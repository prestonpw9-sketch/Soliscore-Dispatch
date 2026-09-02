/**
 * Shared dispatch AI: live schedule/crew context, persistent memory, and placement tools.
 * Used by send-outbound-sms (ai-chat) and gemini-chat.
 */

import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { notifyCrew } from './twilio.ts';

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

export const DEFAULT_MODEL = 'gemini-2.5-flash';
const MEMORY_BUCKET = 'ai-memory';
const MEMORY_PATH = 'dispatch-memories.json';
const HISTORY_PATH = 'schedule-history.json';
const MAX_HISTORY_DAYS = 180;
const MAX_TOOL_ROUNDS = 6;

export type UserRole = 'owner' | 'office' | 'crew';

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface SOLIDCOREContext {
  activeJobs?: number;
  techsOnDuty?: string[];
  pendingDispatches?: number;
  currentPage?: string;
  selectedJob?: {
    id: string | number;
    customerName: string;
    address: string;
    description: string;
    tech: string;
    phase: string;
  } | null;
  openJobsToday?: Array<{
    id: string;
    customerName: string;
    site: string;
    phase: string;
    status: string;
    tech?: string;
    startTime?: string;
    serviceType?: string;
  }>;
  totalJobsToday?: number;
  currentDateTime?: string;
  todayDate?: string;
}

export interface AIRequestOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

export interface AiMemory {
  id: string;
  category:
    | 'crew_ability'
    | 'schedule_rule'
    | 'site_note'
    | 'preference'
    | 'customer_note'
    | 'general';
  subject: string | null;
  technician_id: string | null;
  content: string;
  source: 'user' | 'ai' | 'system';
  active: boolean;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
}

interface MemoryFile {
  version: number;
  updated_at: string | null;
  memories: AiMemory[];
}

const SYSTEM_PROMPT = `You are the AI dispatch assistant for ITDG Plumbing (Arizona).
You can READ the live schedule, crew roster, time-off, long-term memories, and frozen daily history.
You LEARN and REMEMBER: when the user teaches you about a tech's abilities, preferences,
site quirks, or scheduling rules, call remember_fact (and update_technician_skills when it is a skill).
Memories persist across chats — treat them as ground truth unless the user corrects them.

Job statuses: scheduled (on board), active (in progress), completed.
Pending dispatches = scheduled jobs with no crew assigned.
Dates are full-day YYYY-MM-DD (America/Phoenix). Never invent dates.

HISTORICAL SCHEDULE:
- A daily freeze of the board is stored automatically (who was on which job that day).
- Past freezes survive reschedules, crew moves, and completed jobs. The live board is NOT history.
- When asked about last week, a past date, who worked a site before, or "what did the schedule look like",
  call lookup_schedule_history. Do not guess from today's live jobs.

SCHEDULING / PLACEMENT:
- Prefer techs whose remembered skills match the job's service_type/phase.
- Never assign a tech whose time-off covers every day of the job. If they have a requested day off that only overlaps the start (or end), still assign them and start (or end) their task the next available work day.
- Prefer lighter workloads / avoid stacking too many concurrent jobs on one person.
- When the user asks you to place or move crew, use assign_crew_to_job (and set_job_task when useful).
- If the request is ambiguous, ask one short clarifying question before writing.
- Office users are read-only — do not call write tools for them.

CUSTOMER SMS:
- Short professional SMS under 300 characters for today's scheduled work.
- Header: **Customer Name (Site)** then the SMS. Sign: "— ITDG Plumbing"
- Never put internal job IDs or crew cell numbers in customer-facing text.

CREW DIRECTORY / CONTACT:
- Each tech may have a cell number and an on-call (emergency_contact) flag from the Plumber Directory.
- When the signed-in dispatcher explicitly asks you to text, page, or call a plumber, use contact_crew.
- Never contact anyone unless they asked you to (or they confirmed a true emergency to page on-call).
- Do not invent phone numbers. If a tech has no phone, tell them to add it in the Plumber Directory.
- Office users are read-only — they can see the directory but cannot send.
- Prefer SMS. Use channel=voice only when they say "call".

Be concise and practical. When you change the schedule, save a memory, or page crew, say what you did.`;

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

export function resolveGeminiModel(requested?: unknown): string {
  const fromEnv = Deno.env.get('GEMINI_MODEL');
  const raw =
    typeof requested === 'string' && requested.trim()
      ? requested.trim()
      : (fromEnv ?? DEFAULT_MODEL);

  if (raw.includes('2.0-flash') || raw === 'gemini-1.5-flash' || raw === 'gemini-1.5-pro') {
    return DEFAULT_MODEL;
  }
  return raw;
}

export function arizonaToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
}

/** Dispatch board day: after 5:00pm Phoenix this is tomorrow. */
export function dispatchToday(at: Date = new Date()): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at).map(p => [p.type, p.value]),
  );
  const ymd = `${parts.year}-${parts.month}-${parts.day}`;
  const hour = Number(parts.hour);
  return hour >= 17 ? addDays(ymd, 1) : ymd;
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function datesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

type TimeOffRow = { technician_id: string; start_date: string; end_date: string };

/** Shrink a window past leading/trailing leave. Null when leave covers every day. */
function clipWorkRangeAroundTimeOff(
  techId: string,
  start: string,
  end: string,
  timeOff: TimeOffRow[],
): { start: string; end: string } | null {
  let s = start;
  let e = end < start ? start : end;
  const leaves = timeOff
    .filter(r => r.technician_id === techId)
    .sort((a, b) => a.start_date.localeCompare(b.start_date));

  for (let i = 0; i < 64; i++) {
    const hit = leaves.find(r => datesOverlap(s, e, r.start_date, r.end_date));
    if (!hit) return { start: s, end: e };
    if (hit.start_date <= s && hit.end_date >= e) return null;
    if (hit.start_date <= s) {
      s = addDays(hit.end_date, 1);
      if (s > e) return null;
      continue;
    }
    if (hit.end_date >= e) {
      e = addDays(hit.start_date, -1);
      if (e < s) return null;
      continue;
    }
    return { start: s, end: e };
  }
  return s <= e ? { start: s, end: e } : null;
}

function makeId(): string {
  return crypto.randomUUID();
}

function normalizeSkills(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(s => String(s).trim()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
  }
  return [];
}

function canWrite(role: UserRole | null): boolean {
  return role === 'owner' || role === 'crew';
}

export function createUserClient(req: Request): SupabaseClient | null {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) return null;

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
}

export function createServiceClient(): SupabaseClient | null {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceKey) return null;
  return createClient(supabaseUrl, serviceKey);
}

export async function resolveUserRole(
  userClient: SupabaseClient,
  userId: string,
): Promise<UserRole | null> {
  const { data } = await userClient
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();
  const role = data?.role;
  if (role === 'owner' || role === 'office' || role === 'crew') return role;
  return null;
}

async function loadMemoryFile(admin: SupabaseClient): Promise<MemoryFile> {
  const empty: MemoryFile = { version: 1, updated_at: null, memories: [] };
  const { data, error } = await admin.storage.from(MEMORY_BUCKET).download(MEMORY_PATH);
  if (error || !data) return empty;
  try {
    const text = await data.text();
    const parsed = JSON.parse(text) as MemoryFile;
    if (!parsed || !Array.isArray(parsed.memories)) return empty;
    return {
      version: parsed.version ?? 1,
      updated_at: parsed.updated_at ?? null,
      memories: parsed.memories,
    };
  } catch {
    return empty;
  }
}

async function saveMemoryFile(admin: SupabaseClient, file: MemoryFile): Promise<string | null> {
  file.updated_at = new Date().toISOString();
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const { error } = await admin.storage.from(MEMORY_BUCKET).upload(MEMORY_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
  });
  return error ? error.message : null;
}

async function loadDbMemories(admin: SupabaseClient): Promise<AiMemory[] | null> {
  const { data, error } = await admin
    .from('ai_memories')
    .select('id, category, subject, technician_id, content, source, active, created_at, updated_at, created_by')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) return null;
  return (data ?? []) as AiMemory[];
}

async function insertDbMemory(
  admin: SupabaseClient,
  memory: AiMemory,
): Promise<boolean> {
  const { error } = await admin.from('ai_memories').insert({
    id: memory.id,
    category: memory.category,
    subject: memory.subject,
    technician_id: memory.technician_id,
    content: memory.content,
    source: memory.source,
    active: true,
    created_by: memory.created_by ?? null,
    created_at: memory.created_at,
    updated_at: memory.updated_at,
  });
  return !error;
}

async function deactivateDbMemory(admin: SupabaseClient, id: string): Promise<boolean> {
  const { error } = await admin
    .from('ai_memories')
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  return !error;
}

export async function loadAllMemories(admin: SupabaseClient): Promise<AiMemory[]> {
  const db = await loadDbMemories(admin);
  if (db) return db.filter(m => m.active !== false);

  const file = await loadMemoryFile(admin);
  return file.memories.filter(m => m.active !== false);
}

/** Persist crew abilities without a Gemini round-trip (Team roster UI). */
export async function saveTechnicianSkillsDirect(
  admin: SupabaseClient,
  opts: {
    technicianId: string;
    skills: string[];
    userId?: string | null;
  },
): Promise<{ ok: true; skills: string[]; name: string; skillsColumnUpdated: boolean } | { ok: false; error: string }> {
  const skills = normalizeSkills(opts.skills);
  const { data: tech, error: techErr } = await admin
    .from('technicians')
    .select('id, name')
    .eq('id', opts.technicianId)
    .maybeSingle();
  if (techErr || !tech) return { ok: false, error: 'Technician not found.' };

  const { error: skillErr } = await admin
    .from('technicians')
    .update({ skills })
    .eq('id', opts.technicianId);

  const mem = await rememberFact(admin, {
    category: 'crew_ability',
    content: `${tech.name} abilities: ${skills.join(', ') || '(none)'}`,
    subject: String(tech.name),
    technician_id: opts.technicianId,
    source: 'user',
    created_by: opts.userId ?? null,
  });
  if (!mem.ok) return { ok: false, error: mem.error };

  return {
    ok: true,
    skills,
    name: String(tech.name),
    skillsColumnUpdated: !skillErr,
  };
}

async function rememberFact(
  admin: SupabaseClient,
  args: {
    category: AiMemory['category'];
    content: string;
    subject?: string | null;
    technician_id?: string | null;
    source?: AiMemory['source'];
    created_by?: string | null;
  },
): Promise<{ ok: true; memory: AiMemory } | { ok: false; error: string }> {
  const now = new Date().toISOString();
  const memory: AiMemory = {
    id: makeId(),
    category: args.category || 'general',
    subject: args.subject ?? null,
    technician_id: args.technician_id ?? null,
    content: String(args.content || '').trim(),
    source: args.source ?? 'ai',
    active: true,
    created_at: now,
    updated_at: now,
    created_by: args.created_by ?? null,
  };
  if (!memory.content) return { ok: false, error: 'Memory content is empty.' };

  const wroteDb = await insertDbMemory(admin, memory);
  if (!wroteDb) {
    const file = await loadMemoryFile(admin);
    file.memories.unshift(memory);
    // Cap storage file growth
    file.memories = file.memories.slice(0, 300);
    const err = await saveMemoryFile(admin, file);
    if (err) return { ok: false, error: err };
  }
  return { ok: true, memory };
}

async function forgetFact(
  admin: SupabaseClient,
  memoryId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const deactivated = await deactivateDbMemory(admin, memoryId);
  if (deactivated) return { ok: true };

  const file = await loadMemoryFile(admin);
  const idx = file.memories.findIndex(m => m.id === memoryId);
  if (idx < 0) return { ok: false, error: `Memory ${memoryId} not found.` };
  file.memories[idx] = {
    ...file.memories[idx],
    active: false,
    updated_at: new Date().toISOString(),
  };
  const err = await saveMemoryFile(admin, file);
  if (err) return { ok: false, error: err };
  return { ok: true };
}

interface HistoryIndexRow {
  snapshot_date: string;
  job_count: number;
  source: string;
  captured_at: string;
}

interface ScheduleHistoryJobPayload {
  id: string;
  title: string;
  location: string;
  status: string;
  phase: string;
  service_type: string;
  date: string;
  end_date: string;
  crew: Array<{ id: string; name: string }>;
  tasks: Array<{
    id?: string;
    technician_id: string | null;
    technician_name: string;
    task: string;
    start_date?: string;
    end_date?: string;
    status: string;
    percent_complete: number;
  }>;
}

interface ScheduleHistoryPayload {
  version: 1;
  jobs: ScheduleHistoryJobPayload[];
  time_off: Array<{
    technician_id: string;
    technician_name: string;
    start_date: string;
    end_date: string;
    note: string | null;
  }>;
}

interface HistoryFile {
  version: number;
  snapshots: Record<string, {
    captured_at: string;
    source: string;
    job_count: number;
    payload: ScheduleHistoryPayload;
  }>;
}

function emptyHistoryFile(): HistoryFile {
  return { version: 1, snapshots: {} };
}

async function loadHistoryFile(admin: SupabaseClient): Promise<HistoryFile> {
  const { data, error } = await admin.storage.from(MEMORY_BUCKET).download(HISTORY_PATH);
  if (error || !data) return emptyHistoryFile();
  try {
    const parsed = JSON.parse(await data.text()) as HistoryFile;
    if (!parsed || typeof parsed.snapshots !== 'object' || parsed.snapshots == null) {
      return emptyHistoryFile();
    }
    return { version: parsed.version ?? 1, snapshots: parsed.snapshots };
  } catch {
    return emptyHistoryFile();
  }
}

async function saveHistoryFile(admin: SupabaseClient, file: HistoryFile): Promise<string | null> {
  const dates = Object.keys(file.snapshots).sort();
  if (dates.length > MAX_HISTORY_DAYS) {
    for (const d of dates.slice(0, dates.length - MAX_HISTORY_DAYS)) {
      delete file.snapshots[d];
    }
  }
  const blob = new Blob([JSON.stringify(file)], { type: 'application/json' });
  const { error } = await admin.storage.from(MEMORY_BUCKET).upload(HISTORY_PATH, blob, {
    upsert: true,
    contentType: 'application/json',
  });
  return error ? error.message : null;
}

function buildHistoryPayload(snap: DispatchSnapshot): ScheduleHistoryPayload {
  return {
    version: 1,
    jobs: snap.allJobs.map(j => ({
      id: j.id,
      title: j.title,
      location: j.location,
      status: j.status,
      phase: j.phase,
      service_type: j.service_type,
      date: j.date,
      end_date: j.end_date,
      crew: j.technician_ids.map(id => ({ id, name: techName(snap, id) })),
      tasks: snap.jobTasks
        .filter(t => t.job_id === j.id)
        .map(t => ({
          id: t.id,
          technician_id: t.technician_id,
          technician_name: techName(snap, t.technician_id),
          task: t.task,
          start_date: t.start_date,
          end_date: t.end_date,
          status: t.status,
          percent_complete: t.percent_complete,
        })),
    })),
    time_off: snap.timeOff.map(r => ({
      technician_id: r.technician_id,
      technician_name: techName(snap, r.technician_id),
      start_date: r.start_date,
      end_date: r.end_date,
      note: r.note,
    })),
  };
}

async function upsertDbHistory(
  admin: SupabaseClient,
  snapshotDate: string,
  payload: ScheduleHistoryPayload,
  source: 'system' | 'ai' | 'user',
  createdBy: string | null,
): Promise<boolean> {
  const { error } = await admin.from('schedule_history').upsert({
    snapshot_date: snapshotDate,
    captured_at: new Date().toISOString(),
    source,
    created_by: createdBy,
    job_count: payload.jobs.length,
    payload,
  }, { onConflict: 'snapshot_date' });
  return !error;
}

async function captureTodayScheduleHistory(
  admin: SupabaseClient,
  snap: DispatchSnapshot,
  source: 'system' | 'ai' | 'user',
  createdBy: string | null,
): Promise<void> {
  const payload = buildHistoryPayload(snap);
  const wroteDb = await upsertDbHistory(admin, snap.today, payload, source, createdBy);
  if (wroteDb) return;

  const file = await loadHistoryFile(admin);
  file.snapshots[snap.today] = {
    captured_at: new Date().toISOString(),
    source,
    job_count: payload.jobs.length,
    payload,
  };
  await saveHistoryFile(admin, file);
}

async function loadHistoryIndex(admin: SupabaseClient): Promise<HistoryIndexRow[]> {
  const { data, error } = await admin
    .from('schedule_history')
    .select('snapshot_date, job_count, source, captured_at')
    .order('snapshot_date', { ascending: false })
    .limit(60);
  if (!error && data) {
    return (data as HistoryIndexRow[]).filter(r => typeof r.snapshot_date === 'string');
  }

  const file = await loadHistoryFile(admin);
  return Object.entries(file.snapshots)
    .map(([snapshot_date, row]) => ({
      snapshot_date,
      job_count: row.job_count,
      source: row.source,
      captured_at: row.captured_at,
    }))
    .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
    .slice(0, 60);
}

function jobMatchesHistoryFilters(
  job: ScheduleHistoryJobPayload,
  technicianId: string,
  query: string,
): boolean {
  if (technicianId && !job.crew.some(c => c.id === technicianId)) return false;
  if (query) {
    const hay = `${job.title} ${job.location} ${job.phase} ${job.service_type}`.toLowerCase();
    if (!hay.includes(query)) return false;
  }
  return true;
}

function formatHistoryDay(
  date: string,
  meta: { source?: string; job_count?: number } | undefined,
  jobs: ScheduleHistoryJobPayload[],
): string {
  const lines: string[] = [];
  const src = meta?.source ? ` source=${meta.source}` : '';
  lines.push(`${date} (${jobs.length} jobs${src}):`);
  if (!jobs.length) {
    lines.push('  (no matching jobs)');
    return lines.join('\n');
  }
  for (const j of jobs) {
    const crew = j.crew.length ? j.crew.map(c => c.name).join(', ') : 'UNASSIGNED';
    const span = j.date === j.end_date ? j.date : `${j.date}→${j.end_date}`;
    lines.push(
      `  - Job #${j.id} "${j.title}" @ ${j.location || 'n/a'} | ${span} | ${j.status}` +
        ` | ${j.phase || 'n/a'} / ${j.service_type || 'n/a'} | crew=${crew}`,
    );
    for (const t of j.tasks ?? []) {
      if (!t.task && !t.status) continue;
      lines.push(
        `      · ${t.technician_name}: "${t.task || '(blank)'}" ${t.status} ${t.percent_complete}%`,
      );
    }
  }
  return lines.join('\n');
}

async function lookupScheduleHistory(
  admin: SupabaseClient,
  args: {
    start_date: string;
    end_date: string;
    technician_id?: string;
    job_query?: string;
  },
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const start = args.start_date;
  const end = args.end_date;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return { ok: false, error: 'Dates must be YYYY-MM-DD.' };
  }
  if (end < start) return { ok: false, error: 'end_date must be >= start_date.' };

  const days: string[] = [];
  let cursor = start;
  for (let i = 0; i < 31 && cursor <= end; i++) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  if (cursor <= end) {
    return { ok: false, error: 'Range too long — ask for at most 31 days.' };
  }

  const technicianId = args.technician_id ?? '';
  const query = (args.job_query ?? '').trim().toLowerCase();

  const { data, error } = await admin
    .from('schedule_history')
    .select('snapshot_date, source, job_count, payload')
    .in('snapshot_date', days)
    .order('snapshot_date', { ascending: true });

  const byDate = new Map<string, { source: string; job_count: number; payload: ScheduleHistoryPayload }>();
  if (!error && data) {
    for (const row of data as Array<{ snapshot_date: string; source: string; job_count: number; payload: ScheduleHistoryPayload }>) {
      byDate.set(row.snapshot_date, {
        source: row.source,
        job_count: row.job_count,
        payload: row.payload,
      });
    }
  } else {
    const file = await loadHistoryFile(admin);
    for (const d of days) {
      const snap = file.snapshots[d];
      if (snap) byDate.set(d, snap);
    }
  }

  const blocks: string[] = [`SCHEDULE HISTORY ${start} → ${days[days.length - 1]}`];
  let found = 0;
  for (const d of days) {
    const row = byDate.get(d);
    if (!row) {
      blocks.push(`${d}: no snapshot stored`);
      continue;
    }
    found += 1;
    const jobs = (row.payload?.jobs ?? []).filter(j => jobMatchesHistoryFilters(j, technicianId, query));
    blocks.push(formatHistoryDay(d, row, jobs));
  }
  if (!found) {
    blocks.push('No frozen days in this range yet. Snapshots start the first day the app or AI runs after this feature is enabled.');
  }
  return { ok: true, text: blocks.join('\n') };
}

interface DispatchSnapshot {
  today: string;
  windowStart: string;
  windowEnd: string;
  technicians: Array<{
    id: string;
    name: string;
    role: string;
    skills: string[];
    phone: string | null;
    emergency_contact: boolean;
  }>;
  jobs: Array<{
    id: string;
    title: string;
    location: string;
    status: string;
    phase: string;
    service_type: string;
    date: string;
    end_date: string;
    technician_ids: string[];
    description: string;
  }>;
  /** Full current board (unwindowed) — written into daily history freezes. */
  allJobs: Array<{
    id: string;
    title: string;
    location: string;
    status: string;
    phase: string;
    service_type: string;
    date: string;
    end_date: string;
    technician_ids: string[];
    description: string;
  }>;
  jobTasks: Array<{
    id: string;
    job_id: string;
    technician_id: string | null;
    task: string;
    start_date: string;
    end_date: string;
    status: string;
    percent_complete: number;
  }>;
  timeOff: Array<{
    id: string;
    technician_id: string;
    start_date: string;
    end_date: string;
    note: string | null;
  }>;
  memories: AiMemory[];
  skillsColumnAvailable: boolean;
  historyIndex: HistoryIndexRow[];
}

async function loadDispatchSnapshot(admin: SupabaseClient): Promise<DispatchSnapshot> {
  const today = dispatchToday();
  const windowStart = addDays(today, -7);
  const windowEnd = addDays(today, 28);

  const [techRes, jobsRes, tasksRes, offRes, memories, historyIndex] = await Promise.all([
    admin.from('technicians').select('*').order('name'),
    admin.from('jobs').select('*'),
    admin.from('job_tasks').select('*'),
    admin.from('tech_time_off').select('id, technician_id, start_date, end_date, note'),
    loadAllMemories(admin),
    loadHistoryIndex(admin),
  ]);

  let techRows = techRes.data ?? [];
  if (techRes.error) {
    const retry = await admin.from('technicians').select('id, name, role, created_at').order('name');
    techRows = retry.data ?? [];
  }

  const abilityByTech = new Map<string, string[]>();
  for (const m of memories) {
    if (m.category !== 'crew_ability' || !m.technician_id) continue;
    const list = abilityByTech.get(m.technician_id) ?? [];
    list.push(m.content);
    abilityByTech.set(m.technician_id, list);
  }

  const technicians = techRows.map((t: Record<string, unknown>) => {
    const id = String(t.id);
    const colSkills = normalizeSkills(t.skills);
    const memSkills = abilityByTech.get(id) ?? [];
    const merged = Array.from(new Set([...colSkills, ...memSkills]));
    const phoneRaw = t.phone == null ? '' : String(t.phone).trim();
    return {
      id,
      name: String(t.name ?? ''),
      role: String(t.role ?? ''),
      skills: merged,
      phone: phoneRaw || null,
      emergency_contact: Boolean(t.emergency_contact),
    };
  });

  const allJobs = (jobsRes.data ?? [])
    .map((j: Record<string, unknown>) => {
      const date = String(j.date ?? '');
      const end = String(j.end_date ?? j.date ?? '');
      const ids = Array.isArray(j.technician_ids)
        ? (j.technician_ids as unknown[]).map(String).filter(Boolean)
        : (j.technician_id ? [String(j.technician_id)] : []);
      return {
        id: String(j.id),
        title: String(j.title ?? j.customerName ?? 'Job'),
        location: String(j.location ?? j.address ?? ''),
        status: String(j.status ?? 'scheduled'),
        phase: String(j.phase ?? ''),
        service_type: String(j.service_type ?? ''),
        date,
        end_date: end,
        technician_ids: ids,
        description: String(j.description ?? ''),
      };
    });

  const jobs = allJobs
    .filter(j => j.status !== 'completed' || (j.end_date >= windowStart && j.date <= windowEnd))
    .filter(j => !j.date || (j.end_date >= windowStart && j.date <= windowEnd));

  const jobTasks = (tasksRes.data ?? []).map((t: Record<string, unknown>) => ({
    id: String(t.id),
    job_id: String(t.job_id),
    technician_id: t.technician_id ? String(t.technician_id) : null,
    task: String(t.task ?? ''),
    start_date: String(t.start_date ?? ''),
    end_date: String(t.end_date ?? ''),
    status: String(t.status ?? 'not_started'),
    percent_complete: Number(t.percent_complete ?? 0),
  }));

  const timeOff = (offRes.data ?? []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    technician_id: String(r.technician_id),
    start_date: String(r.start_date),
    end_date: String(r.end_date),
    note: r.note == null ? null : String(r.note),
  }));

  return {
    today,
    windowStart,
    windowEnd,
    technicians,
    jobs,
    allJobs,
    jobTasks,
    timeOff,
    memories,
    skillsColumnAvailable: Boolean(techRows[0] && 'skills' in (techRows[0] as object)),
    historyIndex,
  };
}

function techName(snap: DispatchSnapshot, id: string | null | undefined): string {
  if (!id) return 'Unassigned';
  return snap.technicians.find(t => t.id === id)?.name ?? id;
}

function formatSnapshot(snap: DispatchSnapshot): string {
  const lines: string[] = [];
  lines.push(`LIVE DISPATCH DATA (${snap.windowStart} → ${snap.windowEnd}, today=${snap.today})`);

  lines.push('\nCREW ROSTER / DIRECTORY:');
  for (const t of snap.technicians) {
    const skills = t.skills.length ? t.skills.join(', ') : 'skills unknown';
    const phone = t.phone ? `phone=${t.phone}` : 'phone=MISSING';
    const onCall = t.emergency_contact ? 'on-call=YES' : 'on-call=no';
    lines.push(`- ${t.name} [${t.id}] role=${t.role}; ${phone}; ${onCall}; abilities: ${skills}`);
  }

  const upcomingOff = snap.timeOff.filter(r => r.end_date >= snap.today);
  if (upcomingOff.length) {
    lines.push('\nTIME OFF:');
    for (const r of upcomingOff) {
      const span = r.start_date === r.end_date ? r.start_date : `${r.start_date}→${r.end_date}`;
      lines.push(`- ${techName(snap, r.technician_id)}: ${span}${r.note ? ` (${r.note})` : ''}`);
    }
  }

  lines.push('\nSCHEDULE (non-completed jobs in window):');
  const openJobs = snap.jobs.filter(j => j.status !== 'completed');
  if (!openJobs.length) lines.push('- none');
  for (const j of openJobs) {
    const crew = j.technician_ids.length
      ? j.technician_ids.map(id => techName(snap, id)).join(', ')
      : 'UNASSIGNED';
    const span = j.date === j.end_date ? j.date : `${j.date}→${j.end_date}`;
    lines.push(
      `- Job #${j.id} "${j.title}" @ ${j.location || 'n/a'} | ${span} | ${j.status}` +
        ` | phase=${j.phase || 'n/a'} | service=${j.service_type || 'n/a'} | crew=${crew}`,
    );
    const tasks = snap.jobTasks.filter(t => t.job_id === j.id);
    for (const t of tasks) {
      lines.push(
        `    · task ${techName(snap, t.technician_id)}: "${t.task || '(blank)'}"` +
          ` ${t.start_date}→${t.end_date} ${t.status} ${t.percent_complete}%`,
      );
    }
  }

  const unassigned = openJobs.filter(j => j.technician_ids.length === 0);
  lines.push(`\nUnassigned open jobs: ${unassigned.length}`);

  if (snap.memories.length) {
    lines.push('\nLONG-TERM MEMORIES (persist across chats):');
    for (const m of snap.memories.slice(0, 80)) {
      const who = m.technician_id ? techName(snap, m.technician_id) : (m.subject || '');
      lines.push(`- [${m.category}] ${who ? who + ': ' : ''}${m.content} (id=${m.id})`);
    }
  } else {
    lines.push('\nLONG-TERM MEMORIES: none yet — learn from the dispatcher and call remember_fact.');
  }

  if (snap.historyIndex.length) {
    const oldest = snap.historyIndex[snap.historyIndex.length - 1]?.snapshot_date;
    const newest = snap.historyIndex[0]?.snapshot_date;
    lines.push(`\nFROZEN DAILY SNAPSHOTS (${snap.historyIndex.length} stored, ${oldest} → ${newest}). Past days survive reschedules.`);
    for (const row of snap.historyIndex.slice(0, 14)) {
      lines.push(`- ${row.snapshot_date}: ${row.job_count} jobs (${row.source})`);
    }
    if (snap.historyIndex.length > 14) {
      lines.push(`- … ${snap.historyIndex.length - 14} older days. Call lookup_schedule_history for details.`);
    } else {
      lines.push('Call lookup_schedule_history to read a date range.');
    }
  } else {
    lines.push('\nFROZEN DAILY SNAPSHOTS: none yet — today’s board is saved automatically. Use lookup_schedule_history for past days after snapshots exist.');
  }

  return lines.join('\n');
}

function buildSystemPrompt(
  snap: DispatchSnapshot,
  ctx: SOLIDCOREContext,
  role: UserRole | null,
  override?: string,
): string {
  if (override) return override;
  const lines = [SYSTEM_PROMPT];
  lines.push(`Signed-in role: ${role ?? 'unknown'} (canWrite=${canWrite(role)}).`);
  if (ctx.todayDate) lines.push(`Client todayDate: ${ctx.todayDate}.`);
  if (ctx.currentDateTime) lines.push(`Client currentDateTime: ${ctx.currentDateTime}.`);
  if (ctx.currentPage) lines.push(`Current view: ${ctx.currentPage}.`);
  if (ctx.selectedJob) {
    const j = ctx.selectedJob;
    lines.push(`Focused job on screen: #${j.id} — ${j.customerName}, ${j.phase}, tech=${j.tech}.`);
  }
  lines.push('');
  lines.push(formatSnapshot(snap));
  return lines.join('\n');
}

const TOOL_DECLARATIONS = [
  {
    name: 'remember_fact',
    description:
      'Persist a fact for future chats (crew abilities, schedule rules, site notes, preferences). Always use when the user teaches you something worth remembering.',
    parameters: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['crew_ability', 'schedule_rule', 'site_note', 'preference', 'customer_note', 'general'],
        },
        content: { type: 'string', description: 'The fact to remember, concise and specific.' },
        subject: { type: 'string', description: 'Optional label (customer/site/rule name).' },
        technician_id: { type: 'string', description: 'Optional technician UUID when about a crew member.' },
      },
      required: ['category', 'content'],
    },
  },
  {
    name: 'forget_fact',
    description: 'Deactivate a previously stored memory by id.',
    parameters: {
      type: 'object',
      properties: {
        memory_id: { type: 'string' },
      },
      required: ['memory_id'],
    },
  },
  {
    name: 'update_technician_skills',
    description:
      'Add or replace ability tags for a technician. Also stores a crew_ability memory so it is remembered long-term.',
    parameters: {
      type: 'object',
      properties: {
        technician_id: { type: 'string' },
        skills: { type: 'array', items: { type: 'string' } },
        mode: { type: 'string', enum: ['add', 'replace'], description: 'Default add.' },
      },
      required: ['technician_id', 'skills'],
    },
  },
  {
    name: 'assign_crew_to_job',
    description:
      'Assign technicians to a job (writes technician_ids and syncs job_tasks). Use for placement / scheduling requests.',
    parameters: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        technician_ids: { type: 'array', items: { type: 'string' } },
        mode: {
          type: 'string',
          enum: ['replace', 'add'],
          description: 'replace = full crew list; add = merge with existing. Default replace.',
        },
        task_label: {
          type: 'string',
          description: 'Optional task text applied to newly added job_task rows.',
        },
      },
      required: ['job_id', 'technician_ids'],
    },
  },
  {
    name: 'update_job_dates',
    description: 'Change a job start/end date (full-day).',
    parameters: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        start_date: { type: 'string', description: 'YYYY-MM-DD' },
        end_date: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: ['job_id', 'start_date'],
    },
  },
  {
    name: 'set_job_task',
    description: 'Update a crew member job_task row (task text, dates, status, percent).',
    parameters: {
      type: 'object',
      properties: {
        job_id: { type: 'string' },
        technician_id: { type: 'string' },
        task: { type: 'string' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        status: {
          type: 'string',
          enum: ['not_started', 'in_progress', 'complete', 'behind'],
        },
        percent_complete: { type: 'number' },
      },
      required: ['job_id', 'technician_id'],
    },
  },
  {
    name: 'list_available_crew',
    description: 'List technicians available (not on leave) for a date range, with skills and current load.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        required_skill: { type: 'string' },
      },
      required: ['start_date'],
    },
  },
  {
    name: 'contact_crew',
    description:
      'Text or call plumbers on the directory via Twilio. Use ONLY when the dispatcher explicitly asks to reach them, or to page on-call for a confirmed emergency. Never invent numbers.',
    parameters: {
      type: 'object',
      properties: {
        technician_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Specific technician UUIDs to contact.',
        },
        page_on_call: {
          type: 'boolean',
          description: 'Page techs flagged emergency_contact (falls back to everyone with a number).',
        },
        page_all_with_phone: {
          type: 'boolean',
          description: 'Page every tech who has a cell. Only when the user asked to notify everyone AND reason is emergency.',
        },
        message: {
          type: 'string',
          description: 'SMS or spoken message. Short, specific, under 400 characters.',
        },
        reason: {
          type: 'string',
          enum: ['emergency', 'dispatch'],
          description: 'emergency = true after-hours / flooding page. dispatch = routine work text.',
        },
        channel: {
          type: 'string',
          enum: ['sms', 'voice'],
          description: 'Default sms. Use voice only when they say call.',
        },
      },
      required: ['message', 'reason'],
    },
  },
  {
    name: 'lookup_schedule_history',
    description:
      'Read frozen daily schedule snapshots (who was assigned where on past dates). Use for last week, a past day, or who worked a site before. Live jobs are not history.',
    parameters: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'YYYY-MM-DD inclusive' },
        end_date: { type: 'string', description: 'YYYY-MM-DD inclusive. Defaults to start_date. Max 31 days.' },
        technician_id: { type: 'string', description: 'Optional technician UUID to filter crew.' },
        job_query: { type: 'string', description: 'Optional substring match on job title/site/phase.' },
      },
      required: ['start_date'],
    },
  },
];

async function syncJobTasks(
  admin: SupabaseClient,
  jobId: string | number,
  crewIds: string[],
  startDate: string,
  endDate: string,
  taskLabel?: string,
  timeOff: TimeOffRow[] = [],
): Promise<string | null> {
  const desired = Array.from(new Set(crewIds.filter(Boolean)));
  const { data: existing, error: fetchError } = await admin
    .from('job_tasks')
    .select('id, technician_id, start_date, end_date')
    .eq('job_id', jobId);
  if (fetchError) return fetchError.message;

  const rows = existing ?? [];
  const existingTechIds = new Set(
    rows.map((r: { technician_id: string | null }) => r.technician_id).filter(Boolean) as string[],
  );
  const toAdd = desired.filter(id => !existingTechIds.has(id));
  const toRemove = rows.filter(
    (r: { technician_id: string | null }) => r.technician_id && !desired.includes(r.technician_id),
  );

  if (toAdd.length) {
    const insertRows = toAdd.map(techId => {
      const work = clipWorkRangeAroundTimeOff(techId, startDate, endDate, timeOff)
        ?? { start: startDate, end: endDate };
      return {
        job_id: jobId,
        technician_id: techId,
        task: taskLabel ?? '',
        start_date: work.start,
        end_date: work.end,
        status: 'not_started',
        percent_complete: 0,
      };
    });
    const { error } = await admin.from('job_tasks').insert(insertRows);
    if (error) return error.message;
  }

  for (const r of rows as Array<{ id: string; technician_id: string | null; start_date: string | null; end_date: string | null }>) {
    if (!r.technician_id || !desired.includes(r.technician_id)) continue;
    const currentStart = String(r.start_date ?? startDate);
    const currentEnd = String(r.end_date ?? endDate);
    const work = clipWorkRangeAroundTimeOff(r.technician_id, currentStart, currentEnd, timeOff);
    if (!work || (work.start === currentStart && work.end === currentEnd)) continue;
    const { error } = await admin
      .from('job_tasks')
      .update({ start_date: work.start, end_date: work.end })
      .eq('id', r.id);
    if (error) return error.message;
  }

  if (toRemove.length) {
    const { error } = await admin
      .from('job_tasks')
      .delete()
      .in('id', toRemove.map((r: { id: string }) => r.id));
    if (error) return error.message;
  }
  return null;
}

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  admin: SupabaseClient,
  snap: DispatchSnapshot,
  role: UserRole | null,
  userId: string,
): Promise<{ result: unknown; mutated: boolean; snap?: DispatchSnapshot }> {
  const writeNeeded = !['list_available_crew', 'lookup_schedule_history'].includes(name);
  if (writeNeeded && !canWrite(role)) {
    return { result: { error: 'Read-only role (office). Cannot change schedule or memories.' }, mutated: false };
  }

  if (name === 'remember_fact') {
    const saved = await rememberFact(admin, {
      category: (args.category as AiMemory['category']) || 'general',
      content: String(args.content ?? ''),
      subject: args.subject ? String(args.subject) : null,
      technician_id: args.technician_id ? String(args.technician_id) : null,
      source: 'ai',
      created_by: userId,
    });
    if (!saved.ok) return { result: saved, mutated: false };
    return { result: { ok: true, memory_id: saved.memory.id }, mutated: true };
  }

  if (name === 'forget_fact') {
    const res = await forgetFact(admin, String(args.memory_id ?? ''));
    return { result: res, mutated: res.ok === true };
  }

  if (name === 'update_technician_skills') {
    const techId = String(args.technician_id ?? '');
    const tech = snap.technicians.find(t => t.id === techId);
    if (!tech) return { result: { error: `Unknown technician_id ${techId}` }, mutated: false };
    const incoming = normalizeSkills(args.skills);
    const mode = args.mode === 'replace' ? 'replace' : 'add';
    const next = mode === 'replace'
      ? incoming
      : Array.from(new Set([...tech.skills, ...incoming]));

    // Best-effort column write (migration may not be applied yet).
    const { error: skillErr } = await admin
      .from('technicians')
      .update({ skills: next })
      .eq('id', techId);
    const columnOk = !skillErr;

    const mem = await rememberFact(admin, {
      category: 'crew_ability',
      content: `${tech.name} abilities: ${next.join(', ') || '(none)'}`,
      subject: tech.name,
      technician_id: techId,
      source: 'ai',
      created_by: userId,
    });

    tech.skills = next;
    return {
      result: {
        ok: true,
        technician: tech.name,
        skills: next,
        skills_column_updated: columnOk,
        memory_saved: mem.ok === true,
      },
      mutated: true,
    };
  }

  if (name === 'assign_crew_to_job') {
    const jobId = String(args.job_id ?? '');
    const job = snap.jobs.find(j => j.id === jobId);
    if (!job) return { result: { error: `Unknown job_id ${jobId}` }, mutated: false };

    const incoming = (Array.isArray(args.technician_ids) ? args.technician_ids : [])
      .map(String)
      .filter(Boolean);
    const mode = args.mode === 'add' ? 'add' : 'replace';
    const next = mode === 'add'
      ? Array.from(new Set([...job.technician_ids, ...incoming]))
      : Array.from(new Set(incoming));

    for (const tid of next) {
      if (!snap.technicians.some(t => t.id === tid)) {
        return { result: { error: `Unknown technician_id ${tid}` }, mutated: false };
      }
      const work = clipWorkRangeAroundTimeOff(tid, job.date, job.end_date, snap.timeOff);
      if (!work) {
        const leave = snap.timeOff.find(
          r => r.technician_id === tid && datesOverlap(job.date, job.end_date, r.start_date, r.end_date),
        );
        const span = leave ? `${leave.start_date}→${leave.end_date}` : 'those dates';
        return {
          result: {
            error: `${techName(snap, tid)} is off ${span}; cannot assign (no remaining work days).`,
          },
          mutated: false,
        };
      }
    }

    const primary = next[0] ?? null;
    const { error } = await admin
      .from('jobs')
      .update({ technician_ids: next, technician_id: primary })
      .eq('id', jobId);
    if (error) return { result: { error: error.message }, mutated: false };

    const taskErr = await syncJobTasks(
      admin,
      jobId,
      next,
      job.date,
      job.end_date,
      args.task_label ? String(args.task_label) : undefined,
      snap.timeOff,
    );
    if (taskErr) return { result: { error: taskErr }, mutated: true };

    job.technician_ids = next;
    return {
      result: {
        ok: true,
        job_id: jobId,
        crew: next.map(id => techName(snap, id)),
      },
      mutated: true,
    };
  }

  if (name === 'update_job_dates') {
    const jobId = String(args.job_id ?? '');
    const job = snap.jobs.find(j => j.id === jobId);
    if (!job) return { result: { error: `Unknown job_id ${jobId}` }, mutated: false };
    const start = String(args.start_date ?? '');
    const end = String(args.end_date ?? start);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
      return { result: { error: 'Dates must be YYYY-MM-DD.' }, mutated: false };
    }
    if (end < start) return { result: { error: 'end_date must be >= start_date.' }, mutated: false };

    const { error } = await admin
      .from('jobs')
      .update({ date: start, end_date: end })
      .eq('id', jobId);
    if (error) return { result: { error: error.message }, mutated: false };

    await admin
      .from('job_tasks')
      .update({ start_date: start, end_date: end })
      .eq('job_id', jobId);
    await syncJobTasks(admin, jobId, job.technician_ids, start, end, undefined, snap.timeOff);

    job.date = start;
    job.end_date = end;
    return { result: { ok: true, job_id: jobId, start_date: start, end_date: end }, mutated: true };
  }

  if (name === 'set_job_task') {
    const jobId = String(args.job_id ?? '');
    const techId = String(args.technician_id ?? '');
    const job = snap.jobs.find(j => j.id === jobId);
    if (!job) return { result: { error: `Unknown job_id ${jobId}` }, mutated: false };

    const { data: existing } = await admin
      .from('job_tasks')
      .select('id')
      .eq('job_id', jobId)
      .eq('technician_id', techId)
      .maybeSingle();

    const patch: Record<string, unknown> = {};
    if (args.task !== undefined) patch.task = String(args.task);
    if (args.start_date) patch.start_date = String(args.start_date);
    if (args.end_date) patch.end_date = String(args.end_date);
    if (args.status) patch.status = String(args.status);
    if (args.percent_complete !== undefined) patch.percent_complete = Number(args.percent_complete);

    if (existing?.id) {
      const { error } = await admin.from('job_tasks').update(patch).eq('id', existing.id);
      if (error) return { result: { error: error.message }, mutated: false };
      return { result: { ok: true, job_task_id: existing.id, updated: patch }, mutated: true };
    }

    const row = {
      job_id: jobId,
      technician_id: techId,
      task: String(args.task ?? ''),
      start_date: String(args.start_date ?? job.date),
      end_date: String(args.end_date ?? job.end_date),
      status: String(args.status ?? 'not_started'),
      percent_complete: Number(args.percent_complete ?? 0),
    };
    const { data: inserted, error } = await admin.from('job_tasks').insert(row).select('id').single();
    if (error) return { result: { error: error.message }, mutated: false };

    if (!job.technician_ids.includes(techId)) {
      const next = [...job.technician_ids, techId];
      await admin.from('jobs').update({
        technician_ids: next,
        technician_id: next[0] ?? null,
      }).eq('id', jobId);
      job.technician_ids = next;
    }
    return { result: { ok: true, job_task_id: inserted?.id, created: row }, mutated: true };
  }

  if (name === 'list_available_crew') {
    const start = String(args.start_date ?? snap.today);
    const end = String(args.end_date ?? start);
    const required = args.required_skill ? String(args.required_skill).toLowerCase() : '';

    const available = snap.technicians
      .filter(t => !!clipWorkRangeAroundTimeOff(t.id, start, end, snap.timeOff))
      .filter(t => !required || t.skills.some(s => s.toLowerCase().includes(required)))
      .map(t => {
        const work = clipWorkRangeAroundTimeOff(t.id, start, end, snap.timeOff);
        const load = snap.jobs.filter(
          j => j.status !== 'completed'
            && j.technician_ids.includes(t.id)
            && datesOverlap(start, end, j.date, j.end_date),
        );
        return {
          id: t.id,
          name: t.name,
          role: t.role,
          skills: t.skills,
          available_from: work?.start,
          available_until: work?.end,
          overlapping_jobs: load.map(j => ({ id: j.id, title: j.title, dates: `${j.date}→${j.end_date}` })),
          load: load.length,
        };
      })
      .sort((a, b) => a.load - b.load);

    return { result: { start_date: start, end_date: end, available }, mutated: false };
  }

  if (name === 'contact_crew') {
    const reason = String(args.reason ?? 'dispatch');
    const pageAll = Boolean(args.page_all_with_phone);
    if (pageAll && reason !== 'emergency') {
      return {
        result: { error: 'page_all_with_phone is only allowed for reason=emergency.' },
        mutated: false,
      };
    }
    const ids = Array.isArray(args.technician_ids)
      ? args.technician_ids.map(String).filter(Boolean)
      : [];
    const notified = await notifyCrew(admin, {
      message: String(args.message ?? ''),
      technicianIds: ids.length ? ids : undefined,
      pageOnCall: Boolean(args.page_on_call),
      pageAllWithPhone: pageAll,
      channel: args.channel === 'voice' ? 'voice' : 'sms',
    });
    return { result: { ...notified, reason }, mutated: notified.ok };
  }

  if (name === 'lookup_schedule_history') {
    const start = String(args.start_date ?? snap.today);
    const end = String(args.end_date ?? start);
    const looked = await lookupScheduleHistory(admin, {
      start_date: start,
      end_date: end,
      technician_id: args.technician_id ? String(args.technician_id) : '',
      job_query: args.job_query ? String(args.job_query) : '',
    });
    return { result: looked, mutated: false };
  }

  return { result: { error: `Unknown tool: ${name}` }, mutated: false };
}

async function callGemini(params: {
  apiKey: string;
  model: string;
  systemInstruction: string;
  contents: unknown[];
  temperature?: number;
  maxTokens?: number;
}): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; status: number; error: string; detail?: unknown }> {
  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${params.apiKey}`;

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: params.systemInstruction }] },
      contents: params.contents,
      tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
      toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
      generationConfig: {
        temperature: params.temperature ?? 0.4,
        maxOutputTokens: params.maxTokens ?? 4096,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });

  const geminiData = await geminiRes.json();
  if (!geminiRes.ok) {
    const message =
      (geminiData as { error?: { message?: string }; message?: string })?.error?.message
      ?? (geminiData as { message?: string })?.message
      ?? 'Gemini request failed.';
    return { ok: false, status: geminiRes.status, error: message, detail: geminiData };
  }
  return { ok: true, data: geminiData as Record<string, unknown> };
}

function extractParts(data: Record<string, unknown>): Array<Record<string, unknown>> {
  const candidates = data.candidates as Array<{ content?: { parts?: Array<Record<string, unknown>> } }> | undefined;
  return candidates?.[0]?.content?.parts ?? [];
}

function extractText(parts: Array<Record<string, unknown>>): string {
  return parts
    .map(p => (typeof p.text === 'string' ? p.text : ''))
    .join('')
    .trim();
}

export async function handleDispatchAiChat(
  req: Request,
  body: Record<string, unknown>,
): Promise<Response> {
  const userClient = createUserClient(req);
  if (!userClient) return jsonResponse({ error: 'Missing authorization header.' }, 401);

  const admin = createServiceClient();
  if (!admin) return jsonResponse({ error: 'Server misconfiguration (service role).' }, 500);

  const { data: { user }, error: authError } = await userClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized — sign out and sign back in.' }, 401);
  }

  const role = await resolveUserRole(userClient, user.id);
  if (!role) {
    return jsonResponse({ error: 'No user role assigned.' }, 403);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY') ?? Deno.env.get('VITE_GEMINI_API_KEY');
  if (!apiKey) {
    return jsonResponse({
      error: 'Gemini API key is not configured. Add GEMINI_API_KEY in Supabase Edge Function secrets.',
    }, 500);
  }

  const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : [];
  const context = (body.context ?? {}) as SOLIDCOREContext;
  const options = (body.options ?? {}) as AIRequestOptions;
  if (messages.length === 0) {
    return jsonResponse({ error: 'Missing required field: messages.' }, 400);
  }

  let snap = await loadDispatchSnapshot(admin);
  try {
    await captureTodayScheduleHistory(admin, snap, 'ai', user.id);
    snap = { ...snap, historyIndex: await loadHistoryIndex(admin) };
  } catch (err) {
    console.error('schedule history capture failed:', err);
  }
  const model = resolveGeminiModel(body.model);
  const systemInstruction = buildSystemPrompt(snap, context, role, options.systemPrompt);

  const contents: Array<Record<string, unknown>> = messages
    .filter(m => m.role !== 'system' && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return jsonResponse({ error: 'No valid messages to send.' }, 400);
  }

  let didMutate = false;
  let finalText = '';
  const toolTrace: Array<{ name: string; args: unknown; result: unknown }> = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const gemini = await callGemini({
      apiKey,
      model,
      systemInstruction,
      contents,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
    });

    if (!gemini.ok) {
      return jsonResponse({ error: gemini.error, detail: gemini.detail }, gemini.status);
    }

    const parts = extractParts(gemini.data);
    const functionCalls = parts.filter(p => p.functionCall);
    const text = extractText(parts);

    if (!functionCalls.length) {
      finalText = text;
      break;
    }

    // Append model turn with function calls
    contents.push({ role: 'model', parts });

    const responseParts: Array<Record<string, unknown>> = [];
    for (const part of functionCalls) {
      const fc = part.functionCall as { name?: string; args?: Record<string, unknown> };
      const name = fc.name ?? '';
      const args = (fc.args ?? {}) as Record<string, unknown>;
      const exec = await executeTool(name, args, admin, snap, role, user.id);
      if (exec.mutated) {
        didMutate = true;
        // Refresh snapshot after mutations so later tools see fresh data
        snap = await loadDispatchSnapshot(admin);
        try {
          await captureTodayScheduleHistory(admin, snap, 'ai', user.id);
          snap = { ...snap, historyIndex: await loadHistoryIndex(admin) };
        } catch (err) {
          console.error('schedule history capture failed:', err);
        }
      }
      toolTrace.push({ name, args, result: exec.result });
      responseParts.push({
        functionResponse: {
          name,
          response: exec.result,
        },
      });
    }
    contents.push({ role: 'user', parts: responseParts });

    // If model also returned text alongside tools, keep it as fallback
    if (text) finalText = text;
  }

  if (!finalText) {
    // One last non-tool nudge if we only got tool calls
    const closing = await callGemini({
      apiKey,
      model,
      systemInstruction,
      contents: [
        ...contents,
        {
          role: 'user',
          parts: [{ text: 'Briefly confirm what you did or found. Do not call more tools unless necessary.' }],
        },
      ],
      temperature: 0.3,
      maxTokens: 1024,
    });
    if (closing.ok) {
      finalText = extractText(extractParts(closing.data));
    }
  }

  if (!finalText) {
    return jsonResponse({ error: 'No response from Gemini.' }, 502);
  }

  return jsonResponse({
    reply: finalText,
    didMutate,
    toolsUsed: toolTrace.map(t => t.name),
  });
}

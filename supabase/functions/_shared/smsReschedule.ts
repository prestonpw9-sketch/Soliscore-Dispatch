/**
 * reschedule_job for the superintendent SMS dispatcher (super-processor).
 *
 * Moves ONE existing, open job to a new date. It never inserts a job. It only
 * writes when exactly one open job matches the texter's description; with zero
 * or several matches it changes nothing and returns an honest reply.
 *
 * Writes on success (same columns the Schedule board's "edit dates" writes):
 *   - jobs.date / jobs.end_date for that one job (guarded by its old date)
 *   - job_tasks.start_date / end_date shifted by the same number of days (best effort)
 *   - one dispatch_schedule_alerts row (by the caller, see super-processor)
 *
 * No network or Deno globals here; the Supabase client is passed in.
 */
import { addDays, formatBoardDate, formatBoardSpan, parseFlexibleDate } from "./jobDate.ts";

export type JobRow = {
  id: number | string;
  title: string | null;
  location: string | null;
  address: string | null;
  description: string | null;
  phase: string | null;
  status: string | null;
  date: string | null;
  end_date: string | null;
  completed_at: string | null;
  customerName?: string | null;
};

export type RescheduleArgs = {
  job_search?: unknown;
  phase?: unknown;
  new_date?: unknown;
  new_end_date?: unknown;
  current_date?: unknown;
};

export type RescheduleOutcome =
  | { kind: "moved"; job: JobRow; fromDate: string | null; fromEnd: string | null; date: string; endDate: string; reply: string; taskErrors: number }
  | { kind: "no_match"; reply: string }
  | { kind: "ambiguous"; candidates: JobRow[]; reply: string }
  | { kind: "invalid"; reply: string }
  | { kind: "error"; reply: string; error: unknown };

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

const JOB_COLUMNS = 'id, title, location, address, description, phase, status, date, end_date, completed_at, "customerName"';

/** Words that carry no identity for matching a job ("the", "plumbing", "dr", "job", ...). */
const STOP_WORDS = new Set([
  "the", "a", "an", "at", "on", "of", "for", "to", "in", "and", "job", "jobs", "work", "plumb", "plumbing",
  "plumber", "schedule", "scheduled", "start", "starting", "move", "moved", "reschedule", "lot", "house", "home",
  "st", "street", "dr", "drive", "rd", "road", "ave", "avenue", "ln", "lane", "ct", "court", "blvd", "way", "pl",
  "place", "cir", "circle", "trl", "trail", "pkwy", "hwy", "n", "s", "e", "w", "north", "south", "east", "west",
  "az", "tucson", "please", "pls",
]);

export function searchTokens(raw: unknown): string[] {
  const text = typeof raw === "string" ? raw.toLowerCase() : "";
  const tokens = text.split(/[^a-z0-9]+/).filter((t) => t && !STOP_WORDS.has(t) && (t.length >= 3 || /^\d+$/.test(t)));
  return Array.from(new Set(tokens));
}

/** "Trim/Finish" -> "trim", "Rough-In" -> "rough", "Top-Out" -> "top". */
export function phaseRoot(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const first = raw.toLowerCase().split(/[^a-z&]+/).find(Boolean) ?? "";
  return first === "finish" ? "trim" : first;
}

function haystack(job: JobRow): string {
  return [job.title, job.location, job.address, job.description, job.customerName, job.phase]
    .filter(Boolean).join(" ").toLowerCase();
}

function isOpen(job: JobRow): boolean {
  return String(job.status ?? "").toLowerCase() !== "completed" && !job.completed_at;
}

/**
 * Open jobs whose title/location/address/description contain every search token,
 * narrowed by phase (strict when given) and by the job's current date when the
 * texter mentioned it and several jobs still match.
 */
export function matchJobs(jobs: JobRow[], args: RescheduleArgs, today: string): JobRow[] {
  const tokens = searchTokens(args.job_search);
  if (!tokens.length) return [];
  const root = phaseRoot(args.phase);
  let hits = jobs.filter(isOpen).filter((j) => {
    const hay = haystack(j);
    return tokens.every((t) => hay.includes(t));
  });
  if (root) {
    hits = hits.filter((j) => `${j.phase ?? ""} ${j.title ?? ""} ${j.description ?? ""}`.toLowerCase().includes(root));
  }
  const cur = parseFlexibleDate(args.current_date, today) ?? "";
  if (hits.length > 1 && cur) {
    const onDate = hits.filter((j) => j.date === cur);
    if (onDate.length) hits = onDate;
  }
  return hits;
}

function describe(job: JobRow): string {
  const where = job.location || job.address;
  const when = job.date ? formatBoardDate(job.date) : "no date";
  return `#${job.id} ${job.title ?? "Untitled"}${where ? ` (${where})` : ""}, now ${when}`;
}

function quoted(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return s ? `"${s.slice(0, 60)}"` : "that description";
}

function dayDiff(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** New end date: the texter's, else the old span shifted, else the new start. Never before the start. */
export function nextEndDate(job: JobRow, date: string, rawEnd: unknown, today: string): string {
  const end = parseFlexibleDate(rawEnd, today);
  if (end) return end < date ? date : end;
  if (job.date && ISO.test(job.date) && job.end_date && ISO.test(job.end_date) && job.end_date > job.date) {
    return addDays(date, dayDiff(job.date, job.end_date));
  }
  return date;
}

export async function rescheduleJob(db: Db, args: RescheduleArgs, today: string): Promise<RescheduleOutcome> {
  // Unlike new jobs, a move never falls back to "tomorrow": no clear date, no write.
  const date = parseFlexibleDate(args.new_date, today);
  if (!date) {
    return { kind: "invalid", reply: "What date should that job move to? I haven't changed the schedule yet." };
  }

  const { data: rows, error: readError } = await db.from("jobs").select(JOB_COLUMNS).is("completed_at", null).limit(2000);
  if (readError) {
    return { kind: "error", error: readError, reply: "I tried to move that job but ran into a system error, so the schedule has NOT changed. Preston will follow up with you." };
  }
  const matches = matchJobs((rows ?? []) as JobRow[], args, today);

  if (matches.length === 0) {
    return {
      kind: "no_match",
      reply: `I couldn't find a single open job matching ${quoted(args.job_search)}, so I haven't changed the schedule. Preston will confirm with you.`,
    };
  }
  if (matches.length > 1) {
    const list = matches.slice(0, 3).map(describe).join("; ");
    const more = matches.length > 3 ? ` (+${matches.length - 3} more)` : "";
    return {
      kind: "ambiguous",
      candidates: matches,
      reply: `I found ${matches.length} open jobs that could match ${quoted(args.job_search)}: ${list}${more}. I haven't changed the schedule. Preston will confirm which one to move.`,
    };
  }

  const job = matches[0];
  const endDate = nextEndDate(job, date, args.new_end_date, today);
  let update = db.from("jobs").update({ date, end_date: endDate }).eq("id", job.id);
  // Optimistic guard: only move it if nobody changed its date since we read it.
  update = job.date == null ? update.is("date", null) : update.eq("date", job.date);
  const { data: updated, error: updateError } = await update.select("id, date, end_date");
  if (updateError || !Array.isArray(updated) || updated.length !== 1) {
    return {
      kind: "error",
      error: updateError ?? new Error(`expected 1 updated row, got ${Array.isArray(updated) ? updated.length : "none"}`),
      reply: `I tried to move ${job.title ?? "that job"} to ${formatBoardDate(date)} but ran into a system error, so the schedule has NOT changed. Preston will follow up with you.`,
    };
  }

  // Keep the board's crew task bars with the job, like the Schedule board's date edit does.
  let taskErrors = 0;
  const shift = job.date && ISO.test(job.date) ? dayDiff(job.date, date) : 0;
  if (shift !== 0) {
    const { data: tasks, error: taskReadError } = await db.from("job_tasks").select("id, start_date, end_date").eq("job_id", job.id);
    if (taskReadError) { taskErrors++; console.error("reschedule_job: job_tasks read failed", taskReadError); }
    for (const t of (tasks ?? []) as Array<{ id: string; start_date: string | null; end_date: string | null }>) {
      if (!t.start_date || !ISO.test(t.start_date)) continue;
      const start = addDays(t.start_date, shift);
      const end = t.end_date && ISO.test(t.end_date) ? addDays(t.end_date, shift) : start;
      const { error } = await db.from("job_tasks").update({ start_date: start, end_date: end }).eq("id", t.id);
      if (error) { taskErrors++; console.error("reschedule_job: job_tasks shift failed", t.id, error); }
    }
  }

  const where = job.location || job.address;
  const from = job.date ? ` from ${formatBoardSpan(job.date, job.end_date)}` : "";
  return {
    kind: "moved",
    job,
    fromDate: job.date,
    fromEnd: job.end_date,
    date,
    endDate,
    taskErrors,
    reply: `Done. I moved ${job.title ?? "the job"}${where ? ` at ${where}` : ""}${from} to ${formatBoardSpan(date, endDate)} on the board. Preston will follow up if anything changes.`,
  };
}

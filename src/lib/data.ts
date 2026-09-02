export type JobType = 'emergency' | 'maintenance' | 'installation' | 'inspection';
export type Priority = 'emergency' | 'high' | 'normal' | 'low';
export type CallStatus = 'active' | 'missed' | 'callback' | 'completed';
/** Job lifecycle: scheduled (on board) → active (in progress) → completed. */
export type JobStatus = 'scheduled' | 'active' | 'completed';

export interface Call {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  issue: string;
  status: CallStatus;
  priority: Priority;
  time: string;
  duration?: string;
}

export interface Job {
  id: string;
  customerId: string;
  customerName: string;
  /** Optional link to public.projects for per-site billing. */
  projectId?: string;
  address: string;
  type: JobType;
  status: JobStatus;
  priority: Priority;
  technicianId: string | null;
  technicianIds?: string[];
  date: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  description: string;
  phase: string;
  serviceType?: string;
  estimatedDuration: number;
  /** T&M log — only used when tmEnabled is true / phase is T&M. */
  tmEnabled?: boolean;
  tmApprovedBy?: string;
  tmWorkDescription?: string;
  tmHours?: number | null;
}

// Full-day service categories selected on a job (jobs.service_type).
export const SERVICE_TYPES = [
  'Rough',
  'Top-out',
  'Trim',
  'Service Call',
  'Inspection',
  'Pre-slab',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export type TaskStatus = 'not_started' | 'in_progress' | 'complete' | 'behind';

// Per-crew task row on a job (job_tasks table).
export interface JobTask {
  id: string;
  jobId: string;
  technicianId: string | null;
  task: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  percentComplete: number;
  createdAt?: string;
}

// A daily completion log entry (task_updates table).
export interface TaskUpdate {
  id: string;
  jobTaskId: string;
  jobId: string;
  updateDate: string;
  note: string;
  percentComplete: number;
  createdBy?: string | null;
  createdAt?: string;
}

export interface Technician {
  id: string;
  name: string;
  role: string;
  color?: string;
  skills?: string[];
  /** Crew cell in E.164 when on file. */
  phone?: string | null;
  /** When true, Twilio emergencies and AI on-call paging include this tech. */
  emergencyContact?: boolean;
}

/** Route pins: ranked stop (1st / 2nd) per technician per calendar day. */
export type StopRank = 1 | 2;

export interface TechDailyPriority {
  technicianId: string;
  workDate: string;
  jobId: string;
  stopRank: StopRank;
}

/** Logged leave for a technician (single day when start === end). */
export interface TechTimeOff {
  id: string;
  technicianId: string;
  startDate: string;
  endDate: string;
  note: string | null;
  createdAt?: string;
}

/** Editable dispatch reminder banner (single row). */
export interface DispatchAnnouncement {
  id: number;
  message: string;
  updatedAt?: string;
}

/** Inclusive YYYY-MM-DD range overlap. */
export function datesOverlap(
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}

/** Calendar-day arithmetic on YYYY-MM-DD strings (UTC, so no TZ shift). */
export function addCalendarDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export const DISPATCH_TZ = 'America/Phoenix';
/** After this Phoenix hour, the live board is tomorrow's schedule. */
export const DISPATCH_ROLLOVER_HOUR = 17;

export function phoenixDateTime(at: Date = new Date()): { ymd: string; hour: number; minute: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: DISPATCH_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(at).map(p => [p.type, p.value]),
  );
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Arizona calendar date as YYYY-MM-DD (no 5pm shift). */
export function arizonaToday(at: Date = new Date()): string {
  return phoenixDateTime(at).ymd;
}

/** Local/Phoenix calendar date as YYYY-MM-DD. */
export function toLocalYMD(d: Date = new Date()): string {
  return arizonaToday(d);
}

/**
 * Dispatch "today": the day the dashboard / My Day / crew board shows.
 * Rolls to the next calendar day at 5:00pm America/Phoenix (end of the Four 10s).
 */
export function dispatchToday(at: Date = new Date()): string {
  const { ymd, hour } = phoenixDateTime(at);
  return hour >= DISPATCH_ROLLOVER_HOUR ? addCalendarDays(ymd, 1) : ymd;
}

/** Sunday–Saturday week containing the given YYYY-MM-DD. */
export function weekDatesFrom(anchorYmd: string): string[] {
  const [y, m, d] = anchorYmd.split('-').map(Number);
  const dow = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 12)).getUTCDay();
  const sunday = addCalendarDays(anchorYmd, -dow);
  return Array.from({ length: 7 }, (_, i) => addCalendarDays(sunday, i));
}

export function formatTimeOffSpan(leave: Pick<TechTimeOff, 'startDate' | 'endDate'>): string {
  return leave.startDate === leave.endDate
    ? leave.startDate
    : `${leave.startDate}–${leave.endDate}`;
}

/** First leave row that overlaps [start, end] for this tech, if any. */
export function isTechOffOnRange(
  techId: string,
  start: string,
  end: string,
  rows: TechTimeOff[],
): TechTimeOff | undefined {
  const safeEnd = end < start ? start : end;
  return rows.find(
    r =>
      r.technicianId === techId
      && datesOverlap(start, safeEnd, r.startDate, r.endDate),
  );
}

export function isTechOffOnDay(
  techId: string,
  day: string,
  rows: TechTimeOff[],
): boolean {
  return !!isTechOffOnRange(techId, day, day, rows);
}

/**
 * Shrink a job/task window so it starts after leading leave and ends before
 * trailing leave. Mid-range days off are left in place (the tech still works
 * the days around them). Returns null when leave covers every remaining day.
 */
export function clipWorkRangeAroundTimeOff(
  techId: string,
  start: string,
  end: string,
  rows: TechTimeOff[],
): { start: string; end: string } | null {
  let s = start;
  let e = end < start ? start : end;
  const leaves = rows
    .filter(r => r.technicianId === techId)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));

  for (let i = 0; i < 64; i++) {
    const hit = leaves.find(r => datesOverlap(s, e, r.startDate, r.endDate));
    if (!hit) return { start: s, end: e };
    if (hit.startDate <= s && hit.endDate >= e) return null;
    if (hit.startDate <= s) {
      s = addCalendarDays(hit.endDate, 1);
      if (s > e) return null;
      continue;
    }
    if (hit.endDate >= e) {
      e = addCalendarDays(hit.startDate, -1);
      if (e < s) return null;
      continue;
    }
    // Leave sits in the middle of the window — keep the surrounding work days.
    return { start: s, end: e };
  }
  return s <= e ? { start: s, end: e } : null;
}

/** Leave that covers the entire range (no remaining work days). */
export function fullyOffLeave(
  techId: string,
  start: string,
  end: string,
  rows: TechTimeOff[],
): TechTimeOff | undefined {
  if (clipWorkRangeAroundTimeOff(techId, start, end, rows)) return undefined;
  return isTechOffOnRange(techId, start, end, rows);
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  propertyType: 'Residential' | 'Commercial';
  totalJobs: number;
  lastService: string;
  notes: string;
}

// Date helpers — dispatch day rolls at 5pm Phoenix; snapshot at module load for mocks.
export const todayStr = dispatchToday();
export const weekDates = weekDatesFrom(todayStr);

export const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const hours = Array.from({ length: 12 }).map((_, i) => i + 7);

export const mockCustomers: Customer[] = [
  {
    id: 'c1',
    name: 'Canyon Ranch',
    phone: '(520) 555-0192',
    email: 'facilities@canyon.com',
    address: '8600 E Rockcliff Rd',
    city: 'Tucson',
    propertyType: 'Commercial',
    totalJobs: 14,
    lastService: '2026-04-15',
    notes: 'TIG welding required for custom washboards.',
  },
  {
    id: 'c2',
    name: 'Sarah Jenkins',
    phone: '(480) 555-0134',
    address: '1423 W Baseline Rd',
    email: 's.jenkins@email.com',
    city: 'Mesa',
    propertyType: 'Residential',
    totalJobs: 3,
    lastService: '2026-05-02',
    notes: 'Gate code 4921.',
  },
];

export const mockCalls: Call[] = [
  {
    id: 'call1',
    customerName: 'Robert Wilson',
    phone: '(520) 555-0188',
    address: 'Eastside Tucson',
    issue: 'Need quote for 40/40/20 phase rough-in on new build.',
    status: 'active',
    priority: 'high',
    time: '08:15 AM',
    duration: '04:30',
  },
  {
    id: 'call2',
    customerName: 'Community Center',
    phone: '(520) 555-0199',
    address: 'South Tucson',
    issue: 'Looking to upgrade gravity-fed urinals to sensor-operated fixtures.',
    status: 'missed',
    priority: 'normal',
    time: '07:45 AM',
  
    duration: '02:15',
  },
];

export const mockJobs: Job[] = [
  {
    id: 'j1',
    customerId: 'c1',
    customerName: 'Canyon Ranch',
    address: '8600 E Rockcliff Rd',
    type: 'installation',
    status: 'scheduled',
    technicianId: 't1',
    date: todayStr,
    startTime: '08:00',
    endTime: '12:00',
    estimatedDuration: 240,
    phase: 'Rough-In',
    description: 'Commercial kitchen modifications. TIG weld custom washboards to three-compartment sink.',
    priority: 'high',
  },
  {
    id: 'j2',
    customerId: 'c2',
    customerName: 'Sarah Jenkins',
    address: '1423 W Baseline Rd',
    type: 'maintenance',
    status: 'scheduled',
    technicianId: 't2',
    date: todayStr,
    startTime: '13:00',
    endTime: '15:00',
    estimatedDuration: 120,
    phase: 'Trim',
    description: 'Install new Brizo thermostatic valve and high-flow diverter.',
    priority: 'normal',
  },
];
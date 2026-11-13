/**
 * Payroll timesheet math. Pure: no Supabase, no Deno or browser APIs.
 * Used by the owner Payroll page (src/lib/payroll), the CSV export, and the
 * payroll-daily-summary edge function.
 *
 * A work day is the America/Phoenix calendar date of the shift's clock-in.
 * Shop and on-site (job) time are paid, travel (driving) is paid, lunch is
 * deducted unless payroll_settings.lunch_paid. Overtime is weekly hours over
 * the threshold (default 40) inside a pay week that starts on
 * week_start_dow (default Monday).
 */

export const PAYROLL_TIME_ZONE = 'America/Phoenix';

/** 'unverified': claimed time with no location to classify it. Paid, flagged. */
export type PayrollSegmentKind = 'shop' | 'driving' | 'job' | 'lunch' | 'unverified';

/**
 * The first four come from the phone (stored in shifts.clock_in_flags). The
 * last two are worked out here from shifts.clock_in_received_at, the server's
 * own time when the shift row first arrived: the phone can't set it.
 */
export type ClockInFlagName =
  | 'late_clock_in'
  | 'backdated'
  | 'off_site_start'
  | 'no_location'
  | 'received_late'
  | 'phone_clock_ahead';

export const CLOCK_IN_FLAG_TEXT: Record<ClockInFlagName, string> = {
  late_clock_in: 'late clock-in',
  backdated: 'backdated start',
  off_site_start: 'started away from shop',
  no_location: 'no location at start',
  received_late: 'server got the clock-in late',
  phone_clock_ahead: 'phone clock ahead of server',
};

/**
 * Worked out from shifts.clock_out_received_at, the server's own time when
 * the clock-out first arrived. Same rules as the clock-in check.
 */
export type ClockOutFlagName = 'clock_out_received_late' | 'clock_out_phone_clock_ahead';

export const CLOCK_OUT_FLAG_TEXT: Record<ClockOutFlagName, string> = {
  clock_out_received_late: 'server got the clock-out late',
  clock_out_phone_clock_ahead: 'phone clock ahead of server at clock-out',
};

/** A clock time this far after the server's time means the phone clock runs fast. */
export const PHONE_CLOCK_AHEAD_MS = 2 * 60_000;

/**
 * Flag a clock-in or clock-out the server received more than this many
 * minutes after the phone's time (offline sync, or a phone sending an
 * earlier time). A fixed rule, not a payroll setting.
 */
export const RECEIVED_GRACE_MINUTES = 45;

export interface PayrollShiftRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: 'clock_out' | 'auto_stop' | null;
  owner_edited_at?: string | null;
  /** Late clock-in: when Start was actually tapped. Null for a normal start. */
  clock_in_tapped_at?: string | null;
  clock_in_flags?: string[] | null;
  clock_in_note?: string | null;
  start_job_id?: number | string | null;
  clock_in_reviewed_at?: string | null;
  clock_in_reviewed_by?: string | null;
  /** Server time the row first arrived (set by the database, never the phone). */
  clock_in_received_at?: string | null;
  /** Server time the clock-out first arrived (set by the database, never the phone). */
  clock_out_received_at?: string | null;
}

export interface PayrollSegmentRow {
  id: string;
  shift_id: string;
  user_id: string;
  kind: PayrollSegmentKind;
  job_id: number | string | null;
  job_name: string | null;
  started_at: string;
  ended_at: string | null;
  owner_edited_at?: string | null;
  /** Rebuilt from saved location points for a backdated gap. */
  backfilled?: boolean | null;
}

export interface PayrollJobInfo {
  id: string;
  name: string;
  pinned: boolean;
}

export interface PayrollSettings {
  lunchPaid: boolean;
  /** 0 = Sunday ... 6 = Saturday. */
  weekStartDow: number;
  overtimeWeeklyHours: number;
  travelAlertMinutes: number;
  /** Pay period length in days (14 = biweekly). A whole number of weeks. */
  payPeriodLengthDays: number;
  /** Any first day of a pay period (YYYY-MM-DD, Phoenix). Periods repeat from it. */
  payPeriodAnchorDate: string;
  /**
   * Company lunch window, minutes after Phoenix midnight. When set and lunch
   * is unpaid, any part of a shift inside the window counts as lunch even if
   * the phone never wrote a lunch row (for example a shift that clocked in
   * during the window). Null turns the carve-out off.
   */
  lunchWindow?: { startMinute: number; endMinute: number } | null;
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  lunchPaid: false,
  // Thursday: ITDG's pay week runs Thu-Wed, paid every two weeks.
  weekStartDow: 4,
  overtimeWeeklyHours: 40,
  travelAlertMinutes: 90,
  payPeriodLengthDays: 14,
  payPeriodAnchorDate: '2026-10-22',
  lunchWindow: { startMinute: 11 * 60, endMinute: 11 * 60 + 30 },
};

function clockMinutes(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function lunchWindowFromRow(row: Record<string, unknown>): PayrollSettings['lunchWindow'] {
  if (row.lunch_enabled === false) return null;
  const startMinute = clockMinutes(row.lunch_start);
  const endMinute = clockMinutes(row.lunch_end);
  if (startMinute == null || endMinute == null) return DEFAULT_PAYROLL_SETTINGS.lunchWindow;
  if (endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}

export function payrollSettingsFromRow(row: Record<string, unknown> | null | undefined): PayrollSettings {
  if (!row) return { ...DEFAULT_PAYROLL_SETTINGS };
  const dow = Number(row.week_start_dow);
  const overtime = Number(row.overtime_weekly_hours);
  const travel = Number(row.travel_alert_minutes);
  const length = Number(row.pay_period_length_days);
  const anchor = typeof row.pay_period_anchor_date === 'string' ? row.pay_period_anchor_date.slice(0, 10) : '';
  return {
    lunchPaid: row.lunch_paid === true,
    weekStartDow: Number.isInteger(dow) && dow >= 0 && dow <= 6 ? dow : DEFAULT_PAYROLL_SETTINGS.weekStartDow,
    overtimeWeeklyHours: Number.isFinite(overtime) && overtime > 0 ? overtime : DEFAULT_PAYROLL_SETTINGS.overtimeWeeklyHours,
    travelAlertMinutes: Number.isFinite(travel) && travel > 0 ? travel : DEFAULT_PAYROLL_SETTINGS.travelAlertMinutes,
    payPeriodLengthDays: Number.isInteger(length) && length >= 7 && length % 7 === 0
      ? length
      : DEFAULT_PAYROLL_SETTINGS.payPeriodLengthDays,
    payPeriodAnchorDate: /^\d{4}-\d{2}-\d{2}$/.test(anchor) ? anchor : DEFAULT_PAYROLL_SETTINGS.payPeriodAnchorDate,
    lunchWindow: lunchWindowFromRow(row),
  };
}

export type AnomalyKind =
  | 'auto_stop'
  | 'open_shift'
  | 'long_travel'
  | 'unpinned_job'
  | 'late_clock_in'
  | 'late_clock_out'
  | 'unverified_time';

export interface PayrollAnomaly {
  kind: AnomalyKind;
  message: string;
  shiftId?: string;
  segmentId?: string;
  /** An owner already corrected the row. */
  resolved?: boolean;
}

export interface PayrollJobLine {
  key: string;
  jobId: string | null;
  jobName: string;
  travelMinutes: number;
  onsiteMinutes: number;
  /** Null when the job is not in the jobs list (deleted, or shop / no job). */
  pinned: boolean | null;
}

export interface PayrollShiftSummary {
  id: string;
  clockIn: string;
  clockOut: string | null;
  endReason: 'clock_out' | 'auto_stop' | null;
  edited: boolean;
  /** Late / backdated / off-site start. Empty for a normal start. */
  clockInFlags: ClockInFlagName[];
  /** When Start was tapped, if it differs from clock-in or the start was flagged. */
  tappedAt: string | null;
  clockInNote: string | null;
  startJobId: string | null;
  /**
   * A payroll admin reviewed the clock times (review panel or a clock-time
   * save). Clears both the clock-in and the clock-out flags.
   */
  clockInReviewed: boolean;
  /** Server time the clock-in arrived. Null before the column existed. */
  receivedAt: string | null;
  /** Clock-out received late / phone clock ahead. Empty when fine or unchecked. */
  clockOutFlags: ClockOutFlagName[];
  /** Server time the clock-out arrived. Null while open or before the column existed. */
  clockOutReceivedAt: string | null;
}

export interface PayrollSegmentView extends PayrollSegmentRow {
  /** Whole minutes inside the shift's clock-in / clock-out. */
  minutes: number;
  /** For travel: the job driven to, if the next stop was a job. */
  travelToJob: string | null;
}

export interface PayrollDay {
  userId: string;
  workDate: string;
  weekStart: string;
  shifts: PayrollShiftSummary[];
  segments: PayrollSegmentView[];
  shopMinutes: number;
  travelMinutes: number;
  onsiteMinutes: number;
  lunchMinutes: number;
  lunchDeductedMinutes: number;
  /** Claimed time with no location. Paid, and flagged for review. */
  unverifiedMinutes: number;
  paidMinutes: number;
  /** Part of this day's paid time that falls past the weekly threshold. */
  overtimeMinutes: number;
  jobs: PayrollJobLine[];
  anomalies: PayrollAnomaly[];
  edited: boolean;
}

export interface PayrollWeek {
  userId: string;
  weekStart: string;
  weekEnd: string;
  days: PayrollDay[];
  paidMinutes: number;
  regularMinutes: number;
  overtimeMinutes: number;
  overtime: boolean;
}

// ── Dates ──────────────────────────────────────────────────────────────────

export function phoenixWorkDate(at: string | number | Date): string {
  const date = at instanceof Date ? at : new Date(at);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PAYROLL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

export function dayOfWeek(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function weekStartFor(ymd: string, weekStartDow: number): string {
  const back = (dayOfWeek(ymd) - weekStartDow + 7) % 7;
  return addDaysYmd(ymd, -back);
}

/** Whole days from `fromYmd` to `toYmd` (negative when `toYmd` is earlier). */
export function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const parse = (ymd: string) => {
    const [year, month, day] = ymd.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((parse(toYmd) - parse(fromYmd)) / 86_400_000);
}

export interface PayPeriod {
  start: string;
  end: string;
  /** First day of each pay week inside the period, in order. */
  weekStarts: string[];
}

/** The pay period containing `ymd`, counted from the anchor in whole periods. */
export function payPeriodFor(
  ymd: string,
  settings: Pick<PayrollSettings, 'payPeriodLengthDays' | 'payPeriodAnchorDate'>,
): PayPeriod {
  const length = settings.payPeriodLengthDays;
  const offset = daysBetweenYmd(settings.payPeriodAnchorDate, ymd);
  const index = Math.floor(offset / length);
  const start = addDaysYmd(settings.payPeriodAnchorDate, index * length);
  const weekStarts: string[] = [];
  for (let day = 0; day < length; day += 7) weekStarts.push(addDaysYmd(start, day));
  return { start, end: addDaysYmd(start, length - 1), weekStarts };
}

/** First instant of a Phoenix calendar day (Phoenix has no DST: UTC-7). */
export function phoenixDayStartIso(ymd: string): string {
  return new Date(`${ymd}T00:00:00-07:00`).toISOString();
}

export function formatPhoenixClock(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PAYROLL_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatHours(minutes: number): string {
  return (Math.round(minutes) / 60).toFixed(2);
}

// ── Core ───────────────────────────────────────────────────────────────────

/**
 * Each segment's paid span inside its shift. Rows can overlap when a phone
 * opened a new segment without closing the last one, or never closed one at
 * clock-out. Every row is cut to the shift's clock-in/clock-out and ends no
 * later than the next row starts, so no minute is counted twice. An open row
 * runs to the shift end (or now, while the shift is still open).
 */
export function segmentSpans(
  ordered: PayrollSegmentRow[],
  shift: PayrollShiftRow,
  nowMs: number,
): Array<{ start: number; end: number }> {
  const shiftStart = Date.parse(shift.started_at);
  const shiftEnd = shift.ended_at ? Date.parse(shift.ended_at) : nowMs;
  return ordered.map((segment, index) => {
    const start = Math.max(Date.parse(segment.started_at), shiftStart);
    let end = Math.min(segment.ended_at ? Date.parse(segment.ended_at) : shiftEnd, shiftEnd);
    const next = ordered[index + 1];
    if (next) {
      const nextStart = Math.max(Date.parse(next.started_at), shiftStart);
      if (Number.isFinite(nextStart)) end = Math.min(end, nextStart);
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { start: 0, end: 0 };
    return { start, end };
  });
}

/** Lunch windows (ms) on every Phoenix day the span touches. */
function lunchWindowsFor(startMs: number, endMs: number, settings: PayrollSettings): Array<[number, number]> {
  const window = settings.lunchWindow;
  if (!window || !(endMs > startMs)) return [];
  const out: Array<[number, number]> = [];
  let ymd = phoenixWorkDate(startMs);
  const last = phoenixWorkDate(endMs);
  for (let guard = 0; guard < 14 && ymd <= last; guard += 1) {
    const midnight = Date.parse(phoenixDayStartIso(ymd));
    out.push([midnight + window.startMinute * 60_000, midnight + window.endMinute * 60_000]);
    ymd = addDaysYmd(ymd, 1);
  }
  return out;
}

function overlapMs(start: number, end: number, windows: Array<[number, number]>): number {
  let total = 0;
  for (const [a, b] of windows) total += Math.max(0, Math.min(end, b) - Math.max(start, a));
  return total;
}

function jobKey(segment: PayrollSegmentRow): string {
  if (segment.job_id != null && String(segment.job_id) !== '') return `job:${segment.job_id}`;
  return `name:${(segment.job_name ?? 'Job').trim() || 'Job'}`;
}

const NO_JOB_TRAVEL = 'travel:none';

const PHONE_FLAG_NAMES: ClockInFlagName[] = ['late_clock_in', 'backdated', 'off_site_start', 'no_location'];

/** 'late': phone time more than the grace before the server got it; 'ahead': phone time after it. */
function receivedGap(phoneIso: string | null | undefined, receivedIso: string | null | undefined): 'late' | 'ahead' | null {
  const receivedMs = receivedIso ? Date.parse(receivedIso) : NaN;
  const phoneMs = phoneIso ? Date.parse(phoneIso) : NaN;
  if (!Number.isFinite(receivedMs) || !Number.isFinite(phoneMs)) return null;
  if (phoneMs < receivedMs - RECEIVED_GRACE_MINUTES * 60_000) return 'late';
  if (phoneMs > receivedMs + PHONE_CLOCK_AHEAD_MS) return 'ahead';
  return null;
}

/**
 * Server-side check of the clock-in time: compare the phone's tap time (or
 * clock-in, for a normal start) with when the server actually received the
 * row. Never blocks, moves the time, or changes pay; it only flags the shift
 * for review.
 */
export function receivedCheckFlags(
  shift: Pick<PayrollShiftRow, 'started_at' | 'clock_in_tapped_at' | 'clock_in_received_at'>,
): ClockInFlagName[] {
  const gap = receivedGap(shift.clock_in_tapped_at || shift.started_at, shift.clock_in_received_at);
  if (gap === 'late') return ['received_late'];
  if (gap === 'ahead') return ['phone_clock_ahead'];
  return [];
}

/**
 * The same check for the clock-out: the phone's clock-out time against when
 * the server first saw it. An auto-stop ends at the safety-stop time, which
 * the phone only notices at its next location sample, so it is only checked
 * for a phone clock running ahead (auto-stops have their own flag anyway).
 */
export function clockOutCheckFlags(
  shift: Pick<PayrollShiftRow, 'ended_at' | 'end_reason' | 'clock_out_received_at'>,
): ClockOutFlagName[] {
  const gap = receivedGap(shift.ended_at, shift.clock_out_received_at);
  if (gap === 'late' && shift.end_reason !== 'auto_stop') return ['clock_out_received_late'];
  if (gap === 'ahead') return ['clock_out_phone_clock_ahead'];
  return [];
}

function clockInFlagsOf(shift: PayrollShiftRow): ClockInFlagName[] {
  const raw = Array.isArray(shift.clock_in_flags) ? shift.clock_in_flags : [];
  return [
    ...PHONE_FLAG_NAMES.filter(flag => raw.includes(flag)),
    ...receivedCheckFlags(shift),
  ];
}

export interface BuildPayrollInput {
  shifts: PayrollShiftRow[];
  segments: PayrollSegmentRow[];
  jobs?: Map<string, PayrollJobInfo>;
  settings?: PayrollSettings;
  now?: number;
}

export function buildPayroll(input: BuildPayrollInput): { days: PayrollDay[]; weeks: PayrollWeek[] } {
  const settings = input.settings ?? DEFAULT_PAYROLL_SETTINGS;
  const jobs = input.jobs ?? new Map<string, PayrollJobInfo>();
  const nowMs = input.now ?? Date.now();
  const today = phoenixWorkDate(nowMs);

  const segmentsByShift = new Map<string, PayrollSegmentRow[]>();
  for (const segment of input.segments) {
    const list = segmentsByShift.get(segment.shift_id) ?? [];
    list.push(segment);
    segmentsByShift.set(segment.shift_id, list);
  }

  type DayAcc = PayrollDay & { msShop: number; msTravel: number; msOnsite: number; msLunch: number; msUnverified: number; jobMap: Map<string, { travel: number; onsite: number; line: PayrollJobLine }> };
  const days = new Map<string, DayAcc>();

  const shifts = [...input.shifts].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
  for (const shift of shifts) {
    const workDate = phoenixWorkDate(shift.started_at);
    const key = `${shift.user_id}|${workDate}`;
    let day = days.get(key);
    if (!day) {
      day = {
        userId: shift.user_id,
        workDate,
        weekStart: weekStartFor(workDate, settings.weekStartDow),
        shifts: [],
        segments: [],
        shopMinutes: 0,
        travelMinutes: 0,
        onsiteMinutes: 0,
        lunchMinutes: 0,
        lunchDeductedMinutes: 0,
        unverifiedMinutes: 0,
        paidMinutes: 0,
        overtimeMinutes: 0,
        jobs: [],
        anomalies: [],
        edited: false,
        msShop: 0,
        msTravel: 0,
        msOnsite: 0,
        msLunch: 0,
        msUnverified: 0,
        jobMap: new Map(),
      };
      days.set(key, day);
    }

    const shiftEdited = Boolean(shift.owner_edited_at);
    const flags = clockInFlagsOf(shift);
    const outFlags = clockOutCheckFlags(shift);
    const reviewed = Boolean(shift.clock_in_reviewed_at);
    day.shifts.push({
      id: shift.id,
      clockIn: shift.started_at,
      clockOut: shift.ended_at,
      endReason: shift.end_reason,
      edited: shiftEdited,
      clockInFlags: flags,
      tappedAt: shift.clock_in_tapped_at ?? null,
      clockInNote: shift.clock_in_note ?? null,
      startJobId: shift.start_job_id != null ? String(shift.start_job_id) : null,
      clockInReviewed: reviewed,
      receivedAt: shift.clock_in_received_at ?? null,
      clockOutFlags: outFlags,
      clockOutReceivedAt: shift.clock_out_received_at ?? null,
    });
    if (shiftEdited) day.edited = true;

    if (flags.length > 0) {
      const what = flags.map(flag => CLOCK_IN_FLAG_TEXT[flag]).join(', ');
      const tapped = shift.clock_in_tapped_at && shift.clock_in_tapped_at !== shift.started_at
        ? `; clock-in ${formatPhoenixClock(shift.started_at)}, tapped Start ${formatPhoenixClock(shift.clock_in_tapped_at)}`
        : `; clock-in ${formatPhoenixClock(shift.started_at)}`;
      const received = flags.includes('received_late') || flags.includes('phone_clock_ahead')
        ? `; server received ${formatPhoenixClock(shift.clock_in_received_at ?? null)}`
        : '';
      const note = shift.clock_in_note?.trim() ? ` — ${shift.clock_in_note.trim()}` : '';
      day.anomalies.push({
        kind: 'late_clock_in',
        shiftId: shift.id,
        resolved: reviewed,
        message: `${what.charAt(0).toUpperCase()}${what.slice(1)}${tapped}${received}${note}${reviewed ? ' (reviewed)' : ''}`,
      });
    }
    if (outFlags.length > 0) {
      const what = outFlags.map(flag => CLOCK_OUT_FLAG_TEXT[flag]).join(', ');
      day.anomalies.push({
        kind: 'late_clock_out',
        shiftId: shift.id,
        resolved: reviewed,
        message: `${what.charAt(0).toUpperCase()}${what.slice(1)}; clock-out ${formatPhoenixClock(shift.ended_at)}; server received ${formatPhoenixClock(shift.clock_out_received_at ?? null)}${reviewed ? ' (reviewed)' : ''}`,
      });
    }

    if (shift.end_reason === 'auto_stop') {
      day.anomalies.push({
        kind: 'auto_stop',
        shiftId: shift.id,
        resolved: shiftEdited,
        message: shiftEdited
          ? `Auto-stopped at ${formatPhoenixClock(shift.ended_at)}; clock-out corrected by owner.`
          : `Auto-stopped at ${formatPhoenixClock(shift.ended_at)} with no clock-out.`,
      });
    }
    if (!shift.ended_at && workDate < today) {
      day.anomalies.push({
        kind: 'open_shift',
        shiftId: shift.id,
        message: `Still clocked in since ${formatPhoenixClock(shift.started_at)} on ${workDate}.`,
      });
    }

    const ordered = [...(segmentsByShift.get(shift.id) ?? [])]
      .sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at));
    const flaggedJobs = new Set<string>();
    const spans = segmentSpans(ordered, shift, nowMs);
    const shiftSpanEnd = shift.ended_at ? Date.parse(shift.ended_at) : nowMs;
    const lunchWindows = lunchWindowsFor(Date.parse(shift.started_at), shiftSpanEnd, settings);

    ordered.forEach((segment, index) => {
      const span = spans[index];
      let ms = span.end - span.start;
      // Company lunch is carved out of work rows even when the phone wrote no
      // lunch row (e.g. clocked in during the window).
      if (segment.kind !== 'lunch' && ms > 0) {
        const carved = overlapMs(span.start, span.end, lunchWindows);
        if (carved > 0) {
          ms -= carved;
          day!.msLunch += carved;
        }
      }
      const minutes = Math.round(ms / 60_000);
      if (segment.owner_edited_at) day!.edited = true;

      let travelToJob: string | null = null;
      let travelSource: PayrollSegmentRow | null = null;
      if (segment.kind === 'driving') {
        const next = ordered.slice(index + 1).find(item => item.kind !== 'lunch');
        if (next?.kind === 'job') {
          travelToJob = jobKey(next);
          travelSource = next;
        } else if (segment.job_id != null && String(segment.job_id) !== '') {
          // Driving to the job picked at clock-in.
          travelToJob = jobKey(segment);
          travelSource = segment;
        }
      }
      day!.segments.push({ ...segment, minutes, travelToJob });

      const lineFor = (keyName: string, source: PayrollSegmentRow | null) => {
        let entry = day!.jobMap.get(keyName);
        if (!entry) {
          const jobId = source?.job_id != null ? String(source.job_id) : null;
          const info = jobId ? jobs.get(jobId) : undefined;
          entry = {
            travel: 0,
            onsite: 0,
            line: {
              key: keyName,
              jobId,
              jobName: keyName === NO_JOB_TRAVEL
                ? 'Travel — shop / no job'
                : (info?.name ?? source?.job_name ?? 'Job'),
              travelMinutes: 0,
              onsiteMinutes: 0,
              pinned: info ? info.pinned : null,
            },
          };
          day!.jobMap.set(keyName, entry);
        }
        return entry;
      };

      switch (segment.kind) {
        case 'shop':
          day!.msShop += ms;
          break;
        case 'lunch':
          day!.msLunch += ms;
          break;
        case 'unverified':
          day!.msUnverified += ms;
          if (minutes > 0) {
            day!.anomalies.push({
              kind: 'unverified_time',
              segmentId: segment.id,
              resolved: Boolean(segment.owner_edited_at),
              message: `Unverified ${formatHours(minutes)} h ${formatPhoenixClock(segment.started_at)}–${formatPhoenixClock(segment.ended_at)}: no location history; set it to shop, travel, or a job.`,
            });
          }
          break;
        case 'job': {
          day!.msOnsite += ms;
          lineFor(jobKey(segment), segment).onsite += ms;
          const jobId = segment.job_id != null ? String(segment.job_id) : null;
          const info = jobId ? jobs.get(jobId) : undefined;
          if (info && !info.pinned && !flaggedJobs.has(jobId!)) {
            flaggedJobs.add(jobId!);
            day!.anomalies.push({
              kind: 'unpinned_job',
              segmentId: segment.id,
              message: `${info.name} has no map pin; arrival there is not detected automatically.`,
            });
          }
          break;
        }
        case 'driving': {
          day!.msTravel += ms;
          const target = travelToJob
            ? lineFor(travelToJob, travelSource)
            : lineFor(NO_JOB_TRAVEL, null);
          target.travel += ms;
          if (minutes > settings.travelAlertMinutes) {
            day!.anomalies.push({
              kind: 'long_travel',
              segmentId: segment.id,
              resolved: Boolean(segment.owner_edited_at),
              message: `Travel ${formatHours(minutes)} h starting ${formatPhoenixClock(segment.started_at)} (over ${settings.travelAlertMinutes} min).`,
            });
          }
          break;
        }
      }
    });
  }

  const finished: PayrollDay[] = [];
  for (const day of days.values()) {
    const shop = Math.round(day.msShop / 60_000);
    const travel = Math.round(day.msTravel / 60_000);
    const onsite = Math.round(day.msOnsite / 60_000);
    const lunch = Math.round(day.msLunch / 60_000);
    const unverified = Math.round(day.msUnverified / 60_000);
    const jobsList = [...day.jobMap.values()].map(entry => ({
      ...entry.line,
      travelMinutes: Math.round(entry.travel / 60_000),
      onsiteMinutes: Math.round(entry.onsite / 60_000),
    })).sort((a, b) => {
      if (a.key === NO_JOB_TRAVEL) return 1;
      if (b.key === NO_JOB_TRAVEL) return -1;
      return (b.onsiteMinutes + b.travelMinutes) - (a.onsiteMinutes + a.travelMinutes);
    });
    const { msShop, msTravel, msOnsite, msLunch, msUnverified, jobMap, ...rest } = day;
    void msShop; void msTravel; void msOnsite; void msLunch; void msUnverified; void jobMap;
    finished.push({
      ...rest,
      shopMinutes: shop,
      travelMinutes: travel,
      onsiteMinutes: onsite,
      lunchMinutes: lunch,
      lunchDeductedMinutes: settings.lunchPaid ? 0 : lunch,
      unverifiedMinutes: unverified,
      // No approval needed: unverified time is paid and flagged.
      paidMinutes: shop + travel + onsite + unverified + (settings.lunchPaid ? lunch : 0),
      jobs: jobsList,
    });
  }
  finished.sort((a, b) => a.userId.localeCompare(b.userId) || a.workDate.localeCompare(b.workDate));

  const thresholdMinutes = Math.round(settings.overtimeWeeklyHours * 60);
  const weekMap = new Map<string, PayrollWeek>();
  for (const day of finished) {
    const key = `${day.userId}|${day.weekStart}`;
    let week = weekMap.get(key);
    if (!week) {
      week = {
        userId: day.userId,
        weekStart: day.weekStart,
        weekEnd: addDaysYmd(day.weekStart, 6),
        days: [],
        paidMinutes: 0,
        regularMinutes: 0,
        overtimeMinutes: 0,
        overtime: false,
      };
      weekMap.set(key, week);
    }
    const before = week.paidMinutes;
    week.paidMinutes += day.paidMinutes;
    day.overtimeMinutes = Math.max(0, week.paidMinutes - Math.max(before, thresholdMinutes));
    week.days.push(day);
  }
  const weeks = [...weekMap.values()].map(week => {
    const overtimeMinutes = Math.max(0, week.paidMinutes - thresholdMinutes);
    return {
      ...week,
      overtimeMinutes,
      regularMinutes: week.paidMinutes - overtimeMinutes,
      overtime: overtimeMinutes > 0,
    };
  });
  weeks.sort((a, b) => a.userId.localeCompare(b.userId) || a.weekStart.localeCompare(b.weekStart));
  return { days: finished, weeks };
}

// ── CSV ────────────────────────────────────────────────────────────────────

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  // Guard against spreadsheet formula injection from job names.
  const safe = /^[=+\-@\t\r]/.test(text) && !/^-?\d/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export interface PayrollCsvOptions {
  names: Record<string, string>;
  /** `${userId}|day|${date}` or `${userId}|week|${weekStart}` → approved. */
  approved?: Set<string>;
}

export const PAYROLL_CSV_HEADER = [
  'Row',
  'Worker',
  'Date',
  'Week start',
  'Job',
  'Clock in',
  'Clock out',
  'End reason',
  'Shop hrs',
  'Travel hrs',
  'On-site hrs',
  'Lunch deducted hrs',
  'Paid hrs',
  'Overtime hrs',
  'Approved',
  'Flags',
  // Last, so existing column positions do not move. Included in Paid hrs.
  'Unverified hrs',
];

export function payrollCsv(weeks: PayrollWeek[], options: PayrollCsvOptions): string {
  const rows: unknown[][] = [PAYROLL_CSV_HEADER];
  const approved = options.approved ?? new Set<string>();
  for (const week of weeks) {
    const worker = options.names[week.userId] ?? week.userId;
    for (const day of week.days) {
      const clockIn = day.shifts.map(shift => formatPhoenixClock(shift.clockIn)).join(' / ');
      const clockOut = day.shifts.map(shift => formatPhoenixClock(shift.clockOut)).join(' / ');
      const reasons = day.shifts.map(shift => shift.endReason ?? 'open').join(' / ');
      rows.push([
        'Day',
        worker,
        day.workDate,
        day.weekStart,
        '',
        clockIn,
        clockOut,
        reasons,
        formatHours(day.shopMinutes),
        formatHours(day.travelMinutes),
        formatHours(day.onsiteMinutes),
        formatHours(day.lunchDeductedMinutes),
        formatHours(day.paidMinutes),
        formatHours(day.overtimeMinutes),
        approved.has(`${day.userId}|day|${day.workDate}`) ? 'yes' : 'no',
        day.anomalies.map(anomaly => anomaly.message).join(' | '),
        formatHours(day.unverifiedMinutes),
      ]);
      for (const job of day.jobs) {
        rows.push([
          'Job',
          worker,
          day.workDate,
          day.weekStart,
          job.jobName,
          '',
          '',
          '',
          '',
          formatHours(job.travelMinutes),
          formatHours(job.onsiteMinutes),
          '',
          '',
          '',
          '',
          job.pinned === false ? 'unpinned job' : '',
          '',
        ]);
      }
    }
    rows.push([
      'Week',
      worker,
      `${week.weekStart} to ${week.weekEnd}`,
      week.weekStart,
      '',
      '',
      '',
      '',
      formatHours(week.days.reduce((sum, day) => sum + day.shopMinutes, 0)),
      formatHours(week.days.reduce((sum, day) => sum + day.travelMinutes, 0)),
      formatHours(week.days.reduce((sum, day) => sum + day.onsiteMinutes, 0)),
      formatHours(week.days.reduce((sum, day) => sum + day.lunchDeductedMinutes, 0)),
      formatHours(week.paidMinutes),
      formatHours(week.overtimeMinutes),
      approved.has(`${week.userId}|week|${week.weekStart}`) ? 'yes' : 'no',
      week.overtime ? 'overtime' : '',
      formatHours(week.days.reduce((sum, day) => sum + day.unverifiedMinutes, 0)),
    ]);
  }
  return rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

// ── Daily owner summary text ───────────────────────────────────────────────

export function dailySummaryText(
  workDate: string,
  days: PayrollDay[],
  names: Record<string, string>,
): string {
  const list = days.filter(day => day.workDate === workDate);
  if (!list.length) return `Payroll ${workDate}: no shifts recorded.`;
  const lines = list
    .sort((a, b) => (names[a.userId] ?? a.userId).localeCompare(names[b.userId] ?? b.userId))
    .map(day => {
      const flags = day.anomalies.filter(anomaly => !anomaly.resolved).length;
      return `${names[day.userId] ?? 'Crew'}: ${formatHours(day.paidMinutes)}h paid (travel ${formatHours(day.travelMinutes)}h)${flags ? `, ${flags} flag${flags === 1 ? '' : 's'}` : ''}`;
    });
  const total = list.reduce((sum, day) => sum + day.paidMinutes, 0);
  return [`Payroll ${workDate}: ${formatHours(total)}h total`, ...lines].join('\n');
}

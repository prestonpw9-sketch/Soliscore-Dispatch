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

export type PayrollSegmentKind = 'shop' | 'driving' | 'job' | 'lunch';

export interface PayrollShiftRow {
  id: string;
  user_id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: 'clock_out' | 'auto_stop' | null;
  owner_edited_at?: string | null;
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
}

export const DEFAULT_PAYROLL_SETTINGS: PayrollSettings = {
  lunchPaid: false,
  weekStartDow: 1,
  overtimeWeeklyHours: 40,
  travelAlertMinutes: 90,
};

export function payrollSettingsFromRow(row: Record<string, unknown> | null | undefined): PayrollSettings {
  if (!row) return { ...DEFAULT_PAYROLL_SETTINGS };
  const dow = Number(row.week_start_dow);
  const overtime = Number(row.overtime_weekly_hours);
  const travel = Number(row.travel_alert_minutes);
  return {
    lunchPaid: row.lunch_paid === true,
    weekStartDow: Number.isInteger(dow) && dow >= 0 && dow <= 6 ? dow : DEFAULT_PAYROLL_SETTINGS.weekStartDow,
    overtimeWeeklyHours: Number.isFinite(overtime) && overtime > 0 ? overtime : DEFAULT_PAYROLL_SETTINGS.overtimeWeeklyHours,
    travelAlertMinutes: Number.isFinite(travel) && travel > 0 ? travel : DEFAULT_PAYROLL_SETTINGS.travelAlertMinutes,
  };
}

export type AnomalyKind = 'auto_stop' | 'open_shift' | 'long_travel' | 'unpinned_job';

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

function clipMs(segment: PayrollSegmentRow, shift: PayrollShiftRow, nowMs: number): number {
  const shiftStart = Date.parse(shift.started_at);
  const shiftEnd = shift.ended_at ? Date.parse(shift.ended_at) : nowMs;
  const start = Math.max(Date.parse(segment.started_at), shiftStart);
  const rawEnd = segment.ended_at ? Date.parse(segment.ended_at) : shiftEnd;
  const end = Math.min(rawEnd, shiftEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
  return end - start;
}

function jobKey(segment: PayrollSegmentRow): string {
  if (segment.job_id != null && String(segment.job_id) !== '') return `job:${segment.job_id}`;
  return `name:${(segment.job_name ?? 'Job').trim() || 'Job'}`;
}

const NO_JOB_TRAVEL = 'travel:none';

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

  type DayAcc = PayrollDay & { msShop: number; msTravel: number; msOnsite: number; msLunch: number; jobMap: Map<string, { travel: number; onsite: number; line: PayrollJobLine }> };
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
        paidMinutes: 0,
        overtimeMinutes: 0,
        jobs: [],
        anomalies: [],
        edited: false,
        msShop: 0,
        msTravel: 0,
        msOnsite: 0,
        msLunch: 0,
        jobMap: new Map(),
      };
      days.set(key, day);
    }

    const shiftEdited = Boolean(shift.owner_edited_at);
    day.shifts.push({
      id: shift.id,
      clockIn: shift.started_at,
      clockOut: shift.ended_at,
      endReason: shift.end_reason,
      edited: shiftEdited,
    });
    if (shiftEdited) day.edited = true;

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

    ordered.forEach((segment, index) => {
      const ms = clipMs(segment, shift, nowMs);
      const minutes = Math.round(ms / 60_000);
      if (segment.owner_edited_at) day!.edited = true;

      let travelToJob: string | null = null;
      if (segment.kind === 'driving') {
        const next = ordered.slice(index + 1).find(item => item.kind !== 'lunch');
        if (next?.kind === 'job') travelToJob = jobKey(next);
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
            ? lineFor(travelToJob, ordered.slice(index + 1).find(item => item.kind === 'job') ?? null)
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
    const jobsList = [...day.jobMap.values()].map(entry => ({
      ...entry.line,
      travelMinutes: Math.round(entry.travel / 60_000),
      onsiteMinutes: Math.round(entry.onsite / 60_000),
    })).sort((a, b) => {
      if (a.key === NO_JOB_TRAVEL) return 1;
      if (b.key === NO_JOB_TRAVEL) return -1;
      return (b.onsiteMinutes + b.travelMinutes) - (a.onsiteMinutes + a.travelMinutes);
    });
    const { msShop, msTravel, msOnsite, msLunch, jobMap, ...rest } = day;
    void msShop; void msTravel; void msOnsite; void msLunch; void jobMap;
    finished.push({
      ...rest,
      shopMinutes: shop,
      travelMinutes: travel,
      onsiteMinutes: onsite,
      lunchMinutes: lunch,
      lunchDeductedMinutes: settings.lunchPaid ? 0 : lunch,
      paidMinutes: shop + travel + onsite + (settings.lunchPaid ? lunch : 0),
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

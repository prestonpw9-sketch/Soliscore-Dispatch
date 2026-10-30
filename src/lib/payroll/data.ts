import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/data';
import {
  addDaysYmd,
  payrollSettingsFromRow,
  phoenixDayStartIso,
  type PayrollJobInfo,
  type PayrollSegmentKind,
  type PayrollSegmentRow,
  type PayrollSettings,
  type PayrollShiftRow,
} from '../../../supabase/functions/_shared/payroll.ts';

export * from '../../../supabase/functions/_shared/payroll.ts';

export interface PayrollSettingsRow {
  lunch_enabled: boolean;
  lunch_start: string;
  lunch_end: string;
  lunch_paid: boolean;
  week_start_dow: number;
  overtime_weekly_hours: number;
  travel_alert_minutes: number;
  daily_summary_enabled: boolean;
  daily_summary_phone: string | null;
}

export const DEFAULT_SETTINGS_ROW: PayrollSettingsRow = {
  lunch_enabled: true,
  lunch_start: '11:00',
  lunch_end: '11:30',
  lunch_paid: false,
  week_start_dow: 1,
  overtime_weekly_hours: 40,
  travel_alert_minutes: 90,
  daily_summary_enabled: false,
  daily_summary_phone: null,
};

export interface PayrollApproval {
  id: string;
  user_id: string;
  period: 'day' | 'week';
  period_start: string;
  approved_by: string | null;
  approved_at: string;
}

export interface PayrollAuditRow {
  id: number;
  target_table: 'shifts' | 'time_segments';
  target_id: string;
  shift_id: string | null;
  worker_user_id: string;
  action: 'update' | 'insert' | 'delete';
  original_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  note: string | null;
  edited_by: string | null;
  edited_at: string;
}

export interface PayrollLoad {
  settingsRow: PayrollSettingsRow;
  settings: PayrollSettings;
  shifts: PayrollShiftRow[];
  segments: PayrollSegmentRow[];
  approvals: PayrollApproval[];
  audit: PayrollAuditRow[];
  names: Record<string, string>;
  /** Set when a payroll table is missing (migration not applied yet). */
  setupMessage: string | null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function jobInfoMap(jobs: Job[]): Map<string, PayrollJobInfo> {
  return new Map(jobs.map(job => [job.id, {
    id: job.id,
    name: job.customerName || job.address || `Job ${job.id}`,
    pinned: job.latitude != null && job.longitude != null,
  }]));
}

export async function loadPayrollSettings(): Promise<{ row: PayrollSettingsRow; error: string | null }> {
  const { data, error } = await supabase.from('payroll_settings').select('*').limit(1);
  if (error) return { row: { ...DEFAULT_SETTINGS_ROW }, error: error.message };
  const raw = (data?.[0] ?? null) as Record<string, unknown> | null;
  if (!raw) return { row: { ...DEFAULT_SETTINGS_ROW }, error: null };
  return {
    row: {
      lunch_enabled: raw.lunch_enabled !== false,
      lunch_start: String(raw.lunch_start ?? '11:00').slice(0, 5),
      lunch_end: String(raw.lunch_end ?? '11:30').slice(0, 5),
      lunch_paid: raw.lunch_paid === true,
      week_start_dow: Number(raw.week_start_dow ?? 1),
      overtime_weekly_hours: Number(raw.overtime_weekly_hours ?? 40),
      travel_alert_minutes: Number(raw.travel_alert_minutes ?? 90),
      daily_summary_enabled: raw.daily_summary_enabled === true,
      daily_summary_phone: raw.daily_summary_phone ? String(raw.daily_summary_phone) : null,
    },
    error: null,
  };
}

/** Shifts that clocked in on any Phoenix day from `fromYmd` to `toYmd` inclusive. */
export async function loadPayroll(fromYmd: string, toYmd: string): Promise<PayrollLoad> {
  const settingsLoad = await loadPayrollSettings();
  const settingsRow = settingsLoad.row;
  const settings = payrollSettingsFromRow(settingsRow as unknown as Record<string, unknown>);
  let setupMessage = settingsLoad.error
    ? 'Payroll settings table not found. Apply supabase/migrations/20261029120100_payroll_lunch_timesheets.sql (defaults are used until then).'
    : null;

  const from = phoenixDayStartIso(fromYmd);
  const to = phoenixDayStartIso(addDaysYmd(toYmd, 1));

  const shiftsReply = await supabase
    .from('shifts')
    .select('*')
    .gte('started_at', from)
    .lt('started_at', to)
    .order('started_at');
  if (shiftsReply.error) {
    return {
      settingsRow,
      settings,
      shifts: [],
      segments: [],
      approvals: [],
      audit: [],
      names: {},
      setupMessage: `Could not read shifts: ${shiftsReply.error.message}. Apply the shift tracking migrations first.`,
    };
  }
  const shifts = (shiftsReply.data ?? []) as PayrollShiftRow[];
  const shiftIds = shifts.map(shift => shift.id);

  const segments: PayrollSegmentRow[] = [];
  const audit: PayrollAuditRow[] = [];
  for (const ids of chunk(shiftIds, 100)) {
    const [segmentReply, auditReply] = await Promise.all([
      supabase.from('time_segments').select('*').in('shift_id', ids).order('started_at'),
      supabase.from('payroll_edit_audit').select('*').in('shift_id', ids).order('edited_at', { ascending: false }),
    ]);
    if (segmentReply.error) throw new Error(segmentReply.error.message);
    segments.push(...((segmentReply.data ?? []) as PayrollSegmentRow[]));
    if (auditReply.error) {
      setupMessage = setupMessage ?? 'Payroll audit table not found. Apply the payroll migration before editing.';
    } else {
      audit.push(...((auditReply.data ?? []) as PayrollAuditRow[]));
    }
  }

  const approvalsReply = await supabase
    .from('payroll_approvals')
    .select('*')
    .gte('period_start', addDaysYmd(fromYmd, -6))
    .lte('period_start', toYmd);
  if (approvalsReply.error) {
    setupMessage = setupMessage ?? 'Payroll approvals table not found. Apply the payroll migration before approving.';
  }

  const rolesReply = await supabase.from('user_roles').select('user_id, email, full_name, role');
  const names: Record<string, string> = {};
  for (const row of (rolesReply.data ?? []) as Array<{ user_id: string; email?: string | null; full_name?: string | null }>) {
    names[row.user_id] = row.full_name?.trim() || row.email?.trim() || 'Crew member';
  }

  return {
    settingsRow,
    settings,
    shifts,
    segments,
    approvals: (approvalsReply.data ?? []) as PayrollApproval[],
    audit,
    names,
    setupMessage,
  };
}

export function approvalKey(userId: string, period: 'day' | 'week', start: string): string {
  return `${userId}|${period}|${start}`;
}

type Result = { ok: true } | { ok: false; message: string };

function result(error: { message: string } | null): Result {
  return error ? { ok: false, message: error.message } : { ok: true };
}

export async function approvePeriods(
  approverId: string,
  userId: string,
  periods: Array<{ period: 'day' | 'week'; start: string }>,
): Promise<Result> {
  const { error } = await supabase.from('payroll_approvals').upsert(
    periods.map(item => ({
      user_id: userId,
      period: item.period,
      period_start: item.start,
      approved_by: approverId,
    })),
    { onConflict: 'user_id,period,period_start', ignoreDuplicates: true },
  );
  return result(error);
}

export async function removeApproval(userId: string, period: 'day' | 'week', start: string): Promise<Result> {
  const { error } = await supabase
    .from('payroll_approvals')
    .delete()
    .eq('user_id', userId)
    .eq('period', period)
    .eq('period_start', start);
  return result(error);
}

export async function editSegment(args: {
  segmentId: string;
  kind?: PayrollSegmentKind;
  jobId?: number | null;
  startedAt?: string;
  endedAt?: string;
  clearJob?: boolean;
  note?: string;
}): Promise<Result> {
  const { error } = await supabase.rpc('payroll_edit_segment', {
    p_segment_id: args.segmentId,
    p_kind: args.kind ?? null,
    p_job_id: args.jobId ?? null,
    p_job_name: null,
    p_started_at: args.startedAt ?? null,
    p_ended_at: args.endedAt ?? null,
    p_clear_job: args.clearJob ?? false,
    p_note: args.note?.trim() || null,
  });
  return result(error);
}

export async function insertSegment(args: {
  shiftId: string;
  kind: PayrollSegmentKind;
  startedAt: string;
  endedAt: string;
  jobId?: number | null;
  note?: string;
}): Promise<Result> {
  const { error } = await supabase.rpc('payroll_insert_segment', {
    p_shift_id: args.shiftId,
    p_kind: args.kind,
    p_started_at: args.startedAt,
    p_ended_at: args.endedAt,
    p_job_id: args.jobId ?? null,
    p_job_name: null,
    p_note: args.note?.trim() || null,
  });
  return result(error);
}

export async function deleteSegment(segmentId: string, note?: string): Promise<Result> {
  const { error } = await supabase.rpc('payroll_delete_segment', {
    p_segment_id: segmentId,
    p_note: note?.trim() || null,
  });
  return result(error);
}

export async function editShift(args: {
  shiftId: string;
  startedAt?: string;
  endedAt?: string;
  note?: string;
}): Promise<Result> {
  const { error } = await supabase.rpc('payroll_edit_shift', {
    p_shift_id: args.shiftId,
    p_started_at: args.startedAt ?? null,
    p_ended_at: args.endedAt ?? null,
    p_note: args.note?.trim() || null,
  });
  return result(error);
}

export async function savePayrollSettings(userId: string, row: PayrollSettingsRow): Promise<Result> {
  const { error } = await supabase.from('payroll_settings').update({
    ...row,
    daily_summary_phone: row.daily_summary_phone?.trim() || null,
    updated_at: new Date().toISOString(),
    updated_by: userId,
  }).eq('id', true);
  return result(error);
}

/** Phoenix wall clock on a work date → ISO instant. Phoenix is UTC-7 all year. */
export function phoenixLocalToIso(ymd: string, hhmm: string): string {
  return new Date(`${ymd}T${hhmm}:00-07:00`).toISOString();
}

export function isoToPhoenixHhmm(iso: string | null): string {
  if (!iso) return '';
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Phoenix',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(iso));
  const pick = (type: string) => parts.find(part => part.type === type)?.value ?? '00';
  return `${pick('hour')}:${pick('minute')}`;
}

export function downloadText(filename: string, text: string, type = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

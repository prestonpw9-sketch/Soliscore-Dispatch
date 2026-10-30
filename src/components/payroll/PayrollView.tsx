import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Printer,
  Settings2,
} from 'lucide-react';
import type { Job } from '@/lib/data';
import { useAuth } from '@/lib/AuthContext';
import {
  addDaysYmd,
  approvalKey,
  approvePeriods,
  buildPayroll,
  DEFAULT_SETTINGS_ROW,
  downloadText,
  formatHours,
  jobInfoMap,
  loadPayroll,
  loadPayrollSettings,
  payrollCsv,
  payrollSettingsFromRow,
  phoenixWorkDate,
  removeApproval,
  weekStartFor,
  type PayrollDay,
  type PayrollLoad,
  type PayrollSettingsRow,
  type PayrollWeek,
} from '@/lib/payroll/data';
import { openPrintView, payrollPrintHtml } from '@/lib/payroll/print';
import PayrollDayDetail from './PayrollDayDetail';
import PayrollSettingsPanel from './PayrollSettingsPanel';

interface Props {
  jobs: Job[];
}

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayLabel(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return `${DOW[date.getUTCDay()]} ${month}/${day}`;
}

function clockList(day: PayrollDay, which: 'in' | 'out'): string {
  return day.shifts
    .map(shift => {
      const iso = which === 'in' ? shift.clockIn : shift.clockOut;
      if (!iso) return 'open';
      return new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Phoenix',
        hour: 'numeric',
        minute: '2-digit',
      }).format(new Date(iso));
    })
    .join(' / ');
}

function endReasonLabel(day: PayrollDay): string {
  return day.shifts
    .map(shift => shift.endReason === 'auto_stop' ? 'Auto-stop' : shift.endReason === 'clock_out' ? 'Clock-out' : 'Open')
    .join(' / ');
}

export default function PayrollView({ jobs }: Props) {
  const { session, isOwner } = useAuth();
  const userId = session?.user.id ?? '';
  const [settingsRow, setSettingsRow] = useState<PayrollSettingsRow>(DEFAULT_SETTINGS_ROW);
  const settings = useMemo(
    () => payrollSettingsFromRow(settingsRow as unknown as Record<string, unknown>),
    [settingsRow],
  );
  const [anchor, setAnchor] = useState(() => phoenixWorkDate(new Date()));
  const weekStart = weekStartFor(anchor, settings.weekStartDow);
  const weekEnd = addDaysYmd(weekStart, 6);
  const [load, setLoad] = useState<PayrollLoad | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [worker, setWorker] = useState<string>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    void loadPayrollSettings().then(({ row }) => setSettingsRow(row));
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadPayroll(weekStart, weekEnd);
      setLoad(next);
      setSettingsRow(next.settingsRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load payroll.');
    } finally {
      setLoading(false);
    }
  }, [weekStart, weekEnd]);

  useEffect(() => {
    if (isOwner) void reload();
  }, [isOwner, reload]);

  const jobMap = useMemo(() => jobInfoMap(jobs), [jobs]);

  const computed = useMemo(() => {
    if (!load) return { days: [] as PayrollDay[], weeks: [] as PayrollWeek[] };
    return buildPayroll({
      shifts: load.shifts,
      segments: load.segments,
      jobs: jobMap,
      settings,
    });
  }, [load, jobMap, settings]);

  const approved = useMemo(
    () => new Set((load?.approvals ?? []).map(row => approvalKey(row.user_id, row.period, row.period_start))),
    [load],
  );
  const names = load?.names ?? {};
  const workerIds = useMemo(
    () => Array.from(new Set(computed.weeks.map(week => week.userId)))
      .sort((a, b) => (names[a] ?? a).localeCompare(names[b] ?? b)),
    [computed.weeks, names],
  );
  const weeks = computed.weeks
    .filter(week => worker === 'all' || week.userId === worker)
    .sort((a, b) => (names[a.userId] ?? a.userId).localeCompare(names[b.userId] ?? b.userId));

  if (!isOwner) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-amber-200 bg-amber-50 p-8 text-center dark:border-amber-800 dark:bg-amber-900/20">
        <p className="font-bold text-amber-800 dark:text-amber-300">Owners only</p>
      </div>
    );
  }

  const run = async (key: string, action: () => Promise<{ ok: true } | { ok: false; message: string }>, done: string) => {
    setBusyKey(key);
    setNotice(null);
    const outcome = await action();
    setBusyKey(null);
    if (outcome.ok === false) {
      setNotice(outcome.message);
      return;
    }
    setNotice(done);
    await reload();
  };

  const exportCsv = () => {
    const csv = payrollCsv(weeks, { names, approved });
    downloadText(`payroll_${weekStart}_to_${weekEnd}.csv`, csv);
  };

  const print = () => {
    const html = payrollPrintHtml(`Payroll ${weekStart} to ${weekEnd}`, weeks, names, approved);
    if (!openPrintView(html)) setNotice('The browser blocked the print window. Allow pop-ups for this site and try again.');
  };

  const totals = weeks.reduce(
    (sum, week) => ({ paid: sum.paid + week.paidMinutes, overtime: sum.overtime + week.overtimeMinutes }),
    { paid: 0, overtime: 0 },
  );
  const flagCount = weeks.reduce(
    (sum, week) => sum + week.days.reduce((n, day) => n + day.anomalies.filter(a => !a.resolved).length, 0),
    0,
  );

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setAnchor(addDaysYmd(weekStart, -7))}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="min-w-[13rem] text-center text-sm font-bold text-slate-900 dark:text-white">
            {dayLabel(weekStart)} – {dayLabel(weekEnd)}
          </div>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setAnchor(addDaysYmd(weekStart, 7))}
            className="rounded-lg border border-slate-200 p-2 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setAnchor(phoenixWorkDate(new Date()))}
            className="rounded-lg px-2 py-2 text-xs font-semibold text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-slate-800"
          >
            This week
          </button>
          <select
            aria-label="Worker"
            value={worker}
            onChange={event => setWorker(event.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All workers</option>
            {workerIds.map(id => (
              <option key={id} value={id}>{names[id] ?? id}</option>
            ))}
          </select>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              onClick={exportCsv}
              disabled={!weeks.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={print}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
            <button
              type="button"
              onClick={() => setSettingsOpen(open => !open)}
              aria-expanded={settingsOpen}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-800"
            >
              <Settings2 className="h-4 w-4" /> Settings
            </button>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          {weeks.length} worker{weeks.length === 1 ? '' : 's'} · {formatHours(totals.paid)} h paid
          {totals.overtime ? ` · ${formatHours(totals.overtime)} h overtime` : ''}
          {flagCount ? ` · ${flagCount} flag${flagCount === 1 ? '' : 's'} to review` : ''}
          {' · '}Pay week starts {DOW[settings.weekStartDow]}; overtime over {settings.overtimeWeeklyHours} h; lunch {settings.lunchPaid ? 'paid' : 'unpaid'}.
        </p>
        {load?.setupMessage && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            {load.setupMessage}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-2 rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-800 dark:bg-slate-800 dark:text-slate-100">
            {notice}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:bg-rose-950 dark:text-rose-100">
            {error}
          </p>
        )}
      </section>

      {settingsOpen && (
        <PayrollSettingsPanel
          userId={userId}
          row={settingsRow}
          onSaved={row => {
            setSettingsRow(row);
            setNotice('Payroll settings saved. Phones pick up a new lunch window the next time they open the app.');
            void reload();
          }}
        />
      )}

      {loading && !load ? (
        <div className="flex items-center justify-center py-16 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : weeks.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
          No shifts clocked in this week.
        </p>
      ) : (
        weeks.map(week => {
          const weekKey = approvalKey(week.userId, 'week', week.weekStart);
          const weekApproved = approved.has(weekKey);
          return (
            <section
              key={weekKey}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
            >
              <header className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">{names[week.userId] ?? 'Crew member'}</h3>
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  {formatHours(week.paidMinutes)} h paid · {formatHours(week.regularMinutes)} regular
                </span>
                {week.overtime && (
                  <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-black text-rose-800 dark:border-rose-400/50 dark:bg-rose-500/20 dark:text-rose-100">
                    Overtime {formatHours(week.overtimeMinutes)} h
                  </span>
                )}
                <div className="ml-auto">
                  {weekApproved ? (
                    <button
                      type="button"
                      disabled={busyKey === weekKey}
                      onClick={() => { void run(weekKey, () => removeApproval(week.userId, 'week', week.weekStart), 'Week approval removed.'); }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-100"
                      title="Click to remove the week approval"
                    >
                      <CheckCircle2 className="h-4 w-4" /> Week approved
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busyKey === weekKey}
                      onClick={() => {
                        void run(weekKey, () => approvePeriods(userId, week.userId, [
                          { period: 'week', start: week.weekStart },
                          ...week.days.map(day => ({ period: 'day' as const, start: day.workDate })),
                        ]), 'Week approved.');
                      }}
                      className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-teal-700 disabled:opacity-60"
                    >
                      Approve week
                    </button>
                  )}
                </div>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[60rem] text-sm">
                  <thead className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Day</th>
                      <th className="px-3 py-2">In</th>
                      <th className="px-3 py-2">Out</th>
                      <th className="px-3 py-2">End</th>
                      <th className="px-3 py-2 text-right">Shop</th>
                      <th className="px-3 py-2 text-right">Travel</th>
                      <th className="px-3 py-2 text-right">On site</th>
                      <th className="px-3 py-2 text-right">Lunch ded.</th>
                      <th className="px-3 py-2 text-right">Paid</th>
                      <th className="px-3 py-2 text-right">OT</th>
                      <th className="px-3 py-2">Flags</th>
                      <th className="px-3 py-2">Approve</th>
                    </tr>
                  </thead>
                  <tbody>
                    {week.days.map(day => {
                      const dayKey = approvalKey(day.userId, 'day', day.workDate);
                      const dayApproved = approved.has(dayKey);
                      const open = expanded === dayKey;
                      const flags = day.anomalies.filter(anomaly => !anomaly.resolved);
                      return (
                        <DayRows
                          key={dayKey}
                          day={day}
                          open={open}
                          flags={flags.length}
                          approvedDay={dayApproved}
                          busy={busyKey === dayKey}
                          onToggle={() => setExpanded(open ? null : dayKey)}
                          onApprove={() => { void run(dayKey, () => approvePeriods(userId, day.userId, [{ period: 'day', start: day.workDate }]), `${dayLabel(day.workDate)} approved.`); }}
                          onUnapprove={() => { void run(dayKey, () => removeApproval(day.userId, 'day', day.workDate), `${dayLabel(day.workDate)} approval removed.`); }}
                        >
                          <PayrollDayDetail
                            day={day}
                            jobs={jobs}
                            names={names}
                            audit={(load?.audit ?? []).filter(row => day.shifts.some(shift => shift.id === row.shift_id))}
                            onChanged={async message => {
                              setNotice(message);
                              await reload();
                            }}
                          />
                        </DayRows>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function DayRows({
  day,
  open,
  flags,
  approvedDay,
  busy,
  onToggle,
  onApprove,
  onUnapprove,
  children,
}: {
  day: PayrollDay;
  open: boolean;
  flags: number;
  approvedDay: boolean;
  busy: boolean;
  onToggle: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
  children: ReactNode;
}) {
  return (
    <>
      <tr className="border-t border-slate-100 align-top dark:border-slate-800">
        <td className="px-3 py-2">
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="inline-flex items-center gap-1 font-semibold text-slate-900 hover:text-teal-700 dark:text-white"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            {dayLabel(day.workDate)}
          </button>
          {day.edited && <span className="ml-1 text-[10px] font-bold uppercase text-sky-700 dark:text-sky-300">edited</span>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">{clockList(day, 'in')}</td>
        <td className="px-3 py-2 whitespace-nowrap">{clockList(day, 'out')}</td>
        <td className="px-3 py-2 whitespace-nowrap">{endReasonLabel(day)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatHours(day.shopMinutes)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatHours(day.travelMinutes)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatHours(day.onsiteMinutes)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{formatHours(day.lunchDeductedMinutes)}</td>
        <td className="px-3 py-2 text-right font-bold tabular-nums">{formatHours(day.paidMinutes)}</td>
        <td className="px-3 py-2 text-right tabular-nums text-rose-700 dark:text-rose-300">
          {day.overtimeMinutes ? formatHours(day.overtimeMinutes) : ''}
        </td>
        <td className="px-3 py-2">
          {flags > 0 && (
            <span
              title={day.anomalies.filter(a => !a.resolved).map(a => a.message).join('\n')}
              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-900 dark:bg-amber-400/25 dark:text-amber-50"
            >
              <AlertTriangle className="h-3 w-3" /> {flags}
            </span>
          )}
        </td>
        <td className="px-3 py-2">
          {approvedDay ? (
            <button
              type="button"
              disabled={busy}
              onClick={onUnapprove}
              title="Click to remove the approval"
              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300"
            >
              <CheckCircle2 className="h-4 w-4" /> Approved
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={onApprove}
              className="rounded-lg border border-teal-600 px-2 py-1 text-xs font-semibold text-teal-700 hover:bg-teal-50 disabled:opacity-60 dark:text-teal-300 dark:hover:bg-slate-800"
            >
              Approve
            </button>
          )}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50 dark:bg-slate-950/40">
          <td colSpan={12} className="px-3 py-3">{children}</td>
        </tr>
      )}
    </>
  );
}

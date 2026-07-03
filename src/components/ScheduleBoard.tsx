import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CalendarRange, Loader2, Plus, Trash2, X,
  ClipboardCheck, ArrowRightLeft, Check, AlertTriangle, CheckCircle2,
  MapPin, User, CalendarDays,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job, Technician, JobTask, TaskStatus } from '@/lib/data';

// ── Date helpers (all 'YYYY-MM-DD' text, no time-of-day) ────────────────────

function parseYMD(s: string): Date {
  // Parse as local midnight to avoid TZ shifting the day.
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}
function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function addDays(s: string, n: number): string {
  const d = parseYMD(s);
  d.setDate(d.getDate() + n);
  return toYMD(d);
}
function daysBetween(a: string, b: string): number {
  // Inclusive whole-day count from a..b (b - a in days).
  return Math.round((parseYMD(b).getTime() - parseYMD(a).getTime()) / 86_400_000);
}
const todayYMD = () => toYMD(new Date());

// Friendly label for the My Day header, e.g. "Today · Fri, Jul 3".
function relativeDayLabel(ymd: string): string {
  const diff = daysBetween(todayYMD(), ymd);
  const nice = parseYMD(ymd).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (diff === 0) return `Today · ${nice}`;
  if (diff === 1) return `Tomorrow · ${nice}`;
  if (diff === -1) return `Yesterday · ${nice}`;
  return nice;
}

// Build the visible day columns.
function buildDays(anchor: Date, mode: 'month' | 'timeline'): string[] {
  if (mode === 'month') {
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const count = new Date(year, month + 1, 0).getDate();
    return Array.from({ length: count }, (_, i) => toYMD(new Date(year, month, i + 1)));
  }
  // Timeline: 4 weeks (28 days) starting from the anchor day.
  const base = toYMD(anchor);
  return Array.from({ length: 28 }, (_, i) => addDays(base, i));
}

// ── Schedule math: on-track vs behind ───────────────────────────────────────

interface Health {
  expected: number;            // expected % complete given elapsed days
  behind: boolean;
  complete: boolean;
}

const BEHIND_BUFFER = 10; // grace points before we call a row "behind"

function computeHealth(task: { startDate: string; endDate: string; percentComplete: number; status: TaskStatus }): Health {
  const complete = task.status === 'complete' || task.percentComplete >= 100;
  if (complete) return { expected: 100, behind: false, complete: true };

  const total = Math.max(1, daysBetween(task.startDate, task.endDate) + 1);
  const elapsed = daysBetween(task.startDate, todayYMD()) + 1; // day 1 == start day
  const clampedElapsed = Math.max(0, Math.min(total, elapsed));
  const expected = Math.round((clampedElapsed / total) * 100);
  const behind = expected > 0 && task.percentComplete + BEHIND_BUFFER < expected;
  return { expected, behind, complete: false };
}

const STATUS_LABEL: Record<TaskStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  complete: 'Complete',
  behind: 'Behind',
};

// ── DB row mappers ───────────────────────────────────────────────────────────

interface RawTaskRow {
  id: string;
  job_id: number | string;
  technician_id: string | null;
  task: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  percent_complete: number | null;
}

function mapTask(r: RawTaskRow, fallbackStart: string, fallbackEnd: string): JobTask {
  return {
    id: r.id,
    jobId: String(r.job_id),
    technicianId: r.technician_id ?? null,
    task: r.task ?? '',
    startDate: r.start_date ?? fallbackStart,
    endDate: r.end_date ?? fallbackEnd,
    status: (r.status as TaskStatus) ?? 'not_started',
    percentComplete: r.percent_complete ?? 0,
  };
}

// ── Props ────────────────────────────────────────────────────────────────────

interface Props {
  jobs: Job[];
  technicians: Technician[];
  onRefresh: () => Promise<void> | void;
}

// ── Component ────────────────────────────────────────────────────────────────

const COL_W = 36; // px per day column

const ScheduleBoard: React.FC<Props> = ({ jobs, technicians, onRefresh }) => {
  const { canEdit } = useAuth();

  const [mode, setMode] = useState<'month' | 'timeline' | 'myday'>(
    () => (typeof window !== 'undefined' && window.innerWidth < 768 ? 'myday' : 'month'),
  );
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // My Day (mobile-first) state: which crew member and which day we're viewing.
  const [selectedDay, setSelectedDay] = useState<string>(() => todayYMD());
  const [viewAsTech, setViewAsTech] = useState<string>(() => {
    try { return localStorage.getItem('schedule_myday_tech') ?? ''; } catch { return ''; }
  });
  const chooseTech = useCallback((id: string) => {
    setViewAsTech(id);
    try { localStorage.setItem('schedule_myday_tech', id); } catch { /* ignore */ }
  }, []);

  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [latestNotes, setLatestNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Popovers / modals
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [logTask, setLogTask] = useState<JobTask | null>(null);
  const [moveTask, setMoveTask] = useState<JobTask | null>(null);

  const days = useMemo(() => buildDays(anchor, mode === 'month' ? 'month' : 'timeline'), [anchor, mode]);
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];

  const technicianName = useCallback(
    (id: string | null) => technicians.find(t => t.id === id)?.name ?? 'Unassigned',
    [technicians],
  );

  // Stable per-plumber color so each crew member is instantly recognizable on the
  // board (their name dot + their job bars all share their color).
  const CREW_COLORS = [
    '#0d9488', // teal
    '#2563eb', // blue
    '#db2777', // pink
    '#ea580c', // orange
    '#7c3aed', // violet
    '#16a34a', // green
    '#dc2626', // red
    '#0891b2', // cyan
    '#ca8a04', // gold
    '#4f46e5', // indigo
    '#be123c', // rose
    '#65a30d', // lime
  ];
  const techColor = useCallback(
    (id: string | null): string => {
      if (!id) return '#94a3b8'; // slate for unassigned
      const t = technicians.find(x => x.id === id);
      if (t?.color) return t.color;
      const idx = Math.max(0, technicians.findIndex(x => x.id === id));
      return CREW_COLORS[idx % CREW_COLORS.length];
    },
    [technicians],
  );

  // ── Fetch job_tasks + latest update note ──────────────────────────────────
  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: taskErr } = await supabase
      .from('job_tasks')
      .select('*')
      .order('created_at', { ascending: true });
    if (taskErr) {
      setError(taskErr.message);
      setLoading(false);
      return;
    }
    const jobById = new Map(jobs.map(j => [j.id, j]));
    const mapped = (data ?? []).map((r: RawTaskRow) => {
      const job = jobById.get(String(r.job_id));
      return mapTask(r, job?.date ?? todayYMD(), job?.endDate ?? job?.date ?? todayYMD());
    });
    setTasks(mapped);

    const { data: updates } = await supabase
      .from('task_updates')
      .select('job_task_id, note, update_date, created_at')
      .order('created_at', { ascending: false });
    const notes: Record<string, string> = {};
    (updates ?? []).forEach((u: { job_task_id: string; note: string | null }) => {
      if (u.job_task_id && notes[u.job_task_id] === undefined) notes[u.job_task_id] = u.note ?? '';
    });
    setLatestNotes(notes);
    setLoading(false);
  }, [jobs]);

  useEffect(() => { void fetchTasks(); }, [fetchTasks]);

  // ── Mutations on job_tasks ────────────────────────────────────────────────
  const patchTask = useCallback(async (id: string, patch: Partial<JobTask>) => {
    setTasks(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)));
    const dbPatch: Record<string, unknown> = {};
    if (patch.task !== undefined) dbPatch.task = patch.task;
    if (patch.startDate !== undefined) dbPatch.start_date = patch.startDate;
    if (patch.endDate !== undefined) dbPatch.end_date = patch.endDate;
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.percentComplete !== undefined) dbPatch.percent_complete = patch.percentComplete;
    const { error: err } = await supabase.from('job_tasks').update(dbPatch).eq('id', id);
    if (err) { setError(err.message); void fetchTasks(); }
  }, [fetchTasks]);

  const addCrewToJob = useCallback(async (job: Job, techIds: string[]) => {
    const existing = new Set(tasks.filter(t => t.jobId === job.id).map(t => t.technicianId));
    const rows = techIds
      .filter(id => !existing.has(id))
      .map(id => ({
        job_id: job.id,
        technician_id: id,
        task: '',
        start_date: job.date,
        end_date: job.endDate ?? job.date,
        status: 'not_started',
        percent_complete: 0,
      }));
    if (!rows.length) return;
    const { error: err } = await supabase.from('job_tasks').insert(rows);
    if (err) { setError(err.message); return; }
    // Keep jobs.technician_ids in sync for the rest of the app.
    const merged = Array.from(new Set([...(job.technicianIds ?? []), ...techIds]));
    await supabase.from('jobs').update({ technician_ids: merged, technician_id: merged[0] ?? null }).eq('id', job.id);
    await fetchTasks();
    await onRefresh();
  }, [tasks, fetchTasks, onRefresh]);

  const removeCrewRow = useCallback(async (task: JobTask) => {
    const { error: err } = await supabase.from('job_tasks').delete().eq('id', task.id);
    if (err) { setError(err.message); return; }
    const job = jobs.find(j => j.id === task.jobId);
    if (job && task.technicianId) {
      const next = (job.technicianIds ?? []).filter(id => id !== task.technicianId);
      await supabase.from('jobs').update({ technician_ids: next, technician_id: next[0] ?? null }).eq('id', job.id);
    }
    await fetchTasks();
    await onRefresh();
  }, [jobs, fetchTasks, onRefresh]);

  const moveTaskToJob = useCallback(async (task: JobTask, newJobId: string) => {
    const newJob = jobs.find(j => j.id === newJobId);
    if (!newJob) return;
    const { error: err } = await supabase
      .from('job_tasks')
      .update({ job_id: newJobId, start_date: newJob.date, end_date: newJob.endDate ?? newJob.date })
      .eq('id', task.id);
    if (err) { setError(err.message); return; }
    // Sync crew arrays on both jobs.
    const oldJob = jobs.find(j => j.id === task.jobId);
    if (oldJob && task.technicianId) {
      const next = (oldJob.technicianIds ?? []).filter(id => id !== task.technicianId);
      await supabase.from('jobs').update({ technician_ids: next, technician_id: next[0] ?? null }).eq('id', oldJob.id);
    }
    if (task.technicianId) {
      const merged = Array.from(new Set([...(newJob.technicianIds ?? []), task.technicianId]));
      await supabase.from('jobs').update({ technician_ids: merged, technician_id: merged[0] ?? null }).eq('id', newJob.id);
    }
    setMoveTask(null);
    await fetchTasks();
    await onRefresh();
  }, [jobs, fetchTasks, onRefresh]);

  const saveJobDates = useCallback(async (job: Job, start: string, end: string) => {
    const safeEnd = end < start ? start : end;
    const { error: err } = await supabase.from('jobs').update({ date: start, end_date: safeEnd }).eq('id', job.id);
    if (err) { setError(err.message); return; }
    setEditJob(null);
    await onRefresh();
  }, [onRefresh]);

  // ── Log today (writes task_updates + updates job_tasks) ────────────────────
  const submitLog = useCallback(async (
    task: JobTask, updateDate: string, note: string, percent: number,
  ) => {
    const { data: userData } = await supabase.auth.getUser();
    const pct = Math.max(0, Math.min(100, percent));
    const newStatus: TaskStatus = pct >= 100 ? 'complete' : pct > 0 ? 'in_progress' : 'not_started';
    const { error: insErr } = await supabase.from('task_updates').insert([{
      job_task_id: task.id,
      job_id: task.jobId,
      update_date: updateDate,
      note,
      percent_complete: pct,
      created_by: userData.user?.id ?? null,
    }]);
    if (insErr) { setError(insErr.message); return; }
    await patchTask(task.id, { percentComplete: pct, status: newStatus });
    setLatestNotes(prev => ({ ...prev, [task.id]: note }));
    setLogTask(null);
  }, [patchTask]);

  // ── Group tasks by job ────────────────────────────────────────────────────
  const groups = useMemo(() => {
    // Only show jobs whose range overlaps the visible window.
    const visible = jobs.filter(j => {
      const s = j.date;
      const e = j.endDate ?? j.date;
      return e >= rangeStart && s <= rangeEnd;
    });
    return visible
      .map(job => ({
        job,
        rows: tasks.filter(t => t.jobId === job.id),
      }))
      .sort((a, b) => a.job.date.localeCompare(b.job.date));
  }, [jobs, tasks, rangeStart, rangeEnd]);

  // Position helper for a bar within the day grid.
  const barStyle = (start: string, end: string): React.CSSProperties | null => {
    const s = start < rangeStart ? rangeStart : start;
    const e = end > rangeEnd ? rangeEnd : end;
    if (e < rangeStart || s > rangeEnd) return null;
    const offset = daysBetween(rangeStart, s);
    const span = daysBetween(s, e) + 1;
    return { left: offset * COL_W, width: span * COL_W - 4 };
  };

  // ── Navigation ────────────────────────────────────────────────────────────
  const goPrev = () => {
    if (mode === 'myday') { setSelectedDay(d => addDays(d, -1)); return; }
    setAnchor(a => mode === 'month'
      ? new Date(a.getFullYear(), a.getMonth() - 1, 1)
      : parseYMD(addDays(toYMD(a), -14)));
  };
  const goNext = () => {
    if (mode === 'myday') { setSelectedDay(d => addDays(d, 1)); return; }
    setAnchor(a => mode === 'month'
      ? new Date(a.getFullYear(), a.getMonth() + 1, 1)
      : parseYMD(addDays(toYMD(a), 14)));
  };
  const goToday = () => {
    if (mode === 'myday') { setSelectedDay(todayYMD()); return; }
    setAnchor(() => {
      const d = new Date();
      return mode === 'month' ? new Date(d.getFullYear(), d.getMonth(), 1) : d;
    });
  };

  const headerLabel = mode === 'myday'
    ? relativeDayLabel(selectedDay)
    : mode === 'month'
      ? anchor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
      : `${parseYMD(rangeStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${parseYMD(rangeEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

  const gridWidth = days.length * COL_W;
  const today = todayYMD();

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
            <CalendarRange className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <h2 className="text-lg font-black text-slate-900 dark:text-white min-w-[12rem]">{headerLabel}</h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
            {(['myday', 'month', 'timeline'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 text-xs font-bold transition-colors ${
                  mode === m
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                {m === 'myday' ? 'My Day' : m === 'month' ? 'Month' : 'Timeline'}
              </button>
            ))}
          </div>
          <button type="button" onClick={goToday}
            className="px-3 py-1.5 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors">
            Today
          </button>
          <button type="button" onClick={goPrev} aria-label="Previous"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={goNext} aria-label="Next"
            className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium">
          {error}
        </div>
      )}

      {/* Crew color legend — each plumber's color so they spot themselves fast */}
      {mode !== 'myday' && technicians.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Crew colors:</span>
          {technicians.map(t => (
            <span key={t.id} className="inline-flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full ring-1 ring-black/10" style={{ backgroundColor: techColor(t.id) }} />
              <span className="text-xs font-bold" style={{ color: techColor(t.id) }}>{t.name}</span>
            </span>
          ))}
        </div>
      )}

      {/* Board */}
      {mode === 'myday' ? (
        <MyDayView
          jobs={jobs}
          tasks={tasks}
          technicians={technicians}
          selectedDay={selectedDay}
          viewAsTech={viewAsTech}
          onChangeTech={chooseTech}
          techColor={techColor}
          technicianName={technicianName}
          latestNotes={latestNotes}
          canEdit={canEdit}
          onLog={setLogTask}
          loading={loading}
        />
      ) : (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: 320 + gridWidth }}>
            {/* Day header */}
            <div className="flex sticky top-0 z-10 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
              <div className="w-80 shrink-0 px-4 py-2 text-xs font-black uppercase tracking-wide text-slate-500">
                Job / Crew
              </div>
              <div className="flex" style={{ width: gridWidth }}>
                {days.map(d => {
                  const dt = parseYMD(d);
                  const isToday = d === today;
                  const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                  return (
                    <div key={d}
                      className={`shrink-0 text-center py-1 border-l border-slate-100 dark:border-slate-800 ${
                        weekend ? 'bg-slate-100/60 dark:bg-slate-800/40' : ''
                      } ${isToday ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
                      style={{ width: COL_W }}>
                      <div className="text-[9px] text-slate-400 leading-none">
                        {dt.toLocaleDateString('en-US', { weekday: 'narrow' })}
                      </div>
                      <div className={`text-xs font-bold leading-tight ${isToday ? 'text-indigo-600 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                        {dt.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Body */}
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : groups.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <CalendarRange className="w-12 h-12 opacity-20" />
                <p className="text-sm font-medium">No jobs scheduled in this range.</p>
              </div>
            ) : (
              groups.map(({ job, rows }) => {
                const jobBehind = rows.some(r => computeHealth(r).behind);
                const jobStart = job.date;
                const jobEnd = job.endDate ?? job.date;
                const jobBar = barStyle(jobStart, jobEnd);
                return (
                  <div key={job.id} className="border-b border-slate-100 dark:border-slate-800">
                    {/* Job group header row */}
                    <div className="flex items-stretch bg-slate-50/70 dark:bg-slate-800/30">
                      <div className="w-80 shrink-0 px-4 py-2.5 flex items-center gap-2 min-w-0">
                        <button
                          type="button"
                          disabled={!canEdit}
                          onClick={() => setEditJob(job)}
                          className="min-w-0 text-left disabled:cursor-default"
                          title={canEdit ? 'Edit job dates' : undefined}
                        >
                          <div className="font-bold text-sm text-slate-900 dark:text-white truncate">
                            {job.customerName}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {job.serviceType && (
                              <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                                {job.serviceType}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              {parseYMD(jobStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              {' – '}
                              {parseYMD(jobEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </button>
                        <span className={`ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full ${
                          jobBehind
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                        }`}>
                          {jobBehind ? <><AlertTriangle className="w-3 h-3" /> Behind</> : <><CheckCircle2 className="w-3 h-3" /> On schedule</>}
                        </span>
                      </div>
                      {/* Job bar */}
                      <div className="relative" style={{ width: gridWidth }}>
                        {jobBar && (
                          <div
                            className={`absolute top-1/2 -translate-y-1/2 h-3 rounded-full ${
                              jobBehind ? 'bg-red-400/70 dark:bg-red-500/50' : 'bg-indigo-400/60 dark:bg-indigo-500/40'
                            }`}
                            style={jobBar}
                          />
                        )}
                      </div>
                    </div>

                    {/* Crew rows */}
                    {rows.length === 0 ? (
                      <div className="flex items-center">
                        <div className="w-80 shrink-0 px-4 py-2 text-xs text-slate-400 italic">
                          No crew assigned yet.
                          {canEdit && (
                            <AddCrewInline job={job} tasks={tasks} technicians={technicians} onAdd={addCrewToJob} />
                          )}
                        </div>
                        <div style={{ width: gridWidth }} />
                      </div>
                    ) : (
                      rows.map(task => {
                        const health = computeHealth(task);
                        const rowBar = barStyle(task.startDate, task.endDate);
                        return (
                          <div key={task.id} className="flex items-stretch hover:bg-slate-50/60 dark:hover:bg-slate-800/30 group">
                            {/* Left: crew + task editor */}
                            <div className="w-80 shrink-0 px-4 py-2 flex flex-col gap-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span
                                  className="shrink-0 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900"
                                  style={{ backgroundColor: techColor(task.technicianId) }}
                                  title={technicianName(task.technicianId)}
                                />
                                <span
                                  className="text-xs font-black truncate"
                                  style={{ color: techColor(task.technicianId) }}
                                >
                                  {technicianName(task.technicianId)}
                                </span>
                                <span className={`shrink-0 text-[9px] font-black px-1.5 py-0.5 rounded-full ${
                                  health.complete
                                    ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                                    : health.behind
                                      ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                                      : task.status === 'in_progress'
                                        ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300'
                                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                }`}>
                                  {health.behind && !health.complete ? STATUS_LABEL.behind : STATUS_LABEL[task.status]}
                                </span>
                                {canEdit && (
                                  <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button type="button" title="Move to another job"
                                      onClick={() => setMoveTask(task)}
                                      className="p-1 rounded text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20">
                                      <ArrowRightLeft className="w-3.5 h-3.5" />
                                    </button>
                                    <button type="button" title="Remove crew from job"
                                      onClick={() => void removeCrewRow(task)}
                                      className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <input
                                type="text"
                                value={task.task}
                                disabled={!canEdit}
                                placeholder="Task (e.g. running water overhead)…"
                                onChange={e => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, task: e.target.value } : t))}
                                onBlur={e => void patchTask(task.id, { task: e.target.value })}
                                className="w-full text-xs px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none disabled:opacity-60 disabled:cursor-default"
                              />
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      health.complete ? 'bg-teal-500' : health.behind ? 'bg-red-500' : 'bg-indigo-500'
                                    }`}
                                    style={{ width: `${Math.min(100, task.percentComplete)}%` }}
                                  />
                                </div>
                                <span className="text-[10px] font-bold text-slate-500 w-8 text-right">{task.percentComplete}%</span>
                                {canEdit && (
                                  <button type="button"
                                    onClick={() => setLogTask(task)}
                                    title="Log today's progress"
                                    className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-teal-600 hover:bg-teal-700 text-white transition-colors">
                                    <ClipboardCheck className="w-3 h-3" /> Log
                                  </button>
                                )}
                              </div>
                              {latestNotes[task.id] && (
                                <p className="text-[10px] text-slate-400 truncate" title={latestNotes[task.id]}>
                                  Latest: {latestNotes[task.id]}
                                </p>
                              )}
                            </div>
                            {/* Right: crew bar */}
                            <div className="relative" style={{ width: gridWidth }}>
                              {/* day grid lines */}
                              <div className="absolute inset-0 flex">
                                {days.map(d => {
                                  const dt = parseYMD(d);
                                  const weekend = dt.getDay() === 0 || dt.getDay() === 6;
                                  return (
                                    <div key={d}
                                      className={`shrink-0 border-l border-slate-50 dark:border-slate-800/60 ${
                                        weekend ? 'bg-slate-50/40 dark:bg-slate-800/20' : ''
                                      } ${d === today ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                                      style={{ width: COL_W }} />
                                  );
                                })}
                              </div>
                              {rowBar && (
                                <div
                                  className={`absolute top-1/2 -translate-y-1/2 h-5 rounded-md flex items-center px-2 text-[10px] font-bold text-white truncate shadow-sm ${
                                    health.behind ? 'ring-2 ring-red-500 ring-offset-1' : ''
                                  }`}
                                  style={{ ...rowBar, backgroundColor: techColor(task.technicianId) }}
                                  title={`${technicianName(task.technicianId)}${task.task ? ' — ' + task.task : ''}${health.behind ? ' (BEHIND)' : health.complete ? ' (Complete)' : ''}`}
                                >
                                  {task.task || technicianName(task.technicianId)}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}

                    {/* Add crew action under each job */}
                    {canEdit && rows.length > 0 && (
                      <div className="flex">
                        <div className="w-80 shrink-0 px-4 pb-2">
                          <AddCrewInline job={job} tasks={tasks} technicians={technicians} onAdd={addCrewToJob} />
                        </div>
                        <div style={{ width: gridWidth }} />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
      )}

      {/* Modals */}
      {editJob && (
        <EditJobDatesModal job={editJob} onClose={() => setEditJob(null)} onSave={saveJobDates} />
      )}
      {logTask && (
        <LogTodayModal
          task={logTask}
          techName={technicianName(logTask.technicianId)}
          onClose={() => setLogTask(null)}
          onSubmit={submitLog}
        />
      )}
      {moveTask && (
        <MoveJobModal
          task={moveTask}
          jobs={jobs}
          onClose={() => setMoveTask(null)}
          onMove={moveTaskToJob}
        />
      )}
    </div>
  );
};

// ── My Day (mobile-first per-crew list) ──────────────────────────────────────
// A phone-friendly vertical list: one card per job the selected crew member is
// on for the chosen day. Shows site, phase, task, "Day X of N", progress,
// one-tap Directions, and a big Log-progress button. A "Viewing as" picker
// (saved to localStorage) is used because there's no link between a login and a
// technicians row.

const MyDayView: React.FC<{
  jobs: Job[];
  tasks: JobTask[];
  technicians: Technician[];
  selectedDay: string;
  viewAsTech: string;
  onChangeTech: (id: string) => void;
  techColor: (id: string | null) => string;
  technicianName: (id: string | null) => string;
  latestNotes: Record<string, string>;
  canEdit: boolean;
  onLog: (t: JobTask) => void;
  loading: boolean;
}> = ({
  jobs, tasks, technicians, selectedDay, viewAsTech, onChangeTech,
  techColor, technicianName, latestNotes, canEdit, onLog, loading,
}) => {
  const jobById = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);

  const picker = (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-bold text-slate-500 inline-flex items-center gap-1">
        <User className="w-3.5 h-3.5" /> Viewing as
      </span>
      <select
        value={viewAsTech}
        onChange={e => onChangeTech(e.target.value)}
        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold text-slate-800 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
      >
        <option value="">Select your name…</option>
        {technicians.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-indigo-500 animate-spin" /></div>;
  }

  if (!viewAsTech) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 text-center space-y-3">
        <User className="w-10 h-10 mx-auto text-slate-300" />
        <p className="text-sm font-medium text-slate-500">Pick your name once to see just your jobs each day.</p>
        <div className="flex justify-center">{picker}</div>
      </div>
    );
  }

  const mine = tasks.filter(t => t.technicianId === viewAsTech);
  const activeToday = mine
    .filter(t => t.startDate <= selectedDay && (t.endDate ?? t.startDate) >= selectedDay)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  const upcoming = mine
    .filter(t => t.startDate > selectedDay)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(0, 4);

  const renderCard = (task: JobTask, upcomingMode: boolean) => {
    const job = jobById.get(task.jobId);
    if (!job) return null;
    const color = techColor(task.technicianId);
    const health = computeHealth(task);
    const total = Math.max(1, daysBetween(task.startDate, task.endDate) + 1);
    const dayNum = Math.min(total, Math.max(1, daysBetween(task.startDate, selectedDay) + 1));
    const startsIn = daysBetween(selectedDay, task.startDate);
    const mapHref = job.address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`
      : null;
    return (
      <div key={task.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: color }} />
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-base font-black text-slate-900 dark:text-white truncate">{job.customerName}</div>
              {job.address && <div className="text-sm text-slate-500 truncate">{job.address}</div>}
            </div>
            {job.serviceType && (
              <span className="shrink-0 text-[11px] font-black uppercase px-2 py-1 rounded-lg bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {job.serviceType}
              </span>
            )}
          </div>

          {task.task && (
            <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">{task.task}</div>
          )}

          <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
            <CalendarDays className="w-4 h-4 shrink-0" />
            {upcomingMode ? (
              <span>
                Starts {startsIn === 1 ? 'tomorrow' : `in ${startsIn} days`}
                {' · '}
                {parseYMD(task.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {'–'}
                {parseYMD(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            ) : (
              <span>
                Day {dayNum} of {total}
                {' · through '}
                {parseYMD(task.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>

          {!upcomingMode && (
            <div className="flex items-center gap-2">
              <div className="flex-1 h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                <div
                  className={`h-full rounded-full ${health.complete ? 'bg-teal-500' : health.behind ? 'bg-red-500' : 'bg-indigo-500'}`}
                  style={{ width: `${Math.min(100, task.percentComplete)}%` }}
                />
              </div>
              <span className="text-xs font-black text-slate-600 dark:text-slate-300 w-9 text-right">{task.percentComplete}%</span>
              <span className={`text-[11px] font-black px-2 py-1 rounded-full ${
                health.complete
                  ? 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300'
                  : health.behind
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {health.complete ? 'Complete' : health.behind ? 'Behind' : 'On track'}
              </span>
            </div>
          )}

          {latestNotes[task.id] && (
            <p className="text-xs text-slate-400">Latest: {latestNotes[task.id]}</p>
          )}

          <div className="flex gap-2 pt-1">
            {mapHref && (
              <a
                href={mapHref}
                target="_blank"
                rel="noreferrer"
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <MapPin className="w-4 h-4" /> Directions
              </a>
            )}
            {!upcomingMode && canEdit && (
              <button
                type="button"
                onClick={() => onLog(task)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold transition-colors"
              >
                <ClipboardCheck className="w-4 h-4" /> Log progress
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between gap-2">{picker}</div>

      <div>
        <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">On this day</h3>
        {activeToday.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center text-sm text-slate-400">
            Nothing scheduled for {technicianName(viewAsTech)} on this day.
          </div>
        ) : (
          <div className="space-y-3">{activeToday.map(t => renderCard(t, false))}</div>
        )}
      </div>

      {upcoming.length > 0 && (
        <div>
          <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Coming up</h3>
          <div className="space-y-3">{upcoming.map(t => renderCard(t, true))}</div>
        </div>
      )}
    </div>
  );
};

// ── Add-crew inline multiselect ──────────────────────────────────────────────

const AddCrewInline: React.FC<{
  job: Job;
  tasks: JobTask[];
  technicians: Technician[];
  onAdd: (job: Job, ids: string[]) => Promise<void> | void;
}> = ({ job, tasks, technicians, onAdd }) => {
  const [open, setOpen] = useState(false);
  const assigned = new Set(tasks.filter(t => t.jobId === job.id).map(t => t.technicianId));
  const available = technicians.filter(t => !assigned.has(t.id));

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)}
        className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
        <Plus className="w-3 h-3" /> Add crew
      </button>
    );
  }
  return (
    <div className="mt-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1.5 max-h-40 overflow-y-auto">
      {available.length === 0 ? (
        <p className="text-[10px] text-slate-400 px-1 py-1">All crew already on this job.</p>
      ) : (
        available.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => { void onAdd(job, [t.id]); setOpen(false); }}
            className="w-full flex items-center gap-2 px-2 py-1 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded"
          >
            <Plus className="w-3 h-3 text-indigo-500" /> {t.name}
            <span className="ml-auto text-[9px] text-slate-400">{t.role}</span>
          </button>
        ))
      )}
      <button type="button" onClick={() => setOpen(false)}
        className="w-full mt-1 text-[10px] text-slate-400 hover:text-slate-600">Done</button>
    </div>
  );
};

// ── Edit job dates modal ─────────────────────────────────────────────────────

const EditJobDatesModal: React.FC<{
  job: Job;
  onClose: () => void;
  onSave: (job: Job, start: string, end: string) => Promise<void> | void;
}> = ({ job, onClose, onSave }) => {
  const [start, setStart] = useState(job.date);
  const [end, setEnd] = useState(job.endDate ?? job.date);
  return (
    <ModalShell title="Edit job schedule" onClose={onClose}>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{job.customerName}</p>
      <div className="grid grid-cols-2 gap-3 mt-3">
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          Start date
          <input type="date" value={start} onChange={e => setStart(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
        </label>
        <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">
          End date
          <input type="date" value={end} min={start} onChange={e => setEnd(e.target.value)}
            className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
        </label>
      </div>
      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button type="button" onClick={() => void onSave(job, start, end)}
          className="flex-1 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1">
          <Check className="w-4 h-4" /> Save
        </button>
      </div>
    </ModalShell>
  );
};

// ── Log today modal ──────────────────────────────────────────────────────────

const LogTodayModal: React.FC<{
  task: JobTask;
  techName: string;
  onClose: () => void;
  onSubmit: (task: JobTask, updateDate: string, note: string, percent: number) => Promise<void> | void;
}> = ({ task, techName, onClose, onSubmit }) => {
  const [updateDate, setUpdateDate] = useState(todayYMD());
  const [note, setNote] = useState('');
  const [percent, setPercent] = useState(task.percentComplete);
  return (
    <ModalShell title="Log today's progress" onClose={onClose}>
      <p className="text-sm font-bold text-slate-800 dark:text-slate-100">{techName}</p>
      {task.task && <p className="text-xs text-slate-500">{task.task}</p>}
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mt-3">
        Date
        <input type="date" value={updateDate} onChange={e => setUpdateDate(e.target.value)}
          className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none" />
      </label>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mt-3">
        What got done
        <textarea value={note} onChange={e => setNote(e.target.value)} rows={3}
          placeholder="e.g. Ran all water lines on the second floor…"
          className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none resize-none" />
      </label>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mt-3">
        Percent complete: <span className="text-teal-600 dark:text-teal-400 font-black">{percent}%</span>
        <input type="range" min={0} max={100} step={5} value={percent}
          onChange={e => setPercent(Number(e.target.value))}
          className="mt-1 w-full accent-teal-600" />
      </label>
      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button type="button" onClick={() => void onSubmit(task, updateDate, note, percent)}
          className="flex-1 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-bold inline-flex items-center justify-center gap-1">
          <ClipboardCheck className="w-4 h-4" /> Save update
        </button>
      </div>
    </ModalShell>
  );
};

// ── Move to job modal ────────────────────────────────────────────────────────

const MoveJobModal: React.FC<{
  task: JobTask;
  jobs: Job[];
  onClose: () => void;
  onMove: (task: JobTask, newJobId: string) => Promise<void> | void;
}> = ({ task, jobs, onClose, onMove }) => {
  const [target, setTarget] = useState('');
  const options = jobs.filter(j => j.id !== task.jobId);
  return (
    <ModalShell title="Move crew to another job" onClose={onClose}>
      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300">
        Destination job
        <select value={target} onChange={e => setTarget(e.target.value)}
          className="mt-1 w-full px-2 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
          <option value="">Select a job…</option>
          {options.map(j => (
            <option key={j.id} value={j.id}>
              {j.customerName} ({parseYMD(j.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-2 mt-5">
        <button type="button" onClick={onClose}
          className="flex-1 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button type="button" disabled={!target} onClick={() => target && void onMove(task, target)}
          className="flex-1 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold inline-flex items-center justify-center gap-1">
          <ArrowRightLeft className="w-4 h-4" /> Move
        </button>
      </div>
    </ModalShell>
  );
};

// ── Shared modal shell ───────────────────────────────────────────────────────

const ModalShell: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4"
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-base font-black text-slate-900 dark:text-white">{title}</h3>
        <button type="button" onClick={onClose} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full text-slate-500">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </div>
  </div>
);

export default ScheduleBoard;

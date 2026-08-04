import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, ChevronLeft, ChevronRight, CalendarOff, Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Job, JobTask, Technician, TechTimeOff, TaskStatus } from '@/lib/data';
import { datesOverlap, isTechOffOnDay } from '@/lib/data';
import {
  addDays, formatShort, parseYMD, techColor, todayYMD, weekContaining,
} from '@/components/schedule/dateUtils';

interface Props {
  jobs: Job[];
  technicians: Technician[];
  techTimeOff?: TechTimeOff[];
  onOpenJob: (jobId: string) => void;
}

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

interface Assignment {
  key: string;
  jobId: string;
  jobLabel: string;
  techId: string;
  start: string;
  end: string;
  taskLabel: string;
}

interface Conflict {
  techId: string;
  a: Assignment;
  b: Assignment;
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

function rangesOverlapWindow(start: string, end: string, winStart: string, winEnd: string) {
  return datesOverlap(start, end, winStart, winEnd);
}

const CrewBoard: React.FC<Props> = ({
  jobs,
  technicians,
  techTimeOff = [],
  onOpenJob,
}) => {
  const [anchorDay, setAnchorDay] = useState(todayYMD);
  const [tasks, setTasks] = useState<JobTask[]>([]);
  const [loading, setLoading] = useState(true);

  const days = useMemo(() => weekContaining(anchorDay), [anchorDay]);
  const rangeStart = days[0];
  const rangeEnd = days[6];

  const jobById = useMemo(() => {
    const m = new Map<string, Job>();
    for (const j of jobs) m.set(j.id, j);
    return m;
  }, [jobs]);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('job_tasks').select('*');
    if (error) {
      console.error('CrewBoard job_tasks:', error);
      setTasks([]);
      setLoading(false);
      return;
    }
    const mapped = (data as RawTaskRow[] ?? []).map(r => {
      const job = jobById.get(String(r.job_id));
      const fbStart = job?.date ?? todayYMD();
      const fbEnd = job?.endDate ?? fbStart;
      return mapTask(r, fbStart, fbEnd);
    });
    setTasks(mapped);
    setLoading(false);
  }, [jobById]);

  useEffect(() => {
    void fetchTasks();
  }, [fetchTasks]);

  const assignments = useMemo(() => {
    const list: Assignment[] = [];
    const seen = new Set<string>();

    for (const t of tasks) {
      if (!t.technicianId) continue;
      if (!rangesOverlapWindow(t.startDate, t.endDate, rangeStart, rangeEnd)) continue;
      const job = jobById.get(t.jobId);
      if (!job || job.status === 'completed') continue;
      const key = `task:${t.id}`;
      seen.add(`${t.technicianId}|${t.jobId}`);
      list.push({
        key,
        jobId: t.jobId,
        jobLabel: job.customerName,
        techId: t.technicianId,
        start: t.startDate,
        end: t.endDate,
        taskLabel: t.task || job.phase || 'Assigned',
      });
    }

    // Fallback: job-level crew without task rows
    for (const job of jobs) {
      if (job.status === 'completed') continue;
      const start = job.date;
      const end = job.endDate ?? job.date;
      if (!rangesOverlapWindow(start, end, rangeStart, rangeEnd)) continue;
      const crew = job.technicianIds?.length
        ? job.technicianIds
        : (job.technicianId ? [job.technicianId] : []);
      for (const techId of crew) {
        if (!techId) continue;
        const dedupe = `${techId}|${job.id}`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        list.push({
          key: `job:${job.id}:${techId}`,
          jobId: job.id,
          jobLabel: job.customerName,
          techId,
          start,
          end,
          taskLabel: job.phase || 'Assigned',
        });
      }
    }

    return list;
  }, [tasks, jobs, jobById, rangeStart, rangeEnd]);

  const conflicts = useMemo(() => {
    const byTech = new Map<string, Assignment[]>();
    for (const a of assignments) {
      const arr = byTech.get(a.techId) ?? [];
      arr.push(a);
      byTech.set(a.techId, arr);
    }
    const out: Conflict[] = [];
    for (const [techId, arr] of byTech) {
      for (let i = 0; i < arr.length; i++) {
        for (let j = i + 1; j < arr.length; j++) {
          const a = arr[i];
          const b = arr[j];
          if (a.jobId === b.jobId) continue;
          if (datesOverlap(a.start, a.end, b.start, b.end)) {
            out.push({ techId, a, b });
          }
        }
      }
    }
    return out;
  }, [assignments]);

  const conflictJobIdsByTech = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const c of conflicts) {
      const set = m.get(c.techId) ?? new Set();
      set.add(c.a.jobId);
      set.add(c.b.jobId);
      m.set(c.techId, set);
    }
    return m;
  }, [conflicts]);

  const goPrev = () => setAnchorDay(addDays(rangeStart, -7));
  const goNext = () => setAnchorDay(addDays(rangeStart, 7));
  const goToday = () => setAnchorDay(todayYMD());

  const dayIndex = (ymd: string) => days.indexOf(ymd);

  const barStyle = (start: string, end: string) => {
    const s = start < rangeStart ? rangeStart : start;
    const e = end > rangeEnd ? rangeEnd : end;
    const i0 = dayIndex(s);
    const i1 = dayIndex(e);
    if (i0 < 0 || i1 < 0 || i1 < i0) return null;
    const leftPct = (i0 / 7) * 100;
    const widthPct = ((i1 - i0 + 1) / 7) * 100;
    return { left: `${leftPct}%`, width: `${widthPct}%` };
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900 dark:text-white">
            {formatShort(rangeStart)} – {formatShort(rangeEnd)}
          </h2>
          <p className="text-xs text-slate-500">Who is assigned where — conflicts highlighted</p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={goToday}
            className="min-h-[40px] px-3 text-xs font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white">
            Today
          </button>
          <button type="button" onClick={goPrev} aria-label="Previous week"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button type="button" onClick={goNext} aria-label="Next week"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {conflicts.length > 0 && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 p-3 space-y-2">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300 font-black text-xs uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4" />
            Double-booking ({conflicts.length})
          </div>
          <ul className="space-y-1.5">
            {conflicts.map((c, i) => {
              const name = technicians.find(t => t.id === c.techId)?.name ?? 'Crew';
              return (
                <li key={`${c.a.key}-${c.b.key}-${i}`} className="text-xs text-red-800 dark:text-red-200">
                  <span className="font-bold">{name}</span>
                  {': '}
                  <button type="button" className="underline font-semibold" onClick={() => onOpenJob(c.a.jobId)}>
                    {c.a.jobLabel}
                  </button>
                  {' ↔ '}
                  <button type="button" className="underline font-semibold" onClick={() => onOpenJob(c.b.jobId)}>
                    {c.b.jobLabel}
                  </button>
                  <span className="text-red-600/80 dark:text-red-400/80">
                    {' '}({formatShort(c.a.start)}–{formatShort(c.a.end)} / {formatShort(c.b.start)}–{formatShort(c.b.end)})
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {/* Day strip */}
          <div className="overflow-x-auto">
            <div className="grid grid-cols-7 gap-1 min-w-[280px] text-center text-[10px] font-bold text-slate-500 mb-1 px-1 md:pl-[8.5rem]">
              {days.map(d => {
                const dt = parseYMD(d);
                const isToday = d === todayYMD();
                return (
                  <div key={d} className={isToday ? 'text-indigo-600 dark:text-indigo-400' : ''}>
                    <div>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][dt.getDay()]}</div>
                    <div className="text-sm tabular-nums">{dt.getDate()}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {technicians.map(tech => {
            const mine = assignments.filter(a => a.techId === tech.id);
            const conflictJobs = conflictJobIdsByTech.get(tech.id);
            const offDays = days.filter(d => isTechOffOnDay(tech.id, d, techTimeOff));

            return (
              <div
                key={tech.id}
                className={`rounded-xl border bg-white dark:bg-slate-900 p-3 ${
                  conflictJobs?.size
                    ? 'border-red-300 dark:border-red-800'
                    : 'border-slate-200 dark:border-slate-800'
                }`}
              >
                <div className="flex items-center gap-2 mb-2 min-h-[40px]">
                  <span
                    className="w-3 h-3 rounded-full shrink-0 ring-1 ring-black/10"
                    style={{ backgroundColor: techColor(tech.id) }}
                  />
                  <span className="font-black text-sm" style={{ color: techColor(tech.id) }}>
                    {tech.name}
                  </span>
                  {conflictJobs && conflictJobs.size > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                      <AlertTriangle className="w-3 h-3" /> Conflict
                    </span>
                  )}
                  {offDays.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400 ml-auto">
                      <CalendarOff className="w-3 h-3" /> Off {offDays.map(formatShort).join(', ')}
                    </span>
                  )}
                </div>

                <div className="relative h-14 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 overflow-hidden">
                  {/* Off day shading */}
                  {days.map((d, i) => (
                    isTechOffOnDay(tech.id, d, techTimeOff) ? (
                      <div
                        key={`off-${d}`}
                        className="absolute inset-y-0 bg-rose-200/40 dark:bg-rose-900/30"
                        style={{ left: `${(i / 7) * 100}%`, width: `${100 / 7}%` }}
                      />
                    ) : null
                  ))}
                  {mine.length === 0 ? (
                    <div className="absolute inset-0 flex items-center justify-center text-[11px] text-slate-400">
                      Free this week
                    </div>
                  ) : (
                    mine.map((a, idx) => {
                      const style = barStyle(a.start, a.end);
                      if (!style) return null;
                      const clash = conflictJobs?.has(a.jobId);
                      return (
                        <button
                          key={a.key}
                          type="button"
                          onClick={() => onOpenJob(a.jobId)}
                          title={`${a.jobLabel} · ${a.taskLabel}`}
                          className={`absolute top-1.5 h-11 rounded-md px-1.5 text-left overflow-hidden border transition-opacity hover:opacity-90 ${
                            clash
                              ? 'bg-red-500/90 border-red-700 text-white'
                              : 'border-black/10 text-white'
                          }`}
                          style={{
                            ...style,
                            backgroundColor: clash ? undefined : techColor(tech.id),
                            top: `${6 + (idx % 2) * 2}px`,
                            zIndex: idx + 1,
                          }}
                        >
                          <span className="block text-[10px] font-black truncate leading-tight">
                            {a.jobLabel}
                          </span>
                          <span className="block text-[9px] opacity-90 truncate">
                            {a.taskLabel}
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>

                {/* Mobile-friendly assignment list */}
                {mine.length > 0 && (
                  <ul className="mt-2 space-y-1 md:hidden">
                    {mine.map(a => (
                      <li key={`list-${a.key}`}>
                        <button
                          type="button"
                          onClick={() => onOpenJob(a.jobId)}
                          className={`w-full min-h-[44px] text-left px-2 py-2 rounded-lg text-xs font-semibold ${
                            conflictJobs?.has(a.jobId)
                              ? 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
                              : 'bg-slate-50 text-slate-700 dark:bg-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {a.jobLabel}
                          <span className="block font-normal text-[10px] opacity-80">
                            {formatShort(a.start)} – {formatShort(a.end)} · {a.taskLabel}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CrewBoard;

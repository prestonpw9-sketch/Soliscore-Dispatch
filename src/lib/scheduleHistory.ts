import { supabase } from '@/lib/supabase';
import type { Job, Technician, TechTimeOff } from '@/lib/data';
import { dispatchToday } from '@/lib/data';

export interface ScheduleHistoryCrew {
  id: string;
  name: string;
}

export interface ScheduleHistoryTask {
  id: string;
  technician_id: string | null;
  technician_name: string;
  task: string;
  start_date: string;
  end_date: string;
  status: string;
  percent_complete: number;
}

export interface ScheduleHistoryJob {
  id: string;
  title: string;
  location: string;
  status: string;
  phase: string;
  service_type: string;
  date: string;
  end_date: string;
  crew: ScheduleHistoryCrew[];
  tasks: ScheduleHistoryTask[];
}

export interface ScheduleHistoryPayload {
  version: 1;
  jobs: ScheduleHistoryJob[];
  time_off: Array<{
    technician_id: string;
    technician_name: string;
    start_date: string;
    end_date: string;
    note: string | null;
  }>;
}

interface JobTaskRow {
  id: string;
  job_id: number | string;
  technician_id: string | null;
  task: string | null;
  start_date: string | null;
  end_date: string | null;
  status: string | null;
  percent_complete: number | null;
}

function techName(technicians: Technician[], id: string | null | undefined): string {
  if (!id) return 'Unassigned';
  return technicians.find(t => t.id === id)?.name ?? id;
}

export function buildScheduleHistoryPayload(
  jobs: Job[],
  technicians: Technician[],
  techTimeOff: TechTimeOff[],
  taskRows: JobTaskRow[] = [],
): ScheduleHistoryPayload {
  const tasksByJob = new Map<string, JobTaskRow[]>();
  for (const row of taskRows) {
    const jobId = String(row.job_id);
    const list = tasksByJob.get(jobId) ?? [];
    list.push(row);
    tasksByJob.set(jobId, list);
  }

  const payloadJobs: ScheduleHistoryJob[] = jobs.map(j => {
    const crewIds = Array.from(new Set(
      (j.technicianIds?.length ? j.technicianIds : (j.technicianId ? [j.technicianId] : []))
        .filter(Boolean) as string[],
    ));
    const tasks = (tasksByJob.get(j.id) ?? []).map(t => ({
      id: String(t.id),
      technician_id: t.technician_id ? String(t.technician_id) : null,
      technician_name: techName(technicians, t.technician_id),
      task: String(t.task ?? ''),
      start_date: String(t.start_date ?? j.date),
      end_date: String(t.end_date ?? j.endDate ?? j.date),
      status: String(t.status ?? 'not_started'),
      percent_complete: Number(t.percent_complete ?? 0),
    }));
    return {
      id: String(j.id),
      title: j.customerName || 'Job',
      location: j.address || '',
      status: j.status,
      phase: j.phase || '',
      service_type: j.serviceType || '',
      date: j.date,
      end_date: j.endDate ?? j.date,
      crew: crewIds.map(id => ({ id, name: techName(technicians, id) })),
      tasks,
    };
  });

  return {
    version: 1,
    jobs: payloadJobs,
    time_off: techTimeOff.map(r => ({
      technician_id: r.technicianId,
      technician_name: techName(technicians, r.technicianId),
      start_date: r.startDate,
      end_date: r.endDate,
      note: r.note,
    })),
  };
}

/**
 * Upsert today's board freeze. No-ops on RLS / missing-table errors so a
 * missing migration never breaks dispatch.
 */
export async function upsertTodayScheduleHistory(opts: {
  jobs: Job[];
  technicians: Technician[];
  techTimeOff: TechTimeOff[];
  createdBy?: string | null;
}): Promise<boolean> {
  const snapshotDate = dispatchToday();
  let taskRows: JobTaskRow[] = [];
  try {
    const { data, error } = await supabase
      .from('job_tasks')
      .select('id, job_id, technician_id, task, start_date, end_date, status, percent_complete');
    if (!error && data) taskRows = data as JobTaskRow[];
  } catch {
    // Tasks are optional on the freeze.
  }

  const payload = buildScheduleHistoryPayload(
    opts.jobs,
    opts.technicians,
    opts.techTimeOff,
    taskRows,
  );

  const { error } = await supabase.from('schedule_history').upsert({
    snapshot_date: snapshotDate,
    captured_at: new Date().toISOString(),
    source: 'user',
    created_by: opts.createdBy ?? null,
    job_count: payload.jobs.length,
    payload,
  }, { onConflict: 'snapshot_date' });

  if (error) {
    console.warn('schedule_history upsert skipped:', error.message);
    return false;
  }
  return true;
}

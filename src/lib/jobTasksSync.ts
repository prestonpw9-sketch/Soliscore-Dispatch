import { supabase } from './supabase';
import {
  clipWorkRangeAroundTimeOff,
  type TechTimeOff,
} from '@/lib/data';

/**
 * Keep job_tasks rows aligned with the job's assigned crew.
 * - Adds blank task rows for newly assigned techs (span = job date range,
 *   clipped past any leading/trailing time off)
 * - Removes task rows for crew no longer on the job
 * - Shifts existing task bars so they start the day after a requested day off
 */
export async function syncJobTasksForCrew(
  jobId: string | number,
  crewIds: string[],
  startDate: string,
  endDate: string,
  techTimeOff: TechTimeOff[] = [],
): Promise<string | null> {
  const desired = Array.from(new Set(crewIds.filter(Boolean)));

  const { data: existing, error: fetchError } = await supabase
    .from('job_tasks')
    .select('id, technician_id, start_date, end_date')
    .eq('job_id', jobId);
  if (fetchError) {
    console.error('Error loading job_tasks for sync:', fetchError);
    return fetchError.message;
  }

  const rows = existing ?? [];
  const existingTechIds = new Set(
    rows.map(r => r.technician_id).filter((id): id is string => !!id),
  );

  const toAdd = desired.filter(id => !existingTechIds.has(id));
  const toRemove = rows.filter(
    r => r.technician_id && !desired.includes(r.technician_id),
  );

  if (toAdd.length) {
    const insertRows = toAdd.map(techId => {
      const work = clipWorkRangeAroundTimeOff(techId, startDate, endDate, techTimeOff)
        ?? { start: startDate, end: endDate };
      return {
        job_id:           jobId,
        technician_id:    techId,
        task:             '',
        start_date:       work.start,
        end_date:         work.end,
        status:           'not_started',
        percent_complete: 0,
      };
    });
    const { error: insertError } = await supabase.from('job_tasks').insert(insertRows);
    if (insertError) {
      console.error('Error inserting job_tasks:', insertError);
      return insertError.message;
    }
  }

  const toClip = rows.filter(r => {
    if (!r.technician_id || !desired.includes(r.technician_id)) return false;
    const currentStart = String(r.start_date ?? startDate);
    const currentEnd = String(r.end_date ?? endDate);
    const work = clipWorkRangeAroundTimeOff(
      r.technician_id,
      currentStart,
      currentEnd,
      techTimeOff,
    );
    return !!work && (work.start !== currentStart || work.end !== currentEnd);
  });
  if (toClip.length) {
    const clipErrors = await Promise.all(toClip.map(async r => {
      const currentStart = String(r.start_date ?? startDate);
      const currentEnd = String(r.end_date ?? endDate);
      const work = clipWorkRangeAroundTimeOff(
        r.technician_id as string,
        currentStart,
        currentEnd,
        techTimeOff,
      );
      if (!work) return null;
      const { error } = await supabase
        .from('job_tasks')
        .update({ start_date: work.start, end_date: work.end })
        .eq('id', r.id);
      return error?.message ?? null;
    }));
    const clipError = clipErrors.find(Boolean);
    if (clipError) {
      console.error('Error clipping job_tasks around time off:', clipError);
      return clipError;
    }
  }

  if (toRemove.length) {
    const ids = toRemove.map(r => r.id);
    const { error: deleteError } = await supabase
      .from('job_tasks')
      .delete()
      .in('id', ids);
    if (deleteError) {
      console.error('Error deleting job_tasks:', deleteError);
      return deleteError.message;
    }
  }

  return null;
}

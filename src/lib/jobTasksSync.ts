import { supabase } from './supabase';

/**
 * Keep job_tasks rows aligned with the job's assigned crew.
 * - Adds blank task rows for newly assigned techs (span = job date range)
 * - Removes task rows for crew no longer on the job
 */
export async function syncJobTasksForCrew(
  jobId: string | number,
  crewIds: string[],
  startDate: string,
  endDate: string,
): Promise<string | null> {
  const desired = Array.from(new Set(crewIds.filter(Boolean)));

  const { data: existing, error: fetchError } = await supabase
    .from('job_tasks')
    .select('id, technician_id')
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
    const insertRows = toAdd.map(techId => ({
      job_id:           jobId,
      technician_id:    techId,
      task:             '',
      start_date:       startDate,
      end_date:         endDate,
      status:           'not_started',
      percent_complete: 0,
    }));
    const { error: insertError } = await supabase.from('job_tasks').insert(insertRows);
    if (insertError) {
      console.error('Error inserting job_tasks:', insertError);
      return insertError.message;
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

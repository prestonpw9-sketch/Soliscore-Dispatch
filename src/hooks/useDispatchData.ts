import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { fetchSubmittalsCount } from '@/lib/submittals';
import { fetchBlueprintsCount, fetchSitePhotosCount } from '@/lib/storageCounts';
import { syncJobTasksForCrew } from '@/lib/jobTasksSync';
import type { Job, Customer, Technician, TechDailyPriority } from '@/lib/data';

export type MutationResult = { ok: true } | { ok: false; message: string };

function mapCustomerRow(c: Record<string, unknown>, builderIds: Set<string>): Customer {
  const id = String(c.id ?? '');
  return {
    id,
    name:         String(c.name ?? ''),
    phone:        String(c.phone ?? ''),
    email:        String(c.email ?? ''),
    address:      String(c.address ?? ''),
    city:         String(c.city ?? ''),
    propertyType: builderIds.has(id) ? 'Commercial' : 'Residential',
    totalJobs:    0,
    lastService:  String(c.created_at ?? '').split('T')[0] || '',
    notes:        String(c.notes ?? ''),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// The DB `technician_id` column is a nullable UUID. Coerce empty / falsey /
// legacy 'unassigned' sentinels to null so the column accepts the value.
function normalizeTechId(id: string | null | undefined): string | null {
  if (!id || id === 'unassigned') return null;
  return id;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export const useDispatchData = () => {
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [customers, setCustomers]     = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [techPriorities, setTechPriorities] = useState<TechDailyPriority[]>([]);
  const [submittalsCount, setSubmittalsCount] = useState(0);
  const [blueprintsCount, setBlueprintsCount] = useState(0);
  const [sitePhotosCount, setSitePhotosCount] = useState(0);

  // FIX: keep a stable ref to jobs so rescheduleJob's DB write
  // always reads the latest job without needing `jobs` in its dep array.
  const jobsRef = useRef<Job[]>(jobs);
  jobsRef.current = jobs;

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const fetchJobs = useCallback(async () => {
    setError(null);
    try {
      const { data, error: sbError } = await supabase.from('jobs').select('*');
      if (sbError) throw sbError;
      const liveJobs: Job[] = (data ?? []).map(j => ({
        ...j,
        id:                j.id?.toString() ?? '',
        customerName:      j.title ?? j.customerName ?? 'New Field Job',
        address:           j.location ?? j.address ?? 'Tucson, AZ',
        description:       j.description ?? '',
        phase:             j.phase ?? 'Rough-In',
        status:            j.status ?? 'pending',
        startTime:         j.startTime ?? '08:00',
        endTime:           j.endTime ?? '10:00',
        date:              j.date ?? new Date().toISOString().split('T')[0],
        endDate:           j.end_date ?? j.date ?? new Date().toISOString().split('T')[0],
        serviceType:       j.service_type ?? '',
        technicianId:      j.technician_id ?? null,
        technicianIds:     Array.isArray(j.technician_ids)
                             ? j.technician_ids.filter(Boolean)
                             : (j.technician_id ? [j.technician_id] : []),
        type:              j.type ?? 'maintenance',
        estimatedDuration: j.estimatedDuration ?? 120,
      }));
      setJobs(liveJobs);
    } catch (err) {
      // FIX: no `catch (err: any)` — narrow with helper
      const msg = getErrorMessage(err, 'Failed to load jobs.');
      console.error('Error fetching jobs:', err);
      setError(msg);
    }
  }, []);

  const fetchTeam = useCallback(async () => {
    try {
      const { data, error: sbError } = await supabase.from('technicians').select('*');
      if (sbError) throw sbError;
      setTechnicians(data ?? []);
    } catch (err) {
      console.error('Error fetching team:', err);
    }
  }, []);

  // FIX: customers were fetched nowhere — the state was always [].
  const fetchCustomers = useCallback(async () => {
    try {
      const [{ data, error: sbError }, { data: builders }] = await Promise.all([
        supabase.from('customers').select('*'),
        supabase.from('builders').select('id'),
      ]);
      if (sbError) throw sbError;
      const builderIds = new Set((builders ?? []).map(b => String(b.id)));
      setCustomers((data ?? []).map(row => mapCustomerRow(row as Record<string, unknown>, builderIds)));
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  }, []);

  const fetchSubmittals = useCallback(async () => {
    try {
      const count = await fetchSubmittalsCount();
      setSubmittalsCount(count);
      return count;
    } catch (err) {
      console.error('Error fetching submittals count:', err);
      return 0;
    }
  }, []);

  const fetchBlueprints = useCallback(async () => {
    try {
      const count = await fetchBlueprintsCount();
      setBlueprintsCount(count);
      return count;
    } catch (err) {
      console.error('Error fetching blueprints count:', err);
      return 0;
    }
  }, []);

  const fetchSitePhotos = useCallback(async () => {
    try {
      const count = await fetchSitePhotosCount();
      setSitePhotosCount(count);
      return count;
    } catch (err) {
      console.error('Error fetching site photos count:', err);
      return 0;
    }
  }, []);

  /** Let modals push a count they already loaded (avoids a second fetch). */
  const reportSubmittalsCount = useCallback((count: number) => {
    setSubmittalsCount(count);
  }, []);
  const reportBlueprintsCount = useCallback((count: number) => {
    setBlueprintsCount(count);
  }, []);
  const reportSitePhotosCount = useCallback((count: number) => {
    setSitePhotosCount(count);
  }, []);

  const fetchTechPriorities = useCallback(async () => {
    try {
      const { data, error: sbError } = await supabase
        .from('tech_daily_priorities')
        .select('technician_id, work_date, job_id');
      if (sbError) throw sbError;
      setTechPriorities((data ?? []).map(row => ({
        technicianId: String(row.technician_id),
        workDate: String(row.work_date),
        jobId: String(row.job_id),
      })));
    } catch (err) {
      console.error('Error fetching tech priorities:', err);
    }
  }, []);

  // Only fetch once we actually have an auth session — under RLS, requests made
  // before the token is attached can hang indefinitely. We also clear the
  // loading flag after all fetches settle, with a hard timeout safety net so
  // the app can NEVER get permanently stuck on "Syncing…".
  const { session, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait until auth has resolved.
    if (authLoading) return;

    // No session => nothing to load; don't leave the app spinning.
    if (!session) {
      setLoading(false);
      return;
    }

    let active = true;
    setLoading(true);

    // Safety net: never hang longer than 12s.
    const timeout = setTimeout(() => {
      if (active) {
        setLoading(false);
        setError(prev => prev ?? 'Data is taking longer than expected to load.');
      }
    }, 12000);

    void Promise.allSettled([
      fetchJobs(),
      fetchTeam(),
      fetchCustomers(),
      fetchTechPriorities(),
      fetchSubmittals(),
      fetchBlueprints(),
      fetchSitePhotos(),
    ])
      .then(async () => {
        // Retry once after the main sync — covers the rare case where the first
        // count request raced ahead of the auth token on the Supabase client.
        if (!active) return;
        const count = await fetchSubmittals();
        if (active && count === 0) {
          await new Promise(r => setTimeout(r, 750));
          if (active) await fetchSubmittals();
        }
      })
      .finally(() => {
        if (active) {
          clearTimeout(timeout);
          setLoading(false);
        }
      });

    return () => { active = false; clearTimeout(timeout); };
  }, [
    session, authLoading, fetchJobs, fetchTeam, fetchCustomers,
    fetchTechPriorities, fetchSubmittals, fetchBlueprints, fetchSitePhotos,
  ]);

  const refresh = useCallback(async () => {
    await Promise.all([
      fetchJobs(),
      fetchTeam(),
      fetchCustomers(),
      fetchTechPriorities(),
      fetchSubmittals(),
      fetchBlueprints(),
      fetchSitePhotos(),
    ]);
  }, [
    fetchJobs, fetchTeam, fetchCustomers, fetchTechPriorities,
    fetchSubmittals, fetchBlueprints, fetchSitePhotos,
  ]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  // FIX: accepts typed `Omit<Job, 'id'>` instead of `any`
  const createJob = useCallback(async (jobData: Omit<Job, 'id'>): Promise<MutationResult> => {
    // Multi-crew: prefer the array, fall back to the legacy single id. Keep
    // technician_id in sync (= first crew member) for older views.
    const crew = Array.from(
      new Set((jobData.technicianIds ?? []).filter(Boolean)),
    );
    const primary = normalizeTechId(crew[0] ?? jobData.technicianId);
    const startDate = jobData.date;
    const endDate   = jobData.endDate ?? jobData.date;
    const { data: inserted, error: sbError } = await supabase.from('jobs').insert([{
      title:        jobData.customerName,
      location:     jobData.address ?? 'Tucson, AZ',
      description:  jobData.description ?? '',
      phase:        jobData.phase ?? 'Rough-In',
      status:       'pending',
      date:         startDate,
      end_date:     endDate,
      service_type: jobData.serviceType ?? null,
      startTime:    jobData.startTime,
      endTime:      jobData.endTime,
      technician_id: primary,
      technician_ids: primary ? (crew.length ? crew : [primary]) : [],
      // NOTE: the `jobs` table has no `type` column; including it makes the whole
      // insert fail (PGRST204) and silently drop the job. Type is derived on read.
    }]).select('id').single();
    if (sbError) {
      console.error('Error saving job to DB:', sbError);
      return { ok: false, message: sbError.message || 'Could not schedule job.' };
    }
    // Seed a job_tasks row for every assigned crew member (task blank, span = job range).
    const newJobId = inserted?.id;
    if (newJobId && crew.length) {
      const taskError = await syncJobTasksForCrew(newJobId, crew, startDate, endDate);
      if (taskError) {
        // Job exists; surface the schedule-row issue but treat create as ok.
        console.error('Error seeding job_tasks:', taskError);
      }
    }
    // FIX: await refresh so callers get updated state after createJob resolves
    await refresh();
    return { ok: true };
  }, [refresh]);

  // Update an existing job (used when editing from the dashboard / calendar).
  const updateJob = useCallback(async (
    jobId: string,
    jobData: Omit<Job, 'id'>,
  ): Promise<MutationResult> => {
    const crew = Array.from(new Set((jobData.technicianIds ?? []).filter(Boolean)));
    const primary = normalizeTechId(crew[0] ?? jobData.technicianId);
    const startDate = jobData.date;
    const endDate   = jobData.endDate ?? jobData.date;
    const { error: sbError } = await supabase.from('jobs').update({
      title:        jobData.customerName,
      location:     jobData.address ?? 'Tucson, AZ',
      description:  jobData.description ?? '',
      phase:        jobData.phase ?? 'Rough-In',
      date:         startDate,
      end_date:     endDate,
      service_type: jobData.serviceType ?? null,
      technician_id: primary,
      technician_ids: primary ? (crew.length ? crew : [primary]) : [],
      // NOTE: `jobs` has no `type` column — see createJob. Omitted so the update
      // doesn't fail (PGRST204) and silently no-op.
    }).eq('id', jobId);
    if (sbError) {
      console.error('Error updating job:', sbError);
      return { ok: false, message: sbError.message || 'Could not update job.' };
    }
    // Keep Schedule board task rows in sync with the assigned crew.
    const taskError = await syncJobTasksForCrew(
      jobId,
      primary ? (crew.length ? crew : [primary]) : [],
      startDate,
      endDate,
    );
    if (taskError) {
      console.error('Error syncing job_tasks:', taskError);
    }
    await refresh();
    return { ok: true };
  }, [refresh]);

  const rescheduleJob = useCallback(async (
    id: string, newDate: string, newStartHour: number,
  ) => {
    // Optimistic UI update (functional form — never stale)
    setJobs(prev => prev.map(j => {
      if (j.id !== id) return j;
      const duration = j.estimatedDuration ?? 120;
      const endHour  = newStartHour + Math.floor(duration / 60);
      const endMin   = duration % 60;
      return {
        ...j,
        date:      newDate,
        startTime: formatTime(newStartHour, 0),
        endTime:   formatTime(endHour, endMin),
      };
    }));

    // FIX: read from ref so the DB write uses latest state, not the stale
    // `jobs` closure captured when useCallback was last memoized.
    const currentJob = jobsRef.current.find(j => j.id === id);
    const duration   = currentJob?.estimatedDuration ?? 120;
    const endHour    = newStartHour + Math.floor(duration / 60);
    const endMin     = duration % 60;

    const { error: sbError } = await supabase
      .from('jobs')
      .update({
        date:      newDate,
        startTime: formatTime(newStartHour, 0),
        endTime:   formatTime(endHour, endMin),
      })
      .eq('id', id);

    if (sbError) {
      console.error('Failed to save new schedule:', sbError);
      await refresh(); // Roll back optimistic update on failure
    }
  }, [refresh]); // FIX: `jobs` removed from deps — read via ref instead

  const toggleJobStatus = useCallback(async (id: string) => {
    // FIX: read from ref — same stale closure fix as rescheduleJob
    const job = jobsRef.current.find(j => j.id === id);
    if (!job) return;
    const newStatus = job.status === 'completed' ? 'pending' : 'completed';
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j));
    const { error: sbError } = await supabase
      .from('jobs').update({ status: newStatus }).eq('id', id);
    if (sbError) {
      console.error('Failed to toggle job status:', sbError);
      await refresh();
    }
  }, [refresh]); // FIX: `jobs` removed from deps — read via ref instead

  const assignTechnician = useCallback(async (
    jobId: string, technicianId: string | null,
  ) => {
    const newTechId = normalizeTechId(technicianId);
    // Optimistic UI update (functional form — never stale)
    setJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, technicianId: newTechId } : j
    ));
    const { error: sbError } = await supabase
      .from('jobs').update({ technician_id: newTechId }).eq('id', jobId);
    if (sbError) {
      console.error('Failed to assign technician:', sbError);
      await refresh(); // Roll back optimistic update on failure
    }
  }, [refresh]);

  // Assign MULTIPLE crew to a job. Writes technician_ids[] and keeps the legacy
  // technician_id in sync (= first crew member, or null) for older views.
  // Also syncs job_tasks so the Schedule board shows the same crew.
  const assignTechnicians = useCallback(async (
    jobId: string, technicianIds: string[],
  ): Promise<MutationResult> => {
    const cleaned = Array.from(new Set((technicianIds || []).filter(Boolean)));
    const primary = cleaned[0] ?? null;
    const current = jobsRef.current.find(j => j.id === jobId);
    const startDate = current?.date ?? new Date().toISOString().split('T')[0];
    const endDate = current?.endDate ?? current?.date ?? startDate;
    setJobs(prev => prev.map(j =>
      j.id === jobId ? { ...j, technicianIds: cleaned, technicianId: primary } : j
    ));
    const { error: sbError } = await supabase
      .from('jobs')
      .update({ technician_ids: cleaned, technician_id: primary })
      .eq('id', jobId);
    if (sbError) {
      console.error('Failed to assign crew:', sbError);
      await refresh();
      return { ok: false, message: sbError.message || 'Could not assign crew.' };
    }
    const taskError = await syncJobTasksForCrew(jobId, cleaned, startDate, endDate);
    if (taskError) {
      console.error('Failed to sync job_tasks after crew assign:', taskError);
      await refresh();
      return { ok: false, message: taskError };
    }
    await refresh();
    return { ok: true };
  }, [refresh]);

  const updateJobPhase = useCallback(async (jobId: string, newPhase: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, phase: newPhase } : j));
    const { error: sbError } = await supabase
      .from('jobs').update({ phase: newPhase }).eq('id', jobId);
    if (sbError) {
      console.error('Failed to update job phase:', sbError);
      await refresh();
    }
  }, [refresh]);

  const hireTechnician = useCallback(async (name: string, role: string) => {
    const { error: sbError } = await supabase
      .from('technicians').insert([{ name, role }]);
    if (sbError) {
      console.error('Error hiring technician:', sbError);
      return;
    }
    await refresh();
  }, [refresh]);

  const fireTechnician = useCallback(async (id: string) => {
    const { error: sbError } = await supabase
      .from('technicians').delete().eq('id', id);
    if (sbError) {
      console.error('Error firing technician:', sbError);
      return;
    }
    await refresh();
  }, [refresh]);

  const createCustomer = useCallback(async (customerData: Partial<Customer>) => {
    const name = customerData.name?.trim();
    if (!name) throw new Error('Company / builder name is required.');

    const contact = {
      name,
      phone:   customerData.phone?.trim() || null,
      email:   customerData.email?.trim() || null,
      address: customerData.address?.trim() || null,
      city:    customerData.city?.trim() || null,
      notes:   customerData.notes?.trim() || null,
    };

    if (customerData.propertyType === 'Commercial') {
      // Projects FK requires a builders row; share one id across both tables.
      const id = crypto.randomUUID();

      const { error: builderError } = await supabase
        .from('builders')
        .insert([{ id, name }]);
      if (builderError) {
        console.error('Error saving builder:', builderError);
        throw new Error(builderError.message);
      }

      const { error: customerError } = await supabase.from('customers').insert([{
        id,
        ...contact,
      }]);
      if (customerError) {
        await supabase.from('builders').delete().eq('id', id);
        console.error('Error saving builder contact info:', customerError);
        throw new Error(customerError.message);
      }
    } else {
      const { error: customerError } = await supabase.from('customers').insert([contact]);
      if (customerError) {
        console.error('Error saving customer:', customerError);
        throw new Error(customerError.message);
      }
    }

    await refresh();
  }, [refresh]);

  const setFirstPriorityJob = useCallback(async (
    technicianId: string,
    workDate: string,
    jobId: string,
  ) => {
    const { error: sbError } = await supabase
      .from('tech_daily_priorities')
      .upsert({
        technician_id: technicianId,
        work_date: workDate,
        job_id: Number(jobId),
      }, { onConflict: 'technician_id,work_date' });
    if (sbError) {
      console.error('Error setting first priority job:', sbError);
      throw new Error(sbError.message);
    }
    await fetchTechPriorities();
  }, [fetchTechPriorities]);

  return {
    loading,
    error,
    jobs,
    customers,
    technicians,
    techPriorities,
    submittalsCount,
    blueprintsCount,
    sitePhotosCount,
    refreshSubmittals: fetchSubmittals,
    refreshBlueprints: fetchBlueprints,
    refreshSitePhotos: fetchSitePhotos,
    reportSubmittalsCount,
    reportBlueprintsCount,
    reportSitePhotosCount,
    refresh,
    createJob,
    updateJob,
    toggleJobStatus,
    rescheduleJob,
    assignTechnician,
    assignTechnicians,
    updateJobPhase,
    hireTechnician,
    fireTechnician,
    createCustomer,
    setFirstPriorityJob,
  };
};
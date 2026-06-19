import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job, Customer, Technician } from '@/lib/data';

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
        phase:             j.phase ?? 'Rough-In',
        status:            j.status ?? 'pending',
        startTime:         j.startTime ?? '08:00',
        endTime:           j.endTime ?? '10:00',
        date:              j.date ?? new Date().toISOString().split('T')[0],
        technicianId:      j.technician_id ?? null,
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
      const { data, error: sbError } = await supabase.from('customers').select('*');
      if (sbError) throw sbError;
      setCustomers(data ?? []);
    } catch (err) {
      console.error('Error fetching customers:', err);
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

    void Promise.allSettled([fetchJobs(), fetchTeam(), fetchCustomers()])
      .finally(() => {
        if (active) {
          clearTimeout(timeout);
          setLoading(false);
        }
      });

    return () => { active = false; clearTimeout(timeout); };
  }, [session, authLoading, fetchJobs, fetchTeam, fetchCustomers]);

  // FIX: await all three in parallel rather than sequentially
  const refresh = useCallback(async () => {
    await Promise.all([fetchJobs(), fetchTeam(), fetchCustomers()]);
  }, [fetchJobs, fetchTeam, fetchCustomers]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  // FIX: accepts typed `Omit<Job, 'id'>` instead of `any`
  const createJob = useCallback(async (jobData: Omit<Job, 'id'>) => {
    const { error: sbError } = await supabase.from('jobs').insert([{
      title:        jobData.customerName,
      location:     jobData.address ?? 'Tucson, AZ',
      phase:        jobData.phase ?? 'Rough-In',
      status:       'pending',
      date:         jobData.date,
      startTime:    jobData.startTime,
      endTime:      jobData.endTime,
      technician_id: normalizeTechId(jobData.technicianId),
      type:         jobData.type ?? 'maintenance',
    }]);
    if (sbError) {
      console.error('Error saving job to DB:', sbError);
      return;
    }
    // FIX: await refresh so callers get updated state after createJob resolves
    await refresh();
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

  return {
    loading,
    error,
    jobs,
    customers,
    technicians,
    refresh,
    createJob,
    toggleJobStatus,
    rescheduleJob,
    assignTechnician,
    updateJobPhase,
    hireTechnician,
    fireTechnician,
  };
};
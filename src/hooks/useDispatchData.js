import { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
// ── Helpers ────────────────────────────────────────────────────────────────
function getErrorMessage(err, fallback) {
    return err instanceof Error ? err.message : fallback;
}
function formatTime(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}
// ── Hook ───────────────────────────────────────────────────────────────────
export const useDispatchData = () => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [jobs, setJobs] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [technicians, setTechnicians] = useState([]);
    // FIX: keep a stable ref to jobs so rescheduleJob's DB write
    // always reads the latest job without needing `jobs` in its dep array.
    const jobsRef = useRef(jobs);
    jobsRef.current = jobs;
    // ── Fetchers ─────────────────────────────────────────────────────────────
    const fetchJobs = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: sbError } = await supabase.from('jobs').select('*');
            if (sbError)
                throw sbError;
            const liveJobs = (data ?? []).map(j => ({
                ...j,
                id: j.id?.toString() ?? '',
                customerName: j.title ?? j.customerName ?? 'New Field Job',
                address: j.location ?? j.address ?? 'Tucson, AZ',
                phase: j.phase ?? 'Rough-In',
                status: j.status ?? 'pending',
                startTime: j.startTime ?? '08:00',
                endTime: j.endTime ?? '10:00',
                date: j.date ?? new Date().toISOString().split('T')[0],
                technicianId: j.technicianId ?? j.tech ?? 'unassigned',
                type: j.type ?? 'maintenance',
                estimatedDuration: j.estimatedDuration ?? 120,
            }));
            setJobs(liveJobs);
        }
        catch (err) {
            // FIX: no `catch (err: any)` — narrow with helper
            const msg = getErrorMessage(err, 'Failed to load jobs.');
            console.error('Error fetching jobs:', err);
            setError(msg);
        }
        finally {
            setLoading(false);
        }
    }, []);
    const fetchTeam = useCallback(async () => {
        try {
            const { data, error: sbError } = await supabase.from('technicians').select('*');
            if (sbError)
                throw sbError;
            setTechnicians(data ?? []);
        }
        catch (err) {
            console.error('Error fetching team:', err);
        }
    }, []);
    // FIX: customers were fetched nowhere — the state was always [].
    const fetchCustomers = useCallback(async () => {
        try {
            const { data, error: sbError } = await supabase.from('customers').select('*');
            if (sbError)
                throw sbError;
            setCustomers(data ?? []);
        }
        catch (err) {
            console.error('Error fetching customers:', err);
        }
    }, []);
    useEffect(() => {
        void Promise.all([fetchJobs(), fetchTeam(), fetchCustomers()]);
    }, [fetchJobs, fetchTeam, fetchCustomers]);
    // FIX: await all three in parallel rather than sequentially
    const refresh = useCallback(async () => {
        await Promise.all([fetchJobs(), fetchTeam(), fetchCustomers()]);
    }, [fetchJobs, fetchTeam, fetchCustomers]);
    // ── Mutations ─────────────────────────────────────────────────────────────
    // FIX: accepts typed `Omit<Job, 'id'>` instead of `any`
    const createJob = useCallback(async (jobData) => {
        const { error: sbError } = await supabase.from('jobs').insert([{
                title: jobData.customerName,
                location: jobData.address ?? 'Tucson, AZ',
                phase: jobData.phase ?? 'Rough-In',
                status: 'pending',
                date: jobData.date,
                startTime: jobData.startTime,
                endTime: jobData.endTime,
                technicianId: jobData.technicianId ?? 'unassigned',
                type: jobData.type ?? 'maintenance',
            }]);
        if (sbError) {
            console.error('Error saving job to DB:', sbError);
            return;
        }
        // FIX: await refresh so callers get updated state after createJob resolves
        await refresh();
    }, [refresh]);
    const rescheduleJob = useCallback(async (id, newDate, newStartHour) => {
        // Optimistic UI update (functional form — never stale)
        setJobs(prev => prev.map(j => {
            if (j.id !== id)
                return j;
            const duration = j.estimatedDuration ?? 120;
            const endHour = newStartHour + Math.floor(duration / 60);
            const endMin = duration % 60;
            return {
                ...j,
                date: newDate,
                startTime: formatTime(newStartHour, 0),
                endTime: formatTime(endHour, endMin),
            };
        }));
        // FIX: read from ref so the DB write uses latest state, not the stale
        // `jobs` closure captured when useCallback was last memoized.
        const currentJob = jobsRef.current.find(j => j.id === id);
        const duration = currentJob?.estimatedDuration ?? 120;
        const endHour = newStartHour + Math.floor(duration / 60);
        const endMin = duration % 60;
        const { error: sbError } = await supabase
            .from('jobs')
            .update({
            date: newDate,
            startTime: formatTime(newStartHour, 0),
            endTime: formatTime(endHour, endMin),
        })
            .eq('id', id);
        if (sbError) {
            console.error('Failed to save new schedule:', sbError);
            await refresh(); // Roll back optimistic update on failure
        }
    }, [refresh]); // FIX: `jobs` removed from deps — read via ref instead
    const toggleJobStatus = useCallback(async (id) => {
        // FIX: read from ref — same stale closure fix as rescheduleJob
        const job = jobsRef.current.find(j => j.id === id);
        if (!job)
            return;
        const newStatus = job.status === 'completed' ? 'pending' : 'completed';
        setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j));
        const { error: sbError } = await supabase
            .from('jobs').update({ status: newStatus }).eq('id', id);
        if (sbError) {
            console.error('Failed to toggle job status:', sbError);
            await refresh();
        }
    }, [refresh]); // FIX: `jobs` removed from deps — read via ref instead
    const updateJobPhase = useCallback(async (jobId, newPhase) => {
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, phase: newPhase } : j));
        const { error: sbError } = await supabase
            .from('jobs').update({ phase: newPhase }).eq('id', jobId);
        if (sbError) {
            console.error('Failed to update job phase:', sbError);
            await refresh();
        }
    }, [refresh]);
    const hireTechnician = useCallback(async (name, role) => {
        const { error: sbError } = await supabase
            .from('technicians').insert([{ name, role }]);
        if (sbError) {
            console.error('Error hiring technician:', sbError);
            return;
        }
        await refresh();
    }, [refresh]);
    const fireTechnician = useCallback(async (id) => {
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
        updateJobPhase,
        hireTechnician,
        fireTechnician,
    };
};

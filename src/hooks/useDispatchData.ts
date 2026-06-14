import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; 
// Notice we removed the mock data imports completely!
import type { Job, Customer, Technician } from '@/lib/data';

export const useDispatchData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data State - Starting completely clean, no dummy data
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);

  // 1. Fetch Real Jobs from Database
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const { data: dbRows, error: supabaseError } = await supabase
        .from('jobs')
        .select('*');

      if (supabaseError) throw supabaseError;

      if (dbRows) {
        const liveJobs = dbRows.map((j: any) => ({
          ...j,
          id: j.id?.toString(),
          customerName: j.title || j.customerName || "New Field Job",
          address: j.location || j.address || "Tucson, AZ",
          phase: j.phase || "Rough-In",
          status: j.status || "pending",
          startTime: j.startTime || "08:00", 
          endTime: j.endTime || "10:00",
          date: j.date || new Date().toISOString().split('T')[0], 
          technicianId: j.technicianId || j.tech || "unassigned",
          type: j.type || "maintenance", // Drives calendar colors
          estimatedDuration: j.estimatedDuration || 120
        }));
        // Only load real database jobs
        setJobs(liveJobs);
      }
    } catch (err: any) {
      console.error("Error fetching jobs:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch Real Team from Database
  const fetchTeam = useCallback(async () => {
    try {
      // Looks for a 'technicians' table in Supabase. 
      const { data, error } = await supabase.from('technicians').select('*');
      if (data && !error) {
        setTechnicians(data);
      }
    } catch (err) {
      console.error("Error fetching team:", err);
    }
  }, []);

  // Run on startup
  useEffect(() => {
    fetchJobs();
    fetchTeam();
  }, [fetchJobs, fetchTeam]);

  const refresh = useCallback(async () => {
    await fetchJobs();
    await fetchTeam();
  }, [fetchJobs, fetchTeam]);

  // 3. CREATE JOB - Now securely fires directly to Supabase!
  const createJob = useCallback(async (jobData: any) => {
    const dbPayload = {
      title: jobData.customerName,
      location: jobData.address || "Tucson, AZ",
      phase: jobData.phase || "Rough-In",
      status: "pending",
      date: jobData.date,
      startTime: jobData.startTime,
      endTime: jobData.endTime,
      technicianId: jobData.technicianId || "unassigned",
      type: jobData.type || "maintenance"
    };

    const { error } = await supabase
      .from('jobs')
      .insert([dbPayload]);

    if (error) {
      console.error("Error saving job to DB:", error);
      return;
    }
    
    // Refresh the board so the new job instantly pops up
    refresh();
  }, [refresh]);

  // 4. RESCHEDULE JOB (Drag & Drop) - Now saves the new time to Supabase!
  const rescheduleJob = useCallback(async (id: string, newDate: string, newStartHour: number) => {
    // 1. Optimistic UI update: Instantly moves it on the screen so it feels fast
    setJobs(prev => prev.map(j => {
      if (j.id === id) {
        const currentDuration = j.estimatedDuration || 120;
        const endHour = newStartHour + Math.floor(currentDuration / 60);
        const endMin = currentDuration % 60;
        return {
          ...j,
          date: newDate,
          startTime: `${String(newStartHour).padStart(2, '0')}:00`,
          endTime: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
        };
      }
      return j;
    }));

    // 2. Background Database Update: Locks the new time in
    const currentJob = jobs.find(j => j.id === id);
    const duration = currentJob?.estimatedDuration || 120;
    const endHour = newStartHour + Math.floor(duration / 60);
    const endMin = duration % 60;
    
    const { error } = await supabase
      .from('jobs')
      .update({
        date: newDate,
        startTime: `${String(newStartHour).padStart(2, '0')}:00`,
        endTime: `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`
      })
      .eq('id', id);

    if (error) {
      console.error("Failed to save new schedule:", error);
      refresh(); // Snaps the job back to original spot if the database fails
    }
  }, [jobs, refresh]);

  // 5. TOGGLE STATUS - Now saves completed status to Supabase!
  const toggleJobStatus = useCallback(async (id: string) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    
    const newStatus = job.status === 'completed' ? 'pending' : 'completed';

    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j));
    await supabase.from('jobs').update({ status: newStatus }).eq('id', id);
  }, [jobs]);

  const updateJobPhase = useCallback(async (jobId: string, newPhase: string) => {
    setJobs(currentJobs => 
      currentJobs.map(job => 
        job.id === jobId ? { ...job, phase: newPhase } : job
      )
    );

    const { error: supabaseError } = await supabase
      .from('jobs')
      .update({ phase: newPhase })
      .eq('id', jobId);

    if (supabaseError) {
      console.error("Failed to update job phase:", supabaseError);
      refresh(); 
    }
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
    updateJobPhase 
  };
};
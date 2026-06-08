import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; 
import { mockJobs, mockCustomers, mockTechnicians } from '@/lib/data';
import type { Job, Customer, Technician } from '@/lib/data';

export const useDispatchData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data State
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>(mockCustomers);
  const [technicians, setTechnicians] = useState<Technician[]>(mockTechnicians);

  // 1. Core function to fetch live jobs from the database
  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: dbRows, error: supabaseError } = await supabase
        .from('jobs')
        .select('*');

      if (supabaseError) {
        console.error("Error fetching jobs from Supabase:", supabaseError);
        setError(supabaseError.message);
        // Fallback to mock data if the database fetch fails entirely
        setJobs(mockJobs);
      } else if (dbRows) {
        // Map the database rows to fit your calendar layout perfectly
const localizedJobs = dbRows.map((j: any) => ({
  ...j,
  id: j.id?.toString() || `job-${Math.random()}`,
  customerName: j.title || j.customerName || "New AI Job",
  address: j.location || j.address || "Tucson, AZ",
  phase: j.phase || "Rough-In",
  status: j.status || "pending",
  startTime: j.startTime || "08:00", 
  endTime: j.endTime || "10:00",
  date: j.date || "2026-06-04",       // Ensures it lands on today's date grid if blank
  tech: j.tech || "Unassigned",       // 👈 CRITICAL: Gives the calendar a column lane to render in
  estimatedDuration: j.estimatedDuration || 120 // Tells the calendar how tall to make the box
}));
        
        // Merge live database jobs with your local mock jobs so the screen looks full!
        setJobs([...mockJobs, ...localizedJobs]);
      }
    } catch (err: any) {
      console.error("Unexpected error in fetchJobs:", err);
      setError(err.message || "An unexpected error occurred");
      setJobs(mockJobs);
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch live data when the app loads
  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  // 3. Clean refresh wrapper
  const refresh = useCallback(async () => {
    await fetchJobs();
  }, [fetchJobs]);

  const createJob = useCallback(async (job: Omit<Job, 'id'>) => {
    const newJob = { ...job, id: `job-${Date.now()}` } as Job;
    setJobs(prev => [...prev, newJob]);
  }, []);

  const toggleJobStatus = useCallback(async (id: string) => {
    setJobs(prev => prev.map(j => {
      if (j.id === id) {
        return { ...j, status: j.status === 'completed' ? 'pending' : 'completed' };
      }
      return j;
    }));
  }, []);

  const rescheduleJob = useCallback(async (id: string, newDate: string, newStartHour: number) => {
    setJobs(prev => prev.map(j => {
      if (j.id === id) {
        const currentDuration = j.estimatedDuration || 60;
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
  }, []);

  // Optimistic UI Phase Update to Supabase
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
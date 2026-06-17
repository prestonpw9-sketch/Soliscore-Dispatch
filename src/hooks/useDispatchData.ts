import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/lib/supabase'; 
import type { Job, Customer, Technician } from '@/lib/data';

export const useDispatchData = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Core Data State - Starting completely clean, NO DUMMY DATA
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
          type: j.type || "maintenance", 
          estimatedDuration: j.estimatedDuration || 120
        }));
        // ONLY load real database jobs
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

  // 3. CREATE JOB - Instantly saves to Supabase
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

    const { error } = await supabase.from('jobs').insert([dbPayload]);
    if (error) console.error("Error saving job to DB:", error);
    refresh();
  }, [refresh]);

  // 4. RESCHEDULE JOB (Drag & Drop) - Locks new time in Supabase
  const rescheduleJob = useCallback(async (id: string, newDate: string, newStartHour: number) => {
    // Optimistic fast UI update
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

    // Background Database Lock-in
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
      refresh(); 
    }
  }, [jobs, refresh]);

  // 5. TOGGLE STATUS - Saves to Supabase
  const toggleJobStatus = useCallback(async (id: string) => {
    const job = jobs.find(j => j.id === id);
    if (!job) return;
    const newStatus = job.status === 'completed' ? 'pending' : 'completed';
    setJobs(prev => prev.map(j => j.id === id ? { ...j, status: newStatus } : j));
    await supabase.from('jobs').update({ status: newStatus }).eq('id', id);
  }, [jobs]);

  const updateJobPhase = useCallback(async (jobId: string, newPhase: string) => {
    setJobs(currentJobs => 
      currentJobs.map(job => job.id === jobId ? { ...job, phase: newPhase } : job)
    );
    const { error } = await supabase.from('jobs').update({ phase: newPhase }).eq('id', jobId);
    if (error) {
      console.error("Failed to update job phase:", error);
      refresh(); 
    }
  }, [refresh]);
// 6. HIRE TECHNICIAN - Saves new guy to Supabase
  const hireTechnician = useCallback(async (name: string, role: string) => {
    const { error } = await supabase.from('technicians').insert([{ name, role }]);
    if (error) console.error("Error hiring technician:", error);
    refresh(); 
  }, [refresh]);

  // 7. FIRE TECHNICIAN - Removes guy from Supabase
  const fireTechnician = useCallback(async (id: string) => {
    const { error } = await supabase.from('technicians').delete().eq('id', id);
    if (error) console.error("Error firing technician:", error);
    refresh();
  }, [refresh]);
 return {
    loading, error, jobs, customers, technicians,
    refresh, createJob, toggleJobStatus, rescheduleJob, updateJobPhase,
    hireTechnician, // <-- Added!
    fireTechnician  // <-- Added!
  };
};
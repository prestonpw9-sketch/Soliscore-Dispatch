import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Trash2, Briefcase, Loader2, CalendarOff, Plus } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { TechTimeOff } from '@/lib/data';
import { isTechOffOnDay } from '@/lib/data';

interface Technician {
  id: string;
  name: string;
  role: string;
}

interface Job {
  id: number;
  title: string;
  customerName: string;
  phase: string;
  technician_id: string | null;
  date: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  triggerRef?: React.RefObject<HTMLElement>;
  techTimeOff?: TechTimeOff[];
  onAddTimeOff?: (
    technicianId: string,
    startDate: string,
    endDate: string,
    note?: string | null,
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  onDeleteTimeOff?: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

type TechRole = 'Plumber' | 'Apprentice';

function todayYMD() {
  return new Date().toISOString().split('T')[0];
}

const TeamModal: React.FC<Props> = ({
  isOpen,
  onClose,
  triggerRef,
  techTimeOff = [],
  onAddTimeOff,
  onDeleteTimeOff,
}) => {
  const { canEdit } = useAuth();
  const [technicians, setTechnicians]     = useState<Technician[]>([]);
  const [todayJobs, setTodayJobs]         = useState<Job[]>([]);
  const [loading, setLoading]             = useState(false);
  const [newName, setNewName]             = useState('');
  const [newRole, setNewRole]             = useState<TechRole>('Plumber');
  const [confirmFireId, setConfirmFireId] = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [leaveForId, setLeaveForId]       = useState<string | null>(null);
  const [leaveStart, setLeaveStart]       = useState(todayYMD());
  const [leaveEnd, setLeaveEnd]           = useState(todayYMD());
  const [leaveNote, setLeaveNote]         = useState('');

  const modalRef    = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);
  const today = todayYMD();

  const handleClose = () => {
    setConfirmFireId(null);
    setLeaveForId(null);
    setError(null);
    onClose();
    triggerRef?.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return;
    async function fetchData() {
      setLoading(true);
      setError(null);
      const [techRes, jobRes] = await Promise.all([
        supabase.from('technicians').select('id, name, role').order('name'),
        supabase.from('jobs').select('id, title, customerName, phase, technician_id, date').eq('date', today),
      ]);
      if (techRes.error) { setError(techRes.error.message); setLoading(false); return; }
      if (jobRes.error)  { setError(jobRes.error.message);  setLoading(false); return; }
      setTechnicians(techRes.data ?? []);
      setTodayJobs(jobRes.data ?? []);
      setLoading(false);
    }
    void fetchData();
  }, [isOpen, today]);

  useEffect(() => {
    if (isOpen) setTimeout(() => firstFocusRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleHire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('technicians')
      .insert({ name: newName.trim(), role: newRole })
      .select()
      .single();
    if (insertError) { setError(insertError.message); }
    else if (data) {
      setTechnicians(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
    }
    setSaving(false);
  };

  const handleFireConfirmed = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase.from('technicians').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); }
    else { setTechnicians(prev => prev.filter(t => t.id !== id)); setConfirmFireId(null); }
    setSaving(false);
  };

  const openLeaveForm = (techId: string) => {
    setLeaveForId(techId);
    setLeaveStart(today);
    setLeaveEnd(today);
    setLeaveNote('');
    setError(null);
  };

  const handleSaveLeave = async (techId: string) => {
    if (!onAddTimeOff) return;
    setSaving(true);
    setError(null);
    const result = await onAddTimeOff(techId, leaveStart, leaveEnd, leaveNote);
    setSaving(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    setLeaveForId(null);
  };

  const handleDeleteLeave = async (id: string) => {
    if (!onDeleteTimeOff) return;
    setSaving(true);
    setError(null);
    const result = await onDeleteTimeOff(id);
    setSaving(false);
    if (result.ok === false) setError(result.message);
  };

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="team-modal-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]"
      >
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="team-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
            Active Roster &amp; Dispatch
          </h2>
          <button type="button" onClick={handleClose} aria-label="Close roster modal" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
        )}

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          )}
          {!loading && technicians.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No technicians on the roster yet.</p>
          )}
          {!loading && technicians.map(tech => {
            const techJobs = todayJobs.filter(j => j.technician_id === tech.id);
            const isFiring = confirmFireId === tech.id;
            const offToday = isTechOffOnDay(tech.id, today, techTimeOff);
            const upcoming = techTimeOff
              .filter(r => r.technicianId === tech.id && r.endDate >= today)
              .sort((a, b) => a.startDate.localeCompare(b.startDate));
            const showLeaveForm = leaveForId === tech.id;

            return (
              <div key={tech.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col gap-3">
                <div className="flex flex-col md:flex-row gap-4 justify-between md:items-start">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 dark:text-white text-lg">{tech.name}</h3>
                      <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${tech.role === 'Plumber' ? 'bg-teal-100 text-teal-700' : 'bg-orange-100 text-orange-700'}`}>
                        {tech.role}
                      </span>
                      {offToday && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                          <CalendarOff className="w-3 h-3" /> Off today
                        </span>
                      )}
                    </div>
                    <div className="mt-2 space-y-1">
                      {techJobs.length === 0 ? (
                        <p className="text-sm text-slate-500 flex items-center gap-1">
                          <Briefcase className="w-3 h-3" aria-hidden="true" /> No jobs scheduled today
                        </p>
                      ) : (
                        techJobs.map(job => (
                          <p key={job.id} className="text-sm text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <Briefcase className="w-3 h-3 text-indigo-500" aria-hidden="true" />
                            {job.customerName || job.title} {job.phase ? `(${job.phase})` : ''}
                          </p>
                        ))
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 self-start flex items-center gap-2">
                    {canEdit && onAddTimeOff && !isFiring && (
                      <button
                        type="button"
                        onClick={() => openLeaveForm(tech.id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800"
                      >
                        <Plus className="w-3.5 h-3.5" /> Day off
                      </button>
                    )}
                    {isFiring ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Remove {tech.name}?</span>
                        <button type="button" onClick={() => handleFireConfirmed(tech.id)} disabled={saving} aria-label={`Confirm remove ${tech.name}`} className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">Yes</button>
                        <button type="button" onClick={() => setConfirmFireId(null)} disabled={saving} aria-label={`Cancel remove ${tech.name}`} className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors">Cancel</button>
                      </div>
                    ) : (
                      <button type="button" onClick={() => setConfirmFireId(tech.id)} aria-label={`Remove ${tech.name} from roster`} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>

                {showLeaveForm && (
                  <div className="rounded-lg border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-900 p-3 space-y-2">
                    <p className="text-xs font-bold text-rose-700 dark:text-rose-300">Log day off for {tech.name}</p>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        Start
                        <input
                          type="date"
                          value={leaveStart}
                          onChange={e => {
                            const next = e.target.value;
                            setLeaveStart(next);
                            if (leaveEnd < next) setLeaveEnd(next);
                          }}
                          className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        />
                      </label>
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                        End
                        <input
                          type="date"
                          value={leaveEnd}
                          min={leaveStart}
                          onChange={e => setLeaveEnd(e.target.value)}
                          className="mt-1 w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                        />
                      </label>
                    </div>
                    <input
                      type="text"
                      value={leaveNote}
                      onChange={e => setLeaveNote(e.target.value)}
                      placeholder="Note (optional)"
                      className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={saving || !leaveStart || !leaveEnd}
                        onClick={() => void handleSaveLeave(tech.id)}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold"
                      >
                        {saving ? 'Saving…' : 'Save day off'}
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => setLeaveForId(null)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {upcoming.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Upcoming days off</p>
                    {upcoming.map(row => (
                      <div
                        key={row.id}
                        className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-lg px-2.5 py-1.5"
                      >
                        <CalendarOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                        <span className="font-semibold">
                          {row.startDate === row.endDate
                            ? row.startDate
                            : `${row.startDate} → ${row.endDate}`}
                        </span>
                        {row.note && <span className="text-slate-400 truncate">· {row.note}</span>}
                        {canEdit && onDeleteTimeOff && (
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void handleDeleteLeave(row.id)}
                            className="ml-auto text-rose-500 hover:text-rose-700 p-1"
                            aria-label="Remove day off"
                            title="Remove day off"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <form onSubmit={handleHire} className="flex gap-3">
            <input ref={firstFocusRef} type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="New hire name…" aria-label="New technician name" className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
            <select value={newRole} onChange={e => setNewRole(e.target.value as TechRole)} aria-label="New technician role" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
              <option value="Plumber">Plumber</option>
              <option value="Apprentice">Apprentice</option>
            </select>
            <button type="submit" disabled={saving || !newName.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />} Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TeamModal;

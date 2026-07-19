import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Briefcase, Loader2, Pencil, Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { PLUMBING_PHASES } from '@/components/PhaseDropdown';

interface Job {
  id: number;
  title: string | null;
  customerName: string | null;
  location: string | null;
  address: string | null;
  status: string;
  phase: string;
  date: string;
  description: string | null;
}

function jobDisplayName(job: Job): string {
  return job.title?.trim() || job.customerName?.trim() || 'Untitled Job';
}

function jobDisplayAddress(job: Job): string {
  return job.location?.trim() || job.address?.trim() || '';
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Refresh dashboard/schedule after add/edit/delete. */
  onJobsChanged?: () => void | Promise<unknown>;
}

const ActiveJobsModal: React.FC<Props> = ({ isOpen, onClose, onJobsChanged }) => {
  const { canEdit } = useAuth();
  const [jobs, setJobs]               = useState<Job[]>([]);
  const [loading, setLoading]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editTitle, setEditTitle]     = useState('');
  const [editPhase, setEditPhase]     = useState('Rough-In');
  const [newCustomer, setNewCustomer] = useState('');
  const [newAddress, setNewAddress]   = useState('');
  const [newPhase, setNewPhase]       = useState('Rough-In');
  const [newDate, setNewDate]         = useState(new Date().toISOString().split('T')[0]);
  const modalRef    = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchJobs();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => firstFocusRef.current?.focus(), 0);
  }, [isOpen]);

  useEffect(() => {
    if (editingId !== null) setTimeout(() => editInputRef.current?.focus(), 0);
  }, [editingId]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab') return;
      const focusable = modalRef.current?.querySelectorAll<HTMLElement>(
        'button, input, select, [tabindex]:not([tabindex="-1"])'
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
  }, [isOpen, onClose]);

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('jobs')
      .select('id, title, customerName, location, address, status, phase, date, description')
      .neq('status', 'completed')
      .order('date', { ascending: true });
    if (fetchError) { setError(fetchError.message); }
    else { setJobs(data ?? []); }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCustomer.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('jobs')
      .insert({
        title: newCustomer.trim(),
        location: newAddress.trim(),
        phase: newPhase,
        date: newDate,
        status: 'scheduled',
      })
      .select('id, title, customerName, location, address, status, phase, date, description')
      .single();
    if (insertError) { setError(insertError.message); }
    else if (data) {
      setJobs(prev => [...prev, data]);
      setNewCustomer('');
      setNewAddress('');
      await onJobsChanged?.();
    }
    setSaving(false);
  };

  const startEditing = (job: Job) => {
    setEditingId(job.id);
    setEditTitle(jobDisplayName(job) === 'Untitled Job' ? '' : jobDisplayName(job));
    setEditPhase(job.phase || 'Rough-In');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditTitle('');
    setEditPhase('Rough-In');
  };

  const saveJobEdits = async (id: number) => {
    const trimmed = editTitle.trim();
    if (!trimmed) {
      setError('Job name cannot be empty.');
      return;
    }
    setSaving(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('jobs')
      .update({ title: trimmed, phase: editPhase })
      .eq('id', id)
      .select('id, title, customerName, location, address, status, phase, date, description')
      .single();
    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setJobs(prev => prev.map(j => (j.id === id ? data : j)));
      cancelEditing();
      await onJobsChanged?.();
    }
    setSaving(false);
  };

  const handlePhaseChange = async (id: number, phase: string) => {
    setSaving(true);
    setError(null);
    const { data, error: updateError } = await supabase
      .from('jobs')
      .update({ phase })
      .eq('id', id)
      .select('id, title, customerName, location, address, status, phase, date, description')
      .single();
    if (updateError) {
      setError(updateError.message);
    } else if (data) {
      setJobs(prev => prev.map(j => (j.id === id ? data : j)));
      await onJobsChanged?.();
    }
    setSaving(false);
  };

  const handleDelete = async (id: number) => {
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase.from('jobs').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); }
    else {
      setJobs(prev => prev.filter(j => j.id !== id));
      setConfirmDeleteId(null);
      if (editingId === id) cancelEditing();
      await onJobsChanged?.();
    }
    setSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jobs-modal-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="jobs-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
            Active Jobs
          </h2>
          <button type="button" onClick={onClose} aria-label="Close jobs modal"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
        )}

        {/* Job list */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          )}
          {!loading && jobs.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No active jobs.</p>
          )}
          {!loading && jobs.map(job => {
            const isDeleting = confirmDeleteId === job.id;
            const isEditing = editingId === job.id;
            const displayName = jobDisplayName(job);
            const displayAddress = jobDisplayAddress(job);
            return (
              <div key={job.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 justify-between md:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Briefcase className="w-4 h-4 text-indigo-500 shrink-0" />
                    {isEditing ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editTitle}
                          onChange={e => setEditTitle(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void saveJobEdits(job.id);
                            if (e.key === 'Escape') cancelEditing();
                          }}
                          aria-label="Job name"
                          className="flex-1 min-w-[10rem] bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg px-3 py-1 text-sm font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        <select
                          value={editPhase}
                          onChange={e => setEditPhase(e.target.value)}
                          aria-label="Job phase"
                          className="bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-lg px-2 py-1 text-[11px] font-black uppercase text-indigo-700 dark:text-indigo-300 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                          {PLUMBING_PHASES.map(p => (
                            <option key={p} value={p}>{p}</option>
                          ))}
                          {/* Keep legacy phase values selectable if present */}
                          {editPhase && !(PLUMBING_PHASES as readonly string[]).includes(editPhase) && (
                            <option value={editPhase}>{editPhase}</option>
                          )}
                        </select>
                        <button
                          type="button"
                          onClick={() => void saveJobEdits(job.id)}
                          disabled={saving || !editTitle.trim()}
                          aria-label="Save job"
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={cancelEditing}
                          disabled={saving}
                          aria-label="Cancel editing"
                          className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <h3 className="font-bold text-slate-900 dark:text-white">{displayName}</h3>
                        {canEdit && (
                          <button
                            type="button"
                            onClick={() => startEditing(job)}
                            aria-label={`Edit ${displayName}`}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canEdit ? (
                          <select
                            value={job.phase || 'Rough-In'}
                            onChange={e => void handlePhaseChange(job.id, e.target.value)}
                            disabled={saving}
                            aria-label={`Phase for ${displayName}`}
                            className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 outline-none cursor-pointer disabled:opacity-50"
                          >
                            {PLUMBING_PHASES.map(p => (
                              <option key={p} value={p}>{p}</option>
                            ))}
                            {job.phase && !(PLUMBING_PHASES as readonly string[]).includes(job.phase) && (
                              <option value={job.phase}>{job.phase}</option>
                            )}
                          </select>
                        ) : (
                          <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                            {job.phase}
                          </span>
                        )}
                      </>
                    )}
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      job.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                      job.status === 'pending' ? 'bg-orange-100 text-orange-700' :
                      'bg-slate-100 text-slate-600'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  {displayAddress && <p className="text-sm text-slate-500 mt-1">{displayAddress}</p>}
                  <p className="text-xs text-slate-400 mt-0.5">{job.date}</p>
                </div>
                <div className="shrink-0 self-start md:self-center">
                  {canEdit && (isDeleting ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Remove job?</span>
                      <button type="button" onClick={() => handleDelete(job.id)} disabled={saving}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">Yes</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={saving}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(job.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add job form */}
        {canEdit && (
          <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0">
            <form onSubmit={handleAdd} className="flex flex-col gap-3">
              <div className="flex gap-3">
                <input ref={firstFocusRef} type="text" value={newCustomer} onChange={e => setNewCustomer(e.target.value)}
                  placeholder="Customer name…" aria-label="Customer name"
                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                <input type="text" value={newAddress} onChange={e => setNewAddress(e.target.value)}
                  placeholder="Address…" aria-label="Address"
                  className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
              </div>
              <div className="flex gap-3">
                <select value={newPhase} onChange={e => setNewPhase(e.target.value)} aria-label="Phase"
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                  {PLUMBING_PHASES.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <input type="date" value={newDate} onChange={e => setNewDate(e.target.value)} aria-label="Job date"
                  className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
                <button type="submit" disabled={saving || !newCustomer.trim()}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};

export default ActiveJobsModal;

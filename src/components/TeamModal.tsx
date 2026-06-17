import React, { useState, useEffect, useRef } from 'react';
import { X, UserPlus, Trash2, Briefcase } from 'lucide-react';
import type { Technician, Job } from '@/lib/data';

// ── Types ──────────────────────────────────────────────────────────────────

interface Props {
  isOpen: boolean;
  onClose: () => void;
  technicians: Technician[];
  todayJobs: Job[];
  onHire: (name: string, role: string) => void;
  onFire: (id: string) => void;
  triggerRef?: React.RefObject<HTMLElement>;
}

type TechRole = 'Plumber' | 'Apprentice';

// ── Component ──────────────────────────────────────────────────────────────

const TeamModal: React.FC<Props> = ({
  isOpen, onClose, technicians, todayJobs, onHire, onFire, triggerRef,
}) => {
  const [newName, setNewName]             = useState('');
  const [newRole, setNewRole]             = useState<TechRole>('Plumber');
  const [confirmFireId, setConfirmFireId] = useState<string | null>(null);

  const modalRef    = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);

  // FIX: wrap onClose so we always reset confirmFireId and return focus
  const handleClose = () => {
    setConfirmFireId(null);
    onClose();
    // Return focus to the button that opened the modal (WCAG 2.4.3)
    triggerRef?.current?.focus();
  };

  // Focus first input when modal opens
  useEffect(() => {
    if (isOpen) setTimeout(() => firstFocusRef.current?.focus(), 0);
  }, [isOpen]);

  // Focus trap + Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }
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
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

  const handleHire = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    onHire(newName.trim(), newRole);
    setNewName('');
  };

  const handleFireConfirmed = (id: string) => {
    onFire(id);
    setConfirmFireId(null);
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
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="team-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
            Active Roster &amp; Dispatch
          </h2>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close roster modal"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Roster list */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {technicians.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No technicians on the roster yet.</p>
          )}

          {technicians.map(tech => {
            const techJobs = todayJobs.filter(j => j.technicianId === tech.id);
            const isFiring = confirmFireId === tech.id;

            return (
              <div
                key={tech.id}
                className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 justify-between md:items-center"
              >
                {/* Tech info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-900 dark:text-white text-lg">{tech.name}</h3>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                      tech.role === 'Plumber'
                        ? 'bg-teal-100 text-teal-700 dark:bg-teal-500/20 dark:text-teal-400'
                        : 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                    }`}>
                      {tech.role}
                    </span>
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
                          {job.customerName} ({job.phase})
                        </p>
                      ))
                    )}
                  </div>
                </div>

                {/* Inline fire confirm */}
                <div className="shrink-0 self-start md:self-center">
                  {isFiring ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 dark:text-red-400 font-semibold whitespace-nowrap">
                        Remove {tech.name}?
                      </span>
                      <button
                        type="button"
                        onClick={() => handleFireConfirmed(tech.id)}
                        aria-label={`Confirm remove ${tech.name}`}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmFireId(null)}
                        aria-label={`Cancel remove ${tech.name}`}
                        className="px-2.5 py-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmFireId(tech.id)}
                      aria-label={`Remove ${tech.name} from roster`}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hire form */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <form onSubmit={handleHire} className="flex gap-3">
            <input
              ref={firstFocusRef}
              id="new-hire-name"
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="New hire name…"
              aria-label="New technician name"
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            />
            <select
              value={newRole}
              onChange={e => setNewRole(e.target.value as TechRole)}
              aria-label="New technician role"
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="Plumber">Plumber</option>
              <option value="Apprentice">Apprentice</option>
            </select>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" /> Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TeamModal;
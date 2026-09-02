import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, UserPlus, Trash2, Briefcase, Loader2, CalendarOff, Plus, Phone, MessageSquare, Search, Siren } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { TechTimeOff } from '@/lib/data';
import { isTechOffOnDay, dispatchToday } from '@/lib/data';
import { formatPhoneDisplay, normalizeToE164, smsHref, telHref } from '@/lib/phone';

interface Technician {
  id: string;
  name: string;
  role: string;
  skills?: string[];
  phone?: string | null;
  emergencyContact?: boolean;
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
  return dispatchToday();
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
  const [newPhone, setNewPhone]           = useState('');
  const [newOnCall, setNewOnCall]         = useState(true);
  const [search, setSearch]               = useState('');
  const [confirmFireId, setConfirmFireId] = useState<string | null>(null);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [leaveForId, setLeaveForId]       = useState<string | null>(null);
  const [leaveStart, setLeaveStart]       = useState(todayYMD());
  const [leaveEnd, setLeaveEnd]           = useState(todayYMD());
  const [leaveNote, setLeaveNote]         = useState('');
  const [skillsDraft, setSkillsDraft]     = useState<Record<string, string>>({});
  const [editingSkillsId, setEditingSkillsId] = useState<string | null>(null);
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft]       = useState<Record<string, string>>({});

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
      const [techRes, jobRes, memoryRes] = await Promise.all([
        supabase.from('technicians').select('id, name, role, phone, emergency_contact').order('name'),
        supabase.from('jobs').select('id, title, customerName, phase, technician_id, date').eq('date', today),
        supabase.functions.invoke<{ memories?: Array<{
          category: string;
          technician_id: string | null;
          content: string;
          active?: boolean;
        }> }>('send-outbound-sms', { body: { action: 'list-ai-memories' } }),
      ]);
      if (techRes.error) { setError(techRes.error.message); setLoading(false); return; }
      if (jobRes.error)  { setError(jobRes.error.message);  setLoading(false); return; }

      const abilityByTech = new Map<string, string[]>();
      for (const m of memoryRes.data?.memories ?? []) {
        if (m.category !== 'crew_ability' || !m.technician_id) continue;
        const list = abilityByTech.get(m.technician_id) ?? [];
        // Prefer compact skill lists when content looks like "Name abilities: a, b"
        const match = m.content.match(/abilities:\s*(.+)$/i);
        if (match) {
          for (const part of match[1].split(',')) {
            const s = part.trim();
            if (s && s !== '(none)' && !list.includes(s)) list.push(s);
          }
        } else if (!list.includes(m.content)) {
          list.push(m.content);
        }
        abilityByTech.set(m.technician_id, list);
      }

      setTechnicians((techRes.data ?? []).map(t => ({
        ...t,
        phone: t.phone ? String(t.phone) : null,
        emergencyContact: Boolean(t.emergency_contact),
        skills: abilityByTech.get(t.id) ?? [],
      })));
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
    const e164 = newPhone.trim() ? normalizeToE164(newPhone) : null;
    if (newPhone.trim() && !e164) {
      setError('Enter a valid US phone number (10 digits).');
      setSaving(false);
      return;
    }
    const { data, error: insertError } = await supabase
      .from('technicians')
      .insert({
        name: newName.trim(),
        role: newRole,
        phone: e164,
        emergency_contact: newOnCall,
      })
      .select()
      .single();
    if (insertError) { setError(insertError.message); }
    else if (data) {
      setTechnicians(prev => [...prev, {
        ...data,
        phone: data.phone ? String(data.phone) : null,
        emergencyContact: Boolean(data.emergency_contact),
        skills: [],
      }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewName('');
      setNewPhone('');
      setNewOnCall(newRole === 'Plumber');
      window.dispatchEvent(new CustomEvent('solidcore:data-refresh'));
    }
    setSaving(false);
  };

  const handleFireConfirmed = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase.from('technicians').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); }
    else { setTechnicians(prev => prev.filter(t => t.id !== id)); setConfirmFireId(null); window.dispatchEvent(new CustomEvent('solidcore:data-refresh')); }
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

  const openSkillsEditor = (tech: Technician) => {
    setEditingSkillsId(tech.id);
    setSkillsDraft(prev => ({
      ...prev,
      [tech.id]: (tech.skills ?? []).join(', '),
    }));
    setError(null);
  };

  const handleSaveSkills = async (techId: string) => {
    const raw = skillsDraft[techId] ?? '';
    const skills = raw.split(/[,;|]/).map(s => s.trim()).filter(Boolean);
    setSaving(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke<{
      ok?: boolean;
      error?: string;
      skills?: string[];
    }>('send-outbound-sms', {
      body: { action: 'save-tech-skills', technician_id: techId, skills },
    });
    setSaving(false);
    if (fnError || data?.error) {
      setError(data?.error ?? fnError?.message ?? 'Could not save abilities.');
      return;
    }
    setTechnicians(prev => prev.map(t =>
      t.id === techId ? { ...t, skills: data?.skills ?? skills } : t,
    ));
    setEditingSkillsId(null);
    window.dispatchEvent(new CustomEvent('solidcore:data-refresh'));
  };

  const openPhoneEditor = (tech: Technician) => {
    setEditingPhoneId(tech.id);
    setPhoneDraft(prev => ({
      ...prev,
      [tech.id]: tech.phone ? formatPhoneDisplay(tech.phone) : '',
    }));
    setError(null);
  };

  const handleSavePhone = async (techId: string) => {
    const raw = phoneDraft[techId] ?? '';
    const e164 = raw.trim() ? normalizeToE164(raw) : null;
    if (raw.trim() && !e164) {
      setError('Enter a valid US phone number (10 digits).');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('technicians')
      .update({ phone: e164 })
      .eq('id', techId);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setTechnicians(prev => prev.map(t => t.id === techId ? { ...t, phone: e164 } : t));
    setEditingPhoneId(null);
    window.dispatchEvent(new CustomEvent('solidcore:data-refresh'));
  };

  const handleToggleOnCall = async (tech: Technician) => {
    const next = !tech.emergencyContact;
    setSaving(true);
    setError(null);
    const { error: updateError } = await supabase
      .from('technicians')
      .update({ emergency_contact: next })
      .eq('id', tech.id);
    setSaving(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setTechnicians(prev => prev.map(t => t.id === tech.id ? { ...t, emergencyContact: next } : t));
    window.dispatchEvent(new CustomEvent('solidcore:data-refresh'));
  };

  const visibleTechs = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter(t => {
      const phone = formatPhoneDisplay(t.phone).toLowerCase();
      return t.name.toLowerCase().includes(q)
        || t.role.toLowerCase().includes(q)
        || phone.includes(q)
        || (t.phone ?? '').toLowerCase().includes(q);
    });
  }, [technicians, search]);

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
        <div className="flex justify-between items-start p-5 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-3">
          <div>
            <h2 id="team-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
              Plumber Directory
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Names, cell numbers, and who Twilio / the dispatch AI pages in an emergency.
            </p>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close plumber directory" className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
        )}

        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {!loading && technicians.length > 0 && (
            <label className="relative block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or phone…"
                aria-label="Search plumber directory"
                className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
              />
            </label>
          )}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          )}
          {!loading && technicians.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No technicians on the roster yet.</p>
          )}
          {!loading && technicians.length > 0 && visibleTechs.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No one matches “{search}”.</p>
          )}
          {!loading && visibleTechs.map(tech => {
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
                      {tech.emergencyContact && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300">
                          <Siren className="w-3 h-3" /> On-call
                        </span>
                      )}
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

                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Cell</p>
                        {canEdit && editingPhoneId !== tech.id && (
                          <button
                            type="button"
                            onClick={() => openPhoneEditor(tech)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-500"
                          >
                            {tech.phone ? 'Edit' : 'Add number'}
                          </button>
                        )}
                      </div>
                      {editingPhoneId === tech.id ? (
                        <div className="space-y-2">
                          <input
                            type="tel"
                            value={phoneDraft[tech.id] ?? ''}
                            onChange={e => setPhoneDraft(prev => ({ ...prev, [tech.id]: e.target.value }))}
                            placeholder="(520) 555-1234"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleSavePhone(tech.id)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold"
                            >
                              {saving ? 'Saving…' : 'Save number'}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setEditingPhoneId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : tech.phone ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <a
                            href={telHref(tech.phone) ?? undefined}
                            className="inline-flex items-center gap-1.5 text-sm font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {formatPhoneDisplay(tech.phone)}
                          </a>
                          <a
                            href={smsHref(tech.phone) ?? undefined}
                            className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                          >
                            <MessageSquare className="w-3 h-3" /> Text
                          </a>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-400 italic">No number on file — add one so Twilio and the AI can reach them</p>
                      )}
                      {canEdit && (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => void handleToggleOnCall(tech)}
                          className={`mt-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors ${
                            tech.emergencyContact
                              ? 'bg-red-50 border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-800 dark:text-red-300'
                              : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-white dark:hover:bg-slate-800'
                          }`}
                        >
                          <Siren className="w-3 h-3" />
                          {tech.emergencyContact ? 'On-call for emergencies' : 'Mark on-call'}
                        </button>
                      )}
                    </div>

                    <div className="mt-3">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Abilities</p>
                        {canEdit && editingSkillsId !== tech.id && (
                          <button
                            type="button"
                            onClick={() => openSkillsEditor(tech)}
                            className="text-[10px] font-bold text-indigo-600 hover:text-indigo-500"
                          >
                            Edit
                          </button>
                        )}
                      </div>
                      {editingSkillsId === tech.id ? (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={skillsDraft[tech.id] ?? ''}
                            onChange={e => setSkillsDraft(prev => ({ ...prev, [tech.id]: e.target.value }))}
                            placeholder="Rough, Top-out, Trim, water heaters…"
                            className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                          />
                          <div className="flex gap-2">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => void handleSaveSkills(tech.id)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold"
                            >
                              {saving ? 'Saving…' : 'Save abilities'}
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setEditingSkillsId(null)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (tech.skills?.length ? (
                        <p className="text-xs text-slate-600 dark:text-slate-300">{tech.skills.join(' · ')}</p>
                      ) : (
                        <p className="text-xs text-slate-400 italic">Not set — teach the AI or edit here</p>
                      ))}
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
          <form onSubmit={handleHire} className="space-y-3">
            <div className="flex gap-3">
              <input ref={firstFocusRef} type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="New hire name…" aria-label="New technician name" className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none" />
              <select value={newRole} onChange={e => {
                const role = e.target.value as TechRole;
                setNewRole(role);
                setNewOnCall(role === 'Plumber');
              }} aria-label="New technician role" className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none">
                <option value="Plumber">Plumber</option>
                <option value="Apprentice">Apprentice</option>
              </select>
            </div>
            <div className="flex gap-3 items-center">
              <input
                type="tel"
                value={newPhone}
                onChange={e => setNewPhone(e.target.value)}
                placeholder="Cell (520) 555-1234"
                aria-label="New technician phone"
                className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
              />
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={newOnCall}
                  onChange={e => setNewOnCall(e.target.checked)}
                  className="rounded border-slate-300"
                />
                On-call
              </label>
              <button type="submit" disabled={saving || !newName.trim()} className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" aria-hidden="true" />} Add
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default TeamModal;

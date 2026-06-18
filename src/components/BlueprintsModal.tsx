import React, { useState, useEffect, useRef } from 'react';
import { X, Plus, Trash2, Map, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Blueprint {
  id: string;
  project_name: string;
  client_name: string | null;
  total_cost: number | null;
  created_at: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const BlueprintsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [blueprints, setBlueprints]       = useState<Blueprint[]>([]);
  const [loading, setLoading]             = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [newProject, setNewProject]       = useState('');
  const [newClient, setNewClient]         = useState('');
  const modalRef      = useRef<HTMLDivElement>(null);
  const firstFocusRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchBlueprints();
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => firstFocusRef.current?.focus(), 0);
  }, [isOpen]);

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
  }, [isOpen]);

  const fetchBlueprints = async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('project_bids')
      .select('id, project_name, client_name, total_cost, created_at')
      .order('created_at', { ascending: false });
    if (fetchError) { setError(fetchError.message); }
    else { setBlueprints(data ?? []); }
    setLoading(false);
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProject.trim()) return;
    setSaving(true);
    setError(null);
    const { data, error: insertError } = await supabase
      .from('project_bids')
      .insert({
        project_name: newProject.trim(),
        client_name: newClient.trim() || null,
        takeoff_data: {},
      })
      .select()
      .single();
    if (insertError) { setError(insertError.message); }
    else if (data) {
      setBlueprints(prev => [data, ...prev]);
      setNewProject('');
      setNewClient('');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    setError(null);
    const { error: deleteError } = await supabase.from('project_bids').delete().eq('id', id);
    if (deleteError) { setError(deleteError.message); }
    else { setBlueprints(prev => prev.filter(b => b.id !== id)); setConfirmDeleteId(null); }
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
        aria-labelledby="blueprints-modal-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="blueprints-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
            Active Blueprints
          </h2>
          <button type="button" onClick={onClose} aria-label="Close blueprints modal"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
        )}

        {/* Blueprint list */}
        <div className="overflow-y-auto p-5 space-y-4 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          )}
          {!loading && blueprints.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-8">No blueprints on file yet.</p>
          )}
          {!loading && blueprints.map(bp => {
            const isDeleting = confirmDeleteId === bp.id;
            return (
              <div key={bp.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col md:flex-row gap-4 justify-between md:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Map className="w-4 h-4 text-blue-500 shrink-0" />
                    <h3 className="font-bold text-slate-900 dark:text-white">{bp.project_name}</h3>
                  </div>
                  {bp.client_name && <p className="text-sm text-slate-500 mt-1">{bp.client_name}</p>}
                  {bp.total_cost != null && (
                    <p className="text-sm font-bold text-emerald-600 mt-0.5">
                      ${bp.total_cost.toLocaleString()}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-0.5">
                    {new Date(bp.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="shrink-0 self-start md:self-center">
                  {isDeleting ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-red-600 font-semibold whitespace-nowrap">Remove blueprint?</span>
                      <button type="button" onClick={() => handleDelete(bp.id)} disabled={saving}
                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors">Yes</button>
                      <button type="button" onClick={() => setConfirmDeleteId(null)} disabled={saving}
                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 text-xs font-bold rounded-lg transition-colors">Cancel</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteId(bp.id)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add blueprint form */}
        <div className="p-5 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 shrink-0">
          <form onSubmit={handleAdd} className="flex gap-3">
            <input ref={firstFocusRef} type="text" value={newProject} onChange={e => setNewProject(e.target.value)}
              placeholder="Project name…" aria-label="Project name"
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            <input type="text" value={newClient} onChange={e => setNewClient(e.target.value)}
              placeholder="Client name…" aria-label="Client name"
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
            <button type="submit" disabled={saving || !newProject.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2 transition-colors">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default BlueprintsModal;
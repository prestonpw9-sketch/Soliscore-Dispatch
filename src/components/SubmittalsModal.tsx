import React, { useState, useEffect, useCallback } from 'react';
import {
  X, Upload, Trash2, FolderOpen, Loader2, FileText, ExternalLink,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job } from '@/lib/data';
import { fetchAllSubmittals, type SubmittalRecord } from '@/lib/submittals';

interface Submittal extends SubmittalRecord {}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
  onCountChange?: (count: number) => void;
}

const BUCKET = 'submittals';

const SubmittalsModal: React.FC<Props> = ({ isOpen, onClose, jobs, onCountChange }) => {
  const { canEdit } = useAuth();
  const [submittals, setSubmittals] = useState<Submittal[]>([]);
  const [loading, setLoading]       = useState(false);
  const [uploading, setUploading]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const jobLabel = useCallback((id: string | number | null) => {
    if (id === null || id === undefined || id === '') return 'Unassigned';
    const job = jobs.find(j => j.id === String(id));
    return job ? job.customerName : `Job #${id}`;
  }, [jobs]);

  const fetchSubmittals = useCallback(async () => {
    setLoading(true);
    setError(null);
    const rows = await fetchAllSubmittals();
    setSubmittals(rows);
    onCountChange?.(rows.length);
    setLoading(false);
  }, [onCountChange]);

  useEffect(() => {
    if (isOpen) void fetchSubmittals();
  }, [isOpen, fetchSubmittals]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Group submittals by job.
  const groups = React.useMemo(() => {
    const map = new Map<string, Submittal[]>();
    submittals.forEach(s => {
      const key = s.job_id === null || s.job_id === undefined ? '' : String(s.job_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    });
    return Array.from(map.entries()).map(([jobId, items]) => ({ jobId, items }));
  }, [submittals]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!selectedJobId) { setError('Pick a job before uploading a submittal.'); return; }
    setUploading(true);
    setError(null);
    const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const filePath  = `${selectedJobId}/${Date.now()}-${cleanName}`;
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(filePath, file);
    if (uploadError) {
      setError(uploadError.message);
      setUploading(false);
      return;
    }
    const { error: insertError } = await supabase.from('submittals').insert([{
      job_id: selectedJobId,
      name: file.name,
      file_path: filePath,
      status: 'submitted',
    }]);
    if (insertError) {
      setError(insertError.message);
      // Roll back the orphaned storage object.
      await supabase.storage.from(BUCKET).remove([filePath]);
    } else {
      setExpanded(prev => new Set(prev).add(selectedJobId));
      await fetchSubmittals();
    }
    setUploading(false);
  };

  const handleDelete = async (s: Submittal) => {
    const { error: storageError } = await supabase.storage.from(BUCKET).remove([s.file_path]);
    if (storageError) { setError(storageError.message); return; }
    if (!s.id.startsWith('storage:')) {
      const { error: rowError } = await supabase.from('submittals').delete().eq('id', s.id);
      if (rowError) { setError(rowError.message); return; }
    }
    setSubmittals(prev => {
      const next = prev.filter(x => x.id !== s.id);
      onCountChange?.(next.length);
      return next;
    });
    setConfirmDelete(null);
  };

  const openFile = (filePath: string) => {
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
  };

  const toggleGroup = (jobId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId); else next.add(jobId);
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submittals-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-xl">
              <FolderOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 id="submittals-title" className="text-lg font-black text-slate-900 dark:text-white">Submittals</h2>
              <p className="text-xs text-slate-500">
                {submittals.length} file{submittals.length !== 1 ? 's' : ''} · {groups.length} job{groups.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Upload bar with job picker */}
        {canEdit && (
          <div className="px-6 py-3 bg-indigo-50/60 dark:bg-indigo-900/10 border-b border-indigo-100 dark:border-indigo-900/30 flex flex-col sm:flex-row gap-3 shrink-0">
            <select
              value={selectedJobId}
              onChange={e => setSelectedJobId(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
            >
              <option value="">Select a job to attach to…</option>
              {jobs.map(j => (
                <option key={j.id} value={j.id}>{j.customerName} — {j.date}</option>
              ))}
            </select>
            <label
              className={`cursor-pointer inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors ${
                uploading || !selectedJobId
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white'
              }`}
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading…' : 'Upload'}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx"
                className="hidden"
                disabled={uploading || !selectedJobId}
                onChange={e => void handleUpload(e)}
              />
            </label>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium shrink-0">
            {error}
          </div>
        )}

        {/* Grouped list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <FolderOpen className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">No submittals yet. Pick a job and upload one.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map(group => {
                const isExpanded = expanded.has(group.jobId);
                return (
                  <div key={group.jobId || 'unassigned'}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.jobId)}
                      className="w-full flex items-center gap-2 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                    >
                      {isExpanded
                        ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                        : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                      <span className="font-bold text-slate-800 dark:text-white">{jobLabel(group.jobId)}</span>
                      <span className="text-xs text-slate-400 font-medium">
                        {group.items.length} file{group.items.length !== 1 ? 's' : ''}
                      </span>
                    </button>

                    {isExpanded && (
                      <div className="bg-slate-50/50 dark:bg-slate-800/20">
                        {group.items.map(s => {
                          const isDeleting = confirmDelete === s.id;
                          return (
                            <div key={s.id} className="flex items-center justify-between px-8 py-2.5 hover:bg-white dark:hover:bg-slate-800/50 transition-colors group">
                              <button
                                type="button"
                                onClick={() => openFile(s.file_path)}
                                className="flex items-center gap-3 flex-1 text-left min-w-0"
                              >
                                <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                                <span className="text-sm text-slate-700 dark:text-slate-300 truncate font-medium group-hover:text-indigo-600 transition-colors">
                                  {s.name}
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-indigo-400 shrink-0 transition-colors" />
                              </button>
                              {canEdit && (isDeleting ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-red-600 dark:text-red-400 font-semibold">Delete?</span>
                                  <button type="button" onClick={() => void handleDelete(s)}
                                    className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-lg">Yes</button>
                                  <button type="button" onClick={() => setConfirmDelete(null)}
                                    className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg">No</button>
                                </div>
                              ) : (
                                <button type="button" onClick={() => setConfirmDelete(s.id)}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SubmittalsModal;

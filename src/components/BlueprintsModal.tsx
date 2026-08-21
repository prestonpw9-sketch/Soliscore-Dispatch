import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  X, Upload, Trash2, Map as MapIcon, Loader2, FileText, ExternalLink,
  ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import type { Job } from '@/lib/data';
import { JobSelect } from '@/components/JobSelect';
import {
  buildBlueprintPath,
  groupBlueprintsByJob,
  parseBlueprintPath,
} from '@/lib/blueprints';

interface BlueprintFile {
  id: string;
  name: string;
  created_at?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
  onCountChange?: (count: number) => void;
  onRefresh?: () => void | Promise<unknown>;
}

const PLACEHOLDER = '.emptyFolderPlaceholder';

const BlueprintsModal: React.FC<Props> = ({
  isOpen, onClose, jobs, onCountChange, onRefresh,
}) => {
  const { canEdit } = useAuth();
  const [files, setFiles]                         = useState<BlueprintFile[]>([]);
  const [loading, setLoading]                     = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId]         = useState('');
  const [expandedGroups, setExpandedGroups]       = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete]         = useState<string | null>(null);
  const [uploadingGroupKey, setUploadingGroupKey] = useState<string | null>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase.storage
      .from('blueprints')
      .list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      const next = (data ?? [])
        .filter(f => f.name !== PLACEHOLDER)
        .map(f => ({ id: f.id, name: f.name, created_at: f.created_at })) as BlueprintFile[];
      setFiles(next);
      onCountChange?.(next.length);
    }
    setLoading(false);
    await onRefresh?.();
  }, [onCountChange, onRefresh]);

  useEffect(() => {
    if (isOpen) void fetchFiles();
  }, [isOpen, fetchFiles]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const groups = useMemo(
    () => groupBlueprintsByJob(files, jobs),
    [files, jobs],
  );

  useEffect(() => {
    const valid = new Set(groups.map(g => g.key));
    setExpandedGroups(prev => {
      const next = new Set<string>();
      prev.forEach(key => {
        if (valid.has(key)) next.add(key);
      });
      if (next.size === 0 && groups.length > 0) {
        next.add(groups[0].key);
      }
      return next;
    });
  }, [groups]);

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const uploadToJob = async (file: File, jobId: string, groupKey?: string) => {
    setUploading(true);
    if (groupKey) setUploadingGroupKey(groupKey);
    setError(null);
    const filePath = buildBlueprintPath(jobId, file.name);
    const { error: uploadError } = await supabase.storage.from('blueprints').upload(filePath, file);
    if (uploadError) {
      setError(uploadError.message);
    } else {
      setExpandedGroups(prev => new Set(prev).add(jobId));
      await fetchFiles();
    }
    setUploading(false);
    setUploadingGroupKey(null);
  };

  const handleHeaderUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!selectedJobId) {
      setError('Select a job before uploading a blueprint.');
      return;
    }
    await uploadToJob(file, selectedJobId, selectedJobId);
  };

  const handleGroupUpload = async (e: React.ChangeEvent<HTMLInputElement>, jobId: string) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !jobId) return;
    await uploadToJob(file, jobId, jobId);
  };

  const handleDelete = async (fileName: string) => {
    const { error: deleteError } = await supabase.storage.from('blueprints').remove([fileName]);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setFiles(prev => {
        const next = prev.filter(f => f.name !== fileName);
        onCountChange?.(next.length);
        return next;
      });
      setConfirmDelete(null);
      await onRefresh?.();
    }
  };

  const openFile = (fileName: string) => {
    const { data } = supabase.storage.from('blueprints').getPublicUrl(fileName);
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
  };

  const canUpload = canEdit && Boolean(selectedJobId) && !uploading;

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="blueprints-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
              <MapIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 id="blueprints-title" className="text-lg font-black text-slate-900 dark:text-white">Job Blueprints</h2>
              <p className="text-xs text-slate-500">
                {files.length} file{files.length !== 1 ? 's' : ''} · {groups.length} job{groups.length !== 1 ? 's' : ''}
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

        {/* Upload bar with job picker — same pattern as submittals / site photos */}
        {canEdit && (
          <div className="px-6 py-3 bg-blue-50/60 dark:bg-blue-900/10 border-b border-blue-100 dark:border-blue-900/30 shrink-0 space-y-2">
            <div className="flex flex-col sm:flex-row gap-3">
              <JobSelect
                jobs={jobs}
                value={selectedJobId}
                onChange={setSelectedJobId}
                id="blueprints-modal-job"
                placeholder="Select a job to attach to…"
                className="flex-1 min-w-0 py-2 px-3 text-sm rounded-xl"
              />
              <label
                className={`inline-flex items-center justify-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl transition-colors ${
                  canUpload
                    ? 'cursor-pointer bg-blue-600 hover:bg-blue-500 text-white'
                    : 'pointer-events-none bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
                }`}
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading…' : 'Upload'}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.dwg"
                  className="hidden"
                  disabled={!canUpload}
                  onChange={e => void handleHeaderUpload(e)}
                />
              </label>
            </div>
            {!selectedJobId && (
              <p className="text-[11px] font-medium text-slate-500">
                Pick an existing job, then upload. Create a new job from the board first if it is not in the list.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium shrink-0">
            {error}
          </div>
        )}

        {/* File list grouped by job */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3 px-6 text-center">
              <MapIcon className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">No blueprints yet.</p>
              <p className="text-xs">
                {jobs.length === 0
                  ? 'Add a job from Schedule first, then attach blueprints here.'
                  : 'Select a job above, then upload a plan.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map(group => {
                const expanded = expandedGroups.has(group.key);
                const isUploadingHere = uploading && uploadingGroupKey === group.key;
                return (
                  <div key={group.key || 'unassigned'}>
                    <div className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.key)}
                        className="flex items-center gap-2 flex-1 text-left min-w-0"
                      >
                        {expanded
                          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className="font-bold text-slate-800 dark:text-white truncate">{group.label}</span>
                        <span className="text-xs text-slate-400 font-medium shrink-0">
                          {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                        </span>
                      </button>
                      {canEdit && group.jobId && (
                        <label
                          className={`cursor-pointer flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                            uploading
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700'
                              : 'bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 dark:bg-slate-800 dark:hover:bg-blue-900/30 dark:text-slate-300'
                          }`}
                        >
                          <Upload className="w-3 h-3" />
                          {isUploadingHere ? 'Uploading…' : 'Upload'}
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.dwg"
                            className="hidden"
                            disabled={uploading}
                            onChange={e => void handleGroupUpload(e, group.jobId!)}
                          />
                        </label>
                      )}
                    </div>

                    {expanded && (
                      <div className="bg-slate-50/50 dark:bg-slate-800/20">
                        {group.files.map(file => {
                          const isDeleting = confirmDelete === file.name;
                          const { displayName } = parseBlueprintPath(file.name);
                          return (
                            <div
                              key={file.id || file.name}
                              className="flex items-center justify-between px-8 py-2.5 hover:bg-white dark:hover:bg-slate-800/50 transition-colors group"
                            >
                              <button
                                type="button"
                                onClick={() => openFile(file.name)}
                                className="flex items-center gap-3 flex-1 text-left min-w-0"
                              >
                                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                                <span className="text-sm text-slate-700 dark:text-slate-300 truncate font-medium group-hover:text-blue-600 transition-colors">
                                  {displayName}
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                              </button>
                              {canEdit && (isDeleting ? (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="text-xs text-red-600 dark:text-red-400 font-semibold">Delete?</span>
                                  <button
                                    type="button"
                                    onClick={() => void handleDelete(file.name)}
                                    className="px-2 py-0.5 bg-red-600 text-white text-xs font-bold rounded-lg"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDelete(null)}
                                    className="px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-lg"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDelete(file.name)}
                                  className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                                >
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

export default BlueprintsModal;

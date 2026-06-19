import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Upload, Trash2, Map as MapIcon, Loader2, FileText, ExternalLink, Plus, ChevronDown, ChevronRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface BlueprintFile {
  id: string;
  name: string;
  created_at?: string;
}

interface ProjectGroup {
  name: string;
  files: BlueprintFile[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

// Strips the leading "1718745600000-" timestamp prefix while keeping the rest of the
// filename intact (so "floor-plan.pdf" stays "floor-plan.pdf").
function stripTimestamp(fileName: string): string {
  return fileName.replace(/^\d+-/, '');
}

const BlueprintsModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [files, setFiles]                         = useState<BlueprintFile[]>([]);
  const [loading, setLoading]                     = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [error, setError]                         = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups]       = useState<Set<string>>(new Set(['Unassigned']));
  const [confirmDelete, setConfirmDelete]         = useState<string | null>(null);
  const [newProject, setNewProject]               = useState('');
  const [showAddProject, setShowAddProject]       = useState(false);
  const [activeUploadGroup, setActiveUploadGroup] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef     = useRef<HTMLDivElement>(null);

  const fetchFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase.storage
      .from('blueprints')
      .list('', { limit: 200, sortBy: { column: 'name', order: 'asc' } });
    if (fetchError) {
      setError(fetchError.message);
    } else {
      setFiles(
        (data ?? [])
          .filter(f => f.name !== '.emptyFolderPlaceholder')
          .map(f => ({ id: f.id, name: f.name, created_at: f.created_at })) as BlueprintFile[]
      );
    }
    setLoading(false);
  }, []);

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

  // Group files by project prefix "ProjectName---filename.pdf"
  const groups: ProjectGroup[] = React.useMemo(() => {
    const map = new Map<string, BlueprintFile[]>();
    files.forEach(f => {
      const sep = f.name.indexOf('---');
      const project = sep !== -1 ? f.name.substring(0, sep).replace(/_/g, ' ') : 'Unassigned';
      if (!map.has(project)) map.set(project, []);
      map.get(project)!.push(f);
    });
    return Array.from(map.entries())
      .map(([name, groupFiles]): ProjectGroup => ({ name, files: groupFiles }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [files]);

  // Prune stale group names from expandedGroups whenever the file list changes,
  // so deleted/empty projects don't linger forever.
  useEffect(() => {
    const valid = new Set(groups.map(g => g.name));
    setExpandedGroups(prev => {
      const next = new Set<string>();
      prev.forEach(name => {
        if (valid.has(name) || name === activeUploadGroup) next.add(name);
      });
      return next;
    });
  }, [groups, activeUploadGroup]);

  const toggleGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const expandGroup = (name: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      next.add(name);
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, project: string | null) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !project) {
      setActiveUploadGroup(null);
      return;
    }
    setUploading(true);
    setActiveUploadGroup(project);
    setError(null);
    const cleanName  = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
    const projectKey = project.replace(/\s+/g, '_');
    const filePath   = `${projectKey}---${Date.now()}-${cleanName}`;
    const { error: uploadError } = await supabase.storage.from('blueprints').upload(filePath, file);
    if (uploadError) {
      setError(uploadError.message);
    } else {
      await fetchFiles();
      expandGroup(project);
    }
    setUploading(false);
    setActiveUploadGroup(null);
  };

  const handleDelete = async (fileName: string) => {
    const { error: deleteError } = await supabase.storage.from('blueprints').remove([fileName]);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setFiles(prev => prev.filter(f => f.name !== fileName));
      setConfirmDelete(null);
    }
  };

  const openFile = (fileName: string) => {
    const { data } = supabase.storage.from('blueprints').getPublicUrl(fileName);
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
  };

  const handleAddProject = (e: React.FormEvent) => {
    e.preventDefault();
    const name = newProject.trim();
    if (!name) return;
    expandGroup(name);
    setActiveUploadGroup(name);
    setNewProject('');
    setShowAddProject(false);
    setTimeout(() => fileInputRef.current?.click(), 100);
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
                {files.length} file{files.length !== 1 ? 's' : ''} · {groups.length} project{groups.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowAddProject(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> New Project
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Add project form */}
        {showAddProject && (
          <form
            onSubmit={handleAddProject}
            className="px-6 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800 flex gap-3 shrink-0"
          >
            <input
              type="text"
              value={newProject}
              onChange={e => setNewProject(e.target.value)}
              placeholder="Project name (e.g. ITDG Construction Phase 2)…"
              autoFocus
              className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <button
              type="submit"
              disabled={!newProject.trim()}
              className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"
            >
              Create
            </button>
          </form>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm font-medium shrink-0">
            {error}
          </div>
        )}

        {/* File list grouped by project */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <MapIcon className="w-12 h-12 opacity-20" />
              <p className="text-sm font-medium">No blueprints yet. Create a project to get started.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map(group => {
                const expanded = expandedGroups.has(group.name);
                const isUploadingHere = uploading && activeUploadGroup === group.name;
                return (
                  <div key={group.name}>
                    {/* Group header */}
                    <div className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.name)}
                        className="flex items-center gap-2 flex-1 text-left"
                      >
                        {expanded
                          ? <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                          : <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />}
                        <span className="font-bold text-slate-800 dark:text-white">{group.name}</span>
                        <span className="text-xs text-slate-400 font-medium">
                          {group.files.length} file{group.files.length !== 1 ? 's' : ''}
                        </span>
                      </button>
                      <label
                        className={`cursor-pointer flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors ${
                          isUploadingHere
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
                          onChange={e => void handleUpload(e, group.name)}
                        />
                      </label>
                    </div>

                    {/* Files */}
                    {expanded && (
                      <div className="bg-slate-50/50 dark:bg-slate-800/20">
                        {group.files.map(file => {
                          const isDeleting = confirmDelete === file.name;
                          const rawName = file.name.includes('---')
                            ? file.name.split('---')[1] ?? file.name
                            : file.name;
                          const name = stripTimestamp(rawName);
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
                                  {name}
                                </span>
                                <ExternalLink className="w-3 h-3 text-slate-300 group-hover:text-blue-400 shrink-0 transition-colors" />
                              </button>
                              {isDeleting ? (
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
                              )}
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

        {/* Hidden input used by the "New Project" flow to trigger an upload for a brand-new group */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.dwg"
          className="hidden"
          onChange={e => void handleUpload(e, activeUploadGroup)}
        />
      </div>
    </div>
  );
};

export default BlueprintsModal;

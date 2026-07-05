import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X, Upload, Trash2, Camera, Loader2, ChevronDown, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Job } from '@/lib/data';
import { JobSelect } from '@/components/JobSelect';
import {
  buildPhotoPath,
  getJobLabel,
  groupPhotosByJob,
  parsePhotoPath,
} from '@/lib/sitePhotos';

interface SitePhoto {
  id: string;
  name: string;
  url: string;
  created_at: string;
  jobId: string | null;
  jobLabel: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  jobs: Job[];
}

const SitePhotosModal: React.FC<Props> = ({ isOpen, onClose, jobs }) => {
  const [photos, setPhotos]               = useState<SitePhoto[]>([]);
  const [loading, setLoading]             = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const modalRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchPhotos();
  }, [isOpen, jobs]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const fetchPhotos = async () => {
    setLoading(true);
    setError(null);
    const { data, error: listError } = await supabase.storage
      .from('site-photos')
      .list('', { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
    if (listError) {
      setError(listError.message);
      setLoading(false);
      return;
    }
    const photoList: SitePhoto[] = (data ?? [])
      .filter(f => f.name !== '.emptyFolderPlaceholder')
      .map(f => {
        const { jobId } = parsePhotoPath(f.name);
        return {
          id: f.id ?? f.name,
          name: f.name,
          url: supabase.storage.from('site-photos').getPublicUrl(f.name).data.publicUrl,
          created_at: f.created_at ?? '',
          jobId,
          jobLabel: getJobLabel(jobId, jobs),
        };
      });
    setPhotos(photoList);
    setLoading(false);
  };

  const groups = useMemo(
    () => groupPhotosByJob(photos, jobs),
    [photos, jobs],
  );

  useEffect(() => {
    const labels = new Set(groups.map(g => g.label));
    setExpandedGroups(prev => {
      const next = new Set<string>();
      prev.forEach(label => {
        if (labels.has(label)) next.add(label);
      });
      if (next.size === 0 && groups.length > 0) {
        groups.forEach(g => next.add(g.label));
      }
      return next;
    });
  }, [groups]);

  const toggleGroup = (label: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedJobId) {
      setError('Select a job before uploading.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploading(true);
    setError(null);
    const fileName = buildPhotoPath(selectedJobId, file.name);
    const { error: uploadError } = await supabase.storage
      .from('site-photos')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadError) {
      setError(uploadError.message);
    } else {
      const jobLabel = getJobLabel(selectedJobId, jobs);
      setExpandedGroups(prev => new Set(prev).add(jobLabel));
      await fetchPhotos();
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (name: string) => {
    setError(null);
    const { error: deleteError } = await supabase.storage
      .from('site-photos')
      .remove([name]);
    if (deleteError) {
      setError(deleteError.message);
    } else {
      setPhotos(prev => prev.filter(p => p.name !== name));
      setConfirmDeleteId(null);
    }
  };

  const canUpload = Boolean(selectedJobId) && !uploading;

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
        aria-labelledby="photos-modal-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="photos-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
            Site Photos
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <JobSelect
              jobs={jobs}
              value={selectedJobId}
              onChange={setSelectedJobId}
              id="site-photos-modal-job"
              className="min-w-[200px]"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={!canUpload}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload Photo
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleUpload} className="hidden" />
            <button type="button" onClick={onClose} aria-label="Close photos modal"
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors text-slate-500">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {error && (
          <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
        )}

        {/* Photo grid grouped by job */}
        <div className="overflow-y-auto p-5 flex-1">
          {loading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 text-emerald-500 animate-spin" />
            </div>
          )}
          {!loading && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
              <Camera className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">No site photos uploaded yet.</p>
              <p className="text-xs text-slate-400">Choose a job above, then upload your first photo.</p>
            </div>
          )}
          {!loading && photos.length > 0 && (
            <div className="space-y-4">
              {groups.map(group => {
                const isExpanded = expandedGroups.has(group.label);
                return (
                  <div key={group.label} className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.label)}
                      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {isExpanded
                          ? <ChevronDown className="w-4 h-4 shrink-0 text-slate-500" />
                          : <ChevronRight className="w-4 h-4 shrink-0 text-slate-500" />}
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100 truncate">
                          {group.label}
                        </span>
                        <span className="text-xs font-semibold text-slate-500 shrink-0">
                          ({group.photos.length})
                        </span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
                        {group.photos.map(photo => {
                          const isDeleting = confirmDeleteId === photo.id;
                          const { displayName } = parsePhotoPath(photo.name);
                          return (
                            <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-square">
                              <img
                                src={photo.url}
                                alt={`${photo.jobLabel}: ${displayName}`}
                                className="w-full h-full object-cover"
                                onError={e => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                              <div className="absolute inset-0 bg-slate-900/0 group-hover:bg-slate-900/40 transition-all flex items-center justify-center">
                                {!isDeleting ? (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteId(photo.id)}
                                    className="opacity-0 group-hover:opacity-100 p-2 bg-red-600 text-white rounded-lg transition-all"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                ) : (
                                  <div className="flex flex-col items-center gap-2 opacity-100 bg-slate-900/80 p-3 rounded-xl">
                                    <span className="text-xs text-white font-semibold">Delete photo?</span>
                                    <div className="flex gap-2">
                                      <button type="button" onClick={() => handleDelete(photo.name)}
                                        className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-colors">Yes</button>
                                      <button type="button" onClick={() => setConfirmDeleteId(null)}
                                        className="px-2.5 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition-colors">Cancel</button>
                                    </div>
                                  </div>
                                )}
                              </div>
                              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/80 to-transparent p-2">
                                <p className="text-[10px] text-white truncate">{displayName}</p>
                              </div>
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

export default SitePhotosModal;

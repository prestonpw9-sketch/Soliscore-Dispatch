import React, { useState, useEffect, useRef } from 'react';
import { X, Upload, Trash2, Camera, Loader2, ImageIcon } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface SitePhoto {
  id: string;
  name: string;
  url: string;
  created_at: string;
  job_id?: string;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const SitePhotosModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const [photos, setPhotos]               = useState<SitePhoto[]>([]);
  const [loading, setLoading]             = useState(false);
  const [uploading, setUploading]         = useState(false);
  const [error, setError]                 = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef  = useRef<HTMLInputElement>(null);
  const modalRef      = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    void fetchPhotos();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen]);

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
      .map(f => ({
        id: f.id ?? f.name,
        name: f.name,
        url: supabase.storage.from('site-photos').getPublicUrl(f.name).data.publicUrl,
        created_at: f.created_at ?? '',
      }));
    setPhotos(photoList);
    setLoading(false);
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fileName = `${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('site-photos')
      .upload(fileName, file, { cacheControl: '3600', upsert: false });
    if (uploadError) { setError(uploadError.message); }
    else { await fetchPhotos(); }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDelete = async (name: string) => {
    setError(null);
    const { error: deleteError } = await supabase.storage
      .from('site-photos')
      .remove([name]);
    if (deleteError) { setError(deleteError.message); }
    else { setPhotos(prev => prev.filter(p => p.name !== name)); setConfirmDeleteId(null); }
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
        aria-labelledby="photos-modal-title"
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="flex justify-between items-center p-5 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <h2 id="photos-modal-title" className="text-xl font-black text-slate-900 dark:text-white">
            Site Photos
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm transition-colors"
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

        {/* Photo grid */}
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
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-sm font-bold text-emerald-600 hover:underline"
              >
                Upload your first photo
              </button>
            </div>
          )}
          {!loading && photos.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {photos.map(photo => {
                const isDeleting = confirmDeleteId === photo.id;
                return (
                  <div key={photo.id} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 aspect-square">
                    <img
                      src={photo.url}
                      alt={photo.name}
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
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-900/80 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-[10px] text-white truncate">{photo.name}</p>
                    </div>
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
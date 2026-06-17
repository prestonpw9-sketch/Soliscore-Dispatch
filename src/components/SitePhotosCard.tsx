import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Camera, UploadCloud } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface StorageFile {
  id: string;
  name: string;
  created_at?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const PLACEHOLDER = '.emptyFolderPlaceholder';

// ── Component ──────────────────────────────────────────────────────────────

export const SitePhotosCard = () => {
  const [uploading, setUploading]       = useState(false);
  const [photos, setPhotos]             = useState<StorageFile[]>([]);
  const [fetchError, setFetchError]     = useState<string | null>(null);
  const [uploadError, setUploadError]   = useState<string | null>(null);

  // FIX: useCallback so it's stable for the useEffect dependency array
  const fetchPhotos = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await supabase.storage
      .from('site-photos')
      .list('', { limit: 4, sortBy: { column: 'created_at', order: 'desc' } });

    if (error) {
      console.error('Error loading photos:', error);
      setFetchError(getErrorMessage(error, 'Failed to load photos.'));
    } else {
      const valid = (data ?? []).filter(f => f.name !== PLACEHOLDER) as StorageFile[];
      setPhotos(valid);
    }
  }, []);

  useEffect(() => {
    void fetchPhotos();
  }, [fetchPhotos]);

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);

    // FIX: reset input so the same file can be re-selected after a failure
    e.target.value = '';

    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const filePath  = `${Date.now()}-${cleanName}`;

      const { error } = await supabase.storage
        .from('site-photos')
        .upload(filePath, file);

      if (error) throw error;

      await fetchPhotos();
    } catch (err) {
      // FIX: no `catch (err: any)` — narrow with helper
      const msg = getErrorMessage(err, 'Failed to upload photo.');
      setUploadError(msg);
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const getImageUrl = (fileName: string): string =>
    supabase.storage.from('site-photos').getPublicUrl(fileName).data.publicUrl;

  const openPhoto = (fileName: string) => {
    window.open(getImageUrl(fileName), '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs flex flex-col h-full min-h-[250px]">

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-indigo-500" aria-hidden="true" />
            Site Photos
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">Recent field uploads</p>
        </div>

        <label className={`cursor-pointer text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2 ${
          uploading
            ? 'bg-indigo-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700'
        }`}>
          <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Upload'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
            disabled={uploading}
            aria-label="Upload site photo"
          />
        </label>
      </div>

      {/* Inline feedback — replaces alert() */}
      {uploadError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-semibold mb-2">
          {uploadError}
        </p>
      )}
      {fetchError && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400 font-semibold mb-2">
          {fetchError}
        </p>
      )}

      {/* Photo grid */}
      <div className="flex-1 overflow-y-auto">
        {photos.length === 0 ? (
          <div className="text-sm text-slate-400 font-medium text-center mt-8">
            No site photos uploaded yet.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photos.map(file => {
              const url = getImageUrl(file.name);
              return (
                // FIX: <div onClick> → <button> for keyboard access and semantics
                <button
                  key={file.id}
                  type="button"
                  onClick={() => openPhoto(file.name)}
                  aria-label={`View site photo ${file.name}`}
                  className="relative group cursor-pointer aspect-video rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                >
                  <img
                    src={url}
                    alt={`Site photo: ${file.name}`}
                    width={300}
                    height={169}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                  />
                  <div
                    aria-hidden="true"
                    className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center"
                  >
                    <span className="opacity-0 group-hover:opacity-100 text-white text-xs font-bold bg-black/60 px-2 py-1 rounded backdrop-blur-sm transition-opacity">
                      View
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, UploadCloud } from 'lucide-react';

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

/** Strip the timestamp prefix added during upload: "1234567890-my-file.pdf" → "my-file.pdf" */
function displayName(fileName: string): string {
  const idx = fileName.indexOf('-');
  return idx !== -1 ? fileName.substring(idx + 1) : fileName;
}

// ── Component ──────────────────────────────────────────────────────────────

export const BlueprintCard = () => {
  const [uploading, setUploading]   = useState(false);
  const [blueprints, setBlueprints] = useState<StorageFile[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // useCallback so it's safe to include in useEffect dependency array
  const fetchBlueprints = useCallback(async () => {
    setFetchError(null);
    const { data, error } = await supabase.storage
      .from('blueprints')
      .list('', {
        limit: 4,
        sortBy: { column: 'created_at', order: 'desc' },
      });

    if (error) {
      console.error('Error loading blueprints:', error);
      setFetchError(getErrorMessage(error, 'Failed to load blueprints.'));
    } else {
      setBlueprints((data ?? []) as StorageFile[]);
    }
  }, []);

  useEffect(() => {
    void fetchBlueprints();
  }, [fetchBlueprints]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    // Reset input so the same file can be re-uploaded after a failure
    e.target.value = '';

    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '');
      const filePath  = `${Date.now()}-${cleanName}`;

      const { error } = await supabase.storage
        .from('blueprints')
        .upload(filePath, file);

      if (error) throw error;

      await fetchBlueprints();
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
      // FIX: no `catch (error: any)` — narrow with instanceof
      setUploadError(getErrorMessage(err, 'Failed to upload blueprint.'));
      console.error('Upload failed:', err);
    } finally {
      setUploading(false);
    }
  };

  const openFile = (fileName: string) => {
    const { data } = supabase.storage.from('blueprints').getPublicUrl(fileName);
    window.open(data.publicUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs flex flex-col h-full min-h-[250px]">

      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Job Blueprints</h3>
          <p className="text-xs text-slate-500 mt-0.5">Active site plans &amp; schematics</p>
        </div>

        <label className={`cursor-pointer text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2 ${
          uploading
            ? 'bg-indigo-400 cursor-not-allowed'
            : 'bg-indigo-600 hover:bg-indigo-700'
        }`}>
          <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
          {uploading ? 'Uploading…' : 'Add Plan'}
          <input
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading}
            aria-label="Upload blueprint file"
          />
        </label>
      </div>

      {/* Inline feedback — replaces alert() */}
      {uploadSuccess && (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-2">
          ✓ Blueprint uploaded successfully.
        </p>
      )}
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

      {/* File list */}
      <div className="flex-1 overflow-y-auto">
        {blueprints.length === 0 ? (
          <div className="text-sm text-slate-400 font-medium text-center mt-8">
            No blueprints uploaded yet.
          </div>
        ) : (
          <ul className="space-y-2" role="list">
            {blueprints.map(file => (
              <li key={file.id}>
                <button
                  type="button"
                  onClick={() => openFile(file.name)}
                  className="group w-full flex items-center justify-between p-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-all text-left"
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    <FileText
                      className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 shrink-0 transition-colors"
                      aria-hidden="true"
                    />
                    <span className="truncate text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                      {displayName(file.name)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

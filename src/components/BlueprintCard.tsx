import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, UploadCloud } from 'lucide-react';
import type { Job } from '@/lib/data';
import { JobSelect } from '@/components/JobSelect';
import {
  buildBlueprintPath,
  getBlueprintGroup,
  parseBlueprintPath,
} from '@/lib/blueprints';

// ── Types ──────────────────────────────────────────────────────────────────

interface StorageFile {
  id: string;
  name: string;
  created_at?: string;
}

interface Props {
  jobs: Job[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

const PLACEHOLDER = '.emptyFolderPlaceholder';

// ── Component ──────────────────────────────────────────────────────────────

export const BlueprintCard: React.FC<Props> = ({ jobs }) => {
  const [uploading, setUploading]   = useState(false);
  const [blueprints, setBlueprints] = useState<StorageFile[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState('');

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
      const valid = (data ?? []).filter(f => f.name !== PLACEHOLDER) as StorageFile[];
      setBlueprints(valid);
    }
  }, []);

  useEffect(() => {
    void fetchBlueprints();
  }, [fetchBlueprints]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedJobId) {
      setUploadError('Select a job before uploading.');
      e.target.value = '';
      return;
    }

    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);
    e.target.value = '';

    try {
      const filePath = buildBlueprintPath(selectedJobId, file.name);

      const { error } = await supabase.storage
        .from('blueprints')
        .upload(filePath, file);

      if (error) throw error;

      await fetchBlueprints();
      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 3000);
    } catch (err) {
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

  const canUpload = Boolean(selectedJobId) && !uploading;

  return (
    <div className="p-5 border border-slate-200 dark:border-slate-800 rounded-xl bg-white dark:bg-slate-900 shadow-xs flex flex-col h-full min-h-[250px]">

      {/* Header */}
      <div className="flex justify-between items-start gap-3 mb-4">
        <div>
          <h3 className="font-bold text-slate-900 dark:text-white">Job Blueprints</h3>
          <p className="text-xs text-slate-500 mt-0.5">Active site plans &amp; schematics</p>
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <JobSelect
            jobs={jobs}
            value={selectedJobId}
            onChange={setSelectedJobId}
            id="blueprints-card-job"
            className="max-w-[180px]"
          />
          <label className={`cursor-pointer text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center gap-2 ${
            canUpload
              ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
              : 'bg-slate-200 text-slate-400 cursor-not-allowed dark:bg-slate-700 dark:text-slate-500'
          }`}>
            <UploadCloud className="w-3.5 h-3.5" aria-hidden="true" />
            {uploading ? 'Uploading…' : 'Add Plan'}
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.dwg"
              className="hidden"
              onChange={e => void handleFileUpload(e)}
              disabled={!canUpload}
              aria-label="Upload blueprint file"
            />
          </label>
          {!selectedJobId && (
            <p className="text-[10px] font-semibold text-slate-400 max-w-[180px] text-right">
              Pick a job first
            </p>
          )}
        </div>
      </div>

      {uploadSuccess && (
        <p role="status" className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold mb-2">
          ✓ Blueprint uploaded and attached to the job.
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
            {blueprints.map(file => {
              const { displayName } = parseBlueprintPath(file.name);
              const { label } = getBlueprintGroup(file.name, jobs);
              return (
                <li key={file.id || file.name}>
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
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {displayName}
                        </span>
                        <span className="block truncate text-[10px] font-semibold text-slate-400">
                          {label}
                        </span>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

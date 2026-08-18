import React, { useState } from 'react';
import { Megaphone, Pencil, Check, X, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import type { DispatchAnnouncement } from '@/lib/data';

interface Props {
  announcement: DispatchAnnouncement | null;
  onSave: (message: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

/**
 * High-visibility editable reminder strip for Dashboard / Schedule.
 * Owners can edit; everyone else sees read-only.
 */
const DispatchBanner: React.FC<Props> = ({ announcement, onSave }) => {
  const { isOwner } = useAuth();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(announcement?.message ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const message = announcement?.message?.trim() || '';

  if (!message && !isOwner) return null;

  const startEdit = () => {
    setDraft(message);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setError(null);
    setDraft(message);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    const result = await onSave(draft);
    setSaving(false);
    if (result.ok === false) {
      setError(result.message);
      return;
    }
    setEditing(false);
  };

  return (
    <div className="rounded-xl border-2 border-amber-400 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-500 shadow-sm overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="mt-0.5 shrink-0 w-9 h-9 rounded-lg bg-amber-400 text-amber-950 flex items-center justify-center">
          <Megaphone className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-amber-800 dark:text-amber-300">
            Team reminder
          </p>
          {editing ? (
            <div className="mt-1.5 space-y-2">
              <textarea
                value={draft}
                onChange={e => setDraft(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold text-slate-900 dark:text-white focus:ring-2 focus:ring-amber-500 outline-none resize-y"
                aria-label="Reminder message"
              />
              {error && (
                <p className="text-xs font-semibold text-red-600">{error}</p>
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving || !draft.trim()}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold"
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs font-bold"
                >
                  <X className="w-3.5 h-3.5" /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-0.5 text-sm sm:text-base font-bold text-amber-950 dark:text-amber-50 leading-snug">
              {message || 'No reminder set yet.'}
            </p>
          )}
        </div>
        {isOwner && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-400/80 bg-white/70 dark:bg-slate-900/50 text-amber-900 dark:text-amber-200 text-xs font-bold hover:bg-white dark:hover:bg-slate-900"
            title="Edit reminder"
            aria-label="Edit reminder"
          >
            <Pencil className="w-3.5 h-3.5" /> Edit
          </button>
        )}
      </div>
    </div>
  );
};

export default DispatchBanner;

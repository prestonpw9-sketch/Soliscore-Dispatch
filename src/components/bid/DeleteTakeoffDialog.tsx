import { useEffect } from 'react';

interface DeleteTakeoffDialogProps {
  name: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function DeleteTakeoffDialog({
  name,
  busy,
  error,
  onCancel,
  onConfirm,
}: DeleteTakeoffDialogProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={() => { if (!busy) onCancel(); }}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-md shadow-2xl p-5"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-takeoff-title"
        aria-describedby="delete-takeoff-body"
        onClick={event => event.stopPropagation()}
      >
        <h3 id="delete-takeoff-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Delete this takeoff?
        </h3>
        <p id="delete-takeoff-body" className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          This permanently removes “{name}” and the material lines stored with it. This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            autoFocus
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white"
          >
            {busy ? 'Deleting…' : 'Delete takeoff'}
          </button>
        </div>
      </div>
    </div>
  );
}

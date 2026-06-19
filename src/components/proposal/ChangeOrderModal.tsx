import React, { useEffect, useState } from 'react';
import { X, FileDown, Loader2 } from 'lucide-react';
import type { BidDocument } from '@/components/bid/types';
import {
  buildChangeOrderPdf,
  savePdf,
  formatCurrency,
  type ChangeOrderData,
} from './generatePdf';

interface Props {
  open: boolean;
  onClose: () => void;
  doc: BidDocument;
}

const REPS = ['Preston Watson', 'Greg Williamson'];

const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1';
const fieldCls =
  'w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-2 text-sm focus:bg-white dark:focus:bg-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 outline-none transition-colors';

const ChangeOrderModal: React.FC<Props> = ({ open, onClose, doc }) => {
  const [company, setCompany] = useState('');
  const [project, setProject] = useState('');
  const [changeOrderNumber, setChangeOrderNumber] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  const [scheduleNoChange, setScheduleNoChange] = useState(true);
  const [scheduleExtendedDays, setScheduleExtendedDays] = useState('');
  const [additionalMaterials, setAdditionalMaterials] = useState(0);
  const [additionalLabor, setAdditionalLabor] = useState(0);
  const [rep, setRep] = useState(REPS[0]);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the bid when the modal opens.
  useEffect(() => {
    if (!open) return;
    setCompany(doc.gcOwner ?? '');
    setProject(doc.project ?? '');
    setChangeOrderNumber('');
    setDate(
      new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    );
    setDescription('');
    setScheduleNoChange(true);
    setScheduleExtendedDays('');
    setAdditionalMaterials(0);
    setAdditionalLabor(0);
    setRep(REPS[0]);
    setNote(null);
    setError(null);
  }, [open, doc]);

  if (!open) return null;

  const total = additionalMaterials + additionalLabor;

  const handleDownload = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const data: ChangeOrderData = {
          company,
          project,
          changeOrderNumber,
          date,
          description,
          scheduleNoChange,
          scheduleExtendedDays,
          additionalMaterials,
          additionalLabor,
          rep,
        };
        const pdf = await buildChangeOrderPdf(data);
        const safeProject = (project || 'change-order').replace(/[^a-zA-Z0-9.\-_ ]/g, '').trim();
        const coNum = changeOrderNumber ? ` ${changeOrderNumber}` : '';
        const result = await savePdf(pdf, `Change Order${coNum} - ${safeProject}.pdf`, doc.id);
        setNote(result.storageNote);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to generate PDF.');
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Job Site Change Order</h3>
            <p className="text-xs text-slate-500">ITDG Plumbing — editable, pre-filled from this bid</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>Company</label>
              <input className={fieldCls} value={company} onChange={e => setCompany(e.target.value)} /></div>
            <div><label className={labelCls}>Project</label>
              <input className={fieldCls} value={project} onChange={e => setProject(e.target.value)} /></div>
            <div><label className={labelCls}>Change Order #</label>
              <input className={fieldCls} value={changeOrderNumber} onChange={e => setChangeOrderNumber(e.target.value)} /></div>
            <div><label className={labelCls}>Date</label>
              <input className={fieldCls} value={date} onChange={e => setDate(e.target.value)} /></div>
          </div>

          <div>
            <label className={labelCls}>Description of Change</label>
            <textarea className={fieldCls} rows={4} value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Impact on Schedule</legend>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name="schedule" checked={scheduleNoChange}
                onChange={() => setScheduleNoChange(true)}
                className="text-teal-600 focus:ring-teal-500" />
              No change to completion date
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
              <input type="radio" name="schedule" checked={!scheduleNoChange}
                onChange={() => setScheduleNoChange(false)}
                className="text-teal-600 focus:ring-teal-500" />
              Completion date extended by
              <input type="number" min="0" disabled={scheduleNoChange}
                className={`${fieldCls} w-20 py-1 disabled:opacity-50`}
                value={scheduleExtendedDays}
                onChange={e => setScheduleExtendedDays(e.target.value)} />
              days
            </label>
          </fieldset>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Financial Adjustment</legend>
            <p className="text-xs text-slate-500 italic">Includes sales tax and freight.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Additional Materials ($)</label>
                <input type="number" step="0.01" className={fieldCls} value={additionalMaterials}
                  onChange={e => setAdditionalMaterials(Number(e.target.value) || 0)} /></div>
              <div><label className={labelCls}>Additional Labor ($)</label>
                <input type="number" step="0.01" className={fieldCls} value={additionalLabor}
                  onChange={e => setAdditionalLabor(Number(e.target.value) || 0)} /></div>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200 dark:border-slate-800">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Total Change Order Amount</span>
              <span className="text-base font-bold text-teal-700 dark:text-teal-400">{formatCurrency(total)}</span>
            </div>
          </fieldset>

          <div>
            <label className={labelCls}>ITDG Rep</label>
            <select className={fieldCls} value={rep} onChange={e => setRep(e.target.value)}>
              {REPS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          {note && <p className="text-xs text-teal-700 dark:text-teal-400 font-medium">{note}</p>}
          {error && <p className="text-xs text-red-600 dark:text-red-400 font-semibold">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex gap-2">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-bold transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleDownload} disabled={busy}
            className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-sm font-bold shadow-sm transition-colors disabled:opacity-60">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {busy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeOrderModal;

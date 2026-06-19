import React, { useEffect, useMemo, useState } from 'react';
import { X, FileDown, Plus, Trash2, Loader2 } from 'lucide-react';
import type { BidDocument } from '@/components/bid/types';
import { calcSummary } from '@/components/bid/calc';
import {
  buildProposalPdf,
  numberToWords,
  savePdf,
  PRICE_GUARANTEE,
  STANDARD_EXCLUSIONS,
  STANDARD_WARRANTY,
  STANDARD_TERMS,
  type ProposalData,
} from './generatePdf';

interface Props {
  open: boolean;
  onClose: () => void;
  doc: BidDocument;
}

const SIGNERS = ['Greg Williamson', 'Preston Watson'];

const labelCls = 'block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1';
const fieldCls =
  'w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-2 text-sm focus:bg-white dark:focus:bg-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 outline-none transition-colors';

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || 'Sir or Madam';
}

const ProposalModal: React.FC<Props> = ({ open, onClose, doc }) => {
  const finalBid = useMemo(() => calcSummary(doc).finalBid, [doc]);

  const [date, setDate] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientCompany, setRecipientCompany] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectAddress, setProjectAddress] = useState('');
  const [planRef, setPlanRef] = useState('');
  const [planDate, setPlanDate] = useState('');
  const [amount, setAmount] = useState(0);
  const [topExclusions, setTopExclusions] = useState<string[]>([]);
  const [priceGuarantee, setPriceGuarantee] = useState(PRICE_GUARANTEE);
  const [dwv, setDwv] = useState('');
  const [water, setWater] = useState('');
  const [condensate, setCondensate] = useState('');
  const [gas, setGas] = useState('');
  const [insulation, setInsulation] = useState('');
  const [fixtures, setFixtures] = useState('');
  const [salesTaxNote, setSalesTaxNote] = useState('');
  const [standardExclusions, setStandardExclusions] = useState(STANDARD_EXCLUSIONS);
  const [warranty, setWarranty] = useState(STANDARD_WARRANTY);
  const [terms, setTerms] = useState(STANDARD_TERMS);
  const [signer, setSigner] = useState(SIGNERS[0]);

  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the bid when the modal opens.
  useEffect(() => {
    if (!open) return;
    setDate(
      new Date().toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      }),
    );
    setRecipientName(doc.gcOwner ?? '');
    setRecipientCompany('');
    setRecipientAddress('');
    setRecipientEmail('');
    setProjectName(doc.project ?? '');
    setProjectAddress('');
    setPlanRef('');
    setPlanDate('');
    setAmount(Number(finalBid.toFixed(2)));
    setTopExclusions([
      'Please note exclusions below',
      'Septic system by others',
      'All plumbing fixtures to be determined',
    ]);
    setPriceGuarantee(PRICE_GUARANTEE);
    setDwv('Schedule 40 PVC');
    setWater('Type L copper / PEX');
    setCondensate('Schedule 40 PVC');
    setGas('Black iron / CSST');
    setInsulation('Per code');
    setFixtures('Per plans and specifications.');
    setSalesTaxNote('Sales tax – add applicable tax or provide form AZ 5005.');
    setStandardExclusions(STANDARD_EXCLUSIONS);
    setWarranty(STANDARD_WARRANTY);
    setTerms(STANDARD_TERMS);
    setSigner(SIGNERS[0]);
    setNote(null);
    setError(null);
  }, [open, doc, finalBid]);

  if (!open) return null;

  const amountWords = numberToWords(amount);

  const updateExclusion = (i: number, v: string) =>
    setTopExclusions(prev => prev.map((e, idx) => (idx === i ? v : e)));
  const addExclusion = () => setTopExclusions(prev => [...prev, '']);
  const removeExclusion = (i: number) =>
    setTopExclusions(prev => prev.filter((_, idx) => idx !== i));

  const handleDownload = () => {
    void (async () => {
      setBusy(true);
      setError(null);
      setNote(null);
      try {
        const data: ProposalData = {
          date,
          recipientName,
          recipientCompany,
          recipientAddress,
          recipientEmail,
          projectName,
          projectAddress,
          salutationFirstName: firstName(recipientName),
          planRef,
          planDate,
          amount,
          amountWords,
          topExclusions,
          priceGuarantee,
          materials: [
            { label: 'DWV piping', value: dwv },
            { label: 'Water piping', value: water },
            { label: 'Condensate piping', value: condensate },
            { label: 'Gas piping', value: gas },
            { label: 'Insulation', value: insulation },
          ],
          fixtures,
          salesTaxNote,
          standardExclusions,
          warranty,
          terms,
          signer,
        };
        const pdf = await buildProposalPdf(data);
        const safeProject = (projectName || 'proposal').replace(/[^a-zA-Z0-9.\-_ ]/g, '').trim();
        const result = await savePdf(pdf, `Proposal - ${safeProject}.pdf`, doc.id);
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
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Generate Proposal</h3>
            <p className="text-xs text-slate-500">ITDG Plumbing — editable, pre-filled from this bid</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close"
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Date</label>
              <input className={fieldCls} value={date} onChange={e => setDate(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Signer</label>
              <select className={fieldCls} value={signer} onChange={e => setSigner(e.target.value)}>
                {SIGNERS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Recipient</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>GC / Owner Name</label>
                <input className={fieldCls} value={recipientName} onChange={e => setRecipientName(e.target.value)} /></div>
              <div><label className={labelCls}>Company</label>
                <input className={fieldCls} value={recipientCompany} onChange={e => setRecipientCompany(e.target.value)} /></div>
              <div><label className={labelCls}>Address</label>
                <input className={fieldCls} value={recipientAddress} onChange={e => setRecipientAddress(e.target.value)} /></div>
              <div><label className={labelCls}>Email</label>
                <input className={fieldCls} value={recipientEmail} onChange={e => setRecipientEmail(e.target.value)} /></div>
            </div>
          </fieldset>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Project</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>Project Name</label>
                <input className={fieldCls} value={projectName} onChange={e => setProjectName(e.target.value)} /></div>
              <div><label className={labelCls}>Project Address</label>
                <input className={fieldCls} value={projectAddress} onChange={e => setProjectAddress(e.target.value)} /></div>
              <div><label className={labelCls}>Plan / Architect Ref</label>
                <input className={fieldCls} value={planRef} onChange={e => setPlanRef(e.target.value)} /></div>
              <div><label className={labelCls}>Plan Date</label>
                <input className={fieldCls} value={planDate} onChange={e => setPlanDate(e.target.value)} /></div>
            </div>
          </fieldset>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Proposal Amount</legend>
            <div>
              <label className={labelCls}>Amount (override allowed — defaults to bid FINAL BID)</label>
              <input type="number" step="0.01" className={fieldCls} value={amount}
                onChange={e => setAmount(Number(e.target.value) || 0)} />
            </div>
            <p className="text-sm font-semibold text-teal-700 dark:text-teal-400 italic">{amountWords}</p>
          </fieldset>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Top Exclusions</legend>
            {topExclusions.map((ex, i) => (
              <div key={i} className="flex items-center gap-2">
                <input className={fieldCls} value={ex} onChange={e => updateExclusion(i, e.target.value)} />
                <button type="button" aria-label="Remove exclusion" onClick={() => removeExclusion(i)}
                  className="text-red-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg p-2 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button type="button" onClick={addExclusion}
              className="inline-flex items-center gap-1.5 text-teal-600 hover:text-teal-700 text-sm font-semibold">
              <Plus className="w-4 h-4" /> Add exclusion
            </button>
          </fieldset>

          <fieldset className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wide text-slate-500 px-1">Materials</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><label className={labelCls}>DWV piping</label>
                <input className={fieldCls} value={dwv} onChange={e => setDwv(e.target.value)} /></div>
              <div><label className={labelCls}>Water piping</label>
                <input className={fieldCls} value={water} onChange={e => setWater(e.target.value)} /></div>
              <div><label className={labelCls}>Condensate piping</label>
                <input className={fieldCls} value={condensate} onChange={e => setCondensate(e.target.value)} /></div>
              <div><label className={labelCls}>Gas piping</label>
                <input className={fieldCls} value={gas} onChange={e => setGas(e.target.value)} /></div>
              <div><label className={labelCls}>Insulation</label>
                <input className={fieldCls} value={insulation} onChange={e => setInsulation(e.target.value)} /></div>
            </div>
          </fieldset>

          <div>
            <label className={labelCls}>Fixtures</label>
            <textarea className={fieldCls} rows={3} value={fixtures} onChange={e => setFixtures(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Price Guarantee Note</label>
            <textarea className={fieldCls} rows={2} value={priceGuarantee} onChange={e => setPriceGuarantee(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Sales Tax Note</label>
            <input className={fieldCls} value={salesTaxNote} onChange={e => setSalesTaxNote(e.target.value)} />
          </div>

          <div>
            <label className={labelCls}>Standard Exclusions</label>
            <textarea className={fieldCls} rows={5} value={standardExclusions} onChange={e => setStandardExclusions(e.target.value)} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className={labelCls}>Warranty</label>
              <textarea className={fieldCls} rows={2} value={warranty} onChange={e => setWarranty(e.target.value)} /></div>
            <div><label className={labelCls}>Terms</label>
              <textarea className={fieldCls} rows={2} value={terms} onChange={e => setTerms(e.target.value)} /></div>
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

export default ProposalModal;

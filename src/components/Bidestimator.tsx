Several real issues here: alert() again, declare const process: any (unused and wrong — Vite uses import.meta.env), handleQuantityChange mutates state directly with updatedData[page][index].quantity = ... instead of producing a new array, and handleSaveAsNewJob is an async event handler returning a floating promise. Here's the corrected version:

tsx
import { useState } from 'react';
import { supabase } from '../lib/supabase';

// ── Types ──────────────────────────────────────────────────────────────────

type BidItem = {
  id: number;
  size: string;
  item: string;
  price: number;
  quantity: number;
};

type BidSummary = {
  laborHours: number;
  laborRate: number;
  overheadPercent: number;
  profitPercent: number;
};

type BidData = {
  page1: BidItem[];
  page2: BidItem[];
  summary: BidSummary;
};

type PageTab = 'page1' | 'page2';
type TabType = PageTab | 'summary';

// ── Helpers ────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function calculateMaterialsTotal(data: BidData): number {
  const pages: PageTab[] = ['page1', 'page2'];
  return pages.reduce((total, page) =>
    total + data[page].reduce((sub, item) => sub + item.price * item.quantity, 0)
  , 0);
}

// ── Initial data ───────────────────────────────────────────────────────────

const INITIAL_BID_DATA: BidData = {
  page1: [
    { id: 1, size: '8"',  item: '8 PVC DWV HXH 90 ELL', price: 41.70, quantity: 0 },
    { id: 2, size: '6"',  item: '6 PVC DWV 90 ELL',      price: 32.50, quantity: 0 },
    { id: 3, size: '4"',  item: 'Combos NO HUB C.I.',    price: 71.92, quantity: 0 },
  ],
  page2: [
    { id: 4, size: '1-1/2"', item: 'L Soft Copper', price: 9.64, quantity: 0 },
  ],
  summary: {
    laborHours: 0,
    laborRate: 65,
    overheadPercent: 0.10,
    profitPercent: 0.12,
  },
};

// ── Component ──────────────────────────────────────────────────────────────

export default function BidEstimator() {
  const [activeTab, setActiveTab]     = useState<TabType>('page1');
  const [projectName, setProjectName] = useState('New Plumbing Bid');
  const [bidData, setBidData]         = useState<BidData>(INITIAL_BID_DATA);
  const [saveError, setSaveError]     = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving]           = useState(false);

  // FIX: produce a new array instead of mutating state in place
  const handleQuantityChange = (page: PageTab, index: number, raw: string) => {
    const qty = Math.max(0, Number(raw) || 0);
    setBidData(prev => ({
      ...prev,
      [page]: prev[page].map((item, i) =>
        i === index ? { ...item, quantity: qty } : item
      ),
    }));
  };

  const handleLaborHoursChange = (raw: string) => {
    const hours = Math.max(0, Number(raw) || 0);
    setBidData(prev => ({
      ...prev,
      summary: { ...prev.summary, laborHours: hours },
    }));
  };

  // FIX: void-wrapped async handler — never return a promise from an event handler
  const handleSaveAsNewJob = () => {
    void (async () => {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);

      try {
        const materialsTotal = calculateMaterialsTotal(bidData);
        const laborTotal     = bidData.summary.laborHours * bidData.summary.laborRate;
        const grandTotal     = materialsTotal + laborTotal;

        const { error } = await supabase.from('project_bids').insert([{
          project_name:  projectName,
          is_master:     false,
          takeoff_data:  bidData,
          total_cost:    grandTotal,
        }]);

        if (error) throw error;

        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err) {
        setSaveError(getErrorMessage(err, 'Failed to save bid.'));
      } finally {
        setSaving(false);
      }
    })();
  };

  const materialsTotal = calculateMaterialsTotal(bidData);
  const laborTotal     = bidData.summary.laborHours * bidData.summary.laborRate;
  const grandTotal     = materialsTotal + laborTotal;

  return (
    <div className="p-6 max-w-6xl mx-auto bg-white dark:bg-slate-900 rounded-lg shadow-md">

      {/* Header */}
      <div className="flex justify-between items-center mb-6 border-b border-slate-200 dark:border-slate-700 pb-4 gap-4">
        <input
          type="text"
          aria-label="Project name"
          className="text-2xl font-bold bg-transparent border-none focus:ring-0 outline-none text-slate-900 dark:text-white flex-1 min-w-0"
          value={projectName}
          onChange={e => setProjectName(e.target.value)}
        />
        <button
          type="button"
          onClick={handleSaveAsNewJob}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 shrink-0"
        >
          {saving ? 'Saving…' : 'Save As New Job'}
        </button>
      </div>

      {/* Inline feedback — replaces alert() */}
      {saveSuccess && (
        <p role="status" className="text-sm text-emerald-600 dark:text-emerald-400 font-semibold mb-4">
          ✓ Bid saved successfully.
        </p>
      )}
      {saveError && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400 font-semibold mb-4">
          {saveError}
        </p>
      )}

      {/* Tabs */}
      <div className="flex space-x-2 mb-4">
        {([
          { key: 'page1',   label: 'Pg 1 (DWV)' },
          { key: 'page2',   label: 'Pg 2 (Copper/Gas)' },
          { key: 'summary', label: 'Pg 4 (Totals)' },
        ] as { key: TabType; label: string }[]).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-slate-200 dark:bg-slate-700 font-bold text-slate-900 dark:text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Items grid */}
      {(activeTab === 'page1' || activeTab === 'page2') && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-300">Size</th>
                <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-300">Item Description</th>
                <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-300">Unit Price</th>
                <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-300 w-24">Qty</th>
                <th className="p-2.5 font-semibold text-slate-700 dark:text-slate-300">Row Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {bidData[activeTab].map((item, index) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="p-2.5 text-slate-600 dark:text-slate-400">{item.size}</td>
                  <td className="p-2.5 text-slate-900 dark:text-slate-100">{item.item}</td>
                  <td className="p-2.5 text-slate-600 dark:text-slate-400 tabular-nums">
                    ${item.price.toFixed(2)}
                  </td>
                  <td className="p-2.5">
                    <input
                      type="number"
                      min="0"
                      aria-label={`Quantity for ${item.item}`}
                      className="w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded p-1 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                      value={item.quantity === 0 ? '' : item.quantity}
                      onChange={e => handleQuantityChange(activeTab, index, e.target.value)}
                    />
                  </td>
                  <td className="p-2.5 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    ${(item.price * item.quantity).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Summary tab */}
      {activeTab === 'summary' && (
        <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-4">Bid Totals</h2>

          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 dark:text-slate-400">Total Material:</span>
            <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
              ${materialsTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center text-sm gap-4">
            <label htmlFor="labor-hours" className="text-slate-600 dark:text-slate-400 shrink-0">
              Labor Hours (@ ${bidData.summary.laborRate}/hr):
            </label>
            <input
              id="labor-hours"
              type="number"
              min="0"
              className="border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded p-1 w-24 text-sm focus:ring-2 focus:ring-blue-500 outline-none tabular-nums"
              value={bidData.summary.laborHours === 0 ? '' : bidData.summary.laborHours}
              onChange={e => handleLaborHoursChange(e.target.value)}
            />
          </div>

          <div className="flex justify-between items-center text-sm">
            <span className="text-slate-600 dark:text-slate-400">Labor Total:</span>
            <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100">
              ${laborTotal.toFixed(2)}
            </span>
          </div>

          <div className="flex justify-between items-center pt-4 mt-2 border-t border-slate-200 dark:border-slate-700 text-xl font-black text-emerald-700 dark:text-emerald-400">
            <span>GRAND TOTAL:</span>
            <span className="tabular-nums">${grandTotal.toFixed(2)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
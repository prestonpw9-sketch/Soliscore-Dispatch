import { useState } from 'react';
import { Plus, Trash2, Save, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type {
  BidDocument,
  FixtureRow,
  LineItem,
  Page2Section,
} from './bid/types';
import {
  calcPage1,
  calcPage1a,
  calcPage2,
  calcPage2Section,
  calcPage3,
  calcSummary,
  fixtureRowTotal,
  lineTotal,
  money,
} from './bid/calc';
import { makeBlankDocument, makeLineId } from './bid/seed';

// ── Helpers ──────────────────────────────────────────────────────────────────

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function num(raw: string): number {
  return Number(raw) || 0;
}

type TabType = 'page1' | 'page2' | 'page3' | 'summary';

const TABS: { key: TabType; label: string }[] = [
  { key: 'page1', label: 'Page 1 — DWV & Cast Iron' },
  { key: 'page2', label: 'Page 2 — Pipe' },
  { key: 'page3', label: 'Page 3 — Fixtures' },
  { key: 'summary', label: 'Summary (Pg 4)' },
];

// Shared cell classes ---------------------------------------------------------
const inputCls =
  'w-full border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-1.5 text-sm shadow-sm focus:bg-white dark:focus:bg-slate-700 focus:border-teal-500 focus:ring-2 focus:ring-teal-500 outline-none tabular-nums placeholder:text-slate-400 transition-colors';
const cardCls =
  'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm';
const moneyCls = 'tabular-nums font-semibold text-slate-900 dark:text-slate-100';
const tealBtn =
  'inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';
const redBtn =
  'inline-flex items-center justify-center text-red-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg p-1.5 transition-colors';

// ── Component ──────────────────────────────────────────────────────────────

export default function BidEstimator() {
  const [activeTab, setActiveTab] = useState<TabType>('page1');
  const [doc, setDoc] = useState<BidDocument>(() => makeBlankDocument());
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // ── Mutators ───────────────────────────────────────────────────────────────
  function patchDoc(patch: Partial<BidDocument>) {
    setDoc(prev => ({ ...prev, ...patch }));
  }

  function updateLine(page: 'page1' | 'page1a', id: string, patch: Partial<LineItem>) {
    setDoc(prev => ({
      ...prev,
      [page]: prev[page].map(l => (l.id === id ? { ...l, ...patch } : l)),
    }));
  }

  function addLine(page: 'page1' | 'page1a') {
    const blank: LineItem = { id: makeLineId(), qty: 0, size: '', item: '', price: 0, mult: 1 };
    setDoc(prev => ({ ...prev, [page]: [...prev[page], blank] }));
  }

  function removeLine(page: 'page1' | 'page1a', id: string) {
    setDoc(prev => ({ ...prev, [page]: prev[page].filter(l => l.id !== id) }));
  }

  function updateSection(key: string, patch: Partial<Page2Section>) {
    setDoc(prev => ({
      ...prev,
      page2: prev.page2.map(s => (s.key === key ? { ...s, ...patch } : s)),
    }));
  }

  function updateP2Line(secKey: string, id: string, patch: Partial<LineItem>) {
    setDoc(prev => ({
      ...prev,
      page2: prev.page2.map(s =>
        s.key === secKey
          ? { ...s, lines: s.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) }
          : s
      ),
    }));
  }

  function addP2Line(secKey: string) {
    const blank: LineItem = { id: makeLineId(), qty: 0, item: '', price: 0, mult: 1 };
    setDoc(prev => ({
      ...prev,
      page2: prev.page2.map(s =>
        s.key === secKey ? { ...s, lines: [...s.lines, blank] } : s
      ),
    }));
  }

  function removeP2Line(secKey: string, id: string) {
    setDoc(prev => ({
      ...prev,
      page2: prev.page2.map(s =>
        s.key === secKey ? { ...s, lines: s.lines.filter(l => l.id !== id) } : s
      ),
    }));
  }

  function updateFixture(id: string, patch: Partial<FixtureRow>) {
    setDoc(prev => ({
      ...prev,
      page3: prev.page3.map(r => (r.id === id ? { ...r, ...patch } : r)),
    }));
  }

  function addFixture() {
    const blank: FixtureRow = {
      id: makeLineId(),
      qty: 0,
      item: '',
      fixture: 0,
      trim: 0,
      trim2: 0,
      misc: 0,
    };
    setDoc(prev => ({ ...prev, page3: [...prev.page3, blank] }));
  }

  function removeFixture(id: string) {
    setDoc(prev => ({ ...prev, page3: prev.page3.filter(r => r.id !== id) }));
  }

  function updateSummary(patch: Partial<BidDocument['summary']>) {
    setDoc(prev => ({ ...prev, summary: { ...prev.summary, ...patch } }));
  }

  function updateLaborHour(index: number, hours: number) {
    setDoc(prev => ({
      ...prev,
      summary: {
        ...prev.summary,
        laborHours: prev.summary.laborHours.map((h, i) =>
          i === index ? { ...h, hours } : h
        ),
      },
    }));
  }

  function updateSub(index: number, amount: number) {
    setDoc(prev => ({
      ...prev,
      summary: {
        ...prev.summary,
        subs: prev.summary.subs.map((s, i) => (i === index ? { ...s, amount } : s)),
      },
    }));
  }

  // ── Persistence ─────────────────────────────────────────────────────────────
  const summary = calcSummary(doc);

  function handleSave() {
    void (async () => {
      setSaving(true);
      setSaveError(null);
      setSaveSuccess(false);
      try {
        const { error } = await supabase.from('project_bids').insert([
          {
            project_name: doc.project,
            is_master: false,
            takeoff_data: doc,
            total_cost: summary.finalBid,
          },
        ]);
        if (error) throw error;
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 4000);
      } catch (err) {
        setSaveError(getErrorMessage(err, 'Failed to save bid.'));
      } finally {
        setSaving(false);
      }
    })();
  }

  function handleLoad() {
    void (async () => {
      setLoading(true);
      setSaveError(null);
      try {
        const { data, error } = await supabase
          .from('project_bids')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error) throw error;
        const loaded = data?.takeoff_data as BidDocument | undefined;
        if (loaded && Array.isArray(loaded.page1)) {
          setDoc(loaded);
        } else {
          setSaveError('Most recent bid is not a 4-page takeoff document.');
        }
      } catch (err) {
        setSaveError(getErrorMessage(err, 'Failed to load bid.'));
      } finally {
        setLoading(false);
      }
    })();
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto text-slate-900 dark:text-slate-100">
      {/* Header */}
      <div className={`${cardCls} p-5 mb-4`}>
        <div className="flex flex-wrap justify-between items-center gap-4">
          <div className="flex-1 min-w-[240px] space-y-2">
            <input
              type="text"
              aria-label="Project name"
              className="text-2xl font-bold bg-transparent border-none focus:ring-0 outline-none w-full"
              value={doc.project}
              onChange={e => patchDoc({ project: e.target.value })}
            />
            <div className="flex flex-wrap gap-3 text-sm">
              <input
                type="text"
                aria-label="GC / Owner"
                placeholder="GC / Owner"
                className={`${inputCls} max-w-[220px]`}
                value={doc.gcOwner}
                onChange={e => patchDoc({ gcOwner: e.target.value })}
              />
              <input
                type="date"
                aria-label="Bid date"
                className={`${inputCls} max-w-[180px]`}
                value={doc.date}
                onChange={e => patchDoc({ date: e.target.value })}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={handleLoad} disabled={loading}
              className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
              <FolderOpen className="w-4 h-4" /> {loading ? 'Loading…' : 'Load'}
            </button>
            <button type="button" onClick={handleSave} disabled={saving}
              className="inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Bid'}
            </button>
          </div>
        </div>

        {saveSuccess && (
          <p role="status" className="text-sm text-teal-600 dark:text-teal-400 font-semibold mt-3">
            ✓ Bid saved successfully.
          </p>
        )}
        {saveError && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400 font-semibold mt-3">
            {saveError}
          </p>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === key
                ? 'bg-indigo-600 text-white font-semibold'
                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'page1' && <Page1Tab doc={doc} updateLine={updateLine} addLine={addLine} removeLine={removeLine} />}
      {activeTab === 'page2' && (
        <Page2Tab doc={doc} updateSection={updateSection} updateLine={updateP2Line} addLine={addP2Line} removeLine={removeP2Line} />
      )}
      {activeTab === 'page3' && (
        <Page3Tab doc={doc} updateFixture={updateFixture} addFixture={addFixture} removeFixture={removeFixture} />
      )}
      {activeTab === 'summary' && (
        <SummaryTab doc={doc} updateSummary={updateSummary} updateLaborHour={updateLaborHour} updateSub={updateSub} />
      )}
    </div>
  );
}

// ── Reusable line-item table ───────────────────────────────────────────────────

interface LineTableProps {
  title: string;
  total: number;
  lines: LineItem[];
  onUpdate: (id: string, patch: Partial<LineItem>) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
  totalLabel: string;
}

function LineTable({ title, total, lines, onUpdate, onAdd, onRemove, totalLabel }: LineTableProps) {
  return (
    <div className={`${cardCls} overflow-hidden mb-4`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="font-semibold">{title}</h3>
        <button type="button" onClick={onAdd} className={tealBtn}>
          <Plus className="w-4 h-4" /> Add Row
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">
              <th className="p-2.5 font-semibold w-24">Size</th>
              <th className="p-2.5 font-semibold">Item</th>
              <th className="p-2.5 font-semibold w-24">Qty</th>
              <th className="p-2.5 font-semibold w-28">Price</th>
              <th className="p-2.5 font-semibold w-20">Mult</th>
              <th className="p-2.5 font-semibold w-28 text-right">Total</th>
              <th className="p-2.5 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {lines.map(l => (
              <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="p-1.5">
                  <input className={inputCls} value={l.size ?? ''} onChange={e => onUpdate(l.id, { size: e.target.value })} />
                </td>
                <td className="p-1.5">
                  <input className={inputCls} value={l.item} onChange={e => onUpdate(l.id, { item: e.target.value })} />
                </td>
                <td className="p-1.5">
                  <input type="number" min="0" className={inputCls} value={l.qty === 0 ? '' : l.qty}
                    onChange={e => onUpdate(l.id, { qty: num(e.target.value) })} />
                </td>
                <td className="p-1.5">
                  <input type="number" step="0.001" className={inputCls} value={l.price === 0 ? '' : l.price}
                    onChange={e => onUpdate(l.id, { price: num(e.target.value) })} />
                </td>
                <td className="p-1.5">
                  <input type="number" step="0.01" className={inputCls} value={l.mult}
                    onChange={e => onUpdate(l.id, { mult: num(e.target.value) })} />
                </td>
                <td className={`p-2.5 text-right ${moneyCls}`}>${money(lineTotal(l))}</td>
                <td className="p-1.5 text-center">
                  <button type="button" aria-label="Delete row" onClick={() => onRemove(l.id)} className={redBtn}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
        <span className="font-semibold text-slate-700 dark:text-slate-300">{totalLabel}</span>
        <span className="text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-400">${money(total)}</span>
      </div>
    </div>
  );
}

// ── Page 1 + 1a ────────────────────────────────────────────────────────────────

interface Page1Props {
  doc: BidDocument;
  updateLine: (page: 'page1' | 'page1a', id: string, patch: Partial<LineItem>) => void;
  addLine: (page: 'page1' | 'page1a') => void;
  removeLine: (page: 'page1' | 'page1a', id: string) => void;
}

function Page1Tab({ doc, updateLine, addLine, removeLine }: Page1Props) {
  const p1 = calcPage1(doc.page1);
  const p1a = calcPage1a(doc.page1a);
  const combined = p1.total + p1a.total;
  return (
    <>
      <LineTable
        title="Page 1 — Material / DWV Takeoff (×1.15)"
        total={p1.total}
        lines={doc.page1}
        onUpdate={(id, patch) => updateLine('page1', id, patch)}
        onAdd={() => addLine('page1')}
        onRemove={id => removeLine('page1', id)}
        totalLabel="PAGE 1 TOTAL"
      />
      <LineTable
        title="Page 1a — Cast Iron (No-Hub C.I.) (×1.05)"
        total={p1a.total}
        lines={doc.page1a}
        onUpdate={(id, patch) => updateLine('page1a', id, patch)}
        onAdd={() => addLine('page1a')}
        onRemove={id => removeLine('page1a', id)}
        totalLabel="PAGE 1a TOTAL (Cast Iron)"
      />
      <div className={`${cardCls} flex justify-between items-center px-4 py-4`}>
        <span className="font-bold">PAGE 1 COMBINED (H81 + I79)</span>
        <span className="text-xl font-black tabular-nums text-teal-700 dark:text-teal-400">${money(combined)}</span>
      </div>
    </>
  );
}

// ── Page 2 ─────────────────────────────────────────────────────────────────────

interface Page2Props {
  doc: BidDocument;
  updateSection: (key: string, patch: Partial<Page2Section>) => void;
  updateLine: (secKey: string, id: string, patch: Partial<LineItem>) => void;
  addLine: (secKey: string) => void;
  removeLine: (secKey: string, id: string) => void;
}

function Page2Tab({ doc, updateSection, updateLine, addLine, removeLine }: Page2Props) {
  const result = calcPage2(doc.page2);
  return (
    <>
      {doc.page2.map(sec => {
        const r = calcPage2Section(sec);
        return (
          <div key={sec.key} className={`${cardCls} overflow-hidden mb-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-semibold">{sec.title}</h3>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
                  Fittings %
                  <input type="number" step="0.01" className={`${inputCls} w-20`} value={sec.fittingsPct}
                    onChange={e => updateSection(sec.key, { fittingsPct: num(e.target.value) })} />
                </label>
                <span className="text-xs text-slate-500">tier ×{sec.tier}</span>
                <button type="button" onClick={() => addLine(sec.key)} className={tealBtn}>
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">
                    <th className="p-2.5 font-semibold">Item</th>
                    <th className="p-2.5 font-semibold w-24">Qty</th>
                    <th className="p-2.5 font-semibold w-28">Price</th>
                    <th className="p-2.5 font-semibold w-20">Mult</th>
                    <th className="p-2.5 font-semibold w-28 text-right">Total</th>
                    <th className="p-2.5 w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sec.lines.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="p-1.5">
                        <input className={inputCls} value={l.item} onChange={e => updateLine(sec.key, l.id, { item: e.target.value })} />
                      </td>
                      <td className="p-1.5">
                        <input type="number" min="0" className={inputCls} value={l.qty === 0 ? '' : l.qty}
                          onChange={e => updateLine(sec.key, l.id, { qty: num(e.target.value) })} />
                      </td>
                      <td className="p-1.5">
                        <input type="number" step="0.0001" className={inputCls} value={l.price === 0 ? '' : l.price}
                          onChange={e => updateLine(sec.key, l.id, { price: num(e.target.value) })} />
                      </td>
                      <td className="p-1.5">
                        <input type="number" step="0.01" className={inputCls} value={l.mult}
                          onChange={e => updateLine(sec.key, l.id, { mult: num(e.target.value) })} />
                      </td>
                      <td className={`p-2.5 text-right ${moneyCls}`}>${money(lineTotal(l))}</td>
                      <td className="p-1.5 text-center">
                        <button type="button" aria-label="Delete row" onClick={() => removeLine(sec.key, l.id)} className={redBtn}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-sm space-y-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Lines sum</span><span className="tabular-nums">${money(r.linesSum)}</span>
              </div>
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>Fittings ({(sec.fittingsPct * 100).toFixed(0)}%)</span><span className="tabular-nums">${money(r.fittings)}</span>
              </div>
              <div className="flex justify-between font-semibold">
                <span>Subtotal (×{sec.tier})</span>
                <span className="tabular-nums text-indigo-700 dark:text-indigo-400">${money(r.subtotal)}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className={`${cardCls} flex justify-between items-center px-4 py-4`}>
        <span className="font-bold">PAGE 2 TOTAL (×1.03)</span>
        <span className="text-xl font-black tabular-nums text-teal-700 dark:text-teal-400">${money(result.total)}</span>
      </div>
    </>
  );
}

// ── Page 3 ─────────────────────────────────────────────────────────────────────

interface Page3Props {
  doc: BidDocument;
  updateFixture: (id: string, patch: Partial<FixtureRow>) => void;
  addFixture: () => void;
  removeFixture: (id: string) => void;
}

function Page3Tab({ doc, updateFixture, addFixture, removeFixture }: Page3Props) {
  const result = calcPage3(doc.page3);
  return (
    <div className={`${cardCls} overflow-hidden mb-4`}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
        <h3 className="font-semibold">Page 3 — Fixture Takeoff (×1.03)</h3>
        <button type="button" onClick={addFixture} className={tealBtn}>
          <Plus className="w-4 h-4" /> Add Fixture
        </button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400">
              <th className="p-2.5 font-semibold">Fixture</th>
              <th className="p-2.5 font-semibold w-20">Qty</th>
              <th className="p-2.5 font-semibold w-28">Fixture $</th>
              <th className="p-2.5 font-semibold w-24">Trim</th>
              <th className="p-2.5 font-semibold w-24">Trim 2</th>
              <th className="p-2.5 font-semibold w-24">Misc</th>
              <th className="p-2.5 font-semibold w-28 text-right">Total</th>
              <th className="p-2.5 w-12"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {doc.page3.map(r => (
              <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                <td className="p-1.5">
                  <input className={inputCls} value={r.item} onChange={e => updateFixture(r.id, { item: e.target.value })} />
                  {r.hookup && <span className="block text-[10px] text-slate-400 mt-0.5">hookup (qty × fixture)</span>}
                </td>
                <td className="p-1.5">
                  <input type="number" min="0" className={inputCls} value={r.qty === 0 ? '' : r.qty}
                    onChange={e => updateFixture(r.id, { qty: num(e.target.value) })} />
                </td>
                <td className="p-1.5">
                  <input type="number" step="0.01" className={inputCls} value={r.fixture === 0 ? '' : r.fixture}
                    onChange={e => updateFixture(r.id, { fixture: num(e.target.value) })} />
                </td>
                <td className="p-1.5">
                  <input type="number" step="0.01" className={`${inputCls} ${r.hookup ? 'opacity-40' : ''}`} disabled={r.hookup}
                    value={r.trim === 0 ? '' : r.trim} onChange={e => updateFixture(r.id, { trim: num(e.target.value) })} />
                </td>
                <td className="p-1.5">
                  <input type="number" step="0.01" className={`${inputCls} ${r.hookup ? 'opacity-40' : ''}`} disabled={r.hookup}
                    value={r.trim2 === 0 ? '' : r.trim2} onChange={e => updateFixture(r.id, { trim2: num(e.target.value) })} />
                </td>
                <td className="p-1.5">
                  <input type="number" step="0.01" className={`${inputCls} ${r.hookup ? 'opacity-40' : ''}`} disabled={r.hookup}
                    value={r.misc === 0 ? '' : r.misc} onChange={e => updateFixture(r.id, { misc: num(e.target.value) })} />
                </td>
                <td className={`p-2.5 text-right ${moneyCls}`}>${money(fixtureRowTotal(r))}</td>
                <td className="p-1.5 text-center">
                  <button type="button" aria-label="Delete fixture" onClick={() => removeFixture(r.id)} className={redBtn}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between items-center px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
        <span className="font-semibold text-slate-700 dark:text-slate-300">PAGE 3 TOTAL (×1.03)</span>
        <span className="text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-400">${money(result.total)}</span>
      </div>
    </div>
  );
}

// ── Summary (Page 4) ───────────────────────────────────────────────────────────

interface SummaryProps {
  doc: BidDocument;
  updateSummary: (patch: Partial<BidDocument['summary']>) => void;
  updateLaborHour: (index: number, hours: number) => void;
  updateSub: (index: number, amount: number) => void;
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${strong ? 'font-bold' : ''}`}>
      <span className={strong ? '' : 'text-slate-600 dark:text-slate-400'}>{label}</span>
      <span className="tabular-nums">${money(value)}</span>
    </div>
  );
}

function SummaryTab({ doc, updateSummary, updateLaborHour, updateSub }: SummaryProps) {
  const s = doc.summary;
  const r = calcSummary(doc);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {/* Inputs column */}
      <div className="space-y-4">
        <div className={`${cardCls} p-4`}>
          <h3 className="font-semibold mb-3">Labor Hours</h3>
          <div className="space-y-2">
            {s.laborHours.map((h, i) => (
              <label key={h.label} className="flex justify-between items-center text-sm gap-3">
                <span className="text-slate-600 dark:text-slate-400">{h.label}</span>
                <input type="number" min="0" className={`${inputCls} w-24`} value={h.hours === 0 ? '' : h.hours}
                  onChange={e => updateLaborHour(i, num(e.target.value))} />
              </label>
            ))}
          </div>
          <div className="flex justify-between items-center text-sm gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
            <span className="font-semibold">Rate ($/hr)</span>
            <input type="number" step="0.01" className={`${inputCls} w-24`} value={s.laborRate}
              onChange={e => updateSummary({ laborRate: num(e.target.value) })} />
          </div>
          <div className="flex justify-between text-sm mt-2 text-slate-600 dark:text-slate-400">
            <span>Total hours: <span className="tabular-nums">{r.laborHours}</span></span>
            <span className="tabular-nums">${money(r.laborCost)}</span>
          </div>
        </div>

        <div className={`${cardCls} p-4 space-y-3`}>
          <h3 className="font-semibold">Markups</h3>
          <label className="flex justify-between items-center text-sm gap-3">
            <span className="text-slate-600 dark:text-slate-400">Overhead (decimal)</span>
            <input type="number" step="0.01" className={`${inputCls} w-24`} value={s.overheadPct}
              onChange={e => updateSummary({ overheadPct: num(e.target.value) })} />
          </label>
          <label className="flex justify-between items-center text-sm gap-3">
            <span className="text-slate-600 dark:text-slate-400">Profit (decimal)</span>
            <input type="number" step="0.01" className={`${inputCls} w-24`} value={s.profitPct}
              onChange={e => updateSummary({ profitPct: num(e.target.value) })} />
          </label>
        </div>

        <div className={`${cardCls} p-4 space-y-3`}>
          <h3 className="font-semibold">Site Work Subs (×1.15)</h3>
          {s.subs.map((sub, i) => (
            <label key={sub.label} className="flex justify-between items-center text-sm gap-3">
              <span className="text-slate-600 dark:text-slate-400">{sub.label}</span>
              <input type="number" step="0.01" className={`${inputCls} w-28`} value={sub.amount === 0 ? '' : sub.amount}
                onChange={e => updateSub(i, num(e.target.value))} />
            </label>
          ))}
          <label className="flex justify-between items-center text-sm gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400">Sitework line (direct)</span>
            <input type="number" step="0.01" className={`${inputCls} w-28`} value={s.siteWorkLine === 0 ? '' : s.siteWorkLine}
              onChange={e => updateSummary({ siteWorkLine: num(e.target.value) })} />
          </label>
        </div>

        <div className={`${cardCls} p-4 space-y-3`}>
          <h3 className="font-semibold">Adders</h3>
          <label className="flex justify-between items-center text-sm gap-3">
            <span className="text-slate-600 dark:text-slate-400">Pre-lien</span>
            <input type="number" step="0.01" className={`${inputCls} w-28`} value={s.preLien}
              onChange={e => updateSummary({ preLien: num(e.target.value) })} />
          </label>
          <label className="flex justify-between items-center text-sm gap-3">
            <span className="text-slate-600 dark:text-slate-400">Travel</span>
            <input type="number" step="0.01" className={`${inputCls} w-28`} value={s.travel === 0 ? '' : s.travel}
              onChange={e => updateSummary({ travel: num(e.target.value) })} />
          </label>
          <label className="flex justify-between items-center text-sm gap-3">
            <span className="text-slate-600 dark:text-slate-400">Engineering</span>
            <input type="number" step="0.01" className={`${inputCls} w-28`} value={s.engineering === 0 ? '' : s.engineering}
              onChange={e => updateSummary({ engineering: num(e.target.value) })} />
          </label>
          <label className="flex justify-between items-center text-sm gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400">Sales tax rate (decimal)</span>
            <input type="number" step="0.001" className={`${inputCls} w-28`} value={s.salesTaxPct}
              onChange={e => updateSummary({ salesTaxPct: num(e.target.value) })} />
          </label>
          <label className="flex justify-between items-center text-sm gap-3">
            <span className="text-slate-600 dark:text-slate-400">Tax base override (blank = material)</span>
            <input type="number" step="0.01" className={`${inputCls} w-28`}
              value={s.taxBaseOverride ?? ''}
              onChange={e => updateSummary({ taxBaseOverride: e.target.value === '' ? null : num(e.target.value) })} />
          </label>
          <label className="flex justify-between items-center text-sm gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
            <span className="text-slate-600 dark:text-slate-400">Bid factor (÷, default 1)</span>
            <input type="number" step="0.01" className={`${inputCls} w-28`} value={s.bidFactor}
              onChange={e => updateSummary({ bidFactor: num(e.target.value) })} />
          </label>
        </div>
      </div>

      {/* Waterfall column */}
      <div className={`${cardCls} p-5 h-fit md:sticky md:top-4`}>
        <h3 className="font-bold text-lg mb-3">Final Bid Waterfall</h3>
        <div className="text-sm divide-y divide-slate-100 dark:divide-slate-800">
          <Row label="Page 1 (H81 + I79)" value={r.pg1} />
          <Row label="Page 2 (F74)" value={r.pg2} />
          <Row label="Page 3 (P58)" value={r.pg3} />
          <Row label="TOTAL MATERIAL" value={r.totalMaterial} strong />
          <Row label={`Labor (${r.laborHours} hrs × $${s.laborRate})`} value={r.laborCost} />
          <Row label="Material + Labor" value={r.i16} />
          <Row label={`Overhead (${(s.overheadPct * 100).toFixed(0)}%)`} value={r.overhead} />
          <Row label="Subtotal" value={r.i18} />
          <Row label={`Profit (${(s.profitPct * 100).toFixed(0)}%)`} value={r.profit} />
          <Row label="Subtotal" value={r.i20} />
          <Row label="Site work subs (×1.15)" value={r.subsTotal} />
          <Row label="BASE BID" value={r.baseBid} strong />
          <Row label="+ Pre-lien" value={r.i28} />
          <Row label="+ Travel + Engineering" value={r.i31} />
          <Row label={`Sales tax (${(s.salesTaxPct * 100).toFixed(1)}%)`} value={r.salesTax} />
        </div>
        <div className="flex justify-between items-center mt-4 pt-4 border-t-2 border-teal-500 text-2xl font-black text-teal-700 dark:text-teal-400">
          <span>FINAL BID</span>
          <span className="tabular-nums">${money(r.finalBid)}</span>
        </div>
      </div>
    </div>
  );
}

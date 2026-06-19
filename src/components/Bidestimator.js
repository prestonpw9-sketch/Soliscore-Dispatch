import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { Plus, Trash2, Save, FolderOpen } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { calcPage1, calcPage1a, calcPage2, calcPage2Section, calcPage3, calcSummary, fixtureRowTotal, lineTotal, money, } from './bid/calc';
import { makeBlankDocument, makeLineId } from './bid/seed';
// ── Helpers ──────────────────────────────────────────────────────────────────
function getErrorMessage(err, fallback) {
    return err instanceof Error ? err.message : fallback;
}
function num(raw) {
    return Number(raw) || 0;
}
const TABS = [
    { key: 'page1', label: 'Page 1 — DWV' },
    { key: 'page2', label: 'Page 2 — Pipe' },
    { key: 'page3', label: 'Page 3 — Fixtures' },
    { key: 'summary', label: 'Summary (Pg 4)' },
];
// Shared cell classes ---------------------------------------------------------
const inputCls = 'w-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white rounded-lg p-1.5 text-sm focus:ring-2 focus:ring-indigo-500 outline-none tabular-nums';
const cardCls = 'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm';
const moneyCls = 'tabular-nums font-semibold text-slate-900 dark:text-slate-100';
const tealBtn = 'inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50';
const redBtn = 'inline-flex items-center justify-center text-red-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg p-1.5 transition-colors';
// ── Component ──────────────────────────────────────────────────────────────
export default function BidEstimator() {
    const [activeTab, setActiveTab] = useState('page1');
    const [doc, setDoc] = useState(() => makeBlankDocument());
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [saveSuccess, setSaveSuccess] = useState(false);
    // ── Mutators ───────────────────────────────────────────────────────────────
    function patchDoc(patch) {
        setDoc(prev => ({ ...prev, ...patch }));
    }
    function updateLine(page, id, patch) {
        setDoc(prev => ({
            ...prev,
            [page]: prev[page].map(l => (l.id === id ? { ...l, ...patch } : l)),
        }));
    }
    function addLine(page) {
        const blank = { id: makeLineId(), qty: 0, size: '', item: '', price: 0, mult: 1 };
        setDoc(prev => ({ ...prev, [page]: [...prev[page], blank] }));
    }
    function removeLine(page, id) {
        setDoc(prev => ({ ...prev, [page]: prev[page].filter(l => l.id !== id) }));
    }
    function updateSection(key, patch) {
        setDoc(prev => ({
            ...prev,
            page2: prev.page2.map(s => (s.key === key ? { ...s, ...patch } : s)),
        }));
    }
    function updateP2Line(secKey, id, patch) {
        setDoc(prev => ({
            ...prev,
            page2: prev.page2.map(s => s.key === secKey
                ? { ...s, lines: s.lines.map(l => (l.id === id ? { ...l, ...patch } : l)) }
                : s),
        }));
    }
    function addP2Line(secKey) {
        const blank = { id: makeLineId(), qty: 0, item: '', price: 0, mult: 1 };
        setDoc(prev => ({
            ...prev,
            page2: prev.page2.map(s => s.key === secKey ? { ...s, lines: [...s.lines, blank] } : s),
        }));
    }
    function removeP2Line(secKey, id) {
        setDoc(prev => ({
            ...prev,
            page2: prev.page2.map(s => s.key === secKey ? { ...s, lines: s.lines.filter(l => l.id !== id) } : s),
        }));
    }
    function updateFixture(id, patch) {
        setDoc(prev => ({
            ...prev,
            page3: prev.page3.map(r => (r.id === id ? { ...r, ...patch } : r)),
        }));
    }
    function addFixture() {
        const blank = {
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
    function removeFixture(id) {
        setDoc(prev => ({ ...prev, page3: prev.page3.filter(r => r.id !== id) }));
    }
    function updateSummary(patch) {
        setDoc(prev => ({ ...prev, summary: { ...prev.summary, ...patch } }));
    }
    function updateLaborHour(index, hours) {
        setDoc(prev => ({
            ...prev,
            summary: {
                ...prev.summary,
                laborHours: prev.summary.laborHours.map((h, i) => i === index ? { ...h, hours } : h),
            },
        }));
    }
    function updateSub(index, amount) {
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
                if (error)
                    throw error;
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 4000);
            }
            catch (err) {
                setSaveError(getErrorMessage(err, 'Failed to save bid.'));
            }
            finally {
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
                if (error)
                    throw error;
                const loaded = data?.takeoff_data;
                if (loaded && Array.isArray(loaded.page1)) {
                    setDoc(loaded);
                }
                else {
                    setSaveError('Most recent bid is not a 4-page takeoff document.');
                }
            }
            catch (err) {
                setSaveError(getErrorMessage(err, 'Failed to load bid.'));
            }
            finally {
                setLoading(false);
            }
        })();
    }
    // ── Render ───────────────────────────────────────────────────────────────────
    return (_jsxs("div", { className: "p-6 max-w-6xl mx-auto text-slate-900 dark:text-slate-100", children: [_jsxs("div", { className: `${cardCls} p-5 mb-4`, children: [_jsxs("div", { className: "flex flex-wrap justify-between items-center gap-4", children: [_jsxs("div", { className: "flex-1 min-w-[240px] space-y-2", children: [_jsx("input", { type: "text", "aria-label": "Project name", className: "text-2xl font-bold bg-transparent border-none focus:ring-0 outline-none w-full", value: doc.project, onChange: e => patchDoc({ project: e.target.value }) }), _jsxs("div", { className: "flex flex-wrap gap-3 text-sm", children: [_jsx("input", { type: "text", "aria-label": "GC / Owner", placeholder: "GC / Owner", className: `${inputCls} max-w-[220px]`, value: doc.gcOwner, onChange: e => patchDoc({ gcOwner: e.target.value }) }), _jsx("input", { type: "date", "aria-label": "Bid date", className: `${inputCls} max-w-[180px]`, value: doc.date, onChange: e => patchDoc({ date: e.target.value }) })] })] }), _jsxs("div", { className: "flex items-center gap-2", children: [_jsxs("button", { type: "button", onClick: handleLoad, disabled: loading, className: "inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50", children: [_jsx(FolderOpen, { className: "w-4 h-4" }), " ", loading ? 'Loading…' : 'Load'] }), _jsxs("button", { type: "button", onClick: handleSave, disabled: saving, className: "inline-flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50", children: [_jsx(Save, { className: "w-4 h-4" }), " ", saving ? 'Saving…' : 'Save Bid'] })] })] }), saveSuccess && (_jsx("p", { role: "status", className: "text-sm text-teal-600 dark:text-teal-400 font-semibold mt-3", children: "\u2713 Bid saved successfully." })), saveError && (_jsx("p", { role: "alert", className: "text-sm text-red-600 dark:text-red-400 font-semibold mt-3", children: saveError }))] }), _jsx("div", { className: "flex flex-wrap gap-2 mb-4", children: TABS.map(({ key, label }) => (_jsx("button", { type: "button", onClick: () => setActiveTab(key), className: `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === key
                        ? 'bg-indigo-600 text-white font-semibold'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'}`, children: label }, key))) }), activeTab === 'page1' && _jsx(Page1Tab, { doc: doc, updateLine: updateLine, addLine: addLine, removeLine: removeLine }), activeTab === 'page2' && (_jsx(Page2Tab, { doc: doc, updateSection: updateSection, updateLine: updateP2Line, addLine: addP2Line, removeLine: removeP2Line })), activeTab === 'page3' && (_jsx(Page3Tab, { doc: doc, updateFixture: updateFixture, addFixture: addFixture, removeFixture: removeFixture })), activeTab === 'summary' && (_jsx(SummaryTab, { doc: doc, updateSummary: updateSummary, updateLaborHour: updateLaborHour, updateSub: updateSub }))] }));
}
function LineTable({ title, total, lines, onUpdate, onAdd, onRemove, totalLabel }) {
    return (_jsxs("div", { className: `${cardCls} overflow-hidden mb-4`, children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800", children: [_jsx("h3", { className: "font-semibold", children: title }), _jsxs("button", { type: "button", onClick: onAdd, className: tealBtn, children: [_jsx(Plus, { className: "w-4 h-4" }), " Add Row"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400", children: [_jsx("th", { className: "p-2.5 font-semibold w-24", children: "Size" }), _jsx("th", { className: "p-2.5 font-semibold", children: "Item" }), _jsx("th", { className: "p-2.5 font-semibold w-24", children: "Qty" }), _jsx("th", { className: "p-2.5 font-semibold w-28", children: "Price" }), _jsx("th", { className: "p-2.5 font-semibold w-20", children: "Mult" }), _jsx("th", { className: "p-2.5 font-semibold w-28 text-right", children: "Total" }), _jsx("th", { className: "p-2.5 w-12" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: lines.map(l => (_jsxs("tr", { className: "hover:bg-slate-50 dark:hover:bg-slate-800/40", children: [_jsx("td", { className: "p-1.5", children: _jsx("input", { className: inputCls, value: l.size ?? '', onChange: e => onUpdate(l.id, { size: e.target.value }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { className: inputCls, value: l.item, onChange: e => onUpdate(l.id, { item: e.target.value }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", min: "0", className: inputCls, value: l.qty === 0 ? '' : l.qty, onChange: e => onUpdate(l.id, { qty: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.001", className: inputCls, value: l.price === 0 ? '' : l.price, onChange: e => onUpdate(l.id, { price: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.01", className: inputCls, value: l.mult, onChange: e => onUpdate(l.id, { mult: num(e.target.value) }) }) }), _jsxs("td", { className: `p-2.5 text-right ${moneyCls}`, children: ["$", money(lineTotal(l))] }), _jsx("td", { className: "p-1.5 text-center", children: _jsx("button", { type: "button", "aria-label": "Delete row", onClick: () => onRemove(l.id), className: redBtn, children: _jsx(Trash2, { className: "w-4 h-4" }) }) })] }, l.id))) })] }) }), _jsxs("div", { className: "flex justify-between items-center px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60", children: [_jsx("span", { className: "font-semibold text-slate-700 dark:text-slate-300", children: totalLabel }), _jsxs("span", { className: "text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-400", children: ["$", money(total)] })] })] }));
}
function Page1Tab({ doc, updateLine, addLine, removeLine }) {
    const p1 = calcPage1(doc.page1);
    const p1a = calcPage1a(doc.page1a);
    const combined = p1.total + p1a.total;
    return (_jsxs(_Fragment, { children: [_jsx(LineTable, { title: "Page 1 \u2014 Material / DWV Takeoff (\u00D71.15)", total: p1.total, lines: doc.page1, onUpdate: (id, patch) => updateLine('page1', id, patch), onAdd: () => addLine('page1'), onRemove: id => removeLine('page1', id), totalLabel: "PAGE 1 TOTAL" }), _jsx(LineTable, { title: "Page 1a \u2014 Additional Material (\u00D71.05)", total: p1a.total, lines: doc.page1a, onUpdate: (id, patch) => updateLine('page1a', id, patch), onAdd: () => addLine('page1a'), onRemove: id => removeLine('page1a', id), totalLabel: "PAGE 1a TOTAL" }), _jsxs("div", { className: `${cardCls} flex justify-between items-center px-4 py-4`, children: [_jsx("span", { className: "font-bold", children: "PAGE 1 COMBINED (H81 + I79)" }), _jsxs("span", { className: "text-xl font-black tabular-nums text-teal-700 dark:text-teal-400", children: ["$", money(combined)] })] })] }));
}
function Page2Tab({ doc, updateSection, updateLine, addLine, removeLine }) {
    const result = calcPage2(doc.page2);
    return (_jsxs(_Fragment, { children: [doc.page2.map(sec => {
                const r = calcPage2Section(sec);
                return (_jsxs("div", { className: `${cardCls} overflow-hidden mb-4`, children: [_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800", children: [_jsx("h3", { className: "font-semibold", children: sec.title }), _jsxs("div", { className: "flex items-center gap-3", children: [_jsxs("label", { className: "flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400", children: ["Fittings %", _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-20`, value: sec.fittingsPct, onChange: e => updateSection(sec.key, { fittingsPct: num(e.target.value) }) })] }), _jsxs("span", { className: "text-xs text-slate-500", children: ["tier \u00D7", sec.tier] }), _jsxs("button", { type: "button", onClick: () => addLine(sec.key), className: tealBtn, children: [_jsx(Plus, { className: "w-4 h-4" }), " Add"] })] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400", children: [_jsx("th", { className: "p-2.5 font-semibold", children: "Item" }), _jsx("th", { className: "p-2.5 font-semibold w-24", children: "Qty" }), _jsx("th", { className: "p-2.5 font-semibold w-28", children: "Price" }), _jsx("th", { className: "p-2.5 font-semibold w-20", children: "Mult" }), _jsx("th", { className: "p-2.5 font-semibold w-28 text-right", children: "Total" }), _jsx("th", { className: "p-2.5 w-12" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: sec.lines.map(l => (_jsxs("tr", { className: "hover:bg-slate-50 dark:hover:bg-slate-800/40", children: [_jsx("td", { className: "p-1.5", children: _jsx("input", { className: inputCls, value: l.item, onChange: e => updateLine(sec.key, l.id, { item: e.target.value }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", min: "0", className: inputCls, value: l.qty === 0 ? '' : l.qty, onChange: e => updateLine(sec.key, l.id, { qty: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.0001", className: inputCls, value: l.price === 0 ? '' : l.price, onChange: e => updateLine(sec.key, l.id, { price: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.01", className: inputCls, value: l.mult, onChange: e => updateLine(sec.key, l.id, { mult: num(e.target.value) }) }) }), _jsxs("td", { className: `p-2.5 text-right ${moneyCls}`, children: ["$", money(lineTotal(l))] }), _jsx("td", { className: "p-1.5 text-center", children: _jsx("button", { type: "button", "aria-label": "Delete row", onClick: () => removeLine(sec.key, l.id), className: redBtn, children: _jsx(Trash2, { className: "w-4 h-4" }) }) })] }, l.id))) })] }) }), _jsxs("div", { className: "px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-sm space-y-1", children: [_jsxs("div", { className: "flex justify-between text-slate-600 dark:text-slate-400", children: [_jsx("span", { children: "Lines sum" }), _jsxs("span", { className: "tabular-nums", children: ["$", money(r.linesSum)] })] }), _jsxs("div", { className: "flex justify-between text-slate-600 dark:text-slate-400", children: [_jsxs("span", { children: ["Fittings (", (sec.fittingsPct * 100).toFixed(0), "%)"] }), _jsxs("span", { className: "tabular-nums", children: ["$", money(r.fittings)] })] }), _jsxs("div", { className: "flex justify-between font-semibold", children: [_jsxs("span", { children: ["Subtotal (\u00D7", sec.tier, ")"] }), _jsxs("span", { className: "tabular-nums text-indigo-700 dark:text-indigo-400", children: ["$", money(r.subtotal)] })] })] })] }, sec.key));
            }), _jsxs("div", { className: `${cardCls} flex justify-between items-center px-4 py-4`, children: [_jsx("span", { className: "font-bold", children: "PAGE 2 TOTAL (\u00D71.03)" }), _jsxs("span", { className: "text-xl font-black tabular-nums text-teal-700 dark:text-teal-400", children: ["$", money(result.total)] })] })] }));
}
function Page3Tab({ doc, updateFixture, addFixture, removeFixture }) {
    const result = calcPage3(doc.page3);
    return (_jsxs("div", { className: `${cardCls} overflow-hidden mb-4`, children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800", children: [_jsx("h3", { className: "font-semibold", children: "Page 3 \u2014 Fixture Takeoff (\u00D71.03)" }), _jsxs("button", { type: "button", onClick: addFixture, className: tealBtn, children: [_jsx(Plus, { className: "w-4 h-4" }), " Add Fixture"] })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm", children: [_jsx("thead", { children: _jsxs("tr", { className: "bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400", children: [_jsx("th", { className: "p-2.5 font-semibold", children: "Fixture" }), _jsx("th", { className: "p-2.5 font-semibold w-20", children: "Qty" }), _jsx("th", { className: "p-2.5 font-semibold w-28", children: "Fixture $" }), _jsx("th", { className: "p-2.5 font-semibold w-24", children: "Trim" }), _jsx("th", { className: "p-2.5 font-semibold w-24", children: "Trim 2" }), _jsx("th", { className: "p-2.5 font-semibold w-24", children: "Misc" }), _jsx("th", { className: "p-2.5 font-semibold w-28 text-right", children: "Total" }), _jsx("th", { className: "p-2.5 w-12" })] }) }), _jsx("tbody", { className: "divide-y divide-slate-100 dark:divide-slate-800", children: doc.page3.map(r => (_jsxs("tr", { className: "hover:bg-slate-50 dark:hover:bg-slate-800/40", children: [_jsxs("td", { className: "p-1.5", children: [_jsx("input", { className: inputCls, value: r.item, onChange: e => updateFixture(r.id, { item: e.target.value }) }), r.hookup && _jsx("span", { className: "block text-[10px] text-slate-400 mt-0.5", children: "hookup (qty \u00D7 fixture)" })] }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", min: "0", className: inputCls, value: r.qty === 0 ? '' : r.qty, onChange: e => updateFixture(r.id, { qty: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.01", className: inputCls, value: r.fixture === 0 ? '' : r.fixture, onChange: e => updateFixture(r.id, { fixture: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.01", className: `${inputCls} ${r.hookup ? 'opacity-40' : ''}`, disabled: r.hookup, value: r.trim === 0 ? '' : r.trim, onChange: e => updateFixture(r.id, { trim: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.01", className: `${inputCls} ${r.hookup ? 'opacity-40' : ''}`, disabled: r.hookup, value: r.trim2 === 0 ? '' : r.trim2, onChange: e => updateFixture(r.id, { trim2: num(e.target.value) }) }) }), _jsx("td", { className: "p-1.5", children: _jsx("input", { type: "number", step: "0.01", className: `${inputCls} ${r.hookup ? 'opacity-40' : ''}`, disabled: r.hookup, value: r.misc === 0 ? '' : r.misc, onChange: e => updateFixture(r.id, { misc: num(e.target.value) }) }) }), _jsxs("td", { className: `p-2.5 text-right ${moneyCls}`, children: ["$", money(fixtureRowTotal(r))] }), _jsx("td", { className: "p-1.5 text-center", children: _jsx("button", { type: "button", "aria-label": "Delete fixture", onClick: () => removeFixture(r.id), className: redBtn, children: _jsx(Trash2, { className: "w-4 h-4" }) }) })] }, r.id))) })] }) }), _jsxs("div", { className: "flex justify-between items-center px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60", children: [_jsx("span", { className: "font-semibold text-slate-700 dark:text-slate-300", children: "PAGE 3 TOTAL (\u00D71.03)" }), _jsxs("span", { className: "text-lg font-bold tabular-nums text-indigo-700 dark:text-indigo-400", children: ["$", money(result.total)] })] })] }));
}
function Row({ label, value, strong }) {
    return (_jsxs("div", { className: `flex justify-between items-center py-1.5 ${strong ? 'font-bold' : ''}`, children: [_jsx("span", { className: strong ? '' : 'text-slate-600 dark:text-slate-400', children: label }), _jsxs("span", { className: "tabular-nums", children: ["$", money(value)] })] }));
}
function SummaryTab({ doc, updateSummary, updateLaborHour, updateSub }) {
    const s = doc.summary;
    const r = calcSummary(doc);
    return (_jsxs("div", { className: "grid gap-4 md:grid-cols-2", children: [_jsxs("div", { className: "space-y-4", children: [_jsxs("div", { className: `${cardCls} p-4`, children: [_jsx("h3", { className: "font-semibold mb-3", children: "Labor Hours" }), _jsx("div", { className: "space-y-2", children: s.laborHours.map((h, i) => (_jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: h.label }), _jsx("input", { type: "number", min: "0", className: `${inputCls} w-24`, value: h.hours === 0 ? '' : h.hours, onChange: e => updateLaborHour(i, num(e.target.value)) })] }, h.label))) }), _jsxs("div", { className: "flex justify-between items-center text-sm gap-3 mt-3 pt-3 border-t border-slate-200 dark:border-slate-800", children: [_jsx("span", { className: "font-semibold", children: "Rate ($/hr)" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-24`, value: s.laborRate, onChange: e => updateSummary({ laborRate: num(e.target.value) }) })] }), _jsxs("div", { className: "flex justify-between text-sm mt-2 text-slate-600 dark:text-slate-400", children: [_jsxs("span", { children: ["Total hours: ", _jsx("span", { className: "tabular-nums", children: r.laborHours })] }), _jsxs("span", { className: "tabular-nums", children: ["$", money(r.laborCost)] })] })] }), _jsxs("div", { className: `${cardCls} p-4 space-y-3`, children: [_jsx("h3", { className: "font-semibold", children: "Markups" }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Overhead (decimal)" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-24`, value: s.overheadPct, onChange: e => updateSummary({ overheadPct: num(e.target.value) }) })] }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Profit (decimal)" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-24`, value: s.profitPct, onChange: e => updateSummary({ profitPct: num(e.target.value) }) })] })] }), _jsxs("div", { className: `${cardCls} p-4 space-y-3`, children: [_jsx("h3", { className: "font-semibold", children: "Site Work Subs (\u00D71.15)" }), s.subs.map((sub, i) => (_jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: sub.label }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: sub.amount === 0 ? '' : sub.amount, onChange: e => updateSub(i, num(e.target.value)) })] }, sub.label))), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3 pt-2 border-t border-slate-200 dark:border-slate-800", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Sitework line (direct)" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: s.siteWorkLine === 0 ? '' : s.siteWorkLine, onChange: e => updateSummary({ siteWorkLine: num(e.target.value) }) })] })] }), _jsxs("div", { className: `${cardCls} p-4 space-y-3`, children: [_jsx("h3", { className: "font-semibold", children: "Adders" }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Pre-lien" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: s.preLien, onChange: e => updateSummary({ preLien: num(e.target.value) }) })] }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Travel" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: s.travel === 0 ? '' : s.travel, onChange: e => updateSummary({ travel: num(e.target.value) }) })] }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Engineering" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: s.engineering === 0 ? '' : s.engineering, onChange: e => updateSummary({ engineering: num(e.target.value) }) })] }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3 pt-2 border-t border-slate-200 dark:border-slate-800", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Sales tax rate (decimal)" }), _jsx("input", { type: "number", step: "0.001", className: `${inputCls} w-28`, value: s.salesTaxPct, onChange: e => updateSummary({ salesTaxPct: num(e.target.value) }) })] }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Tax base override (blank = material)" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: s.taxBaseOverride ?? '', onChange: e => updateSummary({ taxBaseOverride: e.target.value === '' ? null : num(e.target.value) }) })] }), _jsxs("label", { className: "flex justify-between items-center text-sm gap-3 pt-2 border-t border-slate-200 dark:border-slate-800", children: [_jsx("span", { className: "text-slate-600 dark:text-slate-400", children: "Bid factor (\u00F7, default 1)" }), _jsx("input", { type: "number", step: "0.01", className: `${inputCls} w-28`, value: s.bidFactor, onChange: e => updateSummary({ bidFactor: num(e.target.value) }) })] })] })] }), _jsxs("div", { className: `${cardCls} p-5 h-fit md:sticky md:top-4`, children: [_jsx("h3", { className: "font-bold text-lg mb-3", children: "Final Bid Waterfall" }), _jsxs("div", { className: "text-sm divide-y divide-slate-100 dark:divide-slate-800", children: [_jsx(Row, { label: "Page 1 (H81 + I79)", value: r.pg1 }), _jsx(Row, { label: "Page 2 (F74)", value: r.pg2 }), _jsx(Row, { label: "Page 3 (P58)", value: r.pg3 }), _jsx(Row, { label: "TOTAL MATERIAL", value: r.totalMaterial, strong: true }), _jsx(Row, { label: `Labor (${r.laborHours} hrs × $${s.laborRate})`, value: r.laborCost }), _jsx(Row, { label: "Material + Labor", value: r.i16 }), _jsx(Row, { label: `Overhead (${(s.overheadPct * 100).toFixed(0)}%)`, value: r.overhead }), _jsx(Row, { label: "Subtotal", value: r.i18 }), _jsx(Row, { label: `Profit (${(s.profitPct * 100).toFixed(0)}%)`, value: r.profit }), _jsx(Row, { label: "Subtotal", value: r.i20 }), _jsx(Row, { label: "Site work subs (\u00D71.15)", value: r.subsTotal }), _jsx(Row, { label: "BASE BID", value: r.baseBid, strong: true }), _jsx(Row, { label: "+ Pre-lien", value: r.i28 }), _jsx(Row, { label: "+ Travel + Engineering", value: r.i31 }), _jsx(Row, { label: `Sales tax (${(s.salesTaxPct * 100).toFixed(1)}%)`, value: r.salesTax })] }), _jsxs("div", { className: "flex justify-between items-center mt-4 pt-4 border-t-2 border-teal-500 text-2xl font-black text-teal-700 dark:text-teal-400", children: [_jsx("span", { children: "FINAL BID" }), _jsxs("span", { className: "tabular-nums", children: ["$", money(r.finalBid)] })] })] })] }));
}

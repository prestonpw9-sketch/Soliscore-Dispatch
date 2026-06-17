import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  Trash2, FileText, Printer, ArrowLeft, BookOpen,
  Plus, Search, X,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

type CatalogTab = 'dwv' | 'copper' | 'fixtures' | 'labor';

interface CatalogItem {
  id: string;
  size: string;
  item: string;
  price: number;
}

interface Line {
  id: string;
  size: string;
  item: string;
  qty: number;
  unit_price: number;
}

// ── Catalog ────────────────────────────────────────────────────────────────

const CATALOG: Record<CatalogTab, CatalogItem[]> = {
  dwv: [
    { id: 'd1',    size: '8"',    item: 'PVC DWV HXH 90 ELL',                price: 46.85  },
    { id: 'd2',    size: '8"',    item: 'PVC DWV HXHXH COMB WYE',            price: 150.44 },
    { id: 'd3',    size: '8"',    item: 'PVC DWV HXH COUP',                  price: 23.50  },
    { id: 'd4',    size: '6"',    item: 'PVC DWV 90 ELL',                    price: 36.26  },
    { id: 'd5',    size: '6"',    item: 'PVC DWV COMB 2PC',                  price: 99.69  },
    { id: 'd6',    size: '6"',    item: 'PVC DWV WYE',                       price: 50.11  },
    { id: 'd7',    size: '4"',    item: '2-way cleanouts w/ c.o. & plug',    price: 82.90  },
    { id: 'd8',    size: '4"',    item: 'PVC Combos',                        price: 25.89  },
    { id: 'd9',    size: '3x2"',  item: 'PVC San Cross',                     price: 11.62  },
    { id: 'd10',   size: '3"',    item: 'Blake tee w/plug & Cover',          price: 15.11  },
    { id: 'd11',   size: '3x4"',  item: 'Closet ell w/ test cap & ring',     price: 23.00  },
    { id: 'd-3-1', size: '3"',    item: 'PVC DWV Pipe',                      price: 15.00  },
    { id: 'd-3-2', size: '3"',    item: 'PVC DWV 90 ELL',                    price: 8.50   },
    { id: 'd-3-3', size: '3"',    item: 'PVC DWV 45 ELL',                    price: 7.20   },
    { id: 'd-3-4', size: '3"',    item: 'PVC Combos',                        price: 14.25  },
    { id: 'd-3-5', size: '3"',    item: 'PVC Wyes',                          price: 12.80  },
    { id: 'd-3-6', size: '3"',    item: 'PVC San Tees',                      price: 11.50  },
    { id: 'd-3-7', size: '3"',    item: 'PVC Sweeps',                        price: 9.75   },
    { id: 'd-3-8', size: '3"',    item: 'C.O. tees w/ plug & Cover',         price: 12.05  },
    { id: 'd12',   size: '2"',    item: 'PVC Combos',                        price: 5.97   },
    { id: 'd13',   size: '2"',    item: 'PVC Wyes',                          price: 7.70   },
    { id: 'd14',   size: '2"',    item: 'PVC Sweeps',                        price: 6.29   },
    { id: 'd15',   size: '2"',    item: 'PVC 1/4 Bends',                     price: 3.92   },
    { id: 'd16',   size: '2"',    item: 'PVC P-Traps',                       price: 10.21  },
    { id: 'd17',   size: '2"',    item: 'PVC San Tees',                      price: 5.51   },
    { id: 'd18',   size: '2"',    item: 'C.O. tees w/ plug & Cover',         price: 6.05   },
    { id: 'ci1',   size: '4"',    item: 'Fig. #5 NO HUB C.I.',               price: 230.08 },
    { id: 'ci2',   size: '4"',    item: 'Combos NO HUB C.I.',                price: 75.35  },
    { id: 'ci3',   size: '4x3"',  item: 'Combos NO HUB C.I.',                price: 57.44  },
    { id: 'ci4',   size: '4"',    item: 'Wyes NO HUB C.I.',                  price: 50.67  },
    { id: 'ci5',   size: '4x2"',  item: 'Lo heel 1/4 bend NO HUB C.I.',      price: 47.88  },
    { id: 'ci6',   size: '4"',    item: 'Sweep NO HUB C.I.',                 price: 54.92  },
    { id: 'ci7',   size: '2"',    item: 'San tees NO HUB C.I.',              price: 23.77  },
    { id: 'ci8',   size: '2"',    item: 'C.O. tees w/ plug NO HUB C.I.',     price: 21.23  },
    { id: 'ci9',   size: '1-1/2"',item: '1/4 bends NO HUB C.I.',             price: 15.63  },
    { id: 'ci10',  size: '6"',    item: 'NO HUB BANDS (Standard)',            price: 16.74  },
    { id: 'ci11',  size: '4"',    item: 'NO HUB BANDS (Standard)',            price: 6.61   },
    { id: 'ci12',  size: '2"',    item: 'NO HUB BANDS (Standard)',            price: 4.81   },
  ],
  copper: [
    { id: 'c1',    size: '3"',     item: 'L HARD COPPER',                    price: 48.81  },
    { id: 'c2',    size: '2-1/2"', item: 'L HARD COPPER',                    price: 34.96  },
    { id: 'c3',    size: '2"',     item: 'L HARD COPPER',                    price: 25.10  },
    { id: 'c4',    size: '1-1/2"', item: 'L SOFT COPPER',                    price: 21.80  },
    { id: 'c5',    size: '1-1/4"', item: 'L SOFT COPPER',                    price: 19.88  },
    { id: 'c6',    size: '1"',     item: 'L SOFT COPPER',                    price: 12.47  },
    { id: 'c7',    size: '3/4"',   item: 'L SOFT COPPER',                    price: 8.70   },
    { id: 'c8',    size: '1/2"',   item: 'L SOFT COPPER',                    price: 5.46   },
    { id: 'cpvc1', size: '2"',     item: 'CPVC Pipe',                        price: 3.91   },
    { id: 'cpvc2', size: '1-1/2"', item: 'CPVC Pipe',                        price: 2.50   },
    { id: 'cpvc3', size: '1-1/4"', item: 'CPVC Pipe',                        price: 1.88   },
    { id: 'cpvc4', size: '1"',     item: 'CPVC Pipe',                        price: 1.08   },
    { id: 'cpvc5', size: '3/4"',   item: 'CPVC Pipe',                        price: 0.50   },
    { id: 'cpvc6', size: '1/2"',   item: 'CPVC Pipe',                        price: 0.36   },
    { id: 'cpvc7', size: 'Lot',    item: 'CPVC Fittings (Est. 50%)',          price: 0.00   },
    { id: 'pex1',  size: '2"',     item: 'PEX Pipe',                         price: 6.72   },
    { id: 'pex2',  size: '1-1/2"', item: 'PEX Pipe',                         price: 3.36   },
    { id: 'pex3',  size: '1-1/4"', item: 'PEX Pipe',                         price: 2.81   },
    { id: 'pex4',  size: '1"',     item: 'PEX Pipe',                         price: 1.23   },
    { id: 'pex5',  size: '3/4"',   item: 'PEX Pipe',                         price: 0.68   },
    { id: 'pex6',  size: '1/2"',   item: 'PEX Pipe',                         price: 0.40   },
    { id: 'pex7',  size: 'Lot',    item: 'PEX Fittings (Est. 60%)',           price: 0.00   },
    { id: 'bi1',   size: '2"',     item: 'BLK Pipe (Gas)',                   price: 12.01  },
    { id: 'bi2',   size: '1-1/2"', item: 'BLK Pipe (Gas)',                   price: 8.93   },
    { id: 'bi3',   size: '1-1/4"', item: 'BLK Pipe (Gas)',                   price: 7.45   },
    { id: 'bi4',   size: '1"',     item: 'BLK Pipe (Gas)',                   price: 5.49   },
    { id: 'bi5',   size: '3/4"',   item: 'BLK Pipe (Gas)',                   price: 1.06   },
    { id: 'bi6',   size: '1/2"',   item: 'BLK Pipe (Gas)',                   price: 0.81   },
  ],
  fixtures: [
    { id: 'f1', size: 'Each', item: 'W.C. (Water Closet) Supply/Trim',       price: 15.00  },
    { id: 'f2', size: 'Each', item: 'Urinal Supply/Trim',                    price: 15.00  },
    { id: 'f3', size: 'Each', item: 'LAV Supply & Trap',                     price: 0.00   },
    { id: 'f4', size: 'Each', item: 'EWC Supply & Trap',                     price: 0.00   },
    { id: 'f5', size: 'Each', item: 'Water Heater Hookup',                   price: 0.00   },
    { id: 'f6', size: 'Each', item: 'Furnace Hookup',                        price: 0.00   },
  ],
  labor: [
    { id: 'l1', size: 'Hour', item: 'Standard Labor (Per Hour)',             price: 60.00  },
    { id: 'l2', size: 'Hour', item: 'Overtime / Emergency Labor',            price: 90.00  },
    { id: 'l3', size: 'Lot',  item: 'Pre-Lien Filing',                       price: 50.00  },
    { id: 'l4', size: 'Lot',  item: 'Permit & Inspection Fees',              price: 150.00 },
  ],
};

// ── Utils ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

// ── Component ──────────────────────────────────────────────────────────────

interface QuickBidEstimatorProps {
  mode?: 'standalone' | 'project';
  projectId?: string;
  initialBidId?: string;
}

export default function QuickBidEstimator({
  mode = 'standalone',
  projectId,
  initialBidId,
}: QuickBidEstimatorProps) {
  const [lines, setLines] = useState<Line[]>([]);
  const [projectName, setProjectName] = useState('');
  const [clientName, setClientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentBidId, setCurrentBidId] = useState<string | null>(null);

  const [isQuoteView, setIsQuoteView] = useState(false);
  const [isCatalogOpen, setIsCatalogOpen] = useState(true);
  const [activeCatalogTab, setActiveCatalogTab] = useState<CatalogTab>('dwv');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (initialBidId) void loadBid(initialBidId);
  }, [initialBidId]);

  async function loadBid(id: string) {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('project_bids')
        .select('*')
        .eq('id', id)
        .single();
      if (error) throw error;
      if (data) {
        setLines((data.takeoff_data?.lines as Line[]) ?? []);
        setProjectName((data.project_name as string) ?? '');
        setClientName((data.client_name as string) ?? '');
        setCurrentBidId((data.id as string) ?? null);
      }
    } catch (err) {
      console.error('loadBid error', err);
    } finally {
      setLoading(false);
    }
  }

  function addLine() {
    setLines(prev => [
      ...prev,
      { id: makeId(), size: '', item: '', qty: 1, unit_price: 0 },
    ]);
  }

  function updateLine(id: string, patch: Partial<Line>) {
    setLines(prev => prev.map(l => (l.id === id ? { ...l, ...patch } : l)));
  }

  function removeLine(id: string) {
    setLines(prev => prev.filter(l => l.id !== id));
  }

  function calcTotal() {
    return lines.reduce(
      (sum, l) => sum + (Number(l.qty) || 0) * (Number(l.unit_price) || 0),
      0
    );
  }

  function addFromCatalog(catalogItem: CatalogItem) {
    const existingIndex = lines.findIndex(
      l => l.item === catalogItem.item && l.size === catalogItem.size
    );
    if (existingIndex >= 0) {
      setLines(prev =>
        prev.map((l, i) =>
          i === existingIndex ? { ...l, qty: l.qty + 1 } : l
        )
      );
    } else {
      setLines(prev => [
        ...prev,
        {
          id: makeId(),
          size: catalogItem.size,
          item: catalogItem.item,
          qty: 1,
          unit_price: catalogItem.price,
        },
      ]);
    }
  }

  const filteredCatalog = CATALOG[activeCatalogTab].filter(
    item =>
      item.item.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.size.toLowerCase().includes(searchQuery.toLowerCase())
  );

  async function handleSaveToProject() { /* Connect to Supabase when ready */ }

  // ── Quote view ────────────────────────────────────────────────────────────

  if (isQuoteView) {
    return (
      <div className="p-8 bg-white min-h-full">
        <div className="flex justify-between items-center mb-8 border-b pb-4 print:hidden">
          <button
            type="button"
            onClick={() => setIsQuoteView(false)}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Editor
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-lg hover:bg-black transition-colors"
          >
            <Printer className="w-4 h-4" /> Print / Save PDF
          </button>
        </div>

        <div className="max-w-4xl mx-auto text-slate-800">
          <div className="flex justify-between items-start mb-12">
            <div>
              <h1 className="text-4xl font-black tracking-tight text-slate-900 mb-2">
                SOLIDCORE PLUMBING
              </h1>
              <p className="text-slate-500 font-medium">Tucson, AZ • ROC #XXXXXX</p>
            </div>
            <div className="text-right">
              <h2 className="text-2xl font-bold text-slate-300 uppercase tracking-widest mb-2">
                Estimate
              </h2>
              <p className="font-semibold text-lg">{projectName || 'Untitled Project'}</p>
              <p className="text-slate-500">{clientName || 'Client Name'}</p>
              <p className="text-slate-400 text-sm mt-2">{new Date().toLocaleDateString()}</p>
            </div>
          </div>

          <table className="w-full mb-8">
            <thead>
              <tr className="border-b-2 border-slate-800 text-left">
                <th className="py-3 px-2 text-sm font-bold uppercase tracking-wider text-slate-600">Size</th>
                <th className="py-3 px-2 text-sm font-bold uppercase tracking-wider text-slate-600">Description</th>
                <th className="py-3 px-2 text-sm font-bold uppercase tracking-wider text-slate-600 text-center">Qty</th>
                <th className="py-3 px-2 text-sm font-bold uppercase tracking-wider text-slate-600 text-right">Unit Price</th>
                <th className="py-3 px-2 text-sm font-bold uppercase tracking-wider text-slate-600 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, idx) => (
                <tr key={line.id} className={idx % 2 === 0 ? 'bg-slate-50' : ''}>
                  <td className="py-3 px-2 border-b border-slate-100">{line.size}</td>
                  <td className="py-3 px-2 border-b border-slate-100 font-medium">{line.item}</td>
                  <td className="py-3 px-2 border-b border-slate-100 text-center">{line.qty}</td>
                  <td className="py-3 px-2 border-b border-slate-100 text-right">
                    ${Number(line.unit_price).toFixed(2)}
                  </td>
                  <td className="py-3 px-2 border-b border-slate-100 text-right font-semibold">
                    ${(line.qty * line.unit_price).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-end">
            <div className="w-1/3 border-t-2 border-slate-800 pt-4 flex justify-between items-center">
              <span className="text-lg font-bold">Total Estimate:</span>
              <span className="text-2xl font-black text-slate-900">
                ${calcTotal().toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Editor view ───────────────────────────────────────────────────────────

  return (
    <div className="flex h-full bg-white relative">
      {isCatalogOpen && (
        <div className="w-[350px] border-r border-slate-200 bg-slate-50 flex flex-col h-full shrink-0">
          <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-white">
            <h3 className="font-bold flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" /> Price Book
            </h3>
            <button
              type="button"
              onClick={() => setIsCatalogOpen(false)}
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex border-b border-slate-200 bg-white text-[11px] font-bold text-slate-600 uppercase tracking-wider">
            {(['dwv', 'copper', 'fixtures', 'labor'] as CatalogTab[]).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveCatalogTab(tab)}
                className={`flex-1 py-3 text-center border-b-2 transition-colors ${
                  activeCatalogTab === tab
                    ? 'border-blue-600 text-blue-700 bg-blue-50/50'
                    : 'border-transparent hover:bg-slate-50'
                }`}
              >
                {tab === 'dwv' ? 'DWV / CI' : tab === 'copper' ? 'Cop / Gas' : tab === 'fixtures' ? 'Fixtures' : 'Labor'}
              </button>
            ))}
          </div>

          <div className="p-3 bg-white border-b border-slate-200">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                placeholder="Search materials..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-2">
            {filteredCatalog.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => addFromCatalog(item)}
                className="w-full text-left bg-white p-3 rounded-lg border border-slate-200 shadow-sm hover:border-blue-300 transition-colors group flex items-center justify-between cursor-pointer"
              >
                <div>
                  <div className="font-bold text-slate-800 text-sm leading-tight">{item.item}</div>
                  <div className="text-xs text-slate-500 mt-1">
                    {item.size} •{' '}
                    <span className="font-semibold text-emerald-600">
                      ${item.price.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                  <Plus className="w-4 h-4" />
                </div>
              </button>
            ))}
            {filteredCatalog.length === 0 && (
              <div className="text-center p-4 text-sm text-slate-500">No items found.</div>
            )}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col h-full p-4 overflow-hidden">
        <div className="flex gap-4 mb-6">
          <input
            value={projectName}
            onChange={e => setProjectName(e.target.value)}
            placeholder="Project name"
            className="border border-slate-300 rounded-lg p-2.5 flex-1 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow font-semibold text-lg"
          />
          <input
            value={clientName}
            onChange={e => setClientName(e.target.value)}
            placeholder="Builder / Client"
            className="border border-slate-300 rounded-lg p-2.5 w-72 focus:ring-2 focus:ring-blue-500 outline-none transition-shadow text-lg"
          />
        </div>

        <div className="space-y-3 flex-1 overflow-y-auto pr-2 pb-4">
          <div className="grid grid-cols-12 gap-2 px-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
            <div className="col-span-2">Size</div>
            <div className="col-span-5">Item Description</div>
            <div className="col-span-1 text-center">Qty</div>
            <div className="col-span-2">Unit Price</div>
            <div className="col-span-1 text-right">Total</div>
            <div className="col-span-1" />
          </div>

          {lines.length === 0 && (
            <div className="text-center py-12 text-slate-400 border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
              <BookOpen className="w-8 h-8 mx-auto mb-3 text-slate-300" />
              <p>Your estimate is empty.</p>
              <p className="text-sm mt-1">Select items from the Price Book to add them.</p>
            </div>
          )}

          {lines.map(line => (
            <div
              key={line.id}
              className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200 group hover:border-blue-300 transition-colors"
            >
              <input
                className="col-span-2 border border-slate-200 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                value={line.size}
                onChange={e => updateLine(line.id, { size: e.target.value })}
                placeholder="Size"
              />
              <input
                className="col-span-5 border border-slate-200 rounded p-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white font-medium"
                value={line.item}
                onChange={e => updateLine(line.id, { item: e.target.value })}
                placeholder="Description"
              />
              <input
                type="number"
                className="col-span-1 border border-slate-200 rounded p-2 text-center focus:ring-2 focus:ring-blue-500 outline-none bg-white font-bold"
                value={line.qty}
                onChange={e => updateLine(line.id, { qty: Number(e.target.value) })}
                min={0}
              />
              <div className="col-span-2 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-medium">
                  $
                </span>
                <input
                  type="number"
                  className="w-full border border-slate-200 rounded py-2 pl-7 pr-2 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                  value={line.unit_price}
                  onChange={e => updateLine(line.id, { unit_price: Number(e.target.value) })}
                  min={0}
                  step="0.01"
                />
              </div>
              <div className="col-span-1 text-right font-bold text-slate-700">
                ${(line.qty * line.unit_price).toFixed(2)}
              </div>
              <div className="col-span-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}

          <div className="flex gap-2 mt-4 pt-2">
            {!isCatalogOpen && (
              <button
                type="button"
                onClick={() => setIsCatalogOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold rounded-lg transition-colors border border-blue-200"
              >
                <BookOpen className="w-4 h-4" /> Open Price Book
              </button>
            )}
            <button
              type="button"
              onClick={addLine}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg transition-colors border border-slate-300"
            >
              + Custom Line Item
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200 flex flex-wrap gap-3 items-center justify-between bg-white shrink-0">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSaveToProject()}
              disabled={loading}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50"
            >
              Save Estimate
            </button>
          </div>
          <div className="flex gap-4 items-center">
            <div className="text-xl font-black bg-slate-100 px-5 py-2.5 rounded-lg text-slate-900 border border-slate-200">
              Total: ${calcTotal().toFixed(2)}
            </div>
            <button
              type="button"
              onClick={() => setIsQuoteView(true)}
              className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-sm transition-all"
            >
              <FileText className="w-5 h-5" /> Generate Quote
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
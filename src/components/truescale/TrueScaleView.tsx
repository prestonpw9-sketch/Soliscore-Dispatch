import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { jsPDF } from 'jspdf';
import {
  Ruler, Move, Crosshair, Save, Printer, Download, Trash2, Undo2,
  ZoomIn, ZoomOut, Maximize, FileText, Loader2, ChevronDown, ChevronRight,
  Map as MapIcon, FolderOpen, RotateCcw, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';
import type { Job } from '@/lib/data';
import {
  groupBlueprintsByJob, parseBlueprintPath,
} from '@/lib/blueprints';
import {
  ARCH_SCALES, Calibration, DimLine, LengthUnit, Pt, TrueScaleDoc, TRUESCALE_COLORS,
  TRUESCALE_VERSION, dist, formatDecimalFeet, formatFeetInches, isTrueScaleEntry,
  loadTrueScaleDoc, manualCalibration, presetCalibration, realInchesForPixels,
  buildDocPath, saveTrueScaleDoc, toInches,
} from '@/lib/truescale';
import { loadPdf, PdfDoc, RenderedPage, renderImage, renderPdfPage } from '@/lib/pdfjs';
import TrueScaleCanvas, { TrueScaleCanvasHandle, Tool } from './TrueScaleCanvas';

interface Props {
  jobs: Job[];
}

interface BlueprintFile {
  id: string;
  name: string;
}

interface ActiveSource {
  path: string;      // storage object name in the blueprints bucket
  name: string;      // display name
}

const PLACEHOLDER = '.emptyFolderPlaceholder';
const IMAGE_RE = /\.(png|jpe?g|webp|gif)$/i;

function makeId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function baseDisplayName(name: string): string {
  return parseBlueprintPath(name).displayName.replace(/\.[^.]+$/, '');
}

const TrueScaleView: React.FC<Props> = ({ jobs }) => {
  const { canEdit, session } = useAuth();
  const { resolved } = useTheme();
  const dark = resolved === 'dark';

  // Blueprint browser
  const [files, setFiles] = useState<BlueprintFile[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Active document
  const [source, setSource] = useState<ActiveSource | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
  const [numPages, setNumPages] = useState(1);
  const [page, setPage] = useState(1);
  const [render, setRender] = useState<RenderedPage | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);

  // Annotations
  const [calibration, setCalibration] = useState<Calibration | null>(null);
  const [dimensions, setDimensions] = useState<DimLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Tools
  const [tool, setTool] = useState<Tool>('dimension');
  const [color, setColor] = useState(TRUESCALE_COLORS[0]);
  const [width, setWidth] = useState(3);

  // Calibration entry
  const [pendingCalib, setPendingCalib] = useState<{ a: Pt; b: Pt } | null>(null);
  const [calibValue, setCalibValue] = useState('');
  const [calibUnit, setCalibUnit] = useState<LengthUnit>('ft');

  // Save state
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const canvasRef = useRef<TrueScaleCanvasHandle>(null);

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // ── Blueprint list ─────────────────────────────────────────────────────────

  const fetchFiles = useCallback(async () => {
    setListLoading(true);
    const { data, error } = await supabase.storage
      .from('blueprints')
      .list('', { limit: 300, sortBy: { column: 'name', order: 'asc' } });
    if (!error) {
      const next = (data ?? [])
        .filter(f => f.name !== PLACEHOLDER && !isTrueScaleEntry(f.name))
        .map(f => ({ id: f.id, name: f.name })) as BlueprintFile[];
      setFiles(next);
    }
    setListLoading(false);
  }, []);

  useEffect(() => { void fetchFiles(); }, [fetchFiles]);

  const groups = useMemo(() => groupBlueprintsByJob(files, jobs), [files, jobs]);

  const toggleGroup = (key: string) =>
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  // ── Rendering a page ─────────────────────────────────────────────────────────

  const tryLoadSaved = useCallback(async (path: string, pageNum: number) => {
    const saved = await loadTrueScaleDoc(buildDocPath(path, pageNum));
    if (saved && saved.version === TRUESCALE_VERSION) {
      setCalibration(saved.calibration);
      setDimensions(saved.dimensions ?? []);
      setDirty(false);
      return true;
    }
    setCalibration(null);
    setDimensions([]);
    setDirty(false);
    return false;
  }, []);

  const renderPdfAt = useCallback(async (pdf: PdfDoc, pageNum: number) => {
    const r = await renderPdfPage(pdf, pageNum);
    setRender(r);
  }, []);

  const openBlueprint = useCallback(async (file: BlueprintFile) => {
    setDocLoading(true);
    setDocError(null);
    setSelectedId(null);
    try {
      const { data, error } = await supabase.storage.from('blueprints').download(file.name);
      if (error || !data) throw error ?? new Error('Download failed');
      const buf = await data.arrayBuffer();
      const lower = file.name.toLowerCase();
      setSource({ path: file.name, name: file.name });
      if (lower.endsWith('.pdf')) {
        const pdf = await loadPdf(buf);
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setPage(1);
        await renderPdfAt(pdf, 1);
      } else if (IMAGE_RE.test(lower)) {
        const url = URL.createObjectURL(data);
        const r = await renderImage(url);
        URL.revokeObjectURL(url);
        setPdfDoc(null);
        setNumPages(1);
        setPage(1);
        setRender(r);
      } else {
        throw new Error('Unsupported file type. TrueScale supports PDF and image blueprints.');
      }
      await tryLoadSaved(file.name, 1);
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Could not open blueprint.');
      setRender(null);
      setSource(null);
    } finally {
      setDocLoading(false);
    }
  }, [renderPdfAt, tryLoadSaved]);

  const goToPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !source || pageNum < 1 || pageNum > numPages) return;
    setDocLoading(true);
    setSelectedId(null);
    try {
      setPage(pageNum);
      await renderPdfAt(pdfDoc, pageNum);
      await tryLoadSaved(source.path, pageNum);
    } finally {
      setDocLoading(false);
    }
  }, [pdfDoc, source, numPages, renderPdfAt, tryLoadSaved]);

  // ── Drawing callbacks ────────────────────────────────────────────────────────

  const handleDrawCalibration = useCallback((a: Pt, b: Pt) => {
    setPendingCalib({ a, b });
    setCalibValue('');
  }, []);

  const confirmCalibration = () => {
    const value = parseFloat(calibValue);
    if (!pendingCalib || !Number.isFinite(value) || value <= 0) return;
    const cal = manualCalibration(pendingCalib.a, pendingCalib.b, toInches(value, calibUnit));
    if (!cal) return;
    setCalibration(cal);
    setPendingCalib(null);
    setDirty(true);
    setTool('dimension');
    flash('Scale set — now draw dimensions.');
  };

  const applyPreset = (label: string) => {
    if (!label) return;
    const scale = ARCH_SCALES.find(s => s.label === label);
    if (!scale) return;
    const cal = presetCalibration(scale, render?.pxPerInch);
    if (!cal) {
      flash('Standard scales need a PDF at its true page size. Use Set Scale instead.');
      return;
    }
    setCalibration(cal);
    setSelectedId(null);
    setDirty(true);
    flash(`Scale set: ${scale.label}`);
  };

  const handleAddDimension = useCallback((a: Pt, b: Pt) => {
    setDimensions(prev => [...prev, { id: makeId(), a, b, color, width }]);
    setDirty(true);
  }, [color, width]);

  const deleteSelected = () => {
    if (!selectedId) return;
    setDimensions(prev => prev.filter(d => d.id !== selectedId));
    setSelectedId(null);
    setDirty(true);
  };

  const undoLast = () => {
    setDimensions(prev => prev.slice(0, -1));
    setSelectedId(null);
    setDirty(true);
  };

  const clearAll = () => {
    setDimensions([]);
    setCalibration(null);
    setSelectedId(null);
    setDirty(true);
  };

  // Keyboard: delete selected
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        deleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // ── Save / export / print ────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!source) return;
    setSaving(true);
    try {
      const doc: TrueScaleDoc = {
        version: TRUESCALE_VERSION,
        sourcePath: source.path,
        sourceName: source.name,
        page,
        calibration,
        dimensions,
        savedAt: new Date().toISOString(),
        savedBy: session?.user?.email ?? undefined,
      };
      await saveTrueScaleDoc(doc);
      setDirty(false);
      flash('TrueScale drawing saved.');
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const revert = async () => {
    if (!source) return;
    await tryLoadSaved(source.path, page);
    setSelectedId(null);
    flash('Reverted to last saved.');
  };

  const exportPdf = () => {
    const c = canvasRef.current?.exportToCanvas();
    if (!c || !source) return;
    const img = c.toDataURL('image/jpeg', 0.92);
    const pdf = new jsPDF({ unit: 'pt', format: [c.width, c.height] });
    pdf.addImage(img, 'JPEG', 0, 0, c.width, c.height);
    pdf.save(`${baseDisplayName(source.name)}-truescale.pdf`);
    flash('Exported PDF.');
  };

  const printSheet = () => {
    const c = canvasRef.current?.exportToCanvas();
    if (!c) return;
    const url = c.toDataURL('image/png');
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>TrueScale — ${source ? baseDisplayName(source.name) : 'plan'}</title>
      <style>@page{margin:8mm} html,body{margin:0} img{width:100%;height:auto;display:block}</style></head>
      <body><img src="${url}" onload="setTimeout(function(){window.print()},150)"/></body></html>`);
    w.document.close();
  };

  // ── Derived UI ────────────────────────────────────────────────────────────────

  const selected = dimensions.find(d => d.id === selectedId) ?? null;
  const selectedInches = selected
    ? realInchesForPixels(calibration, dist(selected.a, selected.b))
    : null;

  const toolBtn = (key: Tool, icon: React.ReactNode, label: string) => (
    <button
      type="button"
      onClick={() => setTool(key)}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
        tool === key
          ? 'bg-blue-600 text-white'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
      }`}
    >
      {icon}<span className="hidden xl:inline">{label}</span>
    </button>
  );

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[calc(100vh-8.5rem)] min-h-[520px]">
      {/* ── Sidebar: blueprint picker ── */}
      <aside className="lg:w-72 shrink-0 flex flex-col bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2">
          <MapIcon className="w-4 h-4 text-blue-500" />
          <h2 className="font-black text-slate-900 dark:text-white text-sm">Blueprints</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {listLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-blue-500" /></div>
          ) : groups.length === 0 ? (
            <p className="text-xs text-slate-400 text-center px-4 py-10">
              No blueprints found. Upload plans from the Dispatch board first.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groups.map(group => {
                const open = expanded.has(group.key);
                return (
                  <div key={group.key || 'unassigned'}>
                    <button
                      type="button"
                      onClick={() => toggleGroup(group.key)}
                      className="w-full flex items-center gap-1.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <span className="font-bold text-xs text-slate-800 dark:text-white truncate flex-1">{group.label}</span>
                      <span className="text-[10px] text-slate-400">{group.files.length}</span>
                    </button>
                    {open && (
                      <div className="pb-1">
                        {group.files.map(file => {
                          const active = source?.path === file.name;
                          return (
                            <button
                              key={file.id || file.name}
                              type="button"
                              onClick={() => void openBlueprint(file)}
                              className={`w-full flex items-center gap-2 pl-9 pr-3 py-2 text-left text-xs transition-colors ${
                                active
                                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                              }`}
                            >
                              <FileText className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">{parseBlueprintPath(file.name).displayName}</span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </aside>

      {/* ── Main stage ── */}
      <section className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 border-b border-slate-100 dark:border-slate-800">
          {toolBtn('dimension', <Ruler className="w-4 h-4" />, 'Dimension')}
          {toolBtn('calibrate', <Crosshair className="w-4 h-4" />, 'Set Scale')}
          {toolBtn('pan', <Move className="w-4 h-4" />, 'Pan / Select')}

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* Standard architectural scale preset */}
          <select
            value={calibration?.source === 'preset' ? calibration.label : ''}
            onChange={e => applyPreset(e.target.value)}
            disabled={!render || !render.pxPerInch}
            title={render && !render.pxPerInch
              ? 'Standard scales require a PDF at true page size (images have no physical size). Use Set Scale.'
              : 'Apply a standard architectural drawing scale'}
            className="px-2.5 py-2 rounded-lg text-sm font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
          >
            <option value="">Standard scale…</option>
            {ARCH_SCALES.map(s => (
              <option key={s.label} value={s.label}>{s.label}</option>
            ))}
          </select>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* Color palette */}
          <div className="flex items-center gap-1">
            {TRUESCALE_COLORS.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setColor(c);
                  if (selectedId) {
                    setDimensions(prev => prev.map(d => d.id === selectedId ? { ...d, color: c } : d));
                    setDirty(true);
                  }
                }}
                title={c}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${color === c ? 'scale-115 border-slate-900 dark:border-white' : 'border-slate-200 dark:border-slate-700'}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          {/* Line weight */}
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
            Weight
            <input
              type="range" min={1} max={8} value={width}
              onChange={e => {
                const w = Number(e.target.value);
                setWidth(w);
                if (selectedId) {
                  setDimensions(prev => prev.map(d => d.id === selectedId ? { ...d, width: w } : d));
                  setDirty(true);
                }
              }}
              className="w-16 accent-blue-600"
            />
          </label>

          <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

          <button type="button" onClick={undoLast} disabled={!dimensions.length} title="Undo last"
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40">
            <Undo2 className="w-4 h-4" />
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selectedId} title="Delete selected"
            className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-40">
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => canvasRef.current?.zoomBy(1 / 1.2)} title="Zoom out"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><ZoomOut className="w-4 h-4" /></button>
            <button type="button" onClick={() => canvasRef.current?.fit()} title="Fit to screen"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><Maximize className="w-4 h-4" /></button>
            <button type="button" onClick={() => canvasRef.current?.zoomBy(1.2)} title="Zoom in"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"><ZoomIn className="w-4 h-4" /></button>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />

            {canEdit && (
              <>
                <button type="button" onClick={() => void handleSave()} disabled={!source || saving || !dirty} title="Save to cloud"
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-bold hover:bg-blue-500 disabled:opacity-40">
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span className="hidden xl:inline">{dirty ? 'Save' : 'Saved'}</span>
                </button>
                <button type="button" onClick={() => void revert()} disabled={!source || !dirty} title="Revert to saved"
                  className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"><RotateCcw className="w-4 h-4" /></button>
              </>
            )}
            <button type="button" onClick={exportPdf} disabled={!render} title="Export PDF"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"><Download className="w-4 h-4" /></button>
            <button type="button" onClick={printSheet} disabled={!render} title="Print"
              className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40"><Printer className="w-4 h-4" /></button>
          </div>
        </div>

        {/* Status bar */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-1.5 text-xs border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
          {calibration ? (
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
              <Check className="w-3.5 h-3.5" /> Scale: {calibration.label}
              {calibration.source === 'preset' ? ' (standard)' : ''}
            </span>
          ) : (
            <span className="font-semibold text-amber-600 dark:text-amber-400">
              Not calibrated — use “Set Scale” over a known dimension first.
            </span>
          )}
          {selected && (
            <span className="font-bold text-slate-700 dark:text-slate-200">
              Selected: {selectedInches != null ? `${formatFeetInches(selectedInches)}  (${formatDecimalFeet(selectedInches)})` : `${Math.round(dist(selected.a, selected.b))} px`}
            </span>
          )}
          <span className="text-slate-400">{dimensions.length} dimension{dimensions.length !== 1 ? 's' : ''}</span>
          {pdfDoc && numPages > 1 && (
            <span className="ml-auto flex items-center gap-2">
              <button type="button" onClick={() => void goToPage(page - 1)} disabled={page <= 1}
                className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 disabled:opacity-40">Prev</button>
              Page {page} / {numPages}
              <button type="button" onClick={() => void goToPage(page + 1)} disabled={page >= numPages}
                className="px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 disabled:opacity-40">Next</button>
            </span>
          )}
        </div>

        {/* Canvas area */}
        <div className="relative flex-1 min-h-0 bg-slate-200 dark:bg-slate-950">
          {!source && !docLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-3">
              <FolderOpen className="w-12 h-12 opacity-30" />
              <p className="text-sm font-medium">Select a blueprint from the left to start measuring.</p>
            </div>
          )}
          {docError && (
            <div className="absolute inset-0 flex items-center justify-center p-6">
              <p className="text-sm font-semibold text-red-600 text-center">{docError}</p>
            </div>
          )}
          {docLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/10">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          )}
          {render && (
            <TrueScaleCanvas
              ref={canvasRef}
              base={render.canvas}
              baseWidth={render.width}
              baseHeight={render.height}
              tool={tool}
              calibration={calibration}
              dimensions={dimensions}
              selectedId={selectedId}
              activeColor={color}
              activeWidth={width}
              dark={dark}
              onDrawCalibration={handleDrawCalibration}
              onAddDimension={handleAddDimension}
              onSelect={setSelectedId}
            />
          )}

          {/* Calibration input overlay */}
          {pendingCalib && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4"
              onClick={e => { if (e.target === e.currentTarget) setPendingCalib(null); }}>
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-5 w-full max-w-sm border border-slate-200 dark:border-slate-800">
                <h3 className="font-black text-slate-900 dark:text-white mb-1">Set Scale</h3>
                <p className="text-xs text-slate-500 mb-4">
                  Enter the real-world length of the line you just drew. Everything else scales from this.
                </p>
                <div className="flex gap-2">
                  <input
                    autoFocus
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    value={calibValue}
                    onChange={e => setCalibValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') confirmCalibration(); }}
                    placeholder="e.g. 10"
                    className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <select
                    value={calibUnit}
                    onChange={e => setCalibUnit(e.target.value as LengthUnit)}
                    className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
                  >
                    <option value="ft">feet</option>
                    <option value="in">inches</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button type="button" onClick={() => setPendingCalib(null)}
                    className="px-3 py-2 rounded-lg text-sm font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Cancel</button>
                  <button type="button" onClick={confirmCalibration}
                    className="px-4 py-2 rounded-lg text-sm font-bold bg-blue-600 text-white hover:bg-blue-500">Set Scale</button>
                </div>
              </div>
            </div>
          )}

          {toast && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900 text-white text-sm font-medium px-4 py-2 rounded-lg shadow-lg pointer-events-none">
              {toast}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default TrueScaleView;

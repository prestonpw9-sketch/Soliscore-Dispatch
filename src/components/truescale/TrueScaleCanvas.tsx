import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Calibration, DimLine, Pt } from '@/lib/truescale';
import {
  needsPdfLens,
  pdfLensExtra,
  startPdfLensRender,
  type PdfLensSource,
} from '@/lib/pdfjs';
import { paintScene, Preview } from './scenePainter';

export type Tool = 'pan' | 'calibrate' | 'dimension';

export interface TrueScaleCanvasHandle {
  /** Composite the plan + annotations to a base-resolution canvas (for export/print). */
  exportToCanvas: () => HTMLCanvasElement | null;
  fit: () => void;
  zoomBy: (factor: number) => void;
}

interface Props {
  base: HTMLCanvasElement | null;
  baseWidth: number;
  baseHeight: number;
  tool: Tool;
  calibration: Calibration | null;
  dimensions: DimLine[];
  selectedId: string | null;
  activeColor: string;
  activeWidth: number;
  dark: boolean;
  /** When false, dimensions can be dragged (moved/edited) with the Pan/Select tool. */
  locked: boolean;
  /** Live PDF page — used to re-render the zoomed viewport at screen density. */
  pdfLens?: PdfLensSource | null;
  onDrawCalibration: (a: Pt, b: Pt) => void;
  onAddDimension: (a: Pt, b: Pt) => void;
  onSelect: (id: string | null) => void;
  onMoveDimension: (id: string, a: Pt, b: Pt) => void;
}

interface LensTile {
  canvas: HTMLCanvasElement;
  pdf: PdfLensSource['pdf'];
  pageNumber: number;
  pdfScale: number;
  scale: number;
  ox: number;
  oy: number;
  cssW: number;
  cssH: number;
}

function pointSegDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

const MIN_DRAG_PX = 10;

const TrueScaleCanvas = forwardRef<TrueScaleCanvasHandle, Props>(function TrueScaleCanvas(
  props,
  ref,
) {
  const {
    base, baseWidth, baseHeight, tool, calibration, dimensions, selectedId,
    activeColor, activeWidth, dark, locked, pdfLens,
    onDrawCalibration, onAddDimension, onSelect, onMoveDimension,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [lensTile, setLensTile] = useState<LensTile | null>(null);
  const [lensPending, setLensPending] = useState(false);

  // Interaction refs (avoid re-renders mid-gesture)
  const panning = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const drawing = useRef<{ start: Pt } | null>(null);
  const downScreen = useRef<Pt | null>(null);
  // Click-to-place: first click arms this; the next click sets the far endpoint.
  const pendingStart = useRef<Pt | null>(null);
  // Dragging an existing dimension (endpoint or whole line) when unlocked.
  const moving = useRef<
    { id: string; mode: 'a' | 'b' | 'line'; startImg: Pt; origA: Pt; origB: Pt } | null
  >(null);
  // Edge auto-pan while drawing (so long measurements can extend past the view).
  const autoPanRAF = useRef<number | null>(null);
  const lastScreen = useRef<Pt | null>(null);
  const viewRef = useRef({ scale, offset });
  useEffect(() => { viewRef.current = { scale, offset }; }, [scale, offset]);

  const toImage = useCallback(
    (s: Pt): Pt => ({ x: (s.x - offset.x) / scale, y: (s.y - offset.y) / scale }),
    [offset, scale],
  );
  const toScreen = useCallback(
    (p: Pt): Pt => ({ x: p.x * scale + offset.x, y: p.y * scale + offset.y }),
    [offset, scale],
  );

  const fit = useCallback(() => {
    if (!baseWidth || !baseHeight || !size.w || !size.h) return;
    const s = Math.min(size.w / baseWidth, size.h / baseHeight) * 0.95;
    const ns = s > 0 ? s : 1;
    setScale(ns);
    setOffset({
      x: (size.w - baseWidth * ns) / 2,
      y: (size.h - baseHeight * ns) / 2,
    });
  }, [baseWidth, baseHeight, size]);

  // Fit whenever a new base image is loaded or container first sizes up.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, baseWidth, baseHeight]);

  // Hold SPACE to grab/pan the plan regardless of the active tool (like Figma/Bluebeam).
  useEffect(() => {
    const isTextField = (el: EventTarget | null) => {
      const t = el as HTMLElement | null;
      return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    };
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !isTextField(e.target)) {
        e.preventDefault();
        setSpaceDown(true);
      }
    };
    const ku = (e: KeyboardEvent) => { if (e.code === 'Space') setSpaceDown(false); };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        pendingStart.current = null;
        drawing.current = null;
        moving.current = null;
        setPreview(null);
        setPlacing(false);
      }
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('keydown', esc);
    };
  }, []);

  // Cancel any in-progress placement when the tool changes.
  useEffect(() => {
    pendingStart.current = null;
    drawing.current = null;
    moving.current = null;
    setPreview(null);
    setPlacing(false);
  }, [tool]);

  // Track container size
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const cr = entries[0].contentRect;
      setSize({ w: cr.width, h: cr.height });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  // Paint
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size.w || !size.h) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size.w * dpr);
    canvas.height = Math.round(size.h * dpr);
    canvas.style.width = `${size.w}px`;
    canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const lensMatches = !!(
      lensTile &&
      pdfLens &&
      lensTile.pdf === pdfLens.pdf &&
      lensTile.pageNumber === pdfLens.pageNumber &&
      lensTile.pdfScale === pdfLens.pdfScale &&
      Math.abs(lensTile.scale - scale) < 1e-6 &&
      Math.abs(lensTile.ox - offset.x) < 0.5 &&
      Math.abs(lensTile.oy - offset.y) < 0.5 &&
      lensTile.cssW === size.w &&
      lensTile.cssH === size.h
    );
    paintScene(ctx, {
      base, baseWidth, baseHeight,
      project: toScreen,
      scale, offset,
      calibration, dimensions, selectedId, preview,
      sizeScale: 1,
      background: dark ? '#0b1220' : '#e2e8f0',
      editable: !locked,
      smoothPlan: scale * dpr <= 1.02,
      lens: lensMatches && lensTile ? lensTile.canvas : null,
    });
  }, [base, baseWidth, baseHeight, scale, offset, calibration, dimensions, selectedId, preview, size, dark, locked, toScreen, lensTile, pdfLens]);

  // Re-render the visible PDF region at screen density after zoom/pan settles.
  useEffect(() => {
    if (!pdfLens || !size.w || !size.h) {
      setLensPending(false);
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    if (!needsPdfLens(scale, dpr)) {
      setLensTile(null);
      setLensPending(false);
      return;
    }

    const region = {
      x: -offset.x / scale,
      y: -offset.y / scale,
      w: size.w / scale,
      h: size.h / scale,
    };
    const extra = pdfLensExtra(scale, dpr, region.w, region.h);
    const view = { scale, ox: offset.x, oy: offset.y, cssW: size.w, cssH: size.h };

    let cancelled = false;
    let cleanupJob: (() => void) | null = null;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setLensPending(true);
      const job = startPdfLensRender(pdfLens, region, extra);
      cleanupJob = job.cancel;
      job.promise.then(() => {
        if (cancelled) return;
        setLensTile({
          canvas: job.canvas,
          pdf: pdfLens.pdf,
          pageNumber: pdfLens.pageNumber,
          pdfScale: pdfLens.pdfScale,
          ...view,
        });
        setLensPending(false);
      }).catch((err) => {
        if (!cancelled) setLensPending(false);
        const name = err && typeof err === 'object' && 'name' in err ? String((err as { name?: string }).name) : '';
        if (name !== 'RenderingCancelledException') {
          console.warn('TrueScale PDF lens failed', err);
        }
      });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      cleanupJob?.();
    };
  }, [pdfLens, scale, offset, size, base]);

  useImperativeHandle(ref, () => ({
    fit,
    zoomBy: (factor: number) => {
      const cx = size.w / 2;
      const cy = size.h / 2;
      setScale(prev => {
        const ns = Math.max(0.05, Math.min(40, prev * factor));
        setOffset(o => ({
          x: cx - ((cx - o.x) / prev) * ns,
          y: cy - ((cy - o.y) / prev) * ns,
        }));
        return ns;
      });
    },
    exportToCanvas: () => {
      if (!base) return null;
      const out = document.createElement('canvas');
      out.width = baseWidth;
      out.height = baseHeight;
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      paintScene(ctx, {
        base, baseWidth, baseHeight,
        project: (p: Pt) => p,
        scale: 1,
        offset: { x: 0, y: 0 },
        calibration, dimensions, selectedId: null, preview: null,
        sizeScale: Math.max(1, baseWidth / 1100),
        background: '#ffffff',
        editable: false,
        smoothPlan: true,
      });
      return out;
    },
  }), [base, baseWidth, baseHeight, calibration, dimensions, fit, size]);

  // ── Pointer handlers ───────────────────────────────────────────────────────

  const getScreen = (e: React.PointerEvent): Pt => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const AUTOPAN_MARGIN = 56;
  const AUTOPAN_MAX = 16;

  const stopAutoPan = () => {
    if (autoPanRAF.current != null) {
      cancelAnimationFrame(autoPanRAF.current);
      autoPanRAF.current = null;
    }
  };

  // One auto-pan frame: shift the view toward whichever edge the cursor is near,
  // and extend the in-progress line's endpoint into the newly revealed area.
  const autoPanStep = () => {
    const el = containerRef.current;
    const p = lastScreen.current;
    const drawingActive = drawing.current != null || pendingStart.current != null;
    if (!el || !p || !drawingActive) { stopAutoPan(); return; }
    const w = el.clientWidth;
    const h = el.clientHeight;
    const clamp = (v: number) => Math.max(-AUTOPAN_MAX, Math.min(AUTOPAN_MAX, v));
    let dx = 0;
    let dy = 0;
    if (p.x < AUTOPAN_MARGIN) dx = clamp(((AUTOPAN_MARGIN - p.x) / AUTOPAN_MARGIN) * AUTOPAN_MAX);
    else if (p.x > w - AUTOPAN_MARGIN) dx = clamp(-((p.x - (w - AUTOPAN_MARGIN)) / AUTOPAN_MARGIN) * AUTOPAN_MAX);
    if (p.y < AUTOPAN_MARGIN) dy = clamp(((AUTOPAN_MARGIN - p.y) / AUTOPAN_MARGIN) * AUTOPAN_MAX);
    else if (p.y > h - AUTOPAN_MARGIN) dy = clamp(-((p.y - (h - AUTOPAN_MARGIN)) / AUTOPAN_MARGIN) * AUTOPAN_MAX);
    if (dx === 0 && dy === 0) { stopAutoPan(); return; }

    const cur = viewRef.current;
    const no = { x: cur.offset.x + dx, y: cur.offset.y + dy };
    viewRef.current = { scale: cur.scale, offset: no };
    setOffset(no);
    setPreview(prev =>
      prev ? { ...prev, b: { x: (p.x - no.x) / cur.scale, y: (p.y - no.y) / cur.scale } } : prev,
    );
    autoPanRAF.current = requestAnimationFrame(autoPanStep);
  };

  const maybeAutoPan = (p: Pt) => {
    const el = containerRef.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const near =
      p.x < AUTOPAN_MARGIN || p.x > w - AUTOPAN_MARGIN ||
      p.y < AUTOPAN_MARGIN || p.y > h - AUTOPAN_MARGIN;
    if (near) {
      if (autoPanRAF.current == null) autoPanRAF.current = requestAnimationFrame(autoPanStep);
    } else {
      stopAutoPan();
    }
  };

  useEffect(() => () => stopAutoPan(), []);

  const previewKind = () => (tool === 'calibrate' ? 'calibrate' : 'dimension');

  const finalizeLine = (a: Pt, b: Pt) => {
    const px = Math.hypot(b.x - a.x, b.y - a.y);
    if (px < 2) return;
    if (tool === 'calibrate') onDrawCalibration(a, b);
    else onAddDimension(a, b);
  };

  // Pick an existing dimension (endpoint handle or body) to drag when unlocked.
  const pickMoveTarget = (s: Pt): typeof moving.current => {
    const HANDLE = 12;
    for (const line of dimensions) {
      if (Math.hypot(s.x - toScreen(line.a).x, s.y - toScreen(line.a).y) <= HANDLE)
        return { id: line.id, mode: 'a', startImg: toImage(s), origA: line.a, origB: line.b };
      if (Math.hypot(s.x - toScreen(line.b).x, s.y - toScreen(line.b).y) <= HANDLE)
        return { id: line.id, mode: 'b', startImg: toImage(s), origA: line.a, origB: line.b };
    }
    const id = hitTest(s);
    if (id) {
      const line = dimensions.find(d => d.id === id)!;
      return { id, mode: 'line', startImg: toImage(s), origA: line.a, origB: line.b };
    }
    return null;
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.button !== 1) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const s = getScreen(e);
    downScreen.current = s;

    // Pan the plan: Pan tool, middle-mouse, or SPACE held — always available.
    if (tool === 'pan' || e.button === 1 || spaceDown) {
      // In Pan/Select while UNLOCKED, a left-press on a dimension grabs it to move.
      if (tool === 'pan' && !spaceDown && e.button === 0 && !locked) {
        const target = pickMoveTarget(s);
        if (target) {
          moving.current = target;
          onSelect(target.id);
          setGrabbing(true);
          return;
        }
      }
      panning.current = { startX: s.x, startY: s.y, ox: offset.x, oy: offset.y };
      setGrabbing(true);
      return;
    }

    // Draw tools (dimension/calibrate). A first click is already armed — the
    // next pointer-up finalizes. Do not start a new press-drag on this down.
    if (pendingStart.current == null) {
      const start = toImage(s);
      drawing.current = { start };
      setPreview({ a: start, b: start, color: activeColor, width: activeWidth, kind: previewKind() });
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = getScreen(e);
    if (moving.current) {
      const cur = toImage(s);
      const m = moving.current;
      if (m.mode === 'a') onMoveDimension(m.id, cur, m.origB);
      else if (m.mode === 'b') onMoveDimension(m.id, m.origA, cur);
      else {
        const dx = cur.x - m.startImg.x;
        const dy = cur.y - m.startImg.y;
        onMoveDimension(
          m.id,
          { x: m.origA.x + dx, y: m.origA.y + dy },
          { x: m.origB.x + dx, y: m.origB.y + dy },
        );
      }
      return;
    }
    if (panning.current) {
      setOffset({
        x: panning.current.ox + (s.x - panning.current.startX),
        y: panning.current.oy + (s.y - panning.current.startY),
      });
      return;
    }
    const anchor = drawing.current?.start ?? pendingStart.current;
    if (anchor) {
      lastScreen.current = s;
      setPreview({ a: anchor, b: toImage(s), color: activeColor, width: activeWidth, kind: previewKind() });
      maybeAutoPan(s);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const s = getScreen(e);
    const down = downScreen.current;
    const moved = down ? Math.hypot(s.x - down.x, s.y - down.y) : 0;

    if (moving.current) {
      moving.current = null;
      setGrabbing(false);
      downScreen.current = null;
      return;
    }

    if (panning.current) {
      panning.current = null;
      setGrabbing(false);
      // A pan tool "click" (no real drag) = selection hit-test / deselect.
      if (tool === 'pan' && !spaceDown && moved < MIN_DRAG_PX) {
        onSelect(hitTest(s));
      }
      downScreen.current = null;
      return;
    }

    // Second click of a click-to-place sequence: finalize at this point.
    // Do not treat pointerleave as this click — leaving the canvas must not
    // cancel an armed first point (that is why click-to-place felt broken).
    if (pendingStart.current != null) {
      const a = pendingStart.current;
      const b = toImage(s);
      pendingStart.current = null;
      stopAutoPan();
      lastScreen.current = null;
      downScreen.current = null;
      setPreview(null);
      setPlacing(false);
      finalizeLine(a, b);
      return;
    }

    if (drawing.current) {
      const a = drawing.current.start;
      const b = toImage(s);
      drawing.current = null;
      if (moved >= MIN_DRAG_PX) {
        // Dragged: finalize immediately (press-drag-release).
        stopAutoPan();
        lastScreen.current = null;
        downScreen.current = null;
        setPreview(null);
        setPlacing(false);
        finalizeLine(a, b);
      } else {
        // Clicked: arm the first endpoint. The rubber-band then follows the
        // cursor on hover — no need to keep the button down.
        pendingStart.current = a;
        setPreview({ a, b: a, color: activeColor, width: activeWidth, kind: previewKind() });
        setPlacing(true);
        downScreen.current = null;
      }
    }
  };

  /** Abort a press-drag / pan if the pointer is cancelled. Keep an armed click. */
  const handlePointerCancel = () => {
    drawing.current = null;
    panning.current = null;
    moving.current = null;
    setGrabbing(false);
    downScreen.current = null;
    stopAutoPan();
    if (pendingStart.current) {
      const a = pendingStart.current;
      setPreview({ a, b: a, color: activeColor, width: activeWidth, kind: previewKind() });
    } else {
      setPreview(null);
      setPlacing(false);
    }
  };

  const hitTest = (screen: Pt): string | null => {
    let best: { id: string; d: number } | null = null;
    for (const line of dimensions) {
      const d = pointSegDist(screen, toScreen(line.a), toScreen(line.b));
      if (d <= 10 && (!best || d < best.d)) best = { id: line.id, d };
    }
    return best?.id ?? null;
  };

  // Native wheel listener so preventDefault actually stops page scroll (React's
  // onWheel is passive in modern Chrome).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      setScale(prev => {
        const ns = Math.max(0.05, Math.min(40, prev * factor));
        setOffset(o => ({
          x: cx - ((cx - o.x) / prev) * ns,
          y: cy - ((cy - o.y) / prev) * ns,
        }));
        return ns;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const cursor = grabbing
    ? 'grabbing'
    : spaceDown
      ? 'grab'
      : tool === 'pan'
        ? (locked ? 'grab' : 'move')
        : 'crosshair';

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden rounded-xl">
      <canvas
        ref={canvasRef}
        className="absolute inset-0 touch-none select-none"
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />
      {placing && (tool === 'dimension' || tool === 'calibrate') && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-900/80 text-white text-xs font-semibold shadow-lg">
          Click the other end · Esc to cancel
        </div>
      )}
      {lensPending && !placing && (
        <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full bg-slate-900/70 text-white/90 text-[11px] font-semibold shadow-lg">
          Sharpening linework…
        </div>
      )}
      <div className="pointer-events-none absolute top-3 right-3 px-2.5 py-1 rounded-full bg-slate-900/70 text-white/90 text-[11px] font-semibold shadow-lg tabular-nums">
        {Math.round(scale * 100)}%
        {lensPending
          ? ' · …'
          : lensTile &&
              pdfLens &&
              lensTile.pdf === pdfLens.pdf &&
              lensTile.pageNumber === pdfLens.pageNumber &&
              Math.abs(lensTile.scale - scale) < 1e-6 &&
              Math.abs(lensTile.ox - offset.x) < 0.5 &&
              Math.abs(lensTile.oy - offset.y) < 0.5
            ? ' · sharp'
            : ''}
      </div>
    </div>
  );
});

export default TrueScaleCanvas;

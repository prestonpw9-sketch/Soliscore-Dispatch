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
  onDrawCalibration: (a: Pt, b: Pt) => void;
  onAddDimension: (a: Pt, b: Pt) => void;
  onSelect: (id: string | null) => void;
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

const MIN_DRAG_PX = 6;

const TrueScaleCanvas = forwardRef<TrueScaleCanvasHandle, Props>(function TrueScaleCanvas(
  props,
  ref,
) {
  const {
    base, baseWidth, baseHeight, tool, calibration, dimensions, selectedId,
    activeColor, activeWidth, dark, onDrawCalibration, onAddDimension, onSelect,
  } = props;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<Pt>({ x: 0, y: 0 });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [grabbing, setGrabbing] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  // Interaction refs (avoid re-renders mid-gesture)
  const panning = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const drawing = useRef<{ start: Pt } | null>(null);
  const downScreen = useRef<Pt | null>(null);
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
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
    };
  }, []);

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
    paintScene(ctx, {
      base, baseWidth, baseHeight,
      project: toScreen,
      scale, offset,
      calibration, dimensions, selectedId, preview,
      sizeScale: 1,
      background: dark ? '#0b1220' : '#e2e8f0',
    });
  }, [base, baseWidth, baseHeight, scale, offset, calibration, dimensions, selectedId, preview, size, dark, toScreen]);

  useImperativeHandle(ref, () => ({
    fit,
    zoomBy: (factor: number) => {
      const cx = size.w / 2;
      const cy = size.h / 2;
      setScale(prev => {
        const ns = Math.max(0.05, Math.min(20, prev * factor));
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
    if (!el || !p || !drawing.current) { stopAutoPan(); return; }
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

  const handlePointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const s = getScreen(e);
    downScreen.current = s;
    // Pan when the Pan tool is active, on middle-mouse, or while holding SPACE —
    // so you can always reposition/recenter the plan even mid-measurement.
    if (tool === 'pan' || e.button === 1 || spaceDown) {
      panning.current = { startX: s.x, startY: s.y, ox: offset.x, oy: offset.y };
      setGrabbing(true);
    } else {
      drawing.current = { start: toImage(s) };
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    const s = getScreen(e);
    if (panning.current) {
      setOffset({
        x: panning.current.ox + (s.x - panning.current.startX),
        y: panning.current.oy + (s.y - panning.current.startY),
      });
      return;
    }
    if (drawing.current) {
      lastScreen.current = s;
      setPreview({
        a: drawing.current.start,
        b: toImage(s),
        color: activeColor,
        width: activeWidth,
        kind: tool === 'calibrate' ? 'calibrate' : 'dimension',
      });
      maybeAutoPan(s);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    const s = getScreen(e);
    const down = downScreen.current;
    const moved = down ? Math.hypot(s.x - down.x, s.y - down.y) : 0;

    if (panning.current) {
      panning.current = null;
      setGrabbing(false);
      // A pan tool "click" (no real drag) = selection hit-test / deselect.
      if (tool === 'pan' && !spaceDown && moved < MIN_DRAG_PX) {
        const hit = hitTest(s);
        onSelect(hit);
      }
      downScreen.current = null;
      return;
    }

    if (drawing.current) {
      stopAutoPan();
      lastScreen.current = null;
      const a = drawing.current.start;
      const b = toImage(s);
      drawing.current = null;
      setPreview(null);
      downScreen.current = null;
      if (moved >= MIN_DRAG_PX) {
        if (tool === 'calibrate') onDrawCalibration(a, b);
        else onAddDimension(a, b);
      }
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

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const cx = e.clientX - rect.left;
    const cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setScale(prev => {
      const ns = Math.max(0.05, Math.min(20, prev * factor));
      setOffset(o => ({
        x: cx - ((cx - o.x) / prev) * ns,
        y: cy - ((cy - o.y) / prev) * ns,
      }));
      return ns;
    });
  };

  const cursor = grabbing
    ? 'grabbing'
    : tool === 'pan' || spaceDown
      ? 'grab'
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
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
      />
    </div>
  );
});

export default TrueScaleCanvas;

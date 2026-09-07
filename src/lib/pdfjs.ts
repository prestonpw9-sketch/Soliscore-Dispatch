// PDF.js configuration + thin render helpers for TrueScale.
// The worker is bundled by Vite via the `?url` import so it works in dev & prod.
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export type PdfDoc = Awaited<ReturnType<typeof pdfjsLib.getDocument>['promise']>;

export interface RenderedPage {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /**
   * Base image pixels per real paper inch, when the source has a true physical
   * size (PDFs). Enables standard-scale presets. Undefined for raster images.
   */
  pxPerInch?: number;
  /** pdf.js viewport scale used for the base canvas. Undefined for raster images. */
  pdfScale?: number;
}

/** Largest base-render width; overview canvas stays memory-bounded. */
const MAX_BASE_WIDTH = 4096;
/** Cap raster scans so a huge photo doesn't freeze the tab. */
const MAX_IMAGE_PIXELS = 16_000_000;
/** pdf.js scale ceiling for the overview bitmap (letter at 5× ≈ 3000px). */
const MAX_PDF_BASE_SCALE = 5;
/** Longest edge of a zoomed PDF viewport tile (GPU/canvas bound). */
const MAX_LENS_EDGE = 8192;
/** Area cap so a 5K retina viewport still renders. */
const MAX_LENS_PIXELS = 16_777_216;
/** Hairlines shorter than this many device pixels get boosted (Revu-style). */
const MIN_STROKE_DEVICE_PX = 1.25;

/** Load a PDF from raw bytes. Caller keeps the doc for page navigation. */
export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // Copy into a fresh Uint8Array — pdf.js detaches the buffer it's given.
  const bytes = new Uint8Array(data.slice(0));
  // enableHWA: GPU-backed 2D canvases for image masks / extra buffers (Chromium).
  return pdfjsLib.getDocument({ data: bytes, enableHWA: true }).promise;
}

export function pdfOverviewScale(unscaledWidth: number): number {
  return Math.min(MAX_BASE_WIDTH / unscaledWidth, MAX_PDF_BASE_SCALE);
}

/** Render a single (1-based) page into a detached canvas at base resolution. */
export async function renderPdfPage(pdf: PdfDoc, pageNumber: number): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = pdfOverviewScale(unscaled.width);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('Could not get 2D context for PDF render');

  await page.render({ canvasContext: ctx, viewport, background: '#ffffff' }).promise;
  // PDF user space is 1/72". At `scale`, base px per point = scale → px/inch = scale*72.
  return { canvas, width: canvas.width, height: canvas.height, pxPerInch: scale * 72, pdfScale: scale };
}

export interface PdfLensSource {
  pdf: PdfDoc;
  pageNumber: number;
  pdfScale: number;
}

export interface PdfLensRegion {
  /** Visible rectangle in overview-canvas (base) pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/** True when the on-screen view is stretching the overview bitmap. */
export function needsPdfLens(viewScale: number, dpr: number): boolean {
  return viewScale * dpr > 1;
}

/**
 * Device-pixel size of the vector tile for the current CSS viewport.
 * Matches the on-screen canvas so zoomed paths rasterize 1:1 (no stretch).
 */
export function pdfLensOutputSize(cssW: number, cssH: number, dpr: number): { w: number; h: number } {
  let w = Math.max(1, Math.round(cssW * dpr));
  let h = Math.max(1, Math.round(cssH * dpr));
  const edge = Math.max(w, h);
  if (edge > MAX_LENS_EDGE) {
    const k = MAX_LENS_EDGE / edge;
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  if (w * h > MAX_LENS_PIXELS) {
    const k = Math.sqrt(MAX_LENS_PIXELS / (w * h));
    w = Math.max(1, Math.round(w * k));
    h = Math.max(1, Math.round(h * k));
  }
  return { w, h };
}

/**
 * Boost hairline strokes to at least `minDevicePx` after the current transform,
 * similar to Revu's "Enhance Thin Lines".
 */
function installThinLineBoost(ctx: CanvasRenderingContext2D, minDevicePx: number): void {
  const stroke = ctx.stroke.bind(ctx);
  ctx.stroke = ((path?: Path2D) => {
    const t = ctx.getTransform();
    const s = Math.min(Math.hypot(t.a, t.b) || 1, Math.hypot(t.c, t.d) || 1);
    const prev = ctx.lineWidth;
    if (prev * s < minDevicePx) ctx.lineWidth = minDevicePx / s;
    try {
      return path ? stroke(path) : stroke();
    } finally {
      ctx.lineWidth = prev;
    }
  }) as CanvasRenderingContext2D['stroke'];
}

/**
 * Re-rasterize the visible PDF region into a viewport-sized tile at screen
 * density. Vector paths are recalculated at this zoom (not a stretched JPEG).
 */
export function startPdfLensRender(
  source: PdfLensSource,
  region: PdfLensRegion,
  outW: number,
  outH: number,
): { canvas: HTMLCanvasElement; promise: Promise<void>; cancel: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(outW));
  canvas.height = Math.max(1, Math.round(outH));
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  if (!ctx) throw new Error('Could not get 2D context for PDF lens');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  installThinLineBoost(ctx, MIN_STROKE_DEVICE_PX);

  const extraX = canvas.width / Math.max(region.w, 1e-6);
  const extraY = canvas.height / Math.max(region.h, 1e-6);

  let cancelled = false;
  let task: { cancel: () => void } | null = null;
  const promise = (async () => {
    const page = await source.pdf.getPage(source.pageNumber);
    if (cancelled) return;
    const viewport = page.getViewport({ scale: source.pdfScale });
    const transform = [
      extraX, 0, 0, extraY,
      -region.x * extraX,
      -region.y * extraY,
    ];
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      transform,
      background: '#ffffff',
      intent: 'display',
    });
    task = renderTask;
    await renderTask.promise;
  })();

  return {
    canvas,
    promise,
    cancel: () => {
      cancelled = true;
      try { task?.cancel(); } catch { /* already finished or never started */ }
    },
  };
}

/** Render a raster image (png/jpg) into a base canvas. */
export async function renderImage(blobUrl: string): Promise<RenderedPage> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = blobUrl;
  });
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  const scale = Math.min(1, MAX_BASE_WIDTH / nw, Math.sqrt(MAX_IMAGE_PIXELS / (nw * nh)));
  const w = Math.max(1, Math.round(nw * scale));
  const h = Math.max(1, Math.round(nh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for image render');
  ctx.imageSmoothingEnabled = scale < 1;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

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
/** Longest edge of a zoomed PDF lens tile (memory bound). */
const MAX_LENS_EDGE = 4096;

/** Load a PDF from raw bytes. Caller keeps the doc for page navigation. */
export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // Copy into a fresh Uint8Array — pdf.js detaches the buffer it's given.
  const bytes = new Uint8Array(data.slice(0));
  return pdfjsLib.getDocument({ data: bytes }).promise;
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
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for PDF render');

  await page.render({ canvasContext: ctx, viewport }).promise;
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
  return viewScale * dpr > 1.15;
}

export function pdfLensExtra(viewScale: number, dpr: number, srcW: number, srcH: number): number {
  let extra = viewScale * dpr;
  const edge = Math.max(srcW * extra, srcH * extra);
  if (edge > MAX_LENS_EDGE) extra *= MAX_LENS_EDGE / edge;
  return extra;
}

/**
 * Re-render the visible PDF region at screen density so zoomed linework stays
 * vector-sharp. Coordinates stay in overview-canvas space; this is display only.
 */
export function startPdfLensRender(
  source: PdfLensSource,
  region: PdfLensRegion,
  extra: number,
): { canvas: HTMLCanvasElement; promise: Promise<void>; cancel: () => void } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(region.w * extra));
  canvas.height = Math.max(1, Math.ceil(region.h * extra));
  const ctx = canvas.getContext('2d', { alpha: true });
  if (!ctx) throw new Error('Could not get 2D context for PDF lens');

  let cancelled = false;
  let task: { cancel: () => void } | null = null;
  const promise = (async () => {
    const page = await source.pdf.getPage(source.pageNumber);
    if (cancelled) return;
    const viewport = page.getViewport({ scale: source.pdfScale });
    const transform = [
      extra, 0, 0, extra,
      -region.x * extra,
      -region.y * extra,
    ];
    const renderTask = page.render({
      canvasContext: ctx,
      viewport,
      transform,
      background: 'rgba(0,0,0,0)',
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

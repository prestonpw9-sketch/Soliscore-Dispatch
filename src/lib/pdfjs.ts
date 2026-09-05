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
}

/** Largest base-render width; keeps zoomed-in plans crisp without huge memory. */
const MAX_BASE_WIDTH = 2200;

/** Load a PDF from raw bytes. Caller keeps the doc for page navigation. */
export async function loadPdf(data: ArrayBuffer): Promise<PdfDoc> {
  // Copy into a fresh Uint8Array — pdf.js detaches the buffer it's given.
  const bytes = new Uint8Array(data.slice(0));
  return pdfjsLib.getDocument({ data: bytes }).promise;
}

/** Render a single (1-based) page into a detached canvas at base resolution. */
export async function renderPdfPage(pdf: PdfDoc, pageNumber: number): Promise<RenderedPage> {
  const page = await pdf.getPage(pageNumber);
  const unscaled = page.getViewport({ scale: 1 });
  const scale = Math.min(MAX_BASE_WIDTH / unscaled.width, 3);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for PDF render');

  await page.render({ canvasContext: ctx, viewport }).promise;
  // PDF user space is 1/72". At `scale`, base px per point = scale → px/inch = scale*72.
  return { canvas, width: canvas.width, height: canvas.height, pxPerInch: scale * 72 };
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
  const w = Math.min(img.naturalWidth, MAX_BASE_WIDTH);
  const h = Math.round(img.naturalHeight * (w / img.naturalWidth));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D context for image render');
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, width: w, height: h };
}

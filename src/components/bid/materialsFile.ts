import { isNativeDispatchApp } from '@/lib/geofence/nativeClient';

export type PdfShareResult = 'shared' | 'cancelled' | 'unavailable';

function canShareFile(file: File): boolean {
  try {
    return navigator.canShare?.({ files: [file] }) === true;
  } catch {
    return false;
  }
}

/**
 * Hand a PDF to the system share sheet when the browser or WebView allows it.
 * Call this in the same turn as the click; the share request itself is the first await.
 */
export async function sharePdfFile(blob: Blob, filename: string): Promise<PdfShareResult> {
  if (typeof navigator === 'undefined' || !navigator.share) return 'unavailable';
  const file = new File([blob], filename, { type: 'application/pdf' });
  if (!canShareFile(file) && !isNativeDispatchApp()) return 'unavailable';
  try {
    await navigator.share({ files: [file], title: filename });
    return 'shared';
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return 'cancelled';
    return 'unavailable';
  }
}

/** Start a download and return an object URL the user can open if the download is ignored. */
export function downloadPdfFile(blob: Blob, filename: string): string {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  return url;
}

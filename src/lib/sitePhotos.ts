import type { Job } from '@/lib/data';
import { supabase } from '@/lib/supabase';

/** Separator between job id and the rest of the storage object name (mirrors blueprints). */
export const JOB_PREFIX_SEP = '---';

const UNASSIGNED = 'Unassigned';
const BUCKET = 'site-photos';

/** Max edge length for newly uploaded photos (keeps full-view snappy). */
const UPLOAD_MAX_EDGE = 2048;
const UPLOAD_JPEG_QUALITY = 0.82;

/** Thumbnail size for grid cells (Supabase image transform). */
const THUMB_SIZE = 480;
const THUMB_QUALITY = 65;

/** Larger preview when opening a photo without downloading the original dump. */
const PREVIEW_MAX_EDGE = 1600;
const PREVIEW_QUALITY = 80;

export interface ParsedPhotoPath {
  jobId: string | null;
  displayName: string;
}

/** Build a storage path that encodes the job id: `{jobId}---{timestamp}-{fileName}`. */
export function buildPhotoPath(jobId: string, fileName: string): string {
  const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
  return `${jobId}${JOB_PREFIX_SEP}${Date.now()}-${cleanName}`;
}

/** Parse a stored photo name back into job id + human-friendly file label. */
export function parsePhotoPath(fileName: string): ParsedPhotoPath {
  const sep = fileName.indexOf(JOB_PREFIX_SEP);
  if (sep === -1) {
    const legacy = fileName.replace(/^\d+-/, '');
    return { jobId: null, displayName: legacy || fileName };
  }
  const jobId = fileName.substring(0, sep);
  const remainder = fileName.substring(sep + JOB_PREFIX_SEP.length);
  const displayName = remainder.replace(/^\d+-/, '') || remainder;
  return { jobId: jobId || null, displayName };
}

export function getJobLabel(jobId: string | null, jobs: Job[]): string {
  if (!jobId) return UNASSIGNED;
  const job = jobs.find(j => j.id === jobId);
  if (!job) return 'Unknown job';
  return job.customerName || job.address || 'Untitled job';
}

export function groupPhotosByJob<T extends { name: string }>(
  photos: T[],
  jobs: Job[],
): { jobId: string | null; label: string; photos: T[] }[] {
  const map = new Map<string | null, T[]>();
  photos.forEach(photo => {
    const { jobId } = parsePhotoPath(photo.name);
    if (!map.has(jobId)) map.set(jobId, []);
    map.get(jobId)!.push(photo);
  });
  return Array.from(map.entries())
    .map(([jobId, groupPhotos]) => ({
      jobId,
      label: getJobLabel(jobId, jobs),
      photos: groupPhotos,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** Full original object URL (use only when the user explicitly downloads / needs pixel-perfect). */
export function getPhotoFullUrl(fileName: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(fileName).data.publicUrl;
}

/** Small transform URL for grid thumbnails — typically ~10KB vs multi-MB originals. */
export function getPhotoThumbnailUrl(fileName: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(fileName, {
    transform: {
      width: THUMB_SIZE,
      height: THUMB_SIZE,
      resize: 'cover',
      quality: THUMB_QUALITY,
    },
  }).data.publicUrl;
}

/** Mid-size transform for in-app lightbox viewing. */
export function getPhotoPreviewUrl(fileName: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(fileName, {
    transform: {
      width: PREVIEW_MAX_EDGE,
      height: PREVIEW_MAX_EDGE,
      resize: 'contain',
      quality: PREVIEW_QUALITY,
    },
  }).data.publicUrl;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image for compression.'));
    };
    img.src = url;
  });
}

/**
 * Downscale large phone photos before upload so storage + full-view stay manageable.
 * Non-images and already-small files are returned unchanged.
 */
export async function compressImageForUpload(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
    return file;
  }

  // Skip tiny files; HEIC etc. may not decode in canvas — fall back to original on failure.
  try {
    const img = await loadImageElement(file);
    const maxEdge = Math.max(img.naturalWidth, img.naturalHeight);
    if (maxEdge <= UPLOAD_MAX_EDGE && file.size <= 1_500_000) {
      return file;
    }

    const scale = Math.min(1, UPLOAD_MAX_EDGE / maxEdge);
    const width = Math.max(1, Math.round(img.naturalWidth * scale));
    const height = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>(resolve => {
      canvas.toBlob(resolve, 'image/jpeg', UPLOAD_JPEG_QUALITY);
    });
    if (!blob || blob.size >= file.size) return file;

    const base = file.name.replace(/\.[^.]+$/, '') || 'photo';
    return new File([blob], `${base}.jpg`, { type: 'image/jpeg', lastModified: Date.now() });
  } catch {
    return file;
  }
}

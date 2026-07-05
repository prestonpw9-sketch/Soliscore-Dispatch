import type { Job } from '@/lib/data';

/** Separator between job id and the rest of the storage object name (mirrors blueprints). */
export const JOB_PREFIX_SEP = '---';

const UNASSIGNED = 'Unassigned';

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

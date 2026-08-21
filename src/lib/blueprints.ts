import type { Job } from '@/lib/data';

/** Separator between job id and the rest of the storage object name (mirrors site photos). */
export const JOB_PREFIX_SEP = '---';

export const UNASSIGNED_KEY = '';
export const UNASSIGNED_LABEL = 'Unassigned';

export interface ParsedBlueprintPath {
  /** Raw prefix before ---, or null when the file has no job prefix. */
  prefix: string | null;
  displayName: string;
}

export interface BlueprintGroup<T> {
  key: string;
  /** Real job id when the prefix matches a dispatch job; otherwise null. */
  jobId: string | null;
  label: string;
  files: T[];
}

/** Build a storage path that encodes the job id: `{jobId}---{timestamp}-{fileName}`. */
export function buildBlueprintPath(jobId: string, fileName: string): string {
  const cleanName = fileName.replace(/[^a-zA-Z0-9.\-_]/g, '');
  return `${jobId}${JOB_PREFIX_SEP}${Date.now()}-${cleanName}`;
}

/** Parse a stored blueprint name into prefix + human-friendly file label. */
export function parseBlueprintPath(fileName: string): ParsedBlueprintPath {
  const sep = fileName.indexOf(JOB_PREFIX_SEP);
  if (sep === -1) {
    const displayName = fileName.replace(/^\d+-/, '') || fileName;
    return { prefix: null, displayName };
  }
  const prefix = fileName.substring(0, sep);
  const remainder = fileName.substring(sep + JOB_PREFIX_SEP.length);
  const displayName = remainder.replace(/^\d+-/, '') || remainder;
  return { prefix: prefix || null, displayName };
}

export function getBlueprintGroup(
  fileName: string,
  jobs: Job[],
): { key: string; jobId: string | null; label: string } {
  const { prefix } = parseBlueprintPath(fileName);
  if (!prefix) {
    return { key: UNASSIGNED_KEY, jobId: null, label: UNASSIGNED_LABEL };
  }
  const job = jobs.find(j => j.id === prefix);
  if (job) {
    return {
      key: prefix,
      jobId: prefix,
      label: job.customerName || job.address || 'Untitled job',
    };
  }
  // Legacy "ProjectName---file" prefixes that aren't job ids stay grouped by name.
  return {
    key: `legacy:${prefix}`,
    jobId: null,
    label: prefix.replace(/_/g, ' '),
  };
}

export function groupBlueprintsByJob<T extends { name: string }>(
  files: T[],
  jobs: Job[],
): BlueprintGroup<T>[] {
  const map = new Map<string, BlueprintGroup<T>>();
  for (const file of files) {
    const group = getBlueprintGroup(file.name, jobs);
    const existing = map.get(group.key);
    if (existing) {
      existing.files.push(file);
    } else {
      map.set(group.key, { ...group, files: [file] });
    }
  }
  return Array.from(map.values()).sort((a, b) => {
    if (a.key === UNASSIGNED_KEY) return 1;
    if (b.key === UNASSIGNED_KEY) return -1;
    return a.label.localeCompare(b.label);
  });
}

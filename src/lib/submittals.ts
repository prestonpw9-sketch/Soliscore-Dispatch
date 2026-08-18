import { supabase } from './supabase';

export interface SubmittalRecord {
  id: string;
  job_id: string | number | null;
  name: string;
  file_path: string;
  status: string | null;
  created_at?: string;
}

const BUCKET = 'submittals';

function isPlaceholder(name: string): boolean {
  return name === '.emptyFolderPlaceholder';
}

/**
 * Fast count from the submittals table (exact row count).
 * This is the source of truth for the dashboard scorecard.
 */
export async function fetchSubmittalsCount(): Promise<number> {
  const { count, error } = await supabase
    .from('submittals')
    .select('*', { count: 'exact', head: true });
  if (error) {
    console.error('Error counting submittals:', error);
    return 0;
  }
  return count ?? 0;
}

/** Load submittals from the DB table. */
export async function fetchSubmittalsFromDb(): Promise<SubmittalRecord[]> {
  const { data, error } = await supabase
    .from('submittals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) {
    console.error('Error fetching submittals:', error);
    return [];
  }
  return (data ?? []) as SubmittalRecord[];
}

/** Load storage-only submittals not already tracked in the DB. */
export async function fetchStorageOnlySubmittals(
  existingPaths: Set<string>,
): Promise<SubmittalRecord[]> {
  const { data: folders, error: listError } = await supabase.storage
    .from(BUCKET)
    .list('', { limit: 200 });
  if (listError) {
    console.error('Error listing submittals storage:', listError);
    return [];
  }

  const extras: SubmittalRecord[] = [];

  await Promise.all(
    (folders ?? [])
      .filter(f => !isPlaceholder(f.name))
      .map(async folder => {
        const jobId = folder.name;
        const { data: files, error } = await supabase.storage
          .from(BUCKET)
          .list(jobId, { limit: 200 });
        if (error) return;

        for (const file of files ?? []) {
          if (isPlaceholder(file.name)) continue;
          const filePath = `${jobId}/${file.name}`;
          if (existingPaths.has(filePath)) continue;
          extras.push({
            id: `storage:${filePath}`,
            job_id: /^\d+$/.test(jobId) ? Number(jobId) : jobId,
            name: file.name.replace(/^\d+-/, ''),
            file_path: filePath,
            status: 'submitted',
            created_at: file.created_at,
          });
        }
      }),
  );

  return extras;
}

/** All submittals: DB rows merged with storage-only files. */
export async function fetchAllSubmittals(): Promise<SubmittalRecord[]> {
  const dbRows = await fetchSubmittalsFromDb();
  const existingPaths = new Set(dbRows.map(r => r.file_path).filter(Boolean));
  const storageRows = await fetchStorageOnlySubmittals(existingPaths);
  return [...dbRows, ...storageRows];
}

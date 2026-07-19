import { supabase } from './supabase';

const PLACEHOLDER = '.emptyFolderPlaceholder';

/** Count non-placeholder files in a storage bucket root listing. */
async function countBucketFiles(bucket: string, limit = 200): Promise<number> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list('', { limit, sortBy: { column: 'name', order: 'asc' } });
  if (error) {
    console.error(`Error counting ${bucket}:`, error);
    return 0;
  }
  return (data ?? []).filter(f => f.name !== PLACEHOLDER).length;
}

export async function fetchBlueprintsCount(): Promise<number> {
  return countBucketFiles('blueprints');
}

export async function fetchSitePhotosCount(): Promise<number> {
  return countBucketFiles('site-photos');
}

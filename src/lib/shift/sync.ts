import { supabase } from '@/lib/supabase';
import { flushOutbox, mergeAll, type OutboxRow } from './outbox.ts';
import { loadOutbox, saveOutbox } from './storage.ts';

let flushing = false;
let lastFailureAt = 0;

export async function enqueueAndSync(rows: OutboxRow[]): Promise<'synced' | 'pending' | 'offline'> {
  if (rows.length) saveOutbox(mergeAll(loadOutbox(), rows));
  return syncOutbox();
}

export async function syncOutbox(): Promise<'synced' | 'pending' | 'offline'> {
  const queue = loadOutbox();
  if (queue.length === 0) return 'synced';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline';
  if (flushing) return 'pending';
  if (lastFailureAt && Date.now() - lastFailureAt < 15_000) return 'pending';

  flushing = true;
  try {
    const result = await flushOutbox(queue, async row => {
      const { error } = await supabase.from(row.table).upsert(row.record, { onConflict: 'id' });
      if (error) {
        console.error('Shift sync failed:', error.message);
        return false;
      }
      return true;
    });
    saveOutbox(result.pending);
    if (result.pending.length > 0) {
      lastFailureAt = Date.now();
      return 'pending';
    }
    lastFailureAt = 0;
    return 'synced';
  } finally {
    flushing = false;
  }
}

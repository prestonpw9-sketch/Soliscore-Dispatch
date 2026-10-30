export type OutboxTable = 'shifts' | 'time_segments' | 'shift_battery_samples' | 'shop_locations';

export interface OutboxRow {
  table: OutboxTable;
  record: { id: string } & Record<string, unknown>;
}

/** One queued row per table + id. A later update replaces the earlier copy. */
export function mergeOutbox(queue: OutboxRow[], row: OutboxRow): OutboxRow[] {
  const kept = queue.filter(item => !(item.table === row.table && item.record.id === row.record.id));
  return [...kept, row];
}

export function mergeAll(queue: OutboxRow[], rows: OutboxRow[]): OutboxRow[] {
  return rows.reduce(mergeOutbox, queue);
}

export interface FlushResult {
  synced: OutboxRow[];
  pending: OutboxRow[];
}

/**
 * Sends each queued row once, in order. A failed send leaves that row and
 * everything after it queued. Sending the same id again is an upsert, so a
 * replay cannot create a second segment.
 */
export async function flushOutbox(
  queue: OutboxRow[],
  send: (row: OutboxRow) => Promise<boolean>,
): Promise<FlushResult> {
  const pending = [...queue];
  const synced: OutboxRow[] = [];
  while (pending.length > 0) {
    const next = pending[0];
    let ok = false;
    try {
      ok = await send(next);
    } catch {
      ok = false;
    }
    if (!ok) break;
    pending.shift();
    synced.push(next);
  }
  return { synced, pending };
}

/** Apply upserts into a map keyed by table and id. Replays collapse. */
export function replayInto(
  store: Map<string, Record<string, unknown>>,
  rows: OutboxRow[],
): Map<string, Record<string, unknown>> {
  const next = new Map(store);
  for (const row of rows) {
    const key = `${row.table}:${row.record.id}`;
    next.set(key, { ...next.get(key), ...row.record });
  }
  return next;
}

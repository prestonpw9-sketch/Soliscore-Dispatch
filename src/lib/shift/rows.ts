import type { MachineState, ShopLocation } from './types.ts';
import type { OutboxRow } from './outbox.ts';

function changed(prev: unknown, next: unknown): boolean {
  return JSON.stringify(prev) !== JSON.stringify(next);
}

export function shiftRow(userId: string, state: MachineState): OutboxRow | null {
  const shift = state.shift;
  if (!shift) return null;
  return {
    table: 'shifts',
    record: {
      id: shift.id,
      user_id: userId,
      started_at: shift.startedAt,
      ended_at: shift.endedAt,
      end_reason: shift.endReason,
      battery_start: shift.batteryStart,
      battery_end: shift.batteryEnd,
      start_latitude: shift.startLatitude,
      start_longitude: shift.startLongitude,
      updated_at: new Date().toISOString(),
    },
  };
}

export function rowsFromTransition(userId: string, prev: MachineState, next: MachineState): OutboxRow[] {
  const rows: OutboxRow[] = [];
  const prevShift = shiftRow(userId, prev);
  const nextShift = shiftRow(userId, next);
  if (nextShift && changed(prevShift?.record, { ...nextShift.record, updated_at: prevShift?.record.updated_at })) {
    rows.push(nextShift);
  } else if (nextShift && !prevShift) {
    rows.push(nextShift);
  }

  for (const segment of next.segments) {
    const before = prev.segments.find(item => item.id === segment.id);
    if (before && !changed(before, segment)) continue;
    rows.push({
      table: 'time_segments',
      record: {
        id: segment.id,
        shift_id: segment.shiftId,
        user_id: userId,
        kind: segment.kind,
        job_id: segment.jobId && /^\d+$/.test(segment.jobId) ? Number(segment.jobId) : null,
        job_name: segment.jobName,
        started_at: segment.startedAt,
        ended_at: segment.endedAt,
        start_latitude: segment.startLatitude,
        start_longitude: segment.startLongitude,
        end_latitude: segment.endLatitude,
        end_longitude: segment.endLongitude,
        battery_start: segment.batteryStart,
        battery_end: segment.batteryEnd,
        updated_at: new Date().toISOString(),
      },
    });
  }

  for (const sample of next.batterySamples) {
    if (prev.batterySamples.some(item => item.id === sample.id)) continue;
    rows.push({
      table: 'shift_battery_samples',
      record: {
        id: sample.id,
        shift_id: sample.shiftId,
        user_id: userId,
        sampled_at: sample.sampledAt,
        battery_percent: sample.batteryPercent,
      },
    });
  }

  return rows;
}

export function shopRow(shop: ShopLocation): OutboxRow {
  return {
    table: 'shop_locations',
    record: {
      id: shop.id,
      name: shop.name,
      latitude: shop.latitude,
      longitude: shop.longitude,
      radius_m: shop.radiusMeters,
      active: true,
      updated_at: new Date().toISOString(),
    },
  };
}

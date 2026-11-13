import { initialMachine } from './machine.ts';
import type { MachineState, Shift, TimeSegment } from './types.ts';

/**
 * The phone keeps the running shift in local storage. If that copy is lost
 * (app reinstalled, storage cleared, another phone or tab) the Start/Stop
 * button shows the wrong thing and new rows pile up beside the old ones.
 * These rules line the local copy up with what the server has.
 */

export interface ServerShiftRow {
  id: string;
  started_at: string;
  ended_at: string | null;
  end_reason: 'clock_out' | 'auto_stop' | null;
  battery_start?: number | null;
  battery_end?: number | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
}

export interface ServerSegmentRow {
  id: string;
  shift_id: string;
  kind: TimeSegment['kind'];
  job_id: number | string | null;
  job_name: string | null;
  started_at: string;
  ended_at: string | null;
  start_latitude?: number | null;
  start_longitude?: number | null;
  end_latitude?: number | null;
  end_longitude?: number | null;
  battery_start?: number | null;
  battery_end?: number | null;
}

/** A server shift open longer than this is stale, not something to resume. */
export const RESUME_MAX_AGE_MS = 16 * 3_600_000;

/**
 * Sort by start, clamp to the shift, and end each row no later than the next
 * one starts, so at most the last row is open and nothing overlaps.
 */
export function normalizeSegments(segments: TimeSegment[], shift: Shift): TimeSegment[] {
  const shiftStart = Date.parse(shift.startedAt);
  const shiftEnd = shift.endedAt ? Date.parse(shift.endedAt) : null;
  const sorted = [...segments]
    .filter(segment => segment.shiftId === shift.id)
    .filter(segment => shiftEnd == null || Date.parse(segment.startedAt) < shiftEnd)
    .map(segment => (Date.parse(segment.startedAt) < shiftStart
      ? { ...segment, startedAt: shift.startedAt }
      : segment))
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  return sorted.map((segment, index) => {
    const next = sorted[index + 1];
    let end = segment.endedAt ? Date.parse(segment.endedAt) : null;
    if (next) end = end == null ? Date.parse(next.startedAt) : Math.min(end, Date.parse(next.startedAt));
    if (shiftEnd != null) end = end == null ? shiftEnd : Math.min(end, shiftEnd);
    if (end == null) return segment;
    end = Math.max(end, Date.parse(segment.startedAt));
    const endedAt = new Date(end).toISOString();
    return endedAt === segment.endedAt ? segment : { ...segment, endedAt };
  });
}

function segmentFromRow(row: ServerSegmentRow): TimeSegment {
  return {
    id: row.id,
    shiftId: row.shift_id,
    kind: row.kind,
    jobId: row.job_id == null ? null : String(row.job_id),
    jobName: row.job_name,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: row.ended_at ? new Date(row.ended_at).toISOString() : null,
    startLatitude: row.start_latitude ?? null,
    startLongitude: row.start_longitude ?? null,
    endLatitude: row.end_latitude ?? null,
    endLongitude: row.end_longitude ?? null,
    batteryStart: row.battery_start ?? null,
    batteryEnd: row.battery_end ?? null,
  };
}

export interface ServerView {
  /** The server copy of the shift the phone thinks is running, if any. */
  localShiftRow: ServerShiftRow | null;
  /** The user's newest open shift on the server, if any. */
  openShift: ServerShiftRow | null;
  /** Segments of `openShift`. */
  openSegments: ServerSegmentRow[];
}

export function reconcile(local: MachineState, server: ServerView, nowMs: number): MachineState | null {
  const localOpen = local.shift && !local.shift.endedAt ? local.shift : null;

  // Ended on the server (owner clocked it out, or another phone did).
  if (localOpen && server.localShiftRow?.id === localOpen.id && server.localShiftRow.ended_at) {
    const shift: Shift = {
      ...localOpen,
      endedAt: new Date(server.localShiftRow.ended_at).toISOString(),
      endReason: server.localShiftRow.end_reason ?? 'clock_out',
    };
    return {
      ...local,
      shift,
      segments: normalizeSegments(local.segments, shift),
      motionSince: null,
      outsideSince: null,
      dwell: null,
      still: null,
    };
  }

  // Lost the local copy, but the server still has the shift open: resume it
  // so the Stop button shows.
  const open = server.openShift;
  if (!localOpen && open && !open.ended_at && nowMs - Date.parse(open.started_at) < RESUME_MAX_AGE_MS) {
    if (local.shift?.id === open.id && local.shift.endedAt) return null; // ended here, not synced yet
    const shift: Shift = {
      id: open.id,
      startedAt: new Date(open.started_at).toISOString(),
      endedAt: null,
      endReason: null,
      batteryStart: open.battery_start ?? null,
      batteryEnd: null,
      startLatitude: open.start_latitude ?? 0,
      startLongitude: open.start_longitude ?? 0,
    };
    const segments = normalizeSegments(server.openSegments.map(segmentFromRow), shift);
    const last = segments[segments.length - 1];
    return {
      ...initialMachine(),
      shift,
      segments,
      lastSample: last?.startLatitude != null && last.startLongitude != null
        ? { at: nowMs, latitude: last.startLatitude, longitude: last.startLongitude }
        : null,
    };
  }
  return null;
}

/** Fix a state saved by an older build: overlapping or multiple open rows. */
export function repairLocal(state: MachineState): MachineState {
  if (!state.shift) return state;
  const segments = normalizeSegments(state.segments, state.shift);
  const same = segments.length === state.segments.length
    && segments.every((segment, i) => segment === state.segments[i]);
  return same ? state : { ...state, segments };
}

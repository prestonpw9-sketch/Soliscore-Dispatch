/**
 * Local shift copy vs server rows. Run: npm run test:shift
 */
import assert from 'node:assert/strict';
import { initialMachine } from '../src/lib/shift/machine.ts';
import { normalizeSegments, reconcile, repairLocal } from '../src/lib/shift/reconcile.ts';
import type { MachineState, Shift, TimeSegment } from '../src/lib/shift/types.ts';

const at = (hhmm: string) => new Date(`2026-10-30T${hhmm}:00-07:00`).toISOString();
const shift: Shift = {
  id: 's1', startedAt: at('12:39'), endedAt: null, endReason: null,
  batteryStart: 90, batteryEnd: null, startLatitude: 32.2, startLongitude: -110.9,
};
const seg = (id: string, kind: TimeSegment['kind'], a: string, b: string | null, shiftId = 's1'): TimeSegment => ({
  id, shiftId, kind, jobId: null, jobName: null, startedAt: at(a), endedAt: b ? at(b) : null,
  startLatitude: 32.2, startLongitude: -110.9, endLatitude: null, endLongitude: null, batteryStart: null, batteryEnd: null,
});

// Preston's Oct 30 rows: shop open from 12:39, shop 1:25-4:09, driving open from 4:09.
{
  const fixed = normalizeSegments([seg('e', 'shop', '12:39', null), seg('f', 'shop', '13:25', '16:09'), seg('g', 'driving', '16:09', null)], shift);
  assert.equal(fixed[0].endedAt, at('13:25'), 'first shop row ends where the next starts');
  assert.equal(fixed[2].endedAt, null, 'only the last row stays open');
  const ended = normalizeSegments(fixed, { ...shift, endedAt: at('19:36') });
  assert.ok(ended.every(segment => segment.endedAt), 'all rows close at clock-out');
  assert.equal(ended[2].endedAt, at('19:36'));
}

// Segment from before clock-in is pulled to the clock-in time.
{
  const early = normalizeSegments([seg('c', 'shop', '10:00', '13:00')], shift);
  assert.equal(early[0].startedAt, shift.startedAt);
}

// Server says the shift ended: local copy closes and the Stop button goes away.
{
  const local: MachineState = { ...initialMachine(), shift, segments: [seg('e', 'shop', '12:39', null)] };
  const next = reconcile(local, {
    localShiftRow: { id: 's1', started_at: shift.startedAt, ended_at: at('19:36'), end_reason: 'clock_out' },
    openShift: null, openSegments: [],
  }, Date.parse(at('19:40')));
  assert.equal(next?.shift?.endedAt, at('19:36'));
  assert.equal(next?.segments[0].endedAt, at('19:36'));
}

// Local copy lost (reinstall) but the server shift is open: resume it.
{
  const next = reconcile(initialMachine(), {
    localShiftRow: null,
    openShift: { id: 's1', started_at: shift.startedAt, ended_at: null, end_reason: null },
    openSegments: [
      { id: 'e', shift_id: 's1', kind: 'shop', job_id: null, job_name: 'Shop', started_at: at('12:39'), ended_at: null },
    ],
  }, Date.parse(at('15:00')));
  assert.equal(next?.shift?.id, 's1');
  assert.equal(next?.shift?.endedAt, null, 'Stop button shows');
  assert.equal(next?.segments.length, 1);
}

// Stale open server shift (yesterday) is not resumed.
{
  const next = reconcile(initialMachine(), {
    localShiftRow: null,
    openShift: { id: 'old', started_at: at('05:00'), ended_at: null, end_reason: null },
    openSegments: [],
  }, Date.parse('2026-10-31T12:00:00-07:00'));
  assert.equal(next, null);
}

// Old-build local state with two open rows is repaired.
{
  const repaired = repairLocal({ ...initialMachine(), shift, segments: [seg('a', 'shop', '12:39', null), seg('b', 'driving', '13:00', null)] });
  assert.equal(repaired.segments[0].endedAt, at('13:00'));
}

console.log('reconcile checks passed');

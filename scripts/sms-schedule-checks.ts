/**
 * Unit checks for the SMS dispatcher's schedule-honesty guard and the
 * reschedule_job matcher. No network, no database, no OpenAI.
 *
 * Run: npm run test:sms-schedule
 * (Full handler flows with a fake Supabase/OpenAI: npm run test:sms-deno)
 */
import assert from 'node:assert/strict';
import {
  HONEST_NO_CHANGE_REPLY,
  claimsScheduleChange,
  guardFreeTextReply,
} from '../supabase/functions/_shared/smsScheduleGuard.ts';
import {
  matchJobs,
  nextEndDate,
  phaseRoot,
  searchTokens,
  type JobRow,
} from '../supabase/functions/_shared/smsReschedule.ts';

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed++;
  console.log(`ok - ${name}`);
}

// ── Claims that must be blocked when no tool wrote anything ──────────────────
const CLAIMS = [
  // The real Nov 11 2026 reply.
  "I've scheduled the plumbing trim work for Kachina to start on Monday, December 7, 2026. Preston will follow up if needed.",
  "I have scheduled the trim for 12/7.",
  "I’ve rescheduled the Kachina trim to Dec 7.",
  "I HAVE RESCHEDULED IT FOR MONDAY.",
  "We've booked you for Thursday.",
  "I booked the rough-in for 11/20.",
  "Perfect. I've locked in the Top-Out for Fri, Nov 20, 2026 on the board.",
  "I locked it in for Friday.",
  "I've put the job on the board for tomorrow.",
  "I just added the trim to the schedule for 12/7.",
  "I moved the Kachina trim to December 7th.",
  "I've moved it to the 7th.",
  "Got it, I updated the date to 12/7.",
  "I pushed the trim back to Dec 7.",
  "I'm scheduling that for Monday now.",
  "The trim is now scheduled for December 7.",
  "It's scheduled for 12/7/26.",
  "Kachina trim has been rescheduled to 12/7.",
  "Your job was moved to Monday, Dec 7.",
  "That's been booked for Friday.",
  "It is locked in for the 20th.",
  "You're on the schedule for Monday.",
  "It's on the board for 12/7.",
  "Scheduled! See you Monday.",
  "Done — Kachina trim moved to 12/7.",
  "Rescheduled to December 7.",
  "You're all set for Monday.",
  "Got you down for Thursday at Kachina.",
  "Confirmed for Dec 7.",
  "Okay, I went ahead and scheduled the trim for 12/7.",
  "i've scheduled it",
  "The Kachina trim is set for December 7th.",
  "I logged the trim for 12/7 on the board.",
  "Sounds good. The trim work at Kachina is now set to start on Monday, December 7, 2026.",
];

// ── Replies that must pass through untouched ─────────────────────────────────
const SAFE = [
  "What's the address or lot and community for that job?",
  "Should I schedule it for December 7?",
  "Do you want me to move the Kachina trim to 12/7?",
  "I haven't scheduled anything yet. What's the address?",
  "I have not changed the schedule.",
  "Once you send the address, I'll put it on the board.",
  "When it's scheduled, Preston will text you.",
  "Thanks! Let me know if you need anything else.",
  "Sorry, I can only help with plumbing jobs.",
  "lol no worries. What needs to be done at the house?",
  "I'll get that scheduled as soon as I have the lot number.",
  "Which job do you mean, the Kachina trim or the Stone Canyon rough?",
  "I can help with that. What date works for the trim?",
  HONEST_NO_CHANGE_REPLY,
  "",
];

check('every scheduling claim is detected', () => {
  const missed = CLAIMS.filter((t) => !claimsScheduleChange(t));
  assert.deepEqual(missed, []);
});

check('questions, negations, promises and chit-chat are not claims', () => {
  const flagged = SAFE.filter((t) => claimsScheduleChange(t));
  assert.deepEqual(flagged, []);
});

check('guardFreeTextReply replaces the Kachina claim with the honest reply', () => {
  const r = guardFreeTextReply(CLAIMS[0]);
  assert.equal(r.replaced, true);
  assert.equal(r.reply, HONEST_NO_CHANGE_REPLY);
  assert.match(r.reply, /haven't changed the schedule/);
});

check('guardFreeTextReply passes safe text and falls back on empty text', () => {
  assert.deepEqual(guardFreeTextReply('What is the address?'), { reply: 'What is the address?', replaced: false });
  assert.deepEqual(guardFreeTextReply(null), { reply: 'I am processing your request.', replaced: false });
  assert.deepEqual(guardFreeTextReply('   '), { reply: 'I am processing your request.', replaced: false });
});

// ── reschedule_job matching ──────────────────────────────────────────────────
const job = (o: Partial<JobRow> & { id: number }): JobRow => ({
  title: null, location: null, address: null, description: null, phase: null,
  status: 'scheduled', date: '2026-11-20', end_date: null, completed_at: null, ...o,
});
const JOBS: JobRow[] = [
  job({ id: 105, title: 'Williamson addition - Plumbing Trim', location: '13601 N Kachina Dr', phase: 'Trim' }),
  job({ id: 106, title: 'Kachina Estates lot 3 - Rough-In', location: 'Lot 3 Kachina Estates', phase: 'Rough-In', date: '2026-11-25' }),
  job({ id: 40, title: 'Old Kachina trim', location: '13601 N Kachina Dr', phase: 'Trim', status: 'completed' }),
  job({ id: 41, title: 'Kachina punch', location: '13601 N Kachina Dr', phase: 'Punch', completed_at: '2026-10-01T00:00:00Z' }),
  job({ id: 90, title: 'Stone Canyon lot 415 - Rough-In', location: 'Lot 415 Stone Canyon', phase: 'Rough-In' }),
];

check('search tokens drop filler words but keep street names and lot numbers', () => {
  assert.deepEqual(searchTokens('the Kachina plumb trim job'), ['kachina', 'trim']);
  assert.deepEqual(searchTokens('lot 415 Stone Canyon'), ['415', 'stone', 'canyon']);
  assert.deepEqual(searchTokens('13601 N Kachina Dr'), ['13601', 'kachina']);
  assert.deepEqual(searchTokens(''), []);
  assert.deepEqual(searchTokens(undefined), []);
});

check('phase roots', () => {
  assert.equal(phaseRoot('Trim/Finish'), 'trim');
  assert.equal(phaseRoot('trim'), 'trim');
  assert.equal(phaseRoot('Rough-In'), 'rough');
  assert.equal(phaseRoot('Top-Out'), 'top');
  assert.equal(phaseRoot(undefined), '');
});

check('Kachina + Trim matches only open job 105', () => {
  assert.deepEqual(matchJobs(JOBS, { job_search: 'Kachina', phase: 'Trim' }, '2026-11-12').map((j) => j.id), [105]);
  assert.deepEqual(matchJobs(JOBS, { job_search: 'Kachina trim' }, '2026-11-12').map((j) => j.id), [105]);
});

check('Kachina with no phase is ambiguous (105 and 106); completed jobs never match', () => {
  assert.deepEqual(matchJobs(JOBS, { job_search: 'Kachina' }, '2026-11-12').map((j) => j.id), [105, 106]);
});

check('current_date narrows several matches', () => {
  assert.deepEqual(matchJobs(JOBS, { job_search: 'Kachina', current_date: '11/25' }, '2026-11-12').map((j) => j.id), [106]);
});

check('phase filter is strict: Kachina top-out matches nothing', () => {
  assert.deepEqual(matchJobs(JOBS, { job_search: 'Kachina', phase: 'Top-Out' }, '2026-11-12'), []);
});

check('empty or filler-only search matches nothing', () => {
  assert.deepEqual(matchJobs(JOBS, { job_search: 'the plumbing job' }, '2026-11-12'), []);
  assert.deepEqual(matchJobs(JOBS, {}, '2026-11-12'), []);
});

check('new end date: explicit, shifted span, or same day; never before start', () => {
  const span = job({ id: 1, date: '2026-11-18', end_date: '2026-11-19' });
  assert.equal(nextEndDate(span, '2026-12-01', undefined, '2026-11-12'), '2026-12-02');
  assert.equal(nextEndDate(span, '2026-12-01', '2026-12-05', '2026-11-12'), '2026-12-05');
  assert.equal(nextEndDate(span, '2026-12-01', '2026-11-30', '2026-11-12'), '2026-12-01');
  assert.equal(nextEndDate(job({ id: 105 }), '2026-12-07', undefined, '2026-11-12'), '2026-12-07');
});

console.log(`\n${passed} sms schedule checks passed`);

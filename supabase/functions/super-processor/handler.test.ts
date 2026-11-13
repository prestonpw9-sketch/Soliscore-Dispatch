/**
 * super-processor flow tests with a fake Supabase client and a fake OpenAI.
 * No network, no database. Run: npm run test:sms-deno
 *   (deno test --allow-env --allow-read supabase/functions/super-processor/)
 */
// deno-lint-ignore-file no-explicit-any
import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleInboundSms, tools } from "./handler.ts";
import { FakeDb } from "./test/fakeSupabase.ts";
import { HONEST_NO_CHANGE_REPLY } from "../_shared/smsScheduleGuard.ts";

const SUPER = "+15207841874";
const KACHINA_TEXT = "Kachina plumb trim schedule to start on 12/7/26";
const FALSE_CLAIM = "I've scheduled the plumbing trim work for Kachina to start on Monday, December 7, 2026. Preston will follow up if needed.";
const TODAY = "2026-11-12";

function job105() {
  return { id: 105, title: "Williamson addition - Plumbing Trim", location: "13601 N Kachina Dr", address: null, description: "Plumbing Trim", phase: "Trim", status: "scheduled", date: "2026-11-20", end_date: null, completed_at: null, customerName: null };
}
function seed(extraJobs: any[] = []) {
  return new FakeDb({
    jobs: [
      job105(),
      { id: 90, title: "Stone Canyon lot 415 - Rough-In", location: "Lot 415 Stone Canyon", address: null, description: "Rough-In", phase: "Rough-In", status: "scheduled", date: "2026-11-18", end_date: "2026-11-19", completed_at: null },
      { id: 40, title: "Kachina remodel - Trim (old)", location: "13601 N Kachina Dr", address: null, description: "", phase: "Trim", status: "completed", date: "2026-03-02", end_date: "2026-03-02", completed_at: "2026-03-03T00:00:00Z" },
      ...extraJobs,
    ],
    job_tasks: [
      { id: "t1", job_id: 105, start_date: "2026-11-20", end_date: "2026-11-20" },
      { id: "t2", job_id: 105, start_date: "2026-11-20", end_date: "2026-11-20" },
      { id: "t3", job_id: 105, start_date: "2026-11-20", end_date: "2026-11-20" },
      { id: "t9", job_id: 90, start_date: "2026-11-18", end_date: "2026-11-19" },
    ],
    technicians: [{ id: "tech-1", name: "On Call Ollie", role: "plumber", phone: "+15205550101", emergency_contact: true }],
    dispatch_messages: [],
    dispatch_schedule_alerts: [],
    sms_opt_outs: [],
  });
}

type AiReply = { content?: string | null; tool_calls?: Array<{ name: string; args: Record<string, unknown> }> } | { error: { message: string } };
function fakeOpenAI(reply: AiReply) {
  const calls: any[] = [];
  const fn = (body: Record<string, unknown>) => {
    calls.push(body);
    if ("error" in reply) return Promise.resolve({ error: reply.error });
    const tool_calls = reply.tool_calls?.map((t, i) => ({ id: `call_${i}`, type: "function", function: { name: t.name, arguments: JSON.stringify(t.args) } }));
    return Promise.resolve({ choices: [{ message: { role: "assistant", content: reply.content ?? null, ...(tool_calls ? { tool_calls } : {}) } }] });
  };
  return { fn, calls };
}

function smsRequest(body: string, from = SUPER) {
  return new Request("https://example.test/super-processor", { method: "POST", body: new URLSearchParams({ Body: body, From: from }).toString(), headers: { "Content-Type": "application/x-www-form-urlencoded" } });
}

async function run(db: FakeDb, text: string, reply: AiReply, from = SUPER) {
  const ai = fakeOpenAI(reply);
  const geocoded: unknown[] = [];
  const warnings: unknown[][] = [];
  const origWarn = console.warn;
  console.warn = (...a: unknown[]) => { warnings.push(a); };
  try {
    const res = await handleInboundSms(smsRequest(text, from), { supabase: db as any, callOpenAI: ai.fn, geocodeInBackground: (_c, id) => { geocoded.push(id); }, today: () => TODAY });
    const xml = await res.text();
    const msg = xml.match(/<Message>([\s\S]*)<\/Message>/)?.[1]?.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&") ?? null;
    return { res, xml, msg, ai, geocoded, warnings };
  } finally {
    console.warn = origWarn;
  }
}

const jobWrites = (db: FakeDb) => db.writes("jobs");
const outbound = (db: FakeDb) => db.table("dispatch_messages").filter((m) => m.direction === "outbound").map((m) => m.message);

Deno.test("tools: log_job and schedule_job unchanged, reschedule_job added", () => {
  assertEquals(tools.map((t) => t.function.name), ["log_job", "schedule_job", "reschedule_job"]);
  assertEquals(tools[0].function.parameters.required, ["title", "job_type", "address"]);
  assertEquals(tools[1].function.parameters.required, ["job_type", "target_date"]);
  assertEquals(tools[2].function.parameters.required, ["job_search", "new_date"]);
});

Deno.test("(a) Kachina: reschedule_job with one match moves job 105 to 2026-12-07 and confirms", async () => {
  const db = seed();
  const before = db.table("jobs").length;
  const r = await run(db, KACHINA_TEXT, { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", phase: "Trim", new_date: "2026-12-07" } }] });
  console.log("  (a) reply:", r.msg);
  const j = db.table("jobs").find((x) => x.id === 105)!;
  assertEquals(j.date, "2026-12-07");
  assertEquals(j.end_date, "2026-12-07");
  assertEquals(db.table("jobs").length, before, "no job inserted");
  assertEquals(jobWrites(db).map((w) => w.op), ["update"]);
  assertEquals(db.table("job_tasks").filter((t) => t.job_id === 105).map((t) => t.start_date), ["2026-12-07", "2026-12-07", "2026-12-07"]);
  assertEquals(db.table("job_tasks").find((t) => t.id === "t9")!.start_date, "2026-11-18", "other job's tasks untouched");
  const alerts = db.table("dispatch_schedule_alerts");
  assertEquals(alerts.length, 1);
  assertEquals({ job_id: alerts[0].job_id, scheduled_date: alerts[0].scheduled_date, scheduled_end_date: alerts[0].scheduled_end_date, phone: alerts[0].phone_number }, { job_id: 105, scheduled_date: "2026-12-07", scheduled_end_date: "2026-12-07", phone: SUPER });
  assertStringIncludes(r.msg!, "moved Williamson addition - Plumbing Trim at 13601 N Kachina Dr from Fri, Nov 20, 2026 to Mon, Dec 7, 2026");
  assertEquals(outbound(db), [r.msg]);
  assertEquals(r.geocoded, [], "address unchanged, no geocode");
  // Prompt now tells the model about moves.
  assertStringIncludes(String(r.ai.calls[0].messages[0].content), "reschedule_job");
  assertEquals(r.ai.calls[0].tool_choice, "auto");
});

Deno.test("(a2) reschedule keeps a multi-day span when no new end date is given", async () => {
  const db = seed();
  await run(db, "push stone canyon 415 rough to 12/1", { tool_calls: [{ name: "reschedule_job", args: { job_search: "lot 415 Stone Canyon", phase: "Rough-In", new_date: "2026-12-01" } }] });
  const j = db.table("jobs").find((x) => x.id === 90)!;
  assertEquals([j.date, j.end_date], ["2026-12-01", "2026-12-02"]);
  assertEquals(db.table("job_tasks").find((t) => t.id === "t9")!.end_date, "2026-12-02");
});

Deno.test("(b) Kachina: exact false free-text claim with no tool call -> honest reply, no DB write", async () => {
  const db = seed();
  const r = await run(db, KACHINA_TEXT, { content: FALSE_CLAIM });
  console.log("  (b) AI said:", FALSE_CLAIM);
  console.log("  (b) reply:  ", r.msg);
  assertEquals(r.msg, HONEST_NO_CHANGE_REPLY);
  assertEquals(jobWrites(db), []);
  assertEquals(db.table("jobs").find((x) => x.id === 105)!.date, "2026-11-20");
  assertEquals(db.table("dispatch_schedule_alerts"), []);
  assertEquals(db.writes("job_tasks"), []);
  assertEquals(outbound(db), [HONEST_NO_CHANGE_REPLY]);
  assert(r.warnings.some((w) => String(w[0]).includes("blocked an unbacked scheduling claim")), "console.warn logged");
});

Deno.test("(b2) harmless free text (a question) still goes through untouched", async () => {
  const db = seed();
  const q = "Got it. What's the address or lot and community for that trim?";
  const r = await run(db, "need a trim", { content: q });
  assertEquals(r.msg, q);
  assertEquals(r.warnings, []);
});

Deno.test("(c1) reschedule with no match -> honest reply, no write", async () => {
  const db = seed();
  const r = await run(db, "move saguaro trim to 12/7", { tool_calls: [{ name: "reschedule_job", args: { job_search: "Saguaro", phase: "Trim", new_date: "2026-12-07" } }] });
  console.log("  (c1) reply:", r.msg);
  assertStringIncludes(r.msg!, "couldn't find a single open job matching \"Saguaro\"");
  assertStringIncludes(r.msg!, "haven't changed the schedule");
  assertEquals(jobWrites(db), []);
  assertEquals(db.table("dispatch_schedule_alerts"), []);
});

Deno.test("(c1b) a completed job never matches", async () => {
  const db = seed();
  db.table("jobs").splice(db.table("jobs").findIndex((j) => j.id === 105), 1); // only the completed Kachina job is left
  const r = await run(db, KACHINA_TEXT, { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", phase: "Trim", new_date: "2026-12-07" } }] });
  assertStringIncludes(r.msg!, "couldn't find a single open job");
  assertEquals(jobWrites(db), []);
});

Deno.test("(c2) reschedule with several matches -> lists up to 3, no write", async () => {
  const extra = [2, 3, 4].map((n) => ({ id: 200 + n, title: `Kachina lot ${n} - Trim`, location: `${13600 + n} N Kachina Dr`, address: null, description: "", phase: "Trim", status: "scheduled", date: "2026-11-2" + n, end_date: null, completed_at: null }));
  const db = seed(extra);
  const r = await run(db, KACHINA_TEXT, { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", phase: "Trim", new_date: "2026-12-07" } }] });
  console.log("  (c2) reply:", r.msg);
  assertStringIncludes(r.msg!, "I found 4 open jobs that could match \"Kachina\"");
  assertStringIncludes(r.msg!, "#105 Williamson addition - Plumbing Trim (13601 N Kachina Dr), now Fri, Nov 20, 2026");
  assertStringIncludes(r.msg!, "(+1 more)");
  assertStringIncludes(r.msg!, "Preston will confirm which one to move");
  assertEquals((r.msg!.match(/#\d+/g) ?? []).length, 3);
  assertEquals(jobWrites(db), []);
  assertEquals(db.table("dispatch_schedule_alerts"), []);
});

Deno.test("(c3) several matches narrowed to one by current_date -> moves only that job", async () => {
  const extra = [{ id: 210, title: "Kachina guest house - Trim", location: "13605 N Kachina Dr", address: null, description: "", phase: "Trim", status: "scheduled", date: "2026-11-30", end_date: null, completed_at: null }];
  const db = seed(extra);
  await run(db, "move the kachina trim from the 20th to 12/7", { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", phase: "Trim", new_date: "2026-12-07", current_date: "2026-11-20" } }] });
  assertEquals(db.table("jobs").find((j) => j.id === 105)!.date, "2026-12-07");
  assertEquals(db.table("jobs").find((j) => j.id === 210)!.date, "2026-11-30");
});

Deno.test("(c4) unreadable new date -> asks, no write (never defaults to tomorrow)", async () => {
  const db = seed();
  const r = await run(db, "push kachina trim a couple weeks", { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", new_date: "a couple weeks" } }] });
  assertStringIncludes(r.msg!, "What date should that job move to?");
  assertEquals(jobWrites(db), []);
});

Deno.test("(d1) log_job still inserts and confirms exactly as before", async () => {
  const db = seed();
  const r = await run(db, "toilet seat at 123 E Main St on 11/20", { tool_calls: [{ name: "log_job", args: { title: "Toilet seat", job_type: "Toilet seat replacement", address: "123 E Main St", target_date: "2026-11-20", phase: "Service Call" } }] });
  console.log("  (d1) reply:", r.msg);
  assertEquals(r.msg, "I've put Toilet seat at 123 E Main St on the schedule for Fri, Nov 20, 2026. Preston will follow up if anything changes.");
  const ins = jobWrites(db);
  assertEquals(ins.length, 1);
  assertEquals(ins[0].op, "insert");
  assertEquals(ins[0].values[0], { customer_phone: SUPER, title: "Toilet seat", location: "123 E Main St", description: "Toilet seat replacement", status: "scheduled", date: "2026-11-20", end_date: "2026-11-20", phase: "Service Call", service_type: "Service Call" });
  assertEquals(db.table("dispatch_schedule_alerts").length, 1);
  assertEquals(r.geocoded.length, 1);
  assertEquals(db.table("jobs").find((x) => x.id === 105)!.date, "2026-11-20");
});

Deno.test("(d2) schedule_job still inserts and confirms exactly as before", async () => {
  const db = seed();
  const r = await run(db, "pre-slab inspection lot 9 Sky Ranch 11/20-11/21", { tool_calls: [{ name: "schedule_job", args: { job_type: "Pre-slab inspection", target_date: "2026-11-20", target_end_date: "2026-11-21", address: "Lot 9 Sky Ranch", phase: "Underground" } }] });
  console.log("  (d2) reply:", r.msg);
  assertEquals(r.msg, "Perfect. I've locked in the Pre-slab inspection for Fri, Nov 20, 2026 – Sat, Nov 21, 2026 on the board. Preston will review it and confirm the specific time slot with you.");
  const ins = jobWrites(db);
  assertEquals(ins.length, 1);
  assertEquals(ins[0].values[0], { customer_phone: SUPER, title: "Pre-slab inspection — Lot 9 Sky Ranch", location: "Lot 9 Sky Ranch", description: "Pre-slab inspection", status: "scheduled", date: "2026-11-20", end_date: "2026-11-21", phase: "Underground", service_type: null });
  assertEquals(db.table("dispatch_schedule_alerts").length, 1);
});

Deno.test("(d3) log_job insert failure keeps the old system-error reply", async () => {
  const db = seed();
  db.fail.push({ table: "jobs", op: "insert" });
  const r = await run(db, "toilet at 1 Main", { tool_calls: [{ name: "log_job", args: { title: "Toilet", job_type: "Toilet", address: "1 Main" } }] });
  assertEquals(r.msg, "I tried to put that on the calendar, but ran into a system error. Let me flag Preston directly.");
  assertEquals(db.table("dispatch_schedule_alerts"), []);
});

Deno.test("(e) DB error on the reschedule update -> honest failure reply, nothing changed", async () => {
  const db = seed();
  db.fail.push({ table: "jobs", op: "update", message: "Thread killed by timeout manager" });
  const r = await run(db, KACHINA_TEXT, { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", phase: "Trim", new_date: "2026-12-07" } }] });
  console.log("  (e) reply:", r.msg);
  assertStringIncludes(r.msg!, "ran into a system error, so the schedule has NOT changed");
  assertEquals(db.table("jobs").find((x) => x.id === 105)!.date, "2026-11-20");
  assertEquals(db.table("dispatch_schedule_alerts"), []);
  assertEquals(db.writes("job_tasks"), []);
});

Deno.test("(e2) job moved by someone else between read and write -> 0 rows updated, honest failure", async () => {
  const db = seed();
  // Simulate a concurrent edit: the update's "date = old date" guard matches nothing.
  const orig = db.from.bind(db);
  (db as any).from = (t: string) => {
    const q = orig(t);
    if (t === "jobs") { const u = q.update.bind(q); q.update = (v: any) => { db.table("jobs").find((j) => j.id === 105)!.date = "2026-11-25"; return u(v); }; }
    return q;
  };
  const r = await run(db, KACHINA_TEXT, { tool_calls: [{ name: "reschedule_job", args: { job_search: "Kachina", phase: "Trim", new_date: "2026-12-07" } }] });
  assertStringIncludes(r.msg!, "NOT changed");
  assertEquals(db.table("jobs").find((x) => x.id === 105)!.date, "2026-11-25");
  assertEquals(db.table("dispatch_schedule_alerts"), []);
});

Deno.test("(e3) tool path with no write and a claiming AI text is still guarded", async () => {
  const db = seed();
  const r = await run(db, KACHINA_TEXT, { content: FALSE_CLAIM, tool_calls: [{ name: "not_a_tool", args: {} }] });
  assertEquals(r.msg, "I tried to put that on the calendar, but ran into a system error. Let me flag Preston directly.");
  assertEquals(jobWrites(db), []);
});

Deno.test("STOP / START / HELP keyword replies unchanged and skip the AI", async () => {
  for (const [word, expect] of [["STOP", "You are unsubscribed"], ["start", "You are opted back in"], ["Help", "Msg&data rates may apply"]] as const) {
    const db = seed();
    const r = await run(db, word, { content: "should not be called" });
    assertStringIncludes(r.msg!, expect);
    assertEquals(r.ai.calls.length, 0);
  }
});

Deno.test("opted-out sender: inbound saved, empty TwiML, no AI", async () => {
  const db = seed();
  db.table("sms_opt_outs").push({ phone_number: SUPER, opted_out: true });
  const r = await run(db, KACHINA_TEXT, { content: FALSE_CLAIM });
  assertEquals(r.msg, null);
  assertStringIncludes(r.xml, "<Response></Response>");
  assertEquals(r.ai.calls.length, 0);
  assertEquals(db.table("dispatch_messages").map((m) => m.direction), ["inbound"]);
});

Deno.test("on-call crew sender: skip superintendent AI (crew skip unchanged)", async () => {
  const db = seed();
  const r = await run(db, "on my way", { content: FALSE_CLAIM }, "+15205550101");
  assertStringIncludes(r.xml, "<Response></Response>");
  assertEquals(r.ai.calls.length, 0);
});

Deno.test("OpenAI error reply unchanged", async () => {
  const db = seed();
  const r = await run(db, KACHINA_TEXT, { error: { message: "rate limited" } });
  assertEquals(r.msg, "System Offline: rate limited");
});

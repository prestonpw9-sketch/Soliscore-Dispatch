/**
 * Inbound superintendent SMS handler for super-processor (Twilio webhook, no login).
 * index.ts wires it to `serve`; tests call handleInboundSms with a fake Supabase
 * client and a fake OpenAI call (see handler.test.ts).
 *
 * Schedule-honesty rules (Nov 2026, Kachina trim incident):
 *   - Only code writes scheduling confirmations, and only after a successful DB write.
 *   - reschedule_job moves ONE existing open job; never inserts.
 *   - With no successful write, the model's free text goes through guardFreeTextReply,
 *     which replaces any "I've scheduled / moved / booked ..." claim with an honest reply.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { formatEmergencyPageMessage, loadCrewDirectory, notifyCrew } from "https://cdn.jsdelivr.net/gh/prestonpw9-sketch/Soliscore-Dispatch@8cbab1d6a7eb2f8b17f16e3350dd8df69deccbeb/supabase/functions/_shared/twilio.ts";
import { phonesMatch } from "https://cdn.jsdelivr.net/gh/prestonpw9-sketch/Soliscore-Dispatch@8cbab1d6a7eb2f8b17f16e3350dd8df69deccbeb/supabase/functions/_shared/phone.ts";
import { shouldSkipSuperintendentAi } from "../_shared/crewInbound.ts";
import {
  formatBoardSpan,
  phoenixNowLabel,
  phoenixYMD,
  resolveBoardDate,
} from "https://cdn.jsdelivr.net/gh/prestonpw9-sketch/Soliscore-Dispatch@8cbab1d6a7eb2f8b17f16e3350dd8df69deccbeb/supabase/functions/_shared/jobDate.ts";
import { runJobGeocode } from "../_shared/geocodeAfterInsert.ts";
import { guardFreeTextReply } from "../_shared/smsScheduleGuard.ts";
import { rescheduleJob } from "../_shared/smsReschedule.ts";

const COMPANY = "Solidcore Plumbing, LLC";
const HELP_CONTACT = "(520) 647-3862";
const PRIVACY_URL = "https://soliscore-dispatch.vercel.app/privacy";
const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"];
const START_WORDS = ["start", "unstop", "yes", "optin", "opt-in"];
const HELP_WORDS = ["help", "info"];
const STOP_REPLY = `${COMPANY}: You are unsubscribed and will receive no more messages. Reply START to opt back in. For help call ${HELP_CONTACT}.`;
const START_REPLY = `${COMPANY}: You are opted back in and will receive messages again. Reply HELP for help, STOP to unsubscribe.`;
const HELP_REPLY = `${COMPANY} dispatch. Msg&data rates may apply. Msg frequency varies. Reply STOP to unsubscribe. Call ${HELP_CONTACT} or see ${PRIVACY_URL}.`;
const VALID_PHASES = new Set(["Underground", "Rough-In", "Top-Out", "Trim/Finish", "Service Call", "T&M"]);

function twiml(msg: string) {
  const escaped = msg.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
}
function emptyTwiml() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, { headers: { "Content-Type": "application/xml" }, status: 200 });
}
function resolveJobDate(raw: unknown, today: string = phoenixYMD()): string { return resolveBoardDate(raw, today); }
function resolveJobEndDate(rawEnd: unknown, start: string, today: string = phoenixYMD()): string {
  if (rawEnd == null || String(rawEnd).trim() === "") return start;
  const end = resolveBoardDate(rawEnd, today);
  return end < start ? start : end;
}
function normalizePhase(raw: unknown): string {
  if (typeof raw === "string" && VALID_PHASES.has(raw)) return raw;
  return "Service Call";
}
export function buildSystemPrompt(today: string): string {
  const year = today.slice(0, 4);
  const nextYear = String(Number(year) + 1);
  return `You are the automated dispatch assistant for Solidcore Plumbing. Your goal is to identify Job Requests from superintendent / customer texts and put them on the dispatch board.\n\nTODAY is ${phoenixNowLabel()} (${today}) in America/Phoenix. The current year is ${year}.\nWhen a superintendent gives a month/day with no year ("11/20", "November 20", "Thursday"), convert it using ${year} — or ${nextYear} if that month/day has already passed this year.\nNEVER use 2023, 2024, or 2025 for new bookings. Those years are in the past. Always include ${year} (or ${nextYear}) in target_date.\n\nRule 1: Domain Boundaries (Out of Scope)\nYou are a plumbing dispatcher, not a personal assistant. If a user asks for food, drinks, or non-plumbing services, gently reject the request. Do NOT log these as jobs.\n\nRule 2: Universal Conversational Grace\nUsers may joke or chit-chat ('lol', 'thanks') at ANY point. Reply naturally, but gently steer them back to getting the necessary job details (Location or Issue).\n\nRule 3: Entity Filtering & Proximity\nFilter out conversational noise when extracting addresses and job details.\n\nRule 4: Emergencies Override\nONLY if a job is a true, un-negated Emergency (e.g., actively flooding, bursting pipes), call log_job immediately with is_emergency=true once you have the address. The system will SMS on-call plumbers. Begin your confirmation with: 'URGENT: Emergency flagged! On-call plumbers are being notified.' Get the address and call log_job with target_date = today if they need someone now, otherwise tomorrow.\n\nRule 5: Logging Jobs Onto The Schedule Board\nDo NOT invent a week-out booking window. Do NOT tell anyone you are booking a week out.\n\nDate rules for STANDARD jobs:\n- If the superintendent names a date or timing ("tomorrow", "Thursday", "July 25", "need it Friday", "ASAP", "needed tomorrow", "pour is Monday", "11/20-11/30"), convert that to YYYY-MM-DD and pass it as target_date on log_job. For a range, also pass target_end_date.\n- If they need it ASAP / as soon as possible / urgently / "needed" without a specific day, use tomorrow's date.\n- If they give no timing at all, omit target_date (the system defaults to tomorrow).\n- Do NOT ask them to pick a date or time — honor what they volunteer; otherwise default to next day.\n\n- STANDARD jobs (repairs, installs, trim, toilet seats, fixtures, warranty work, etc.):\n  Once you have BOTH (a) what work is needed AND (b) a location (street address OR lot + community/subdivision), you MUST call the 'log_job' tool. Saying you "logged" or "noted" a job WITHOUT calling the tool is a failure — the board will stay empty.\n  A lot number plus community (e.g. "lot 415 Stone Canyon") is enough location to log. Prefer logging first; you may still ask for a full street address afterward if it would help the crew.\n  After a successful log_job call, confirm the job is on the board for the scheduled date (include the year ${year}) and that Preston will follow up if needed.\n\n- CRITICAL construction phases (inspection, pre-slab, roof penetration, trim on a hard window):\n  When they already named a date ("Friday", "9/25", "this Friday"), call schedule_job immediately with that date. Do not ask them to reconfirm a date they already gave.\n  Only ask for a hard deadline if they gave NO date at all.\n  Once they provide a deadline/date, you MUST call 'schedule_job' with that date (and target_end_date when they give a range like 11/20-11/30).\n\nRule 6: Moving / Rescheduling EXISTING Jobs\nIf the text is about a job that is probably already on the board and gives it a new or different date ("move", "push", "bump", "reschedule", "change the date", "now starts", "schedule to start on", "pushed to", "instead of the 20th"), call 'reschedule_job'. Do NOT call log_job or schedule_job for that: they create a NEW job and would leave a duplicate on the board.\nPass job_search with the words that identify the job (street name, address, lot + community, builder or job name, e.g. "Kachina"), phase when they name one (e.g. "Trim"), new_date (YYYY-MM-DD, year ${year} or ${nextYear}), new_end_date for a range, and current_date if they say what day it is on now.\nIf you are unsure whether it is a new job or a move and they only gave a street/community name, use reschedule_job: the system only moves a job when exactly one open job matches, and otherwise changes nothing and tells them Preston will confirm.\n\nRule 7: Never Claim A Change You Did Not Make\nNEVER write that something is scheduled, booked, locked in, put on the board/schedule/calendar, moved or rescheduled unless you called a tool for it in this reply. The system writes every confirmation itself after the database write succeeds; any such claim in your own text is discarded. If you cannot call a tool yet, ask for what is missing instead.\n\nHow to Respond:\n- If work type is missing: ask what needs to be done.\n- If location is missing: ask for address or lot/community.\n- If it moves an existing job: call reschedule_job (Rule 6).\n- If Everything is Complete: call the correct tool FIRST, then confirm what was added to the board and for which date (with year ${year}).`;
}
export const tools = [
  { type: "function", function: { name: "log_job", description: "Creates a standard plumbing job on the Solidcore dispatch schedule board.", parameters: { type: "object", properties: { title: { type: "string" }, job_type: { type: "string" }, address: { type: "string" }, target_date: { type: "string" }, target_end_date: { type: "string" }, phase: { type: "string", enum: ["Underground", "Rough-In", "Top-Out", "Trim/Finish", "Service Call", "T&M"] }, notes: { type: "string" }, is_emergency: { type: "boolean" } }, required: ["title", "job_type", "address"] } } },
  { type: "function", function: { name: "schedule_job", description: "Schedules a high-priority construction phase with a known hard deadline onto the dispatch calendar.", parameters: { type: "object", properties: { job_type: { type: "string" }, target_date: { type: "string" }, target_end_date: { type: "string" }, address: { type: "string" }, title: { type: "string" }, phase: { type: "string", enum: ["Underground", "Rough-In", "Top-Out", "Trim/Finish", "Service Call", "T&M"] } }, required: ["job_type", "target_date"] } } },
  { type: "function", function: { name: "reschedule_job", description: "Moves ONE EXISTING open job on the dispatch board to a new date (and optional end date). Use for move / push / reschedule / 'now starts on' requests about a job that is already on the board. Never creates a job. Only writes when exactly one open job matches; otherwise changes nothing.", parameters: { type: "object", properties: { job_search: { type: "string", description: "Words that identify the existing job: street name or address, lot + community, builder, or job title words. Example: 'Kachina' or '13601 N Kachina'." }, phase: { type: "string", description: "Phase named in the text, if any (e.g. 'Trim', 'Rough-In', 'Top-Out', 'Underground')." }, new_date: { type: "string", description: "New start date, YYYY-MM-DD." }, new_end_date: { type: "string", description: "New end date for a range, YYYY-MM-DD." }, current_date: { type: "string", description: "The date the job is on now, if the texter mentioned it, YYYY-MM-DD." } }, required: ["job_search", "new_date"] } } },
];
const TOOL_ERROR_REPLY = "I tried to put that on the calendar, but ran into a system error. Let me flag Preston directly.";
const PARTIAL_ERROR_NOTE = "Part of that hit a system error and was NOT saved. Preston will follow up.";
// deno-lint-ignore no-explicit-any
type Supabase = SupabaseClient<any, "public", any>;
/** Default post-insert job geocode. Non-blocking and never throws; the TwiML reply never waits on it. */
/** Post-insert job geocode. Non-blocking and never throws; the TwiML reply never waits on it. */
function geocodeJobInBackground(client: Supabase, jobId: unknown): void {
  try {
    const task = runJobGeocode(client, jobId).catch((err) => console.error("geocode after SMS insert failed", err));
    (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(task);
  } catch (err) {
    console.error("geocode after SMS insert was not scheduled", err);
  }
}
type JobInsert = { customer_phone: string; title: string; location: string; description: string; status: "scheduled"; date: string; end_date: string; phase: string; service_type: string | null; };
async function recordScheduleAlert(supabase: Supabase, row: { job_id: number | string | null; title: string; location: string; scheduled_date: string; scheduled_end_date: string; phone_number: string; }) {
  const { error } = await supabase.from("dispatch_schedule_alerts").insert({ job_id: row.job_id, title: row.title, location: row.location, scheduled_date: row.scheduled_date, scheduled_end_date: row.scheduled_end_date, phone_number: row.phone_number });
  if (error) console.error("dispatch_schedule_alerts insert failed:", error);
}

export type SmsDeps = {
  supabase: Supabase;
  /** POST body for https://api.openai.com/v1/chat/completions -> parsed JSON response. */
  // deno-lint-ignore no-explicit-any
  callOpenAI: (body: Record<string, unknown>) => Promise<any>;
  geocodeInBackground?: (client: Supabase, jobId: unknown) => void;
  /** America/Phoenix YYYY-MM-DD; defaults to phoenixYMD(). */
  today?: () => string;
};

export async function handleInboundSms(req: Request, deps: SmsDeps): Promise<Response> {
  try {
    const { supabase, callOpenAI } = deps;
    const geocodeInBackground = deps.geocodeInBackground ?? geocodeJobInBackground;
    const today = deps.today ? deps.today() : phoenixYMD();
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    const incomingMessage = params.get("Body") || "";
    const phoneNumber = params.get("From") || "Unknown";
    const normalized = incomingMessage.trim().toLowerCase().replace(/[^a-z-]/g, "");
    if (STOP_WORDS.includes(normalized)) {
      await supabase.from("sms_opt_outs").upsert({ phone_number: phoneNumber, opted_out: true, updated_at: new Date().toISOString() });
      await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: incomingMessage, direction: "inbound" }, { phone_number: phoneNumber, message: STOP_REPLY, direction: "outbound" }]);
      return twiml(STOP_REPLY);
    }
    if (START_WORDS.includes(normalized)) {
      await supabase.from("sms_opt_outs").upsert({ phone_number: phoneNumber, opted_out: false, updated_at: new Date().toISOString() });
      await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: incomingMessage, direction: "inbound" }, { phone_number: phoneNumber, message: START_REPLY, direction: "outbound" }]);
      return twiml(START_REPLY);
    }
    if (HELP_WORDS.includes(normalized)) {
      await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: incomingMessage, direction: "inbound" }, { phone_number: phoneNumber, message: HELP_REPLY, direction: "outbound" }]);
      return twiml(HELP_REPLY);
    }
    const { data: optRow } = await supabase.from("sms_opt_outs").select("opted_out").eq("phone_number", phoneNumber).maybeSingle();
    if (optRow?.opted_out) {
      if (incomingMessage) await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: incomingMessage, direction: "inbound" }]);
      return emptyTwiml();
    }
    const crew = await loadCrewDirectory(supabase);
    const crewSender = crew.find((c) => c.phone && phonesMatch(c.phone, phoneNumber));
    if (crewSender) {
      const { data: lastOut } = await supabase.from("dispatch_messages").select("created_at, message").eq("phone_number", phoneNumber).eq("direction", "outbound").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (shouldSkipSuperintendentAi({ isDirectoryCrew: true, isOnCall: crewSender.emergency_contact, lastOutboundAt: lastOut?.created_at ? String(lastOut.created_at) : null, lastOutboundMessage: lastOut?.message ? String(lastOut.message) : null })) {
        if (incomingMessage) await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: incomingMessage, direction: "inbound" }]);
        console.log("crew inbound — skipping superintendent job AI", { name: crewSender.name, onCall: crewSender.emergency_contact });
        return emptyTwiml();
      }
    }
    const { data: previousMessages } = await supabase.from("dispatch_messages").select("message, direction").eq("phone_number", phoneNumber).order("created_at", { ascending: false }).limit(6);
    const history = (previousMessages || []).reverse().map((row: { direction: string; message: string }) => ({ role: row.direction === "inbound" ? "user" : "assistant", content: row.message }));
    if (incomingMessage) await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: incomingMessage, direction: "inbound" }]);
    const aiData = await callOpenAI({ model: "gpt-4o", messages: [{ role: "system", content: buildSystemPrompt(today) }, ...history, { role: "user", content: incomingMessage }], tools: tools, tool_choice: "auto" });
    if (aiData.error) {
      console.error("OPENAI REJECTED THE REQUEST:", aiData.error.message);
      return twiml(`System Offline: ${aiData.error.message}`);
    }
    const aiMessage = aiData.choices[0].message;
    let replyText = "";
    // True only when a tool wrote to the jobs table this turn. Gates any "scheduled" wording.
    let anyWrite = false;
    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const confirmations: string[] = [];
      let anyFailed = false;
      // A failed tool whose failure is not already spelled out in `confirmations`.
      let unexplainedFailure = false;
      for (const toolCall of aiMessage.tool_calls) {
        const name = toolCall.function?.name as string;
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(toolCall.function.arguments || "{}"); } catch (parseErr) { console.error("Failed to parse tool args:", parseErr); anyFailed = true; unexplainedFailure = true; continue; }
        if (name === "log_job") {
          const title = String(args.title || args.job_type || "SMS job request").trim();
          const jobType = String(args.job_type || title).trim();
          const address = String(args.address || "Address pending").trim();
          const phase = normalizePhase(args.phase);
          const notes = typeof args.notes === "string" ? args.notes.trim() : "";
          const date = resolveJobDate(args.target_date, today);
          const endDate = resolveJobEndDate(args.target_end_date, date, today);
          const when = formatBoardSpan(date, endDate);
          const description = [jobType, notes].filter(Boolean).join(" — ");
          console.log("log_job dates", { raw: args.target_date, rawEnd: args.target_end_date, date, endDate });
          const row: JobInsert = { customer_phone: phoneNumber, title, location: address, description, status: "scheduled", date, end_date: endDate, phase, service_type: phase === "Service Call" ? "Service Call" : null };
          const { data: inserted, error: dbError } = await supabase.from("jobs").insert([row]).select("id").single();
          if (dbError) { console.error("log_job insert failed:", dbError); anyFailed = true; unexplainedFailure = true; }
          else {
            anyWrite = true;
            geocodeInBackground(supabase, inserted?.id);
            await recordScheduleAlert(supabase, { job_id: inserted?.id ?? null, title, location: address, scheduled_date: date, scheduled_end_date: endDate, phone_number: phoneNumber });
            if (args.is_emergency === true) {
              const page = await notifyCrew(supabase, { pageOnCall: true, channel: "sms", message: formatEmergencyPageMessage({ title, address, callerPhone: phoneNumber, notes: notes || jobType }) });
              const names = page.sent.map((s) => s.name).join(", ");
              confirmations.push(page.sent.length ? `URGENT: Emergency flagged! On-call notified (${names}). I've put ${title} at ${address} on the schedule for ${when}.` : `URGENT: Emergency flagged! I logged ${title} at ${address} for ${when}, but could not reach on-call plumbers yet — Preston needs to call the crew. ${page.error ?? ""}`.trim());
            } else {
              confirmations.push(`I've put ${title} at ${address} on the schedule for ${when}. Preston will follow up if anything changes.`);
            }
          }
        } else if (name === "schedule_job") {
          const jobType = String(args.job_type || "Critical phase").trim();
          const targetDate = resolveJobDate(args.target_date, today);
          const endDate = resolveJobEndDate(args.target_end_date, targetDate, today);
          const when = formatBoardSpan(targetDate, endDate);
          const address = String(args.address || "Address pending").trim();
          const title = String(args.title || `${jobType} — ${address}`).trim();
          const phase = normalizePhase(args.phase ?? "Rough-In");
          console.log("schedule_job dates", { raw: args.target_date, rawEnd: args.target_end_date, targetDate, endDate });
          const row: JobInsert = { customer_phone: phoneNumber, title, location: address, description: jobType, status: "scheduled", date: targetDate, end_date: endDate, phase, service_type: null };
          const { data: inserted, error: dbError } = await supabase.from("jobs").insert([row]).select("id").single();
          if (dbError) { console.error("schedule_job insert failed:", dbError); anyFailed = true; unexplainedFailure = true; }
          else {
            anyWrite = true;
            geocodeInBackground(supabase, inserted?.id);
            await recordScheduleAlert(supabase, { job_id: inserted?.id ?? null, title, location: address, scheduled_date: targetDate, scheduled_end_date: endDate, phone_number: phoneNumber });
            confirmations.push(`Perfect. I've locked in the ${jobType} for ${when} on the board. Preston will review it and confirm the specific time slot with you.`);
          }
        } else if (name === "reschedule_job") {
          const outcome = await rescheduleJob(supabase, args, today);
          console.log("reschedule_job", { args, outcome: outcome.kind, jobId: outcome.kind === "moved" ? outcome.job.id : null, candidates: outcome.kind === "ambiguous" ? outcome.candidates.map((j) => j.id) : null });
          if (outcome.kind === "moved") {
            anyWrite = true;
            const job = outcome.job;
            await recordScheduleAlert(supabase, { job_id: job.id, title: String(job.title ?? "Rescheduled job"), location: String(job.location ?? job.address ?? ""), scheduled_date: outcome.date, scheduled_end_date: outcome.endDate, phone_number: phoneNumber });
          } else if (outcome.kind === "error") {
            console.error("reschedule_job update failed:", outcome.error);
            anyFailed = true;
          }
          // Every outcome carries a code-written, truthful reply (moved / no match / several / error).
          confirmations.push(outcome.reply);
        } else { console.error("Unknown tool:", name); anyFailed = true; unexplainedFailure = true; }
      }
      if (confirmations.length > 0) {
        replyText = confirmations.join(" ");
        if (unexplainedFailure) replyText += ` ${PARTIAL_ERROR_NOTE}`;
      } else if (anyFailed) {
        replyText = TOOL_ERROR_REPLY;
      } else {
        replyText = typeof aiMessage.content === "string" ? aiMessage.content : "";
      }
    } else {
      replyText = typeof aiMessage.content === "string" ? aiMessage.content : "";
    }
    // Last gate before anything is sent: with no successful DB write this turn,
    // no reply may claim a schedule change (covers the model's free text on every path).
    if (!anyWrite) replyText = guardedFreeText(replyText, phoneNumber, incomingMessage);
    await supabase.from("dispatch_messages").insert([{ phone_number: phoneNumber, message: replyText, direction: "outbound" }]);
    return twiml(replyText);
  } catch (error) {
    console.error("Crash in processing:", error);
    return new Response("Error processing request", { status: 500 });
  }
}

/** No tool wrote anything: never let the model's own text claim a schedule change. */
function guardedFreeText(content: string, phoneNumber: string, incomingMessage: string): string {
  const { reply, replaced } = guardFreeTextReply(content);
  if (replaced) {
    console.warn("super-processor: blocked an unbacked scheduling claim (no tool wrote to the board)", { phoneNumber, incomingMessage, aiText: content });
  }
  return reply;
}

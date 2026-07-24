import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ---- SMS COMPLIANCE (Twilio / carrier required) ----------------------------
const COMPANY = "Solidcore Plumbing, LLC";
const HELP_CONTACT = "(520) 647-3862";
const PRIVACY_URL = "https://soliscore-dispatch.vercel.app/privacy";

const STOP_WORDS = ["stop", "stopall", "unsubscribe", "cancel", "end", "quit", "optout", "opt-out"];
const START_WORDS = ["start", "unstop", "yes", "optin", "opt-in"];
const HELP_WORDS = ["help", "info"];

const STOP_REPLY = `${COMPANY}: You are unsubscribed and will receive no more messages. Reply START to opt back in. For help call ${HELP_CONTACT}.`;
const START_REPLY = `${COMPANY}: You are opted back in and will receive messages again. Reply HELP for help, STOP to unsubscribe.`;
const HELP_REPLY = `${COMPANY} dispatch. Msg&data rates may apply. Msg frequency varies. Reply STOP to unsubscribe. Call ${HELP_CONTACT} or see ${PRIVACY_URL}.`;

const VALID_PHASES = new Set([
  "Underground",
  "Rough-In",
  "Top-Out",
  "Trim/Finish",
  "Service Call",
  "T&M",
]);

function twiml(msg: string) {
  const escaped = msg
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escaped}</Message></Response>`,
    {
      headers: { "Content-Type": "application/xml" },
      status: 200,
    },
  );
}

function emptyTwiml() {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`, {
    headers: { "Content-Type": "application/xml" },
    status: 200,
  });
}

/** Calendar YMD in America/Phoenix (Solidcore's local day). */
function phoenixYMD(offsetDays = 0): string {
  const now = new Date();
  // Shift by offset in Phoenix-local terms: format today, then add days via UTC noon anchor.
  const todayStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // YYYY-MM-DD
  const [y, m, d] = todayStr.split("-").map(Number);
  const anchor = new Date(Date.UTC(y, m - 1, d + offsetDays, 12, 0, 0));
  const yyyy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(anchor.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function nextDayDate(): string {
  return phoenixYMD(1);
}

/** Accept YYYY-MM-DD from the model; otherwise fall back to next Phoenix day. */
function resolveJobDate(raw: unknown): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw.trim())) {
    return raw.trim();
  }
  return nextDayDate();
}

function normalizePhase(raw: unknown): string {
  if (typeof raw === "string" && VALID_PHASES.has(raw)) return raw;
  return "Service Call";
}

const SYSTEM_PROMPT = `You are the automated dispatch assistant for Solidcore Plumbing. Your goal is to identify Job Requests from superintendent / customer texts and put them on the dispatch board.

Rule 1: Domain Boundaries (Out of Scope)
You are a plumbing dispatcher, not a personal assistant. If a user asks for food, drinks, or non-plumbing services, gently reject the request. Do NOT log these as jobs.

Rule 2: Universal Conversational Grace
Users may joke or chit-chat ('lol', 'thanks') at ANY point. Reply naturally, but gently steer them back to getting the necessary job details (Location or Issue).

Rule 3: Entity Filtering & Proximity
Filter out conversational noise when extracting addresses and job details.

Rule 4: Emergencies Override
ONLY if a job is a true, un-negated Emergency (e.g., actively flooding, bursting pipes), begin your confirmation with: 'URGENT: Emergency flagged! A technician is being immediately notified.' Get the address and call log_job immediately with target_date = tomorrow (or today if they say they need someone now).

Rule 5: Logging Jobs Onto The Schedule Board
Do NOT invent a week-out booking window. Do NOT tell anyone you are booking a week out.

Date rules for STANDARD jobs:
- If the superintendent names a date or timing ("tomorrow", "Thursday", "July 25", "need it Friday", "ASAP", "needed tomorrow", "pour is Monday"), convert that to YYYY-MM-DD and pass it as target_date on log_job.
- If they need it ASAP / as soon as possible / urgently / "needed" without a specific day, use tomorrow's date.
- If they give no timing at all, omit target_date (the system defaults to tomorrow).
- Do NOT ask them to pick a date or time — honor what they volunteer; otherwise default to next day.

- STANDARD jobs (repairs, installs, trim, toilet seats, fixtures, warranty work, etc.):
  Once you have BOTH (a) what work is needed AND (b) a location (street address OR lot + community/subdivision), you MUST call the 'log_job' tool. Saying you "logged" or "noted" a job WITHOUT calling the tool is a failure — the board will stay empty.
  A lot number plus community (e.g. "lot 415 Stone Canyon") is enough location to log. Prefer logging first; you may still ask for a full street address afterward if it would help the crew.
  After a successful log_job call, confirm the job is on the board for the scheduled date and that Preston will follow up if needed.

- CRITICAL construction phases (inspection, pre-slab, roof penetration):
  Immediately ask for their hard deadline, pour date, or crane schedule.
  Once they provide a deadline/date, you MUST call 'schedule_job' with that date.

How to Respond:
- If work type is missing: ask what needs to be done.
- If location is missing: ask for address or lot/community.
- If Everything is Complete: call the correct tool FIRST, then confirm what was added to the board and for which date.`;

const tools = [
  {
    type: "function",
    function: {
      name: "log_job",
      description:
        "Creates a standard plumbing job on the Solidcore dispatch schedule board. Call this whenever service + location are known — including lot/community locations. Do not claim a job is logged unless you call this tool. Pass target_date when the superintendent requested a date or needs it ASAP (use tomorrow); omit it to default to tomorrow.",
      parameters: {
        type: "object",
        properties: {
          title: {
            type: "string",
            description:
              "Short board title, e.g. 'Stone Canyon Lot 415 — Toilet seat covers' or builder + lot.",
          },
          job_type: {
            type: "string",
            description: "What work is needed (e.g. 'Install replacement toilet seat covers').",
          },
          address: {
            type: "string",
            description:
              "Job site location: full street address when known, otherwise lot + community.",
          },
          target_date: {
            type: "string",
            description:
              "Board date YYYY-MM-DD. Use the superintendent's requested date when given; use tomorrow for ASAP/needed/urgent with no day; omit to default to tomorrow.",
          },
          phase: {
            type: "string",
            enum: ["Underground", "Rough-In", "Top-Out", "Trim/Finish", "Service Call", "T&M"],
            description: "Best-fit plumbing phase for the board.",
          },
          notes: {
            type: "string",
            description: "Optional extra context (builder name, contact, special instructions).",
          },
        },
        required: ["title", "job_type", "address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "schedule_job",
      description:
        "Schedules a high-priority construction phase with a known hard deadline onto the dispatch calendar.",
      parameters: {
        type: "object",
        properties: {
          job_type: {
            type: "string",
            description: "The type of job (e.g., 'Pre-slab Inspection', 'Roof Penetration')",
          },
          target_date: {
            type: "string",
            description: "The requested date or deadline in YYYY-MM-DD format",
          },
          address: {
            type: "string",
            description: "The job site address or lot/community",
          },
          title: {
            type: "string",
            description: "Optional short board title; defaults from job_type + address",
          },
          phase: {
            type: "string",
            enum: ["Underground", "Rough-In", "Top-Out", "Trim/Finish", "Service Call", "T&M"],
          },
        },
        required: ["job_type", "target_date"],
      },
    },
  },
];

type JobInsert = {
  customer_phone: string;
  title: string;
  location: string;
  description: string;
  status: "scheduled";
  date: string;
  end_date: string;
  phase: string;
  service_type: string | null;
};

serve(async (req) => {
  try {
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    const incomingMessage = params.get("Body") || "";
    const phoneNumber = params.get("From") || "Unknown";

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ---- COMPLIANCE: handle STOP / START / HELP keywords FIRST -------------
    const normalized = incomingMessage.trim().toLowerCase().replace(/[^a-z-]/g, "");

    if (STOP_WORDS.includes(normalized)) {
      await supabase
        .from("sms_opt_outs")
        .upsert({ phone_number: phoneNumber, opted_out: true, updated_at: new Date().toISOString() });
      await supabase.from("dispatch_messages").insert([
        { phone_number: phoneNumber, message: incomingMessage, direction: "inbound" },
        { phone_number: phoneNumber, message: STOP_REPLY, direction: "outbound" },
      ]);
      return twiml(STOP_REPLY);
    }

    if (START_WORDS.includes(normalized)) {
      await supabase
        .from("sms_opt_outs")
        .upsert({ phone_number: phoneNumber, opted_out: false, updated_at: new Date().toISOString() });
      await supabase.from("dispatch_messages").insert([
        { phone_number: phoneNumber, message: incomingMessage, direction: "inbound" },
        { phone_number: phoneNumber, message: START_REPLY, direction: "outbound" },
      ]);
      return twiml(START_REPLY);
    }

    if (HELP_WORDS.includes(normalized)) {
      await supabase.from("dispatch_messages").insert([
        { phone_number: phoneNumber, message: incomingMessage, direction: "inbound" },
        { phone_number: phoneNumber, message: HELP_REPLY, direction: "outbound" },
      ]);
      return twiml(HELP_REPLY);
    }

    // ---- If the number has opted out, do NOT auto-reply -------------------
    const { data: optRow } = await supabase
      .from("sms_opt_outs")
      .select("opted_out")
      .eq("phone_number", phoneNumber)
      .maybeSingle();
    if (optRow?.opted_out) {
      if (incomingMessage) {
        await supabase.from("dispatch_messages").insert([
          { phone_number: phoneNumber, message: incomingMessage, direction: "inbound" },
        ]);
      }
      return emptyTwiml();
    }

    // ---- Normal AI dispatch flow -----------------------------------------
    const { data: previousMessages } = await supabase
      .from("dispatch_messages")
      .select("message, direction")
      .eq("phone_number", phoneNumber)
      .order("created_at", { ascending: false })
      .limit(6);

    const history = (previousMessages || []).reverse().map((row) => ({
      role: row.direction === "inbound" ? "user" : "assistant",
      content: row.message,
    }));

    if (incomingMessage) {
      await supabase.from("dispatch_messages").insert([
        { phone_number: phoneNumber, message: incomingMessage, direction: "inbound" },
      ]);
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...history,
          { role: "user", content: incomingMessage },
        ],
        tools: tools,
        tool_choice: "auto",
      }),
    });

    const aiData = await aiResponse.json();

    if (aiData.error) {
      console.error("OPENAI REJECTED THE REQUEST:", aiData.error.message);
      return twiml(`System Offline: ${aiData.error.message}`);
    }

    const aiMessage = aiData.choices[0].message;
    let replyText = "";

    if (aiMessage.tool_calls && aiMessage.tool_calls.length > 0) {
      const confirmations: string[] = [];
      let anyFailed = false;

      for (const toolCall of aiMessage.tool_calls) {
        const name = toolCall.function?.name as string;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(toolCall.function.arguments || "{}");
        } catch (parseErr) {
          console.error("Failed to parse tool args:", parseErr);
          anyFailed = true;
          continue;
        }

        if (name === "log_job") {
          const title = String(args.title || args.job_type || "SMS job request").trim();
          const jobType = String(args.job_type || title).trim();
          const address = String(args.address || "Address pending").trim();
          const phase = normalizePhase(args.phase);
          const notes = typeof args.notes === "string" ? args.notes.trim() : "";
          const date = resolveJobDate(args.target_date);
          const description = [jobType, notes].filter(Boolean).join(" — ");

          const row: JobInsert = {
            customer_phone: phoneNumber,
            title,
            location: address,
            description,
            status: "scheduled",
            date,
            end_date: date,
            phase,
            service_type: phase === "Service Call" ? "Service Call" : null,
          };

          const { error: dbError } = await supabase.from("jobs").insert([row]);
          if (dbError) {
            console.error("log_job insert failed:", dbError);
            anyFailed = true;
          } else {
            confirmations.push(
              `I've put ${title} at ${address} on the schedule for ${date}. Preston will follow up if anything changes.`,
            );
          }
        } else if (name === "schedule_job") {
          const jobType = String(args.job_type || "Critical phase").trim();
          const targetDate = resolveJobDate(args.target_date);
          const address = String(args.address || "Address pending").trim();
          const title = String(args.title || `${jobType} — ${address}`).trim();
          const phase = normalizePhase(args.phase ?? "Rough-In");

          const row: JobInsert = {
            customer_phone: phoneNumber,
            title,
            location: address,
            description: jobType,
            status: "scheduled",
            date: targetDate,
            end_date: targetDate,
            phase,
            service_type: null,
          };

          const { error: dbError } = await supabase.from("jobs").insert([row]);
          if (dbError) {
            console.error("schedule_job insert failed:", dbError);
            anyFailed = true;
          } else {
            confirmations.push(
              `Perfect. I've locked in the ${jobType} for ${targetDate} on the board. Preston will review it and confirm the specific time slot with you.`,
            );
          }
        } else {
          console.error("Unknown tool:", name);
          anyFailed = true;
        }
      }

      if (confirmations.length > 0) {
        replyText = confirmations.join(" ");
      } else if (anyFailed) {
        replyText =
          "I tried to put that on the calendar, but ran into a system error. Let me flag Preston directly.";
      } else {
        replyText = aiMessage.content || "I am processing your request.";
      }
    } else {
      replyText = aiMessage.content || "I am processing your request.";
    }

    await supabase.from("dispatch_messages").insert([
      { phone_number: phoneNumber, message: replyText, direction: "outbound" },
    ]);

    return twiml(replyText);
  } catch (error) {
    console.error("Crash in processing:", error);
    return new Response("Error processing request", { status: 500 });
  }
});

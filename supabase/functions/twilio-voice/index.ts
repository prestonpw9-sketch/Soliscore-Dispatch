import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { escapeXml } from "../_shared/phone.ts";
import { loadCrewDirectory, pickEmergencyRecipients } from "../_shared/twilio.ts";

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>${body}`, {
    headers: { "Content-Type": "text/xml" },
    status: 200,
  });
}

function publicFnUrl(req: Request, extraQuery = ""): string {
  const incoming = new URL(req.url);
  const base = Deno.env.get("SUPABASE_URL") ?? `${incoming.origin}`;
  const qs = extraQuery.startsWith("?") || extraQuery === "" ? extraQuery : `?${extraQuery}`;
  return `${base}/functions/v1/twilio-voice${qs}`;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const bodyText = await req.text();
    const params = new URLSearchParams(bodyText);
    for (const [key, value] of params) {
      if (!url.searchParams.has(key)) url.searchParams.set(key, value);
    }

    const step = url.searchParams.get("step") || "welcome";
    const digits = (url.searchParams.get("Digits") || params.get("Digits") || "").trim();
    const dialStatus = (params.get("DialCallStatus") || url.searchParams.get("DialCallStatus") || "").toLowerCase();

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const fromNumber = Deno.env.get("TWILIO_PHONE_NUMBER") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (step === "welcome") {
      const action = publicFnUrl(req, "?step=menu");
      return xml(`<Response>
  <Gather numDigits="1" timeout="8" action="${escapeXml(action)}" method="POST">
    <Say voice="Polly.Matthew">You've reached Solidcore Plumbing dispatch. If this is a plumbing emergency, press 1 to be connected to an on-call plumber. Press 2 to leave a short message.</Say>
  </Gather>
  <Say voice="Polly.Matthew">Sorry we missed you. Please text this number with your address and the issue.</Say>
</Response>`);
    }

    if (step === "menu") {
      if (digits === "2") {
        const action = publicFnUrl(req, "?step=voicemail");
        return xml(`<Response>
  <Say voice="Polly.Matthew">Leave your name, address, and the problem after the beep.</Say>
  <Record maxLength="90" playBeep="true" action="${escapeXml(action)}" method="POST" />
</Response>`);
      }

      const crew = await loadCrewDirectory(supabase);
      const onCall = pickEmergencyRecipients(crew);
      if (!onCall.length) {
        return xml(`<Response>
  <Say voice="Polly.Matthew">No on-call plumber has a number in the directory yet. Please text this number with your address and the issue. Goodbye.</Say>
</Response>`);
      }
      return dialIndex(req, onCall, 0, fromNumber);
    }

    if (step === "dial") {
      const crew = await loadCrewDirectory(supabase);
      const onCall = pickEmergencyRecipients(crew);
      const index = Number(url.searchParams.get("i") || "0");
      const answered = dialStatus === "completed" || dialStatus === "answered";
      if (answered) {
        return xml(`<Response><Hangup/></Response>`);
      }
      if (index >= onCall.length) {
        return xml(`<Response>
  <Say voice="Polly.Matthew">We could not reach an on-call plumber. Please text this number with your address and the issue. Goodbye.</Say>
</Response>`);
      }
      return dialIndex(req, onCall, index, fromNumber);
    }

    if (step === "voicemail") {
      const recordingUrl = params.get("RecordingUrl") || "";
      const from = params.get("From") || "Unknown";
      await supabase.from("dispatch_messages").insert({
        phone_number: from,
        message: recordingUrl
          ? `Voice message left (emergency line). Recording: ${recordingUrl}`
          : "Voice message left (emergency line).",
        direction: "inbound",
      });
      return xml(`<Response>
  <Say voice="Polly.Matthew">Thanks. Dispatch will follow up. Goodbye.</Say>
</Response>`);
    }

    return xml(`<Response><Say voice="Polly.Matthew">Goodbye.</Say></Response>`);
  } catch (error) {
    console.error("twilio-voice error:", error);
    return xml(`<Response><Say voice="Polly.Matthew">Sorry, dispatch is offline. Please try again.</Say></Response>`);
  }
});

function dialIndex(
  req: Request,
  onCall: Array<{ name: string; phone: string | null }>,
  index: number,
  callerId: string,
) {
  const tech = onCall[index];
  if (!tech?.phone) {
    const next = publicFnUrl(req, `?step=dial&i=${index + 1}`);
    return xml(`<Response><Redirect method="POST">${escapeXml(next)}</Redirect></Response>`);
  }
  const action = publicFnUrl(req, `?step=dial&i=${index + 1}`);
  const callerAttr = callerId ? ` callerId="${escapeXml(callerId)}"` : "";
  return xml(`<Response>
  <Say voice="Polly.Matthew">Connecting you to ${escapeXml(tech.name)}.</Say>
  <Dial timeout="22"${callerAttr} action="${escapeXml(action)}" method="POST">
    <Number>${escapeXml(tech.phone)}</Number>
  </Dial>
</Response>`);
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { handleInboundSms } from "./handler.ts";

// Inbound superintendent SMS (Twilio webhook, verify_jwt = false). All logic is in handler.ts.
async function callOpenAI(body: Record<string, unknown>) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${Deno.env.get("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

serve((req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  return handleInboundSms(req, { supabase: createClient(supabaseUrl, supabaseKey), callOpenAI });
});

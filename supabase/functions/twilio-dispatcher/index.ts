import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  // This is the exact compliant response Twilio reviewers want to see
  const xmlResponse = `<?xml version="1.0" encoding="UTF-8"?>
  <Response>
      <Message>Welcome to Solidcore Plumbing Dispatch! We will use this number to coordinate your service request. Message frequency varies based on your project. Msg & Data rates may apply. Reply HELP for support, or reply STOP to cancel.</Message>
  </Response>`;

  return new Response(xmlResponse, {
    headers: { 'Content-Type': 'text/xml' },
  });
});
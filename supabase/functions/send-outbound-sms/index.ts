The corrected Edge Function from the previous message got cut off. Here it is in full:

ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

// ── Handler ────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // FIX: validate method — only POST should reach the Twilio call
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    // FIX: validate request body before using values
    let phone: string;
    let message: string;

    try {
      const body = await req.json() as Record<string, unknown>;
      phone   = typeof body.phone   === 'string' ? body.phone.trim()   : '';
      message = typeof body.message === 'string' ? body.message.trim() : '';
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }

    if (!phone)   return jsonResponse({ error: 'Missing required field: phone.'   }, 400);
    if (!message) return jsonResponse({ error: 'Missing required field: message.' }, 400);

    // FIX: check env vars before use — a missing secret gives a clear 500
    // rather than a cryptic Twilio auth error or a `btoa(undefined)` string
    const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID');
    const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
    const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER');

    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
      console.error('Missing Twilio environment variables');
      return jsonResponse({ error: 'Server misconfiguration: Twilio secrets not set.' }, 500);
    }

    // Send via Twilio Messages API
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append('To',   phone);
    formData.append('From', TWILIO_PHONE);
    formData.append('Body', message);

    const twilioRes = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Content-Type':  'application/x-www-form-urlencoded',
        'Authorization': `Basic ${btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`)}`,
      },
      body: formData,
    });

    const data = await twilioRes.json();

    // FIX: forward Twilio's actual status code instead of always returning 200.
    // A 400 from Twilio (invalid number, unverified trial recipient, etc.)
    // was previously swallowed and the dashboard saw a fake success response.
    if (!twilioRes.ok) {
      console.error('Twilio error:', data);
      return jsonResponse({ error: data.message ?? 'Twilio request failed.', detail: data }, twilioRes.status);
    }

    return jsonResponse({ sid: data.sid, status: data.status }, 200);

  } catch (err) {
    // FIX: @ts-nocheck removed — narrow error type properly
    const msg = getErrorMessage(err, 'Unexpected server error.');
    console.error('Edge function error:', err);
    return jsonResponse({ error: msg }, 500);
  }
});
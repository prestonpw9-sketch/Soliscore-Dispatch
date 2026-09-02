import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { probeTwilioAuth } from '../_shared/twilioAuth.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authorization header.' }, 401);
  }

  const probed = await probeTwilioAuth();
  return jsonResponse(probed, probed.ok ? 200 : 502);
});

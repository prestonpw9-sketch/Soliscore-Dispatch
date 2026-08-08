import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import {
  CORS_HEADERS,
  handleDispatchAiChat,
  jsonResponse,
} from '../_shared/dispatchAi.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405);
  }

  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json() as Record<string, unknown>;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }

    return await handleDispatchAiChat(req, body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected server error.';
    console.error('gemini-chat error:', err);
    return jsonResponse({ error: msg }, 500);
  }
});

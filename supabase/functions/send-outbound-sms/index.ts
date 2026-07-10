import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

const SYSTEM_PROMPT = `You are an AI assistant embedded in SOLIDCORE Dispatch,
a field service management platform for plumbing contractors.
Help dispatchers manage jobs, schedule technicians, and communicate with customers.
Be concise and practical.`;

const DEFAULT_MODEL = 'gemini-2.5-flash';

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  role:    'user' | 'assistant' | 'system';
  content: string;
}

interface SelectedJob {
  id:           string | number;
  customerName: string;
  address:      string;
  description:  string;
  tech:         string;
  phase:        string;
}

interface SOLIDCOREContext {
  activeJobs?:        number;
  techsOnDuty?:       string[];
  pendingDispatches?: number;
  currentPage?:       string;
  selectedJob?:       SelectedJob | null;
}

interface AIRequestOptions {
  temperature?:  number;
  maxTokens?:    number;
  systemPrompt?: string;
}

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

function buildSystemPrompt(ctx: SOLIDCOREContext, override?: string): string {
  if (override) return override;

  const lines = [SYSTEM_PROMPT];
  if (ctx.currentPage)                     lines.push(`Current view: ${ctx.currentPage}.`);
  if (ctx.activeJobs !== undefined)        lines.push(`Active jobs: ${ctx.activeJobs}.`);
  if (ctx.pendingDispatches !== undefined) lines.push(`Pending dispatches: ${ctx.pendingDispatches}.`);
  if (ctx.techsOnDuty?.length)             lines.push(`Techs on duty: ${ctx.techsOnDuty.join(', ')}.`);
  if (ctx.selectedJob) {
    const j = ctx.selectedJob;
    lines.push(`Focused job: #${j.id} — ${j.customerName}, Phase: ${j.phase}, Tech: ${j.tech}.`);
  }
  return lines.join('\n');
}

async function handleAiChat(req: Request, body: Record<string, unknown>): Promise<Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing authorization header.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Server misconfiguration.' }, 500);
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return jsonResponse({ error: 'Unauthorized — sign out and sign back in.' }, 401);
  }

  const apiKey =
    Deno.env.get('GEMINI_API_KEY') ??
    Deno.env.get('VITE_GEMINI_API_KEY');

  if (!apiKey) {
    return jsonResponse({
      error: 'Gemini API key is not configured. Add VITE_GEMINI_API_KEY in Supabase Edge Function secrets.',
    }, 500);
  }

  const messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : [];
  const context  = (body.context  ?? {}) as SOLIDCOREContext;
  const options  = (body.options  ?? {}) as AIRequestOptions;

  if (messages.length === 0) {
    return jsonResponse({ error: 'Missing required field: messages.' }, 400);
  }

  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;
  const systemInstruction = buildSystemPrompt(context, options.systemPrompt);

  const contents = messages
    .filter(m => m.role !== 'system' && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      role:  m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

  if (contents.length === 0) {
    return jsonResponse({ error: 'No valid messages to send.' }, 400);
  }

  const geminiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const geminiRes = await fetch(geminiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemInstruction }] },
      contents,
      generationConfig: {
        temperature:     options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens   ?? 1024,
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });

  const geminiData = await geminiRes.json();

  if (!geminiRes.ok) {
    const message =
      geminiData?.error?.message ??
      geminiData?.message ??
      'Gemini request failed.';
    return jsonResponse({ error: message, detail: geminiData }, geminiRes.status);
  }

  const reply =
    geminiData?.candidates?.[0]?.content?.parts
      ?.map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim() ?? '';

  if (!reply) {
    const blockReason = geminiData?.candidates?.[0]?.finishReason ?? 'unknown';
    return jsonResponse({ error: `No response from Gemini (${blockReason}).` }, 502);
  }

  return jsonResponse({ reply }, 200);
}

async function handleOutboundSms(body: Record<string, unknown>): Promise<Response> {
  const phone   = typeof body.phone   === 'string' ? body.phone.trim()   : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';

  if (!phone)   return jsonResponse({ error: 'Missing required field: phone.'   }, 400);
  if (!message) return jsonResponse({ error: 'Missing required field: message.' }, 400);

  const TWILIO_SID   = Deno.env.get('TWILIO_ACCOUNT_SID');
  const TWILIO_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN');
  const TWILIO_PHONE = Deno.env.get('TWILIO_PHONE_NUMBER');

  if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_PHONE) {
    return jsonResponse({ error: 'Server misconfiguration: Twilio secrets not set.' }, 500);
  }

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

  if (!twilioRes.ok) {
    return jsonResponse({ error: data.message ?? 'Twilio request failed.', detail: data }, twilioRes.status);
  }

  return jsonResponse({ sid: data.sid, status: data.status }, 200);
}

// ── Handler ────────────────────────────────────────────────────────────────

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

    if (body.action === 'ai-chat' || Array.isArray(body.messages)) {
      return await handleAiChat(req, body);
    }

    return await handleOutboundSms(body);
  } catch (err) {
    const msg = getErrorMessage(err, 'Unexpected server error.');
    console.error('send-outbound-sms error:', err);
    return jsonResponse({ error: msg }, 500);
  }
});

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ───────────────────────────────────────────────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
} as const;

const SYSTEM_PROMPT = `You are an AI assistant embedded in SOLIDCORE Dispatch,
a field service management platform for plumbing contractors in Arizona.
Help dispatchers manage jobs, schedule technicians, and communicate with customers.
Use the current date/time provided in context — never guess the time.
Give complete, concise answers (do not trail off mid-sentence).
Job status 'scheduled' means not yet marked active on the board, even if start time has passed.
If no focused job is selected, use today's open jobs list from context.
When asked to draft customer updates, list the relevant jobs by customer name and write ready-to-send SMS-style messages — do not ask the user to pick a job if today's job list is already provided.`;

const DEFAULT_MODEL = 'gemini-2.5-flash';

function resolveGeminiModel(requested?: unknown): string {
  const fromEnv = Deno.env.get('GEMINI_MODEL');
  const raw =
    typeof requested === 'string' && requested.trim()
      ? requested.trim()
      : (fromEnv ?? DEFAULT_MODEL);

  if (raw.includes('2.0-flash') || raw === 'gemini-1.5-flash' || raw === 'gemini-1.5-pro') {
    return DEFAULT_MODEL;
  }
  return raw;
}

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

interface TodayJobSummary {
  id:           string;
  customerName: string;
  address:      string;
  phase:        string;
  status:       string;
  tech?:        string;
  startTime?:   string;
}

interface SOLIDCOREContext {
  activeJobs?:        number;
  techsOnDuty?:       string[];
  pendingDispatches?: number;
  currentPage?:       string;
  selectedJob?:       SelectedJob | null;
  openJobsToday?:     TodayJobSummary[];
  totalJobsToday?:    number;
  currentDateTime?:   string;
}

interface AIRequestOptions {
  temperature?: number;
  maxTokens?:   number;
  systemPrompt?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function buildSystemPrompt(ctx: SOLIDCOREContext, override?: string): string {
  if (override) return override;

  const lines = [SYSTEM_PROMPT];
  if (ctx.currentDateTime)                 lines.push(`Current date/time (Arizona): ${ctx.currentDateTime}.`);
  if (ctx.currentPage)                     lines.push(`Current view: ${ctx.currentPage}.`);
  if (ctx.activeJobs !== undefined)        lines.push(`Active jobs: ${ctx.activeJobs}.`);
  if (ctx.pendingDispatches !== undefined) lines.push(`Pending dispatches: ${ctx.pendingDispatches}.`);
  if (ctx.techsOnDuty?.length)             lines.push(`Techs on duty today: ${ctx.techsOnDuty.join(', ')}.`);
  if (ctx.openJobsToday?.length) {
    lines.push(`Today's open jobs (${ctx.openJobsToday.length}):`);
    for (const j of ctx.openJobsToday) {
      const tech = j.tech ? `, tech: ${j.tech}` : ', tech: unassigned';
      const time = j.startTime ? `, start: ${j.startTime}` : '';
      lines.push(`- #${j.id} ${j.customerName} @ ${j.address}, phase: ${j.phase}, status: ${j.status}${tech}${time}`);
    }
  } else if (ctx.totalJobsToday === 0) {
    lines.push('Today\'s open jobs: none on the schedule.');
  } else {
    lines.push('No job is currently selected/focused on screen.');
  }
  if (ctx.selectedJob) {
    const j = ctx.selectedJob;
    lines.push(`Focused job: #${j.id} — ${j.customerName}, Phase: ${j.phase}, Tech: ${j.tech}.`);
  }
  return lines.join('\n');
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
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing authorization header.' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return jsonResponse({ error: 'Server misconfiguration.' }, 500);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      console.error('Auth failed:', authError?.message);
      return jsonResponse({ error: 'Unauthorized — sign out and sign back in.' }, 401);
    }

    const apiKey =
      Deno.env.get('GEMINI_API_KEY') ??
      Deno.env.get('VITE_GEMINI_API_KEY');

    if (!apiKey) {
      console.error('Missing Gemini API key secret');
      return jsonResponse({
        error: 'Gemini API key is not configured. Add GEMINI_API_KEY or VITE_GEMINI_API_KEY in Supabase Edge Function secrets.',
      }, 500);
    }

    let messages: ChatMessage[] = [];
    let context: SOLIDCOREContext = {};
    let options: AIRequestOptions = {};

    try {
      const body = await req.json() as Record<string, unknown>;
      messages = Array.isArray(body.messages) ? body.messages as ChatMessage[] : [];
      context  = (body.context  ?? {}) as SOLIDCOREContext;
      options  = (body.options  ?? {}) as AIRequestOptions;
    } catch {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }

    if (messages.length === 0) {
      return jsonResponse({ error: 'Missing required field: messages.' }, 400);
    }

    const model = resolveGeminiModel(body.model);
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
          maxOutputTokens: options.maxTokens   ?? 2048,
        },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      }),
    });

    const geminiData = await geminiRes.json();

    if (!geminiRes.ok) {
      console.error('Gemini API error:', geminiData);
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
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected server error.';
    console.error('gemini-chat error:', err);
    return jsonResponse({ error: msg }, 500);
  }
});

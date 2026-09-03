import { supabase } from '@/lib/supabase';
import type { IAIProvider, AIMessage, AIRequestOptions, SOLIDCOREContext, AIChatResult } from './types';

interface GeminiChatResponse {
  reply?: string;
  error?: string;
  didMutate?: boolean;
  toolsUsed?: string[];
}

async function readFunctionsErrorPayload(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx || typeof ctx !== 'object') return null;

  const jsonFn = (ctx as { json?: unknown }).json;
  if (typeof jsonFn === 'function') {
    try {
      const payload = await jsonFn.call(ctx) as GeminiChatResponse;
      if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
    } catch {
      // Body may already have been consumed, or context is not a Response.
    }
  }

  const rec = ctx as Record<string, unknown>;
  const nestedError = typeof rec.error === 'string' ? rec.error.trim() : '';
  const nestedMessage = typeof rec.message === 'string' ? rec.message.trim() : '';
  const nestedCode = typeof rec.code === 'string' ? rec.code.trim() : '';
  const detail = nestedError || nestedMessage;
  if (detail) {
    return nestedCode && !detail.toLowerCase().includes(nestedCode.toLowerCase())
      ? `${nestedCode}: ${detail}`
      : detail;
  }
  return null;
}

function isRetryableFunctionsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const ctx = (error as { context?: unknown } | null)?.context;
  const ctxMessage = ctx && typeof ctx === 'object' && 'message' in ctx
    ? String((ctx as { message?: unknown }).message ?? '')
    : '';
  const blob = `${message} ${ctxMessage}`.toLowerCase();
  return blob.includes('boot_error')
    || blob.includes('failed to start')
    || blob.includes('failed to send a request')
    || blob.includes('failed to fetch');
}

async function invokeAiChat(
  accessToken: string,
  messages: AIMessage[],
  context: SOLIDCOREContext,
  options: AIRequestOptions,
) {
  const body = {
    action: 'ai-chat' as const,
    model: 'gemini-2.5-flash',
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    context,
    options,
  };
  let last: { data: GeminiChatResponse | null; error: unknown } = { data: null, error: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await supabase.functions.invoke<GeminiChatResponse>('send-outbound-sms', {
      headers: { Authorization: `Bearer ${accessToken}` },
      body,
    });
    last = { data: result.data, error: result.error };
    if (!result.error) return result;
    if (attempt < 2 && isRetryableFunctionsError(result.error)) {
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
      continue;
    }
    return result;
  }
  return last;
}

export class GeminiService implements IAIProvider {
  readonly provider = 'gemini' as const;

  async sendMessage(
    messages: AIMessage[],
    context: SOLIDCOREContext,
    options: AIRequestOptions = {},
  ): Promise<AIChatResult> {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const session = refreshed.session ?? (await supabase.auth.getSession()).data.session;

    if (refreshError || !session) {
      throw new Error('You must be signed in to use the AI assistant.');
    }

    const { data, error } = await invokeAiChat(session.access_token, messages, context, options);

    if (error) {
      const payload = await readFunctionsErrorPayload(error);
      throw new Error(payload ?? error.message ?? 'AI request failed.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.reply) {
      throw new Error('Empty response from AI service.');
    }

    return {
      reply: data.reply,
      didMutate: Boolean(data.didMutate),
      toolsUsed: data.toolsUsed,
    };
  }
}

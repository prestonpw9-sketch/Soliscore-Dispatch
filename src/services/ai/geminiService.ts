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

  if (typeof (ctx as GeminiChatResponse).error === 'string' && (ctx as GeminiChatResponse).error?.trim()) {
    return (ctx as GeminiChatResponse).error ?? null;
  }
  return null;
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

    const { data, error } = await supabase.functions.invoke<GeminiChatResponse>('send-outbound-sms', {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
      body: {
        action: 'ai-chat',
        model:  'gemini-2.5-flash',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        context,
        options,
      },
    });

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

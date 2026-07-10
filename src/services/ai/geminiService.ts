import { supabase } from '@/lib/supabase';
import type { IAIProvider, AIMessage, AIRequestOptions, SOLIDCOREContext } from './types';

interface GeminiChatResponse {
  reply?: string;
  error?: string;
}

const NOT_DEPLOYED_MSG =
  'The AI service is not deployed yet. In Supabase → Edge Functions, deploy gemini-chat.';

export class GeminiService implements IAIProvider {
  readonly provider = 'gemini' as const;

  async sendMessage(
    messages: AIMessage[],
    context: SOLIDCOREContext,
    options: AIRequestOptions = {},
  ): Promise<string> {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const session = refreshed.session ?? (await supabase.auth.getSession()).data.session;

    if (refreshError || !session?.access_token) {
      throw new Error('You must be signed in to use the AI assistant.');
    }

    const url = import.meta.env.VITE_SUPABASE_URL;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anonKey) {
      throw new Error('Missing Supabase configuration.');
    }

    const res = await fetch(`${url}/functions/v1/gemini-chat`, {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${session.access_token}`,
        apikey:         anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        context,
        options,
      }),
    });

    if (res.status === 404) {
      throw new Error(NOT_DEPLOYED_MSG);
    }

    let payload: GeminiChatResponse = {};
    try {
      payload = await res.json() as GeminiChatResponse;
    } catch {
      if (!res.ok) {
        throw new Error(`AI service error (${res.status}).`);
      }
      throw new Error('Invalid response from AI service.');
    }

    if (!res.ok) {
      throw new Error(payload.error ?? `AI service error (${res.status}).`);
    }

    if (payload.error) {
      throw new Error(payload.error);
    }

    if (!payload.reply) {
      throw new Error('Empty response from AI service.');
    }

    return payload.reply;
  }
}

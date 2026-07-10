import { supabase } from '@/lib/supabase';
import type { IAIProvider, AIMessage, AIRequestOptions, SOLIDCOREContext } from './types';

interface GeminiChatResponse {
  reply?: string;
  error?: string;
}

const NOT_DEPLOYED_MSG =
  'The AI service is not deployed yet. In Supabase: Edge Functions → deploy gemini-chat.';

const AUTH_ERROR_MSG =
  'Session expired or blocked by JWT settings. Sign out and back in. In Supabase → gemini-chat → Settings, turn OFF "Verify JWT with legacy secret", then Save.';

export class GeminiService implements IAIProvider {
  readonly provider = 'gemini' as const;

  async sendMessage(
    messages: AIMessage[],
    context: SOLIDCOREContext,
    options: AIRequestOptions = {},
  ): Promise<string> {
    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
    const session = refreshed.session ?? (await supabase.auth.getSession()).data.session;

    if (refreshError || !session) {
      throw new Error('You must be signed in to use the AI assistant.');
    }

    const { data, error } = await supabase.functions.invoke<GeminiChatResponse>('gemini-chat', {
      body: {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        context,
        options,
      },
    });

    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      if (status === 404) throw new Error(NOT_DEPLOYED_MSG);
      if (status === 401) throw new Error(AUTH_ERROR_MSG);
      throw new Error(error.message ?? 'AI request failed.');
    }

    if (data?.error) {
      if (data.error.toLowerCase().includes('unauthorized')) {
        throw new Error(AUTH_ERROR_MSG);
      }
      throw new Error(data.error);
    }

    if (!data?.reply) {
      throw new Error('Empty response from AI service.');
    }

    return data.reply;
  }
}

import { supabase } from '@/lib/supabase';
import type { IAIProvider, AIMessage, AIRequestOptions, SOLIDCOREContext } from './types';

interface GeminiChatResponse {
  reply?: string;
  error?: string;
}

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

    const { data, error } = await supabase.functions.invoke<GeminiChatResponse>('send-outbound-sms', {
      body: {
        action: 'ai-chat',
        model:  'gemini-2.5-flash',
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        context,
        options,
      },
    });

    if (error) {
      const response = (error as { context?: Response }).context;
      if (response) {
        try {
          const payload = await response.json() as GeminiChatResponse;
          if (payload.error) throw new Error(payload.error);
        } catch (parseErr) {
          if (parseErr instanceof Error && parseErr.message !== error.message) {
            throw parseErr;
          }
        }
      }
      throw new Error(error.message ?? 'AI request failed.');
    }

    if (data?.error) {
      throw new Error(data.error);
    }

    if (!data?.reply) {
      throw new Error('Empty response from AI service.');
    }

    return data.reply;
  }
}

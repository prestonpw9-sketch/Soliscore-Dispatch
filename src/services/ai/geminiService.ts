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
    const { data, error } = await supabase.functions.invoke<GeminiChatResponse>('gemini-chat', {
      body: {
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        context,
        options,
      },
    });

    if (error) {
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

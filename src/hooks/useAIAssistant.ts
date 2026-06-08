import { useState, useCallback }          from 'react';
import { useMutation }                    from '@tanstack/react-query';
import { useAIProviderContext }            from '@/services/ai/aiProviderFactory';
import type { AIMessage, AIRequestOptions } from '@/services/ai/types';

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useAIAssistant() {
  const { activeProvider, getActiveProvider, solidcoreContext } = useAIProviderContext();
  const [messages, setMessages] = useState<AIMessage[]>([]);

  const { mutateAsync, isPending, error } = useMutation({
    mutationFn: async ({
      content,
      options,
    }: {
      content: string;
      options?: AIRequestOptions;
    }) => {
      const userMessage: AIMessage = {
        id:        makeId(),
        role:      'user',
        content,
        provider:  activeProvider,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, userMessage]);

      const history  = [...messages, userMessage];
      const provider = getActiveProvider();
      const reply    = await provider.sendMessage(history, solidcoreContext, options);

      const assistantMessage: AIMessage = {
        id:        makeId(),
        role:      'assistant',
        content:   reply,
        provider:  activeProvider,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
      return assistantMessage;
    },
  });

  const sendMessage = useCallback(
    (content: string, options?: AIRequestOptions) => mutateAsync({ content, options }),
    [mutateAsync]
  );

  const clearHistory = useCallback(() => setMessages([]), []);

  return {
    messages,
    sendMessage,
    clearHistory,
    isLoading: isPending,
    error:     error as Error | null,
    activeProvider,
  };
}
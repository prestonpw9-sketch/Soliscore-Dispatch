import { useState, useCallback, useRef } from 'react';
import { useMutation }                   from '@tanstack/react-query';
import { useAIProviderContext }           from '@/services/ai/aiProviderFactory';
import type { AIMessage, AIRequestOptions } from '@/services/ai/types';

/** AppLayout / useDispatchData listen for this after AI schedule or memory writes. */
export const SOLIDCORE_REFRESH_EVENT = 'solidcore:data-refresh';

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function useAIAssistant() {
  const { activeProvider, getActiveProvider, solidcoreContext } = useAIProviderContext();
  const [messages, setMessages] = useState<AIMessage[]>([]);

  const messagesRef = useRef<AIMessage[]>(messages);
  messagesRef.current = messages;

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

      const history  = [...messagesRef.current, userMessage];
      const provider = getActiveProvider();
      const result   = await provider.sendMessage(history, solidcoreContext, options);

      const assistantMessage: AIMessage = {
        id:        makeId(),
        role:      'assistant',
        content:   result.reply,
        provider:  activeProvider,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);

      if (result.didMutate) {
        window.dispatchEvent(new CustomEvent(SOLIDCORE_REFRESH_EVENT, {
          detail: { toolsUsed: result.toolsUsed ?? [] },
        }));
      }

      return assistantMessage;
    },
  });

  const sendMessage = useCallback(
    (content: string, options?: AIRequestOptions) => mutateAsync({ content, options }),
    [mutateAsync],
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

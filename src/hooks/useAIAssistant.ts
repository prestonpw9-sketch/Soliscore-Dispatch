import { useState, useCallback, useRef } from 'react';
import { useMutation }                   from '@tanstack/react-query';
import { useAIProviderContext }           from '@/services/ai/aiProviderFactory';
import type { AIMessage, AIRequestOptions } from '@/services/ai/types';

// ── Helpers ────────────────────────────────────────────────────────────────

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useAIAssistant() {
  const { activeProvider, getActiveProvider, solidcoreContext } = useAIProviderContext();
  const [messages, setMessages] = useState<AIMessage[]>([]);

  // FIX: keep a ref in sync with messages so mutationFn always reads
  // the latest history without needing `messages` in its closure.
  // Reading messages directly inside mutationFn captures the stale value
  // from the render when useMutation was last called — not the current value.
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

      // FIX: use the functional updater form so the new state is based on
      // the latest committed messages, not the stale closure value.
      setMessages(prev => [...prev, userMessage]);

      // FIX: read current history from the ref, not from the stale `messages`
      // closure. messagesRef.current is updated synchronously on every render,
      // so it always reflects the latest committed state.
      const history  = [...messagesRef.current, userMessage];
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
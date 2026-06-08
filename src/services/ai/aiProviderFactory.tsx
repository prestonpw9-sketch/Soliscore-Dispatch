import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { GeminiService }  from './geminiService';
import type { AIProvider, IAIProvider, SOLIDCOREContext } from './types';

let _gemini: GeminiService | null = null;

function getProvider(provider: AIProvider): IAIProvider {
  if (provider === 'gemini') {
    if (!_gemini) _gemini = new GeminiService();
    return _gemini;
  }
  throw new Error(`Provider "${provider}" not configured yet.`);
}

interface AIProviderContextValue {
  activeProvider:    AIProvider;
  setActiveProvider: (p: AIProvider) => void;
  getActiveProvider: () => IAIProvider;
  solidcoreContext:  SOLIDCOREContext;
  updateContext:     (patch: Partial<SOLIDCOREContext>) => void;
}

const AIProviderContext = createContext<AIProviderContextValue | null>(null);

interface AIProviderRootProps {
  children:         ReactNode;
  defaultProvider?: AIProvider;
  initialContext?:  Partial<SOLIDCOREContext>;
}

export function AIProviderRoot({
  children,
  defaultProvider = 'gemini',
  initialContext  = {},
}: AIProviderRootProps) {
  const [activeProvider,   setActiveProvider]   = useState<AIProvider>(defaultProvider);
  const [solidcoreContext, setSolidcoreContext] = useState<SOLIDCOREContext>({
    currentPage:       'Dispatch Board',
    activeJobs:        0,
    pendingDispatches: 0,
    techsOnDuty:       [],
    ...initialContext,
  });

  const getActiveProvider = useCallback(() => getProvider(activeProvider), [activeProvider]);

  const updateContext = useCallback((patch: Partial<SOLIDCOREContext>) => {
    setSolidcoreContext(prev => ({ ...prev, ...patch }));
  }, []);

  return (
    <AIProviderContext.Provider value={{
      activeProvider,
      setActiveProvider,
      getActiveProvider,
      solidcoreContext,
      updateContext,
    }}>
      {children}
    </AIProviderContext.Provider>
  );
}

export function useAIProviderContext(): AIProviderContextValue {
  const ctx = useContext(AIProviderContext);
  if (!ctx) throw new Error('useAIProviderContext must be used inside <AIProviderRoot>');
  return ctx;
}
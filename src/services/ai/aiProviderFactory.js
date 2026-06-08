import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useState, useCallback } from 'react';
import { GeminiService } from './geminiService';
let _gemini = null;
function getProvider(provider) {
    if (provider === 'gemini') {
        if (!_gemini)
            _gemini = new GeminiService();
        return _gemini;
    }
    throw new Error(`Provider "${provider}" not configured yet.`);
}
const AIProviderContext = createContext(null);
export function AIProviderRoot({ children, defaultProvider = 'gemini', initialContext = {}, }) {
    const [activeProvider, setActiveProvider] = useState(defaultProvider);
    const [solidcoreContext, setSolidcoreContext] = useState({
        currentPage: 'Dispatch Board',
        activeJobs: 0,
        pendingDispatches: 0,
        techsOnDuty: [],
        ...initialContext,
    });
    const getActiveProvider = useCallback(() => getProvider(activeProvider), [activeProvider]);
    const updateContext = useCallback((patch) => {
        setSolidcoreContext(prev => ({ ...prev, ...patch }));
    }, []);
    return (_jsx(AIProviderContext.Provider, { value: {
            activeProvider,
            setActiveProvider,
            getActiveProvider,
            solidcoreContext,
            updateContext,
        }, children: children }));
}
export function useAIProviderContext() {
    const ctx = useContext(AIProviderContext);
    if (!ctx)
        throw new Error('useAIProviderContext must be used inside <AIProviderRoot>');
    return ctx;
}

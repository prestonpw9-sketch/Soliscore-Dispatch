import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useRef, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Send, Trash2, X, Loader2 } from 'lucide-react';
import { useAIAssistant } from '@/hooks/useAIAssistant';
import { useAIProviderContext } from '@/services/ai/aiProviderFactory';
import { AI_PROVIDER_CONFIGS } from '@/services/ai/types';
import { AIMessage } from './AIMessage';
const QUICK_PROMPTS = [
    "Summarise today's open jobs",
    "Which techs are available right now?",
    "Draft a customer update for the current job",
    "What jobs are overdue?",
];
export function AIAssistantPanel({ onClose }) {
    const { activeProvider } = useAIProviderContext();
    const { messages, sendMessage, clearHistory, isLoading, error } = useAIAssistant();
    const [input, setInput] = useState('');
    const bottomRef = useRef(null);
    const textareaRef = useRef(null);
    const config = AI_PROVIDER_CONFIGS[activeProvider];
    useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);
    useEffect(() => { textareaRef.current?.focus(); }, []);
    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || isLoading)
            return;
        setInput('');
        await sendMessage(trimmed);
    };
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };
    return (_jsxs("div", { className: "flex flex-col h-full w-72 bg-slate-900 border-l border-slate-800 text-slate-100", children: [_jsxs("div", { className: "flex items-center justify-between px-4 py-3 border-b border-slate-800", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx("span", { className: clsx('text-base font-bold', config.color), children: config.icon }), _jsx("span", { className: "text-sm font-semibold text-white", children: "AI Assistant" }), _jsx("span", { className: clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full', activeProvider === 'gemini' ? 'bg-blue-600/30 text-blue-300' : 'bg-purple-600/30 text-purple-300'), children: config.label })] }), _jsxs("div", { className: "flex items-center gap-1", children: [_jsx("button", { onClick: clearHistory, className: "p-1 text-slate-500 hover:text-slate-200 transition-colors", title: "Clear", children: _jsx(Trash2, { className: "w-3.5 h-3.5" }) }), _jsx("button", { onClick: onClose, className: "p-1 text-slate-500 hover:text-slate-200 transition-colors", title: "Close", children: _jsx(X, { className: "w-3.5 h-3.5" }) })] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto px-3 py-3", children: [messages.length === 0 && !isLoading && (_jsxs("div", { className: "flex flex-col items-center justify-center h-full gap-4 py-8 text-center", children: [_jsx("div", { className: clsx('w-12 h-12 rounded-2xl flex items-center justify-center text-2xl', activeProvider === 'gemini' ? 'bg-blue-600/20' : 'bg-purple-600/20'), children: config.icon }), _jsxs("div", { children: [_jsxs("p", { className: "text-sm font-semibold text-white mb-1", children: [config.label, " ready"] }), _jsxs("p", { className: "text-xs text-slate-400 leading-relaxed", children: ["Ask anything about your jobs,", _jsx("br", {}), "techs, or customers."] })] }), _jsx("div", { className: "w-full space-y-1.5 mt-2", children: QUICK_PROMPTS.map(p => (_jsx("button", { onClick: () => sendMessage(p), className: "w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors", children: p }, p))) })] })), messages.map(msg => _jsx(AIMessage, { message: msg }, msg.id)), isLoading && (_jsxs("div", { className: "flex items-center gap-2 px-3 py-2", children: [_jsx(Loader2, { className: clsx('w-4 h-4 animate-spin', activeProvider === 'gemini' ? 'text-blue-400' : 'text-purple-400') }), _jsxs("span", { className: "text-xs text-slate-400", children: [config.label, " is thinking\u2026"] })] })), error && (_jsx("div", { className: "mx-2 px-3 py-2 bg-red-900/40 border border-red-700 rounded-lg text-xs text-red-300", children: error.message })), _jsx("div", { ref: bottomRef })] }), _jsxs("div", { className: "px-3 pb-3 pt-2 border-t border-slate-800", children: [_jsxs("div", { className: "flex items-end gap-2 bg-slate-800 rounded-xl px-3 py-2", children: [_jsx("textarea", { ref: textareaRef, value: input, onChange: e => setInput(e.target.value), onKeyDown: handleKeyDown, placeholder: `Message ${config.label}…`, rows: 1, className: "flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none outline-none leading-relaxed max-h-28 overflow-y-auto", style: { minHeight: '1.5rem' } }), _jsx("button", { onClick: handleSend, disabled: !input.trim() || isLoading, className: clsx('flex-shrink-0 p-1.5 rounded-lg transition-all', input.trim() && !isLoading
                                    ? activeProvider === 'gemini' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-purple-600 text-white hover:bg-purple-500'
                                    : 'text-slate-600 cursor-not-allowed'), children: _jsx(Send, { className: "w-4 h-4" }) })] }), _jsx("p", { className: "text-[10px] text-slate-600 mt-1.5 text-center", children: "Enter to send \u00B7 Shift+Enter for new line" })] })] }));
}

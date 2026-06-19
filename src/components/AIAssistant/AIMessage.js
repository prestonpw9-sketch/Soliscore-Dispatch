import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { clsx } from 'clsx';
import { AI_PROVIDER_CONFIGS } from '@/services/ai/types';
// ── Helpers ────────────────────────────────────────────────────────────────
// FIX: timestamp may arrive as an ISO string after JSON serialization.
// `JSON.stringify` converts Date → string; `JSON.parse` does not restore it.
// Wrapping in `new Date()` is safe for both a Date object and an ISO string.
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
    });
}
// ── Component ──────────────────────────────────────────────────────────────
export function AIMessage({ message }) {
    const isUser = message.role === 'user';
    // FIX: config can be undefined if message.provider is not a known key —
    // e.g. if a new provider is added to the backend before the frontend type
    // is updated, or if a stored message has a stale provider value.
    const config = AI_PROVIDER_CONFIGS[message.provider];
    const timeLabel = formatTime(message.timestamp);
    return (_jsxs("div", { className: clsx('flex w-full gap-2 mb-3', isUser ? 'justify-end' : 'justify-start'), children: [!isUser && (_jsx("div", { "aria-hidden": "true", className: clsx('flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5', message.provider === 'gemini' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white'), children: config?.icon ?? '🤖' })), _jsxs("div", { className: clsx('flex flex-col max-w-[85%]', isUser ? 'items-end' : 'items-start'), children: [!isUser && config && (_jsx("span", { className: clsx('text-[10px] font-semibold mb-1 tracking-wide uppercase', config.color), children: config.label })), _jsx("div", { className: clsx('px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words', isUser
                            ? 'bg-blue-600 text-white rounded-br-sm'
                            : 'bg-slate-700 text-slate-100 rounded-bl-sm'), children: message.content }), _jsx("time", { dateTime: new Date(message.timestamp).toISOString(), className: "text-[10px] text-slate-500 mt-1", children: timeLabel })] }), isUser && (_jsx("div", { "aria-hidden": "true", className: "flex-shrink-0 w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-200 mt-0.5", children: "D" }))] }));
}

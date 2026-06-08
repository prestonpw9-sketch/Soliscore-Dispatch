import { useRef, useEffect, useState, type KeyboardEvent } from 'react';
import { clsx }                        from 'clsx';
import { Send, Trash2, X, Loader2 }    from 'lucide-react';
import { useAIAssistant }              from '@/hooks/useAIAssistant';
import { useAIProviderContext }         from '@/services/ai/aiProviderFactory';
import { AI_PROVIDER_CONFIGS }         from '@/services/ai/types';
import { AIMessage }                   from './AIMessage';

const QUICK_PROMPTS = [
  "Summarise today's open jobs",
  "Which techs are available right now?",
  "Draft a customer update for the current job",
  "What jobs are overdue?",
];

interface Props { onClose: () => void; }

export function AIAssistantPanel({ onClose }: { onClose: () => void }) {
  const { activeProvider } = useAIProviderContext();
  const { messages, sendMessage, clearHistory, isLoading, error } = useAIAssistant();
  const [input, setInput]   = useState('');
  const bottomRef           = useRef<HTMLDivElement>(null);
  const textareaRef         = useRef<HTMLTextAreaElement>(null);
  const config              = AI_PROVIDER_CONFIGS[activeProvider];

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, isLoading]);
  useEffect(() => { textareaRef.current?.focus(); }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <div className="flex flex-col h-full w-72 bg-slate-900 border-l border-slate-800 text-slate-100">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <span className={clsx('text-base font-bold', config.color)}>{config.icon}</span>
          <span className="text-sm font-semibold text-white">AI Assistant</span>
          <span className={clsx('text-[10px] font-bold px-1.5 py-0.5 rounded-full',
            activeProvider === 'gemini' ? 'bg-blue-600/30 text-blue-300' : 'bg-purple-600/30 text-purple-300')}>
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={clearHistory} className="p-1 text-slate-500 hover:text-slate-200 transition-colors" title="Clear">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-slate-200 transition-colors" title="Close">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        {messages.length === 0 && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-4 py-8 text-center">
            <div className={clsx('w-12 h-12 rounded-2xl flex items-center justify-center text-2xl',
              activeProvider === 'gemini' ? 'bg-blue-600/20' : 'bg-purple-600/20')}>
              {config.icon}
            </div>
            <div>
              <p className="text-sm font-semibold text-white mb-1">{config.label} ready</p>
              <p className="text-xs text-slate-400 leading-relaxed">Ask anything about your jobs,<br />techs, or customers.</p>
            </div>
            <div className="w-full space-y-1.5 mt-2">
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => sendMessage(p)}
                  className="w-full text-left text-xs px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors">
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map(msg => <AIMessage key={msg.id} message={msg} />)}
        {isLoading && (
          <div className="flex items-center gap-2 px-3 py-2">
            <Loader2 className={clsx('w-4 h-4 animate-spin', activeProvider === 'gemini' ? 'text-blue-400' : 'text-purple-400')} />
            <span className="text-xs text-slate-400">{config.label} is thinking…</span>
          </div>
        )}
        {error && (
          <div className="mx-2 px-3 py-2 bg-red-900/40 border border-red-700 rounded-lg text-xs text-red-300">
            {error.message}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 pb-3 pt-2 border-t border-slate-800">
        <div className="flex items-end gap-2 bg-slate-800 rounded-xl px-3 py-2">
          <textarea ref={textareaRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown} placeholder={`Message ${config.label}…`} rows={1}
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 resize-none outline-none leading-relaxed max-h-28 overflow-y-auto"
            style={{ minHeight: '1.5rem' }} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className={clsx('flex-shrink-0 p-1.5 rounded-lg transition-all',
              input.trim() && !isLoading
                ? activeProvider === 'gemini' ? 'bg-blue-600 text-white hover:bg-blue-500' : 'bg-purple-600 text-white hover:bg-purple-500'
                : 'text-slate-600 cursor-not-allowed')}>
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>
  );
}
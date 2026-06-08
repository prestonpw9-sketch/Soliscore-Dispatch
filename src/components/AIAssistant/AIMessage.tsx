import { clsx }                           from 'clsx';
import { AI_PROVIDER_CONFIGS }            from '@/services/ai/types';
import type { AIMessage as AIMessageType } from '@/services/ai/types';

interface Props { message: AIMessageType; }

export function AIMessage({ message }: Props) {
  const isUser    = message.role === 'user';
  const config    = AI_PROVIDER_CONFIGS[message.provider];
  const timeLabel = message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={clsx('flex w-full gap-2 mb-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className={clsx('flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold mt-0.5',
          message.provider === 'gemini' ? 'bg-blue-600 text-white' : 'bg-purple-600 text-white')}>
          {config.icon}
        </div>
      )}
      <div className={clsx('flex flex-col max-w-[85%]', isUser ? 'items-end' : 'items-start')}>
        {!isUser && (
          <span className={clsx('text-[10px] font-semibold mb-1 tracking-wide uppercase', config.color)}>
            {config.label}
          </span>
        )}
        <div className={clsx('px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-slate-700 text-slate-100 rounded-bl-sm')}>
          {message.content}
        </div>
        <span className="text-[10px] text-slate-500 mt-1">{timeLabel}</span>
      </div>
      {isUser && (
        <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center text-xs font-bold text-slate-200 mt-0.5">
          D
        </div>
      )}
    </div>
  );
}
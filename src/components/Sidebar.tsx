Absolutely — let’s do it all at once. Your current Sidebar types are too loose because they use string, which is why AppLayout and Sidebar are fighting each other. The clean fix is to make both files use the same shared ViewKey union instead of mixing strict unions with plain strings. Accurate shared prop types are the right React + TypeScript pattern here.

Replace these files
src/components/types.ts
Use this exact file:

ts
export type ViewKey =
  | 'dashboard'
  | 'calendar'
  | 'tasks'
  | 'customers'
  | 'estimator'
  | 'schedule'
  | 'settings';
src/components/Sidebar.tsx
Replace your whole sidebar with this:

tsx
import { useState } from 'react';
import { clsx } from 'clsx';
import {
  Sparkles,
  MessageSquare,
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Truck,
  Users,
  Calculator,
  Settings,
  X,
} from 'lucide-react';
import { AIAssistantPanel } from '@/components/AIAssistant/AIAssistantPanel';
import SMSPanel from '@/components/SMSPanel';
import { useAIProviderContext } from '@/services/ai/aiProviderFactory';
import { useTwilioMessages } from '@/hooks/useTwilioMessages';
import { AI_PROVIDER_CONFIGS } from '@/services/ai/types';
import type { ViewKey } from './types';

interface SidebarProps {
  activeView: ViewKey;
  onChange: (view: ViewKey) => void;
  open: boolean;
  onClose: () => void;
}

export default function Sidebar({
  activeView,
  onChange,
  open,
  onClose,
}: SidebarProps) {
  const [aiOpen, setAiOpen] = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);
  const { activeProvider } = useAIProviderContext();
  const { unreadCount } = useTwilioMessages();
  const config = AI_PROVIDER_CONFIGS[activeProvider];

  const handleSmsOpen = () => {
    setSmsOpen(prev => !prev);
    if (aiOpen) setAiOpen(false);
  };

  const handleAiOpen = () => {
    setAiOpen(prev => !prev);
    if (smsOpen) setSmsOpen(false);
  };

  const handleNavClick = (viewTarget: ViewKey) => {
    onChange(viewTarget);
    onClose();
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      <div className="flex h-screen shrink-0">
        <div
          className={clsx(
            'bg-slate-900 h-screen w-64 flex flex-col text-slate-300 font-medium border-r border-slate-800 transition-transform duration-300 ease-in-out fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0',
            open ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center mr-3 text-white font-black shadow-inner">
                S
              </div>
              <span className="text-white text-base font-black tracking-wider">
                SOLISCORE
              </span>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
              aria-label="Close layout panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            <button
              type="button"
              onClick={() => handleNavClick('dashboard')}
              className={clsx(
                'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                activeView === 'dashboard'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <LayoutDashboard className="w-4 h-4 mr-3 shrink-0" />
              Dispatch Board
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('calendar')}
              className={clsx(
                'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                activeView === 'calendar'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <CalendarDays className="w-4 h-4 mr-3 shrink-0" />
              Weekly Calendar
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('tasks')}
              className={clsx(
                'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                activeView === 'tasks'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <ClipboardList className="w-4 h-4 mr-3 shrink-0" />
              Daily Tasks
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('schedule')}
              className={clsx(
                'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                activeView === 'schedule'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <Truck className="w-4 h-4 mr-3 shrink-0" />
              Crew Schedule
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('customers')}
              className={clsx(
                'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                activeView === 'customers'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <Users className="w-4 h-4 mr-3 shrink-0" />
              Customers Database
            </button>

            <button
              type="button"
              onClick={() => handleNavClick('estimator')}
              className={clsx(
                'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                activeView === 'estimator'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <Calculator className="w-4 h-4 mr-3 shrink-0" />
              Bid Estimator
            </button>
          </nav>

          <div className="p-3 border-t border-slate-800 bg-slate-950/20 space-y-1 shrink-0">
            <button
              type="button"
              onClick={() => handleNavClick('settings')}
              className={clsx(
                'w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold',
                activeView === 'settings'
                  ? 'bg-blue-600 text-white'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <Settings className="w-4 h-4 mr-3 shrink-0" />
              System Settings
            </button>

            <button
              type="button"
              onClick={handleSmsOpen}
              className={clsx(
                'w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold',
                smsOpen
                  ? 'bg-emerald-600/10 text-emerald-400 border border-emerald-500/20'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <MessageSquare className="w-4 h-4 mr-3 shrink-0" />
              <span>Messaging Matrix</span>
              {unreadCount > 0 && (
                <span className="ml-auto text-[10px] font-black bg-emerald-500 text-white rounded-full min-w-5 h-5 px-1 flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={handleAiOpen}
              className={clsx(
                'w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold',
                aiOpen
                  ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                  : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
              )}
            >
              <Sparkles className="w-4 h-4 mr-3 shrink-0" />
              <span>AI Core Copilot</span>
              <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/10 uppercase tracking-wider">
                {config?.label || 'Pro'}
              </span>
            </button>
          </div>
        </div>

        {smsOpen && <SMSPanel onClose={() => setSmsOpen(false)} />}
        {aiOpen && <AIAssistantPanel onClose={() => setAiOpen(false)} />}
      </div>
    </>
  );
}
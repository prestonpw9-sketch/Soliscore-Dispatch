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
  FileSpreadsheet,
  Settings,
  LogOut,
  Moon,
  Sun,
  X,
} from 'lucide-react';
import { AIAssistantPanel } from '@/components/AIAssistant/AIAssistantPanel';
import SMSPanel from '@/components/SMSPanel';
import { useAIProviderContext } from '@/services/ai/aiProviderFactory';
import { useTwilioMessages } from '@/hooks/useTwilioMessages';
import { AI_PROVIDER_CONFIGS } from '@/services/ai/types';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';


// ── Types ──────────────────────────────────────────────────────────────────


export type ViewKey =
  | 'dashboard'
  | 'calendar'
  | 'tasks'
  | 'customers'
  | 'estimator'
  | 'takeoff'
  | 'schedule'
  | 'settings';

import type { Role } from '@/lib/AuthContext';

// Which roles can see each nav item.
// owner = Preston/Greg (everything), office = read-only everywhere except bids,
// crew = past jobs, blueprints, submittals, photos, quick bid only.
const NAV_ITEMS: { key: ViewKey; label: string; icon: typeof LayoutDashboard; roles: Role[] }[] = [
  { key: 'dashboard', label: 'Dispatch Board',     icon: LayoutDashboard, roles: ['owner', 'office', 'crew'] },
  { key: 'calendar',  label: 'Weekly Calendar',    icon: CalendarDays,    roles: ['owner', 'office', 'crew'] },
  { key: 'tasks',     label: 'Daily Tasks',        icon: ClipboardList,   roles: ['owner', 'office', 'crew'] },
  { key: 'schedule',  label: 'Crew Schedule',      icon: Truck,           roles: ['owner', 'office', 'crew'] },
  { key: 'customers', label: 'Customers Database', icon: Users,           roles: ['owner', 'office'] },
  // Quick Bid Estimator: owners + crew (per Preston). Office is view-only elsewhere.
  { key: 'estimator', label: 'Bid Estimator',      icon: Calculator,      roles: ['owner', 'crew'] },
  // Full Bid Takeoff: OWNERS ONLY — sensitive bid pricing.
  { key: 'takeoff',   label: 'Full Bid Takeoff',   icon: FileSpreadsheet, roles: ['owner'] },
];


interface SidebarProps {
  activeView: ViewKey;
  onChange: (view: ViewKey) => void;
  open: boolean;
  onClose: () => void;
}


// ── Component ──────────────────────────────────────────────────────────────


export default function Sidebar({
  activeView,
  onChange,
  open,
  onClose,
}: SidebarProps) {
  const [aiOpen, setAiOpen]   = useState(false);
  const [smsOpen, setSmsOpen] = useState(false);

  const { activeProvider } = useAIProviderContext();
  const { unreadCount }    = useTwilioMessages();
  const { session, signOut, role } = useAuth();
  const { resolved, setMode } = useTheme();
  const config             = AI_PROVIDER_CONFIGS[activeProvider];


  // ── Handlers ─────────────────────────────────────────────────────────────


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


  // ── Render ────────────────────────────────────────────────────────────────


  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-40 lg:hidden transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <div
        className={clsx(
          'bg-slate-900 h-screen w-64 flex flex-col text-slate-300 font-medium border-r border-slate-800',
          'transition-transform duration-300 ease-in-out',
          'fixed inset-y-0 left-0 z-50 lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center">
            <div className="bg-white rounded-lg p-1 mr-3 shadow-inner flex items-center justify-center">
              <img src="/itdg-logo.png" alt="ITDG" className="h-7 w-auto" />
            </div>
            <span className="text-white text-sm font-black tracking-wide leading-tight">
              ITDG Plumbing
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main nav — filtered by the signed-in user's role */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV_ITEMS.filter(item => role && item.roles.includes(role)).map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.key;
            const activeColor = item.key === 'takeoff' ? 'bg-teal-600 text-white' : 'bg-blue-600 text-white';
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleNavClick(item.key)}
                className={clsx(
                  'flex items-center px-3 py-2.5 rounded-xl text-sm transition-colors w-full font-bold group',
                  isActive ? activeColor : 'hover:bg-slate-800/80 hover:text-white text-slate-400'
                )}
              >
                <Icon className="w-4 h-4 mr-3 shrink-0" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Bottom actions */}
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

          {/* Signed-in user + sign out */}
          <div className="pt-2 mt-1 border-t border-slate-800">
            {session?.user?.email && (
              <div className="px-3 pt-1 pb-1.5">
                <p className="text-[10px] text-slate-500 truncate" title={session.user.email}>
                  Signed in as {session.user.email}
                </p>
                {role && (
                  <span className={clsx(
                    'inline-block mt-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider',
                    role === 'owner' ? 'bg-teal-900/40 text-teal-300'
                      : role === 'office' ? 'bg-blue-900/40 text-blue-300'
                      : 'bg-slate-800 text-slate-400'
                  )}>
                    {role === 'owner' ? 'Owner' : role === 'office' ? 'Office (View Only)' : 'Crew'}
                  </span>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMode(resolved === 'dark' ? 'light' : 'dark')}
              className="w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold text-slate-400 hover:bg-slate-800/80 hover:text-white"
            >
              {resolved === 'dark'
                ? <Sun className="w-4 h-4 mr-3 shrink-0" />
                : <Moon className="w-4 h-4 mr-3 shrink-0" />}
              {resolved === 'dark' ? 'Light Mode' : 'Dark Mode'}
            </button>
            <button
              type="button"
              onClick={() => { void signOut(); }}
              className="w-full flex items-center px-3 py-2 rounded-xl text-xs transition-colors font-bold text-slate-400 hover:bg-red-600/10 hover:text-red-400"
            >
              <LogOut className="w-4 h-4 mr-3 shrink-0" />
              Sign Out
            </button>
          </div>
        </div>
      </div>

      {/* AI Assistant — fixed panel to the right of the sidebar */}
      {aiOpen && (
        <div className="fixed inset-y-0 left-64 w-72 z-40 shadow-2xl">
          <AIAssistantPanel onClose={() => setAiOpen(false)} />
        </div>
      )}

      {/* SMS Panel — centered fullscreen modal overlay */}
      {smsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-6 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setSmsOpen(false); }}
        >
          <SMSPanel onClose={() => setSmsOpen(false)} />
        </div>
      )}
    </>
  );
}
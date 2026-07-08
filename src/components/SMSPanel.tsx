import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';
import { X, Send, Bot, Smartphone, MessageSquare, Trash2, Phone } from 'lucide-react';

/** ITDG dispatch line — shown in Comm Matrix so the team always has it handy. */
export const DISPATCH_PHONE = '(520) 650-6100';
export const DISPATCH_PHONE_TEL = '+15206506100';

interface DispatchMessage {
  id?: string;
  phone_number: string;
  message: string;
  direction: 'inbound' | 'outbound';
  created_at?: string;
}

interface SMSPanelProps {
  onClose: () => void;
}

export default function SMSPanel({ onClose }: SMSPanelProps) {
  const { isOwner } = useAuth();
  const [messages, setMessages] = useState<DispatchMessage[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const [deleting, setDeleting] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Close on Escape — safety net so the panel is never a dead end.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    void fetchMessages();

    const subscription = supabase
      .channel('dispatch_messages_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_messages' },
        payload => {
          const newMessage = payload.new as DispatchMessage;
          setMessages(prev => [...prev, newMessage]);
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'dispatch_messages' },
        payload => {
          const deleted = payload.old as { id?: string };
          if (!deleted.id) return;
          setMessages(prev => prev.filter(m => m.id !== deleted.id));
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(subscription);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activePhone]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('dispatch_messages')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching messages:', error);
      return;
    }

    const typedData = (data ?? []) as DispatchMessage[];
    setMessages(typedData);

    if (!activePhone && typedData.length > 0) {
      setActivePhone(typedData[typedData.length - 1].phone_number);
    }
  };

  const uniquePhones = Array.from(
    new Set(messages.map(m => m.phone_number))
  );

  const activeMessages = messages.filter(m => m.phone_number === activePhone);

  const handleDeleteMessage = async (id: string) => {
    if (!isOwner || deleting) return;

    setDeleting(true);
    const { error } = await supabase.from('dispatch_messages').delete().eq('id', id);
    setDeleting(false);

    if (error) {
      console.error('Failed to delete message:', error);
      return;
    }

    setMessages(prev => prev.filter(m => m.id !== id));
  };

  const handleClearThread = async () => {
    if (!isOwner || !activePhone || deleting) return;

    const threadCount = messages.filter(m => m.phone_number === activePhone).length;
    if (threadCount === 0) return;

    const confirmed = window.confirm(
      `Delete all ${threadCount} message${threadCount === 1 ? '' : 's'} with ${activePhone}? This cannot be undone.`,
    );
    if (!confirmed) return;

    setDeleting(true);
    const { error } = await supabase
      .from('dispatch_messages')
      .delete()
      .eq('phone_number', activePhone);
    setDeleting(false);

    if (error) {
      console.error('Failed to clear conversation:', error);
      return;
    }

    setMessages(prev => prev.filter(m => m.phone_number !== activePhone));
  };

  const handleSendManualMessage = async () => {
    const trimmed = manualText.trim();
    if (!trimmed || !activePhone) return;

    const outboundMessage: DispatchMessage = {
      phone_number: activePhone,
      message: trimmed,
      direction: 'outbound',
    };

    const { error: insertError } = await supabase
      .from('dispatch_messages')
      .insert([outboundMessage]);

    if (insertError) {
      console.error('Failed to save outbound message:', insertError);
      return;
    }

    setManualText('');

    const { data, error: functionError } = await supabase.functions.invoke(
      'send-outbound-sms',
      {
        body: { phone: activePhone, message: trimmed },
      }
    );

    if (functionError) {
      console.error('Failed to send text via Twilio:', functionError);
    } else {
      console.log('Text successfully sent to Twilio!', data);
    }
  };

  return (
    <div className="flex h-[800px] max-h-full w-full max-w-6xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
        <div className="p-5 bg-slate-900 dark:bg-slate-950 text-white shrink-0">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
              <span className="font-black text-lg tracking-tight">Comm Matrix</span>
            </div>
            <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white"
            title="Close Message Matrix"
            type="button"
          >
            <X className="w-4 h-4" />
            </button>
          </div>
          <a
            href={`tel:${DISPATCH_PHONE_TEL}`}
            className="mt-3 flex items-center gap-2 text-sm font-semibold text-indigo-200 hover:text-white transition-colors"
            title="Call dispatch line"
          >
            <Phone className="w-4 h-4 shrink-0" />
            <span>Dispatch: {DISPATCH_PHONE}</span>
          </a>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {uniquePhones.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-sm font-medium">
              No active field communications.
            </div>
          ) : (
            uniquePhones.map(phone => {
              const lastMsg = messages.filter(m => m.phone_number === phone).pop();
              const isActive = activePhone === phone;

              return (
                <button
                  key={phone}
                  type="button"
                  onClick={() => setActivePhone(phone)}
                  className={`w-full text-left p-4 border-b border-slate-200 dark:border-slate-800/50 transition-all flex gap-3 ${
                    isActive
                      ? 'bg-white dark:bg-slate-800 border-l-4 border-l-indigo-600 shadow-sm'
                      : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 border-l-4 border-l-transparent'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                      isActive
                        ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                        : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    <Smartphone className="w-5 h-5" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white">
                      {phone}
                    </div>
                    <div
                      className={`text-xs truncate mt-0.5 ${
                        isActive
                          ? 'text-slate-600 dark:text-slate-300'
                          : 'text-slate-500 dark:text-slate-500'
                      }`}
                    >
                      {lastMsg?.direction === 'outbound' && (
                        <span className="font-bold">You: </span>
                      )}
                      {lastMsg?.message || 'New conversation...'}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="w-2/3 flex flex-col bg-slate-50/30 dark:bg-slate-900 relative">
        {activePhone ? (
          <>
            <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm z-10 shrink-0 gap-3">
              <div className="min-w-0">
                <div className="font-black text-slate-900 dark:text-white text-xl tracking-tight truncate">
                  {activePhone}
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Replying from {DISPATCH_PHONE}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isOwner && activeMessages.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleClearThread()}
                    disabled={deleting}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-red-50 hover:text-red-600 hover:border-red-200 dark:hover:bg-red-500/10 dark:hover:text-red-400 dark:hover:border-red-500/30 transition-colors disabled:opacity-50"
                    title="Delete all messages in this conversation"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear
                  </button>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full border border-emerald-200 dark:border-emerald-500/20 shadow-sm">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </span>
                  AI Active Routing
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
              {activeMessages.map(msg => {
                const isCustomer = msg.direction === 'inbound';
                return (
                  <div
                    key={msg.id ?? `${msg.phone_number}-${msg.created_at ?? msg.message}`}
                    className={`group flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
                  >
                    <div className="flex flex-col gap-1 max-w-[75%]">
                      <div
                        className={`flex items-center gap-2 mb-1 ${
                          isCustomer ? 'justify-start' : 'justify-end'
                        }`}
                      >
                        {!isCustomer && (
                          <Bot className="w-3.5 h-3.5 text-indigo-500" />
                        )}
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                          {isCustomer ? 'Superintendent' : 'Dispatch AI'}
                        </span>
                        {isOwner && msg.id && (
                          <button
                            type="button"
                            onClick={() => void handleDeleteMessage(msg.id!)}
                            disabled={deleting}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-slate-400 hover:text-red-500 transition-all disabled:opacity-50"
                            title="Delete message"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>

                      <div
                        className={`p-4 shadow-sm text-sm leading-relaxed ${
                          isCustomer
                            ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-sm'
                            : 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm shadow-indigo-200 dark:shadow-none'
                        }`}
                      >
                        {msg.message}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
              <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 transition-colors">
                <input
                  type="text"
                  value={manualText}
                  onChange={e => setManualText(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && void handleSendManualMessage()}
                  placeholder="Take over conversation (Manual override)..."
                  className="flex-1 bg-transparent border-none focus:ring-0 text-slate-800 dark:text-slate-100 px-3 placeholder:text-slate-400 outline-none"
                />
                <button
                  onClick={() => void handleSendManualMessage()}
                  disabled={!manualText.trim()}
                  className="p-3 bg-indigo-600 disabled:bg-slate-400 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                  type="button"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-200 dark:border-slate-700 shadow-sm">
              <MessageSquare className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-xl font-black text-slate-900 dark:text-white">
              Signal Standby
            </h3>
            <p className="text-slate-500 mt-1 font-medium">
              Select an active field route to monitor comms.
            </p>
            <a
              href={`tel:${DISPATCH_PHONE_TEL}`}
              className="mt-4 flex items-center gap-2 text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Phone className="w-4 h-4" />
              Dispatch line: {DISPATCH_PHONE}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
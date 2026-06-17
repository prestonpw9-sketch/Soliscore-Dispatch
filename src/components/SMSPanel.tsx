import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Send, Bot, Smartphone, MessageSquare } from 'lucide-react';

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
  const [messages, setMessages] = useState<DispatchMessage[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    <div className="flex h-[800px] w-full max-w-6xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="w-1/3 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
        <div className="p-5 bg-slate-900 dark:bg-slate-950 text-white flex justify-between items-center shrink-0">
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
            <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm z-10 shrink-0">
              <div className="flex items-center gap-3">
                <div className="font-black text-slate-900 dark:text-white text-xl tracking-tight">
                  {activePhone}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full border border-emerald-200 dark:border-emerald-500/20 shadow-sm">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                AI Active Routing
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950">
              {activeMessages.map(msg => {
                const isCustomer = msg.direction === 'inbound';
                return (
                  <div
                    key={`${msg.phone_number}-${msg.created_at ?? msg.message}`}
                    className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
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
          </div>
        )}
      </div>
    </div>
  );
}
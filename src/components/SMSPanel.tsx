import React, { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// Ensure your environment variables are set in your .env file!
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export default function SMSPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<any[]>([]);
  const [activePhone, setActivePhone] = useState<string | null>(null);
  const [manualText, setManualText] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch initial messages and listen for new ones live!
  useEffect(() => {
    fetchMessages();

    // The Magic Realtime Listener
    const subscription = supabase
      .channel('dispatch_messages_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispatch_messages' }, (payload) => {
        // When a new text hits the database, instantly add it to the screen
        setMessages((prev) => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  // Scroll to bottom when a new message arrives
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, activePhone]);

  const fetchMessages = async () => {
    const { data, error } = await supabase
      .from('dispatch_messages')
      .select('*')
      .order('created_at', { ascending: true }); // Oldest first so we scroll down to newest

    if (error) console.error("Error fetching messages:", error);
    else setMessages(data || []);
  };

  // Group messages by phone number to create the "Inbox" list
  const uniquePhones = Array.from(new Set(messages.map((m) => m.phone_number)));
  const activeMessages = messages.filter((m) => m.phone_number === activePhone);

  const handleSendManualMessage = async () => {
    if (!manualText.trim() || !activePhone) return;

    // 1. Log Preston's manual message to the database so it shows on screen
    const { error } = await supabase.from('dispatch_messages').insert([
      { phone_number: activePhone, message: manualText, direction: 'outbound' }
    ]);

    if (!error) {
      setManualText('');
      // Note: We still need to tell Twilio to actually text the customer's phone!
      // We will hook that API call up next.
    }
  };

  return (
    <div className="flex h-[800px] w-full max-w-6xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden border border-gray-200">
      
      {/* LEFT SIDEBAR: Inbox List */}
      <div className="w-1/3 border-r border-gray-200 bg-gray-50 flex flex-col">
        {/* ADDED CLOSE BUTTON HERE */}
        <div className="p-4 bg-gray-800 text-white flex justify-between items-center">
          <span className="font-bold text-lg">Active Dispatches</span>
          <button 
            onClick={onClose} 
            className="p-1.5 hover:bg-gray-700 rounded-lg transition-colors text-gray-300 hover:text-white"
            title="Close Message Matrix"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {uniquePhones.length === 0 ? (
            <div className="p-6 text-center text-gray-400">No active conversations.</div>
          ) : (
            uniquePhones.map((phone) => (
              <div
                key={phone}
                onClick={() => setActivePhone(phone)}
                className={`p-4 border-b border-gray-200 cursor-pointer transition-colors ${
                  activePhone === phone ? 'bg-blue-100 border-l-4 border-blue-600' : 'hover:bg-gray-100'
                }`}
              >
                <div className="font-semibold text-gray-800">{phone}</div>
                <div className="text-sm text-gray-500 truncate">
                  {messages.filter(m => m.phone_number === phone).pop()?.message || 'New conversation...'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL: Live Chat Window */}
      <div className="w-2/3 flex flex-col bg-gray-50">
        {activePhone ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
              <span className="font-bold text-gray-800 text-lg">{activePhone}</span>
              <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full border border-green-200">
                AI Active
              </span>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {activeMessages.map((msg, idx) => {
                const isCustomer = msg.direction === 'inbound';
                return (
                  <div key={idx} className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}>
                    <div
                      className={`max-w-[70%] p-4 rounded-2xl shadow-sm ${
                        isCustomer
                          ? 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                          : 'bg-blue-600 text-white rounded-br-none'
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                );
              })}
              {/* Invisible div to snap scroll to bottom */}
              <div ref={messagesEndRef} />
            </div>

            {/* Manual Override Input */}
            <div className="p-4 bg-white border-t border-gray-200 flex space-x-3">
              <input
                type="text"
                value={manualText}
                onChange={(e) => setManualText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendManualMessage()}
                placeholder="Type to manually text customer..."
                className="flex-1 px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all text-gray-800"
              />
              <button
                onClick={handleSendManualMessage}
                className="px-6 py-3 bg-gray-800 text-white font-bold rounded-lg hover:bg-black transition-colors"
              >
                Send
              </button>
            </div>
          </>
        ) : (
          /* Empty State */
          <div className="flex-1 flex items-center justify-center text-gray-400 flex-col">
            <svg className="w-16 h-16 mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path></svg>
            <p className="text-xl font-semibold">Select a conversation to monitor</p>
          </div>
        )}
      </div>
    </div>
  );
}
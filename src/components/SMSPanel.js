import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { X, Send, Bot, Smartphone, MessageSquare } from 'lucide-react';
export default function SMSPanel({ onClose }) {
    const [messages, setMessages] = useState([]);
    const [activePhone, setActivePhone] = useState(null);
    const [manualText, setManualText] = useState('');
    const messagesEndRef = useRef(null);
    // Close on Escape — safety net so the panel is never a dead end.
    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape')
            onClose(); };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);
    useEffect(() => {
        void fetchMessages();
        const subscription = supabase
            .channel('dispatch_messages_changes')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispatch_messages' }, payload => {
            const newMessage = payload.new;
            setMessages(prev => [...prev, newMessage]);
        })
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
        const typedData = (data ?? []);
        setMessages(typedData);
        if (!activePhone && typedData.length > 0) {
            setActivePhone(typedData[typedData.length - 1].phone_number);
        }
    };
    const uniquePhones = Array.from(new Set(messages.map(m => m.phone_number)));
    const activeMessages = messages.filter(m => m.phone_number === activePhone);
    const handleSendManualMessage = async () => {
        const trimmed = manualText.trim();
        if (!trimmed || !activePhone)
            return;
        const outboundMessage = {
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
        const { data, error: functionError } = await supabase.functions.invoke('send-outbound-sms', {
            body: { phone: activePhone, message: trimmed },
        });
        if (functionError) {
            console.error('Failed to send text via Twilio:', functionError);
        }
        else {
            console.log('Text successfully sent to Twilio!', data);
        }
    };
    return (_jsxs("div", { className: "flex h-[800px] max-h-full w-full max-w-6xl mx-auto bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800", children: [_jsxs("div", { className: "w-1/3 border-r border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex flex-col", children: [_jsxs("div", { className: "p-5 bg-slate-900 dark:bg-slate-950 text-white flex justify-between items-center shrink-0", children: [_jsxs("div", { className: "flex items-center gap-2", children: [_jsx(MessageSquare, { className: "w-5 h-5 text-indigo-400" }), _jsx("span", { className: "font-black text-lg tracking-tight", children: "Comm Matrix" })] }), _jsx("button", { onClick: onClose, className: "p-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors text-slate-300 hover:text-white", title: "Close Message Matrix", type: "button", children: _jsx(X, { className: "w-4 h-4" }) })] }), _jsx("div", { className: "flex-1 overflow-y-auto custom-scrollbar", children: uniquePhones.length === 0 ? (_jsx("div", { className: "p-8 text-center text-slate-400 text-sm font-medium", children: "No active field communications." })) : (uniquePhones.map(phone => {
                            const lastMsg = messages.filter(m => m.phone_number === phone).pop();
                            const isActive = activePhone === phone;
                            return (_jsxs("button", { type: "button", onClick: () => setActivePhone(phone), className: `w-full text-left p-4 border-b border-slate-200 dark:border-slate-800/50 transition-all flex gap-3 ${isActive
                                    ? 'bg-white dark:bg-slate-800 border-l-4 border-l-indigo-600 shadow-sm'
                                    : 'hover:bg-slate-100 dark:hover:bg-slate-800/50 border-l-4 border-l-transparent'}`, children: [_jsx("div", { className: `w-10 h-10 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${isActive
                                            ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400'
                                            : 'bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`, children: _jsx(Smartphone, { className: "w-5 h-5" }) }), _jsxs("div", { className: "flex-1 min-w-0", children: [_jsx("div", { className: "font-bold text-slate-900 dark:text-white", children: phone }), _jsxs("div", { className: `text-xs truncate mt-0.5 ${isActive
                                                    ? 'text-slate-600 dark:text-slate-300'
                                                    : 'text-slate-500 dark:text-slate-500'}`, children: [lastMsg?.direction === 'outbound' && (_jsx("span", { className: "font-bold", children: "You: " })), lastMsg?.message || 'New conversation...'] })] })] }, phone));
                        })) })] }), _jsx("div", { className: "w-2/3 flex flex-col bg-slate-50/30 dark:bg-slate-900 relative", children: activePhone ? (_jsxs(_Fragment, { children: [_jsxs("div", { className: "px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center shadow-sm z-10 shrink-0", children: [_jsx("div", { className: "flex items-center gap-3", children: _jsx("div", { className: "font-black text-slate-900 dark:text-white text-xl tracking-tight", children: activePhone }) }), _jsxs("div", { className: "flex items-center gap-2 px-3 py-1.5 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-full border border-emerald-200 dark:border-emerald-500/20 shadow-sm", children: [_jsxs("span", { className: "relative flex h-2 w-2", children: [_jsx("span", { className: "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" }), _jsx("span", { className: "relative inline-flex rounded-full h-2 w-2 bg-emerald-500" })] }), "AI Active Routing"] })] }), _jsxs("div", { className: "flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-950", children: [activeMessages.map(msg => {
                                    const isCustomer = msg.direction === 'inbound';
                                    return (_jsx("div", { className: `flex ${isCustomer ? 'justify-start' : 'justify-end'}`, children: _jsxs("div", { className: "flex flex-col gap-1 max-w-[75%]", children: [_jsxs("div", { className: `flex items-center gap-2 mb-1 ${isCustomer ? 'justify-start' : 'justify-end'}`, children: [!isCustomer && (_jsx(Bot, { className: "w-3.5 h-3.5 text-indigo-500" })), _jsx("span", { className: "text-[10px] font-bold text-slate-400 uppercase tracking-wider", children: isCustomer ? 'Superintendent' : 'Dispatch AI' })] }), _jsx("div", { className: `p-4 shadow-sm text-sm leading-relaxed ${isCustomer
                                                        ? 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-2xl rounded-tl-sm'
                                                        : 'bg-indigo-600 text-white rounded-2xl rounded-tr-sm shadow-indigo-200 dark:shadow-none'}`, children: msg.message })] }) }, `${msg.phone_number}-${msg.created_at ?? msg.message}`));
                                }), _jsx("div", { ref: messagesEndRef })] }), _jsx("div", { className: "p-5 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0", children: _jsxs("div", { className: "flex items-center gap-3 bg-slate-100 dark:bg-slate-800 p-2 rounded-xl border border-slate-200 dark:border-slate-700 focus-within:border-indigo-500 dark:focus-within:border-indigo-500 transition-colors", children: [_jsx("input", { type: "text", value: manualText, onChange: e => setManualText(e.target.value), onKeyDown: e => e.key === 'Enter' && void handleSendManualMessage(), placeholder: "Take over conversation (Manual override)...", className: "flex-1 bg-transparent border-none focus:ring-0 text-slate-800 dark:text-slate-100 px-3 placeholder:text-slate-400 outline-none" }), _jsx("button", { onClick: () => void handleSendManualMessage(), disabled: !manualText.trim(), className: "p-3 bg-indigo-600 disabled:bg-slate-400 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm", type: "button", children: _jsx(Send, { className: "w-4 h-4" }) })] }) })] })) : (_jsxs("div", { className: "flex-1 flex flex-col items-center justify-center text-slate-400", children: [_jsx("div", { className: "w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4 border border-slate-200 dark:border-slate-700 shadow-sm", children: _jsx(MessageSquare, { className: "w-8 h-8 text-slate-400" }) }), _jsx("h3", { className: "text-xl font-black text-slate-900 dark:text-white", children: "Signal Standby" }), _jsx("p", { className: "text-slate-500 mt-1 font-medium", children: "Select an active field route to monitor comms." })] })) })] }));
}

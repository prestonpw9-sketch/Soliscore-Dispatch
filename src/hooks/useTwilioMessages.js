import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
// ── Hook ───────────────────────────────────────────────────────────────────
export function useTwilioMessages() {
    const [unreadCount, setUnreadCount] = useState(0);
    useEffect(() => {
        // FIX: void the floating async function instead of letting it return
        // a Promise that useEffect silently ignores
        void (async () => {
            const { count, error } = await supabase
                .from('dispatch_messages')
                .select('*', { count: 'exact', head: true })
                .eq('direction', 'inbound');
            // FIX: check error and guard against null — count is null on failure
            if (error) {
                console.error('Failed to fetch unread message count:', error);
                return;
            }
            if (count !== null)
                setUnreadCount(count);
        })();
        // Subscribe to new inbound messages and increment the badge
        const channel = supabase
            .channel('unread_messages_badge')
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispatch_messages' }, payload => {
            if (payload.new.direction === 'inbound') {
                setUnreadCount(prev => prev + 1);
            }
        })
            // FIX: log channel errors and timeouts from the subscribe callback
            .subscribe((status, err) => {
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                console.error('Realtime channel error:', status, err);
            }
        });
        return () => {
            void supabase.removeChannel(channel);
        };
    }, []);
    return { unreadCount };
}

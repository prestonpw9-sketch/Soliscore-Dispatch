import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useTwilioMessages() {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // 1. Get current count of inbound messages
    const fetchInitialCount = async () => {
      const { count } = await supabase
        .from('dispatch_messages')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'inbound'); // Only count texts from customers
        
      if (count) setUnreadCount(count);
    };

    fetchInitialCount();

    // 2. Watch for new messages and bump the counter up instantly
    const subscription = supabase
      .channel('unread_messages_badge')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'dispatch_messages' }, (payload) => {
        if (payload.new.direction === 'inbound') {
          setUnreadCount((prev) => prev + 1);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, []);

  return { unreadCount };
}
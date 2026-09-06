import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/AuthContext';

export interface ScheduleAlert {
  id: string;
  jobId: string | null;
  title: string;
  location: string;
  scheduledDate: string;
  scheduledEndDate: string | null;
  phoneNumber: string | null;
  createdAt: string;
}

interface InboxStateRow {
  messages_seen_at: string;
  alerts_seen_at: string;
}

function mapAlert(row: Record<string, unknown>): ScheduleAlert {
  return {
    id: String(row.id ?? ''),
    jobId: row.job_id == null ? null : String(row.job_id),
    title: String(row.title ?? 'Job'),
    location: String(row.location ?? ''),
    scheduledDate: String(row.scheduled_date ?? ''),
    scheduledEndDate: row.scheduled_end_date ? String(row.scheduled_end_date) : null,
    phoneNumber: row.phone_number ? String(row.phone_number) : null,
    createdAt: String(row.created_at ?? ''),
  };
}

export function useDispatchInbox() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const [unreadCount, setUnreadCount] = useState(0);
  const [scheduledAlerts, setScheduledAlerts] = useState<ScheduleAlert[]>([]);
  const seenRef = useRef<{ messages: string; alerts: string } | null>(null);

  const ensureState = useCallback(async (): Promise<InboxStateRow | null> => {
    if (!userId) return null;
    const now = new Date().toISOString();
    const { data, error } = await supabase
      .from('dispatch_inbox_state')
      .select('messages_seen_at, alerts_seen_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) {
      console.error('Failed to load inbox state:', error);
      return null;
    }
    if (data) {
      seenRef.current = {
        messages: String(data.messages_seen_at),
        alerts: String(data.alerts_seen_at),
      };
      return data as InboxStateRow;
    }
    const alertsEpoch = '1970-01-01T00:00:00.000Z';
    const { data: inserted, error: insertError } = await supabase
      .from('dispatch_inbox_state')
      .insert({
        user_id: userId,
        messages_seen_at: now,
        alerts_seen_at: alertsEpoch,
        updated_at: now,
      })
      .select('messages_seen_at, alerts_seen_at')
      .single();
    if (insertError) {
      console.error('Failed to initialize inbox state:', insertError);
      seenRef.current = { messages: now, alerts: alertsEpoch };
      return { messages_seen_at: now, alerts_seen_at: alertsEpoch };
    }
    seenRef.current = {
      messages: String(inserted.messages_seen_at),
      alerts: String(inserted.alerts_seen_at),
    };
    return inserted as InboxStateRow;
  }, [userId]);

  const refreshCounts = useCallback(async (state?: InboxStateRow | null) => {
    const seen = state ?? (seenRef.current
      ? { messages_seen_at: seenRef.current.messages, alerts_seen_at: seenRef.current.alerts }
      : await ensureState());
    if (!seen) return;

    const [{ count, error: countError }, { data: alerts, error: alertError }] = await Promise.all([
      supabase
        .from('dispatch_messages')
        .select('*', { count: 'exact', head: true })
        .eq('direction', 'inbound')
        .gt('created_at', seen.messages_seen_at),
      supabase
        .from('dispatch_schedule_alerts')
        .select('id, job_id, title, location, scheduled_date, scheduled_end_date, phone_number, created_at')
        .gt('created_at', seen.alerts_seen_at)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    if (countError) console.error('Failed to fetch unread message count:', countError);
    else setUnreadCount(count ?? 0);

    if (alertError) console.error('Failed to fetch schedule alerts:', alertError);
    else setScheduledAlerts((alerts ?? []).map(row => mapAlert(row as Record<string, unknown>)));
  }, [ensureState]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      const state = await ensureState();
      if (!cancelled) await refreshCounts(state);
    })();

    const channel = supabase
      .channel(`dispatch_inbox_${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_messages' },
        payload => {
          const row = payload.new as { direction?: string; created_at?: string };
          if (row.direction !== 'inbound') return;
          const seenAt = seenRef.current?.messages;
          if (seenAt && row.created_at && row.created_at <= seenAt) return;
          setUnreadCount(prev => prev + 1);
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'dispatch_schedule_alerts' },
        payload => {
          const alert = mapAlert(payload.new as Record<string, unknown>);
          const seenAt = seenRef.current?.alerts;
          if (seenAt && alert.createdAt && alert.createdAt <= seenAt) return;
          setScheduledAlerts(prev => [alert, ...prev.filter(a => a.id !== alert.id)]);
        },
      )
      .subscribe((status, err) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Realtime inbox channel error:', status, err);
        }
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId, ensureState, refreshCounts]);

  const markInboxSeen = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    const alertsSeen = seenRef.current?.alerts ?? now;
    const { error } = await supabase
      .from('dispatch_inbox_state')
      .upsert({
        user_id: userId,
        messages_seen_at: now,
        alerts_seen_at: alertsSeen,
        updated_at: now,
      }, { onConflict: 'user_id' });
    if (error) {
      console.error('Failed to mark messages seen:', error);
      return;
    }
    seenRef.current = {
      messages: now,
      alerts: alertsSeen,
    };
    setUnreadCount(0);
  }, [userId]);

  const markAlertsSeen = useCallback(async () => {
    if (!userId) return;
    const now = new Date().toISOString();
    const prevMessages = seenRef.current?.messages ?? now;
    const { error } = await supabase
      .from('dispatch_inbox_state')
      .upsert({
        user_id: userId,
        alerts_seen_at: now,
        messages_seen_at: prevMessages,
        updated_at: now,
      }, { onConflict: 'user_id' });
    if (error) {
      console.error('Failed to mark schedule alerts seen:', error);
      return;
    }
    seenRef.current = {
      messages: prevMessages,
      alerts: now,
    };
    setScheduledAlerts([]);
  }, [userId]);

  return {
    unreadCount,
    scheduledAlerts,
    scheduledAlertCount: scheduledAlerts.length,
    markInboxSeen,
    markAlertsSeen,
  };
}

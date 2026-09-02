'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { t } from '@/i18n';

/**
 * Live updates.
 *
 * Realtime is used as a **change signal, not a data source**: an event only
 * triggers `router.refresh()`, and the server re-renders the page under RLS.
 * Nothing from the payload is displayed, so a subscriber can never see a row
 * the page itself would not have been allowed to fetch.
 *
 * Two things about Supabase Realtime that this component has to respect:
 *
 * 1. The socket needs the user's access token explicitly. Without
 *    `realtime.setAuth()` the subscription is evaluated as `anon`, whatever
 *    the page's own session says.
 * 2. A binding on a table the subscriber cannot read is not skipped — it takes
 *    the **whole channel** down, silently, while still reporting SUBSCRIBED.
 *    So bindings are chosen to match what this viewer may actually read.
 */

type LiveTable = 'sessions' | 'session_participants' | 'waitlist_entries' | 'bookings';

type Subscription = { table: LiveTable; filter: string };

/** Tables `anon` holds a SELECT grant on; the rest are signed-in only. */
const ANONYMOUS_READABLE: readonly LiveTable[] = ['sessions', 'bookings'];

function useLiveRefresh(channelName: string, subscriptions: Subscription[]) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const pendingRefresh = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Subscriptions are rebuilt each render; compare by value, not identity.
  const key = JSON.stringify(subscriptions);

  const scheduleRefresh = useCallback(() => {
    // A burst of changes (several players paying at once) should cause one
    // refresh, not one per row.
    if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
    pendingRefresh.current = setTimeout(() => router.refresh(), 250);
  }, [router]);

  useEffect(() => {
    const supabase = createClient();
    const wanted = JSON.parse(key) as Subscription[];
    let channel: RealtimeChannel | null = null;
    let disposed = false;

    async function connect() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (disposed) return;

      const token = session?.access_token ?? null;
      if (token) {
        await supabase.realtime.setAuth(token);
      }

      const bindings = token
        ? wanted
        : wanted.filter((s) => ANONYMOUS_READABLE.includes(s.table));

      if (bindings.length === 0) return;

      // `supabase.channel(topic)` returns the EXISTING channel when one with
      // that topic is still registered, and adding a binding to an already
      // subscribed channel throws. A unique topic per connection attempt keeps
      // React's double-invoked effects and the auth-change reconnect from
      // colliding; the topic is only a routing key, so uniqueness is free.
      const topic = `${channelName}:${Math.random().toString(36).slice(2, 10)}`;
      let next = supabase.channel(topic);

      for (const binding of bindings) {
        next = next.on(
          'postgres_changes',
          { event: '*', schema: 'public', table: binding.table, filter: binding.filter },
          scheduleRefresh,
        );
      }

      // Cleanup may have run while we were awaiting the session.
      if (disposed) {
        void supabase.removeChannel(next);
        return;
      }

      channel = next;
      next.subscribe((status) => {
        if (!disposed) setConnected(status === 'SUBSCRIBED');
      });
    }

    void connect();

    // Signing in widens what this viewer may subscribe to, so rebuild.
    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        if (channel) void supabase.removeChannel(channel);
        channel = null;
        setConnected(false);
        void connect();
      }
    });

    return () => {
      disposed = true;
      authSubscription.unsubscribe();
      if (pendingRefresh.current) clearTimeout(pendingRefresh.current);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [channelName, key, scheduleRefresh]);

  return connected;
}

function Indicator({ connected }: { connected: boolean }) {
  if (!connected) return null;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-500 dark:text-ink-400"
      title={t.live.tooltip}
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      {t.live.label}
    </span>
  );
}

export function LiveSession({ sessionId }: { sessionId: string }) {
  const connected = useLiveRefresh(`session:${sessionId}`, [
    { table: 'sessions', filter: `id=eq.${sessionId}` },
    { table: 'bookings', filter: `session_id=eq.${sessionId}` },
    { table: 'session_participants', filter: `session_id=eq.${sessionId}` },
    { table: 'waitlist_entries', filter: `session_id=eq.${sessionId}` },
  ]);

  return <Indicator connected={connected} />;
}

export function LiveVenueBookings({ venueId }: { venueId: string }) {
  const connected = useLiveRefresh(`venue:${venueId}`, [
    { table: 'bookings', filter: `venue_id=eq.${venueId}` },
  ]);

  return <Indicator connected={connected} />;
}

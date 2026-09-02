-- ===========================================================================
-- Longsanam — Realtime publication
--
-- These tables are published so the UI can learn that something changed.
-- The client uses the event purely as a signal to re-render from the server;
-- it never reads the payload. That keeps RLS the single place where "who may
-- see this row" is decided, and means a change to a policy cannot be bypassed
-- by a subscriber holding a stale channel.
-- ===========================================================================

do $$
declare
  v_table text;
  v_tables constant text[] := array[
    'sessions',
    'session_participants',
    'waitlist_entries',
    'bookings'
  ];
begin
  foreach v_table in array v_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;

-- Realtime delivers the old row on UPDATE/DELETE only when the replica
-- identity carries it. `full` is what lets a subscriber filter on a column
-- that just changed, which is how a participant leaving a session still
-- reaches that session's channel.
alter table public.session_participants replica identity full;
alter table public.waitlist_entries replica identity full;
alter table public.bookings replica identity full;

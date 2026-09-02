-- ===========================================================================
-- Longsanam — authorization helpers
--
-- All of these are SECURITY DEFINER so that a policy on table A may consult
-- table B without the caller needing rights on B, and without the policy on B
-- re-entering the policy on A (which is how RLS recursion happens).
-- ===========================================================================

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'platform_admin'
  );
$$;

create or replace function public.is_venue_member(p_venue_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.venue_members
    where venue_id = p_venue_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_court_venue_member(p_court_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.courts c
    join public.venue_members vm on vm.venue_id = c.venue_id
    where c.id = p_court_id and vm.user_id = auth.uid()
  );
$$;

create or replace function public.is_session_organizer(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sessions
    where id = p_session_id and organizer_id = auth.uid()
  );
$$;

create or replace function public.is_session_participant(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.session_participants
    where session_id = p_session_id
      and user_id = auth.uid()
      and status in ('joined_pending_payment', 'paid_confirmed', 'refunded', 'cancelled')
  )
  or exists (
    select 1 from public.waitlist_entries
    where session_id = p_session_id and user_id = auth.uid()
  );
$$;

-- A session is publicly readable once the organizer has published it. Drafts
-- and cancelled-before-publish sessions stay private to the organizer.
create or replace function public.session_is_public(p_status public.session_status)
returns boolean
language sql
immutable
as $$
  select p_status in ('open', 'ready_to_book', 'holding_court', 'booked', 'completed');
$$;

-- True when the caller shares any session with the given user, which is what
-- makes a co-participant's display name visible.
create or replace function public.shares_session_with(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.session_participants mine
    join public.session_participants theirs on theirs.session_id = mine.session_id
    where mine.user_id = auth.uid() and theirs.user_id = p_user_id
  )
  or exists (
    select 1 from public.sessions s
    where s.organizer_id = p_user_id
      and (s.organizer_id = auth.uid() or public.session_is_public(s.status))
  )
  or exists (
    select 1
    from public.sessions s
    join public.session_participants sp on sp.session_id = s.id
    where s.organizer_id = auth.uid() and sp.user_id = p_user_id
  );
$$;

-- These three exist purely to break policy cycles. Reading bookings requires
-- checking the session, and reading a session requires checking bookings; a
-- SECURITY DEFINER hop bypasses RLS on the inner table and ends the recursion.

create or replace function public.session_is_published(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and public.session_is_public(s.status)
  );
$$;

create or replace function public.session_has_public_booking(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.sessions s
    where s.id = p_session_id and s.status in ('booked', 'completed')
  );
$$;

create or replace function public.is_booking_venue_member(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.bookings b
    join public.venue_members vm on vm.venue_id = b.venue_id
    where b.session_id = p_session_id and vm.user_id = auth.uid()
  );
$$;

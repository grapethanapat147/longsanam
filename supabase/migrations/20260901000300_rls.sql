-- ===========================================================================
-- Longsanam — Row Level Security
--
-- RLS is the authorization boundary. Route guards in the Next.js app are a
-- user-experience nicety; this file is what actually stops one player reading
-- another player's payments.
--
-- Every state-changing operation goes through a SECURITY DEFINER RPC invoked
-- from a server action, so most tables deliberately have no INSERT/UPDATE
-- policy at all for end users.
-- ===========================================================================

alter table public.profiles             enable row level security;
alter table public.profile_contacts     enable row level security;
alter table public.sports               enable row level security;
alter table public.venues               enable row level security;
alter table public.venue_members        enable row level security;
alter table public.courts               enable row level security;
alter table public.court_sports         enable row level security;
alter table public.court_availability   enable row level security;
alter table public.court_price_rules    enable row level security;
alter table public.sessions             enable row level security;
alter table public.session_venue_preferences enable row level security;
alter table public.session_participants enable row level security;
alter table public.waitlist_entries     enable row level security;
alter table public.court_holds          enable row level security;
alter table public.bookings             enable row level security;
alter table public.payments             enable row level security;
alter table public.refunds              enable row level security;
alter table public.notifications        enable row level security;
alter table public.audit_logs           enable row level security;

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------

create policy profiles_select on public.profiles
  for select to anon, authenticated
  using (
    id = auth.uid()
    or public.is_platform_admin()
    or public.shares_session_with(id)
  );

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy profiles_admin_write on public.profiles
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- A user may edit their own display name but not promote themselves.
create or replace function public.profiles_guard_role()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_platform_admin() then
    raise exception 'role changes require a platform admin';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role
  before update on public.profiles
  for each row execute function public.profiles_guard_role();

-- ---------------------------------------------------------------------------
-- Profile contacts — strictly private
-- ---------------------------------------------------------------------------

create policy profile_contacts_owner on public.profile_contacts
  for all to authenticated
  using (user_id = auth.uid() or public.is_platform_admin())
  with check (user_id = auth.uid() or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Sports — a public catalogue
-- ---------------------------------------------------------------------------

create policy sports_read on public.sports
  for select to anon, authenticated
  using (true);

create policy sports_admin_write on public.sports
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Venues and courts
-- ---------------------------------------------------------------------------

create policy venues_read on public.venues
  for select to anon, authenticated
  using (is_active or public.is_venue_member(id) or public.is_platform_admin());

create policy venues_manage on public.venues
  for update to authenticated
  using (public.is_venue_member(id) or public.is_platform_admin())
  with check (public.is_venue_member(id) or public.is_platform_admin());

create policy venues_admin_delete on public.venues
  for delete to authenticated
  using (public.is_platform_admin());

create policy venue_members_read on public.venue_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_venue_member(venue_id)
    or public.is_platform_admin()
  );

create policy venue_members_manage on public.venue_members
  for all to authenticated
  using (public.is_venue_member(venue_id) or public.is_platform_admin())
  with check (public.is_venue_member(venue_id) or public.is_platform_admin());

create policy courts_read on public.courts
  for select to anon, authenticated
  using (
    (is_active and exists (
      select 1 from public.venues v where v.id = venue_id and v.is_active
    ))
    or public.is_venue_member(venue_id)
    or public.is_platform_admin()
  );

create policy courts_manage on public.courts
  for all to authenticated
  using (public.is_venue_member(venue_id) or public.is_platform_admin())
  with check (public.is_venue_member(venue_id) or public.is_platform_admin());

create policy court_sports_read on public.court_sports
  for select to anon, authenticated
  using (true);

create policy court_sports_manage on public.court_sports
  for all to authenticated
  using (public.is_court_venue_member(court_id) or public.is_platform_admin())
  with check (public.is_court_venue_member(court_id) or public.is_platform_admin());

create policy court_availability_read on public.court_availability
  for select to anon, authenticated
  using (true);

create policy court_availability_manage on public.court_availability
  for all to authenticated
  using (public.is_court_venue_member(court_id) or public.is_platform_admin())
  with check (public.is_court_venue_member(court_id) or public.is_platform_admin());

create policy court_price_rules_read on public.court_price_rules
  for select to anon, authenticated
  using (true);

create policy court_price_rules_manage on public.court_price_rules
  for all to authenticated
  using (public.is_court_venue_member(court_id) or public.is_platform_admin())
  with check (public.is_court_venue_member(court_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

create policy sessions_read on public.sessions
  for select to anon, authenticated
  using (
    public.session_is_public(status)
    or organizer_id = auth.uid()
    or public.is_session_participant(id)
    or public.is_platform_admin()
    or public.is_booking_venue_member(id)
  );

create policy sessions_insert on public.sessions
  for insert to authenticated
  with check (organizer_id = auth.uid());

create policy sessions_update on public.sessions
  for update to authenticated
  using (organizer_id = auth.uid() or public.is_platform_admin())
  with check (organizer_id = auth.uid() or public.is_platform_admin());

create policy sessions_delete_draft on public.sessions
  for delete to authenticated
  using (
    (organizer_id = auth.uid() and status = 'draft')
    or public.is_platform_admin()
  );

create policy session_prefs_read on public.session_venue_preferences
  for select to anon, authenticated
  using (
    public.is_session_organizer(session_id)
    or public.is_session_participant(session_id)
    or public.is_venue_member(venue_id)
    or public.is_platform_admin()
    or public.session_is_published(session_id)
  );

create policy session_prefs_manage on public.session_venue_preferences
  for all to authenticated
  using (public.is_session_organizer(session_id) or public.is_platform_admin())
  with check (public.is_session_organizer(session_id) or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Participation
--
-- Read-only for end users: joining, cancelling and promotion all run through
-- RPCs so that capacity and payment state are enforced transactionally.
-- ---------------------------------------------------------------------------

create policy participants_read on public.session_participants
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_session_organizer(session_id)
    or public.is_session_participant(session_id)
    or public.is_platform_admin()
  );

create policy participants_admin_write on public.session_participants
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy waitlist_read on public.waitlist_entries
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_session_organizer(session_id)
    or public.is_platform_admin()
  );

create policy waitlist_admin_write on public.waitlist_entries
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Holds and bookings
-- ---------------------------------------------------------------------------

create policy holds_read on public.court_holds
  for select to authenticated
  using (
    public.is_session_organizer(session_id)
    or public.is_court_venue_member(court_id)
    or public.is_platform_admin()
  );

create policy bookings_read on public.bookings
  for select to anon, authenticated
  using (
    public.is_venue_member(venue_id)
    or public.is_session_organizer(session_id)
    or public.is_session_participant(session_id)
    or public.is_platform_admin()
    or public.session_has_public_booking(session_id)
  );

-- Venue admins act on bookings through venue_decide_booking(), which performs
-- its own membership check; direct writes are reserved for platform admins.
create policy bookings_admin_write on public.bookings
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create policy payments_read on public.payments
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_session_organizer(session_id)
    or public.is_platform_admin()
  );

create policy payments_admin_write on public.payments
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create policy refunds_read on public.refunds
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_session_organizer(session_id)
    or public.is_platform_admin()
  );

create policy refunds_admin_write on public.refunds
  for all to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------

create policy notifications_read on public.notifications
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Marking a notification read is the only field a user may change; the
-- trigger below stops the policy from being used to rewrite the message.
create policy notifications_mark_read on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create or replace function public.notifications_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    if (new.title, new.body, new.kind, new.user_id, new.session_id, new.action_url)
       is distinct from
       (old.title, old.body, old.kind, old.user_id, old.session_id, old.action_url) then
      raise exception 'only read_at may be updated on a notification';
    end if;
  end if;
  return new;
end;
$$;

create trigger notifications_guard
  before update on public.notifications
  for each row execute function public.notifications_guard();

create policy audit_read on public.audit_logs
  for select to authenticated
  using (
    public.is_platform_admin()
    or (session_id is not null and public.is_session_organizer(session_id))
    or (session_id is not null and public.is_session_participant(session_id))
    or (session_id is not null and public.is_booking_venue_member(session_id))
  );

-- ---------------------------------------------------------------------------
-- Function privileges
--
-- Anything that moves money, holds a court or changes a booking is callable
-- only by the service role, from a Next.js server action that has already
-- authorized the caller. The exceptions below either perform their own
-- authorization or are pure reads.
-- ---------------------------------------------------------------------------

do $$
declare
  v_fn text;
  v_public constant text[] := array[
    'court_is_open(uuid,timestamptz,timestamptz)',
    'court_has_conflict(uuid,timestamptz,timestamptz,uuid,uuid)',
    'court_price_for(uuid,timestamptz,timestamptz)',
    'court_availability_report(uuid,timestamptz,timestamptz)',
    'session_progress(uuid)',
    'session_is_public(session_status)',
    'is_platform_admin()',
    'is_venue_member(uuid)',
    'is_court_venue_member(uuid)',
    'is_session_organizer(uuid)',
    'is_session_participant(uuid)',
    'shares_session_with(uuid)',
    -- Invoked from inside policies, so the calling role needs EXECUTE.
    'session_is_published(uuid)',
    'session_has_public_booking(uuid)',
    'is_booking_venue_member(uuid)',
    -- Performs its own venue-membership check.
    'venue_decide_booking(uuid,boolean,text,uuid)',
    -- Performs its own authentication check and cannot impersonate.
    'create_venue(text,text,text,text,text,text,text,uuid)',
    -- Called with the player's own client on purpose: it resolves the actor
    -- from auth.uid() first, so a caller cannot join on someone else's behalf,
    -- and it enforces capacity and the waitlist inside one transaction.
    'join_session(uuid,uuid)'
  ];
begin
  -- Start from a closed door. Trigger functions are skipped: their privileges
  -- are checked when the trigger is created, and auth's signup trigger runs as
  -- supabase_auth_admin.
  for v_fn in
    select p.oid::regprocedure::text
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prorettype <> 'pg_catalog.trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', v_fn);
    execute format('grant execute on function %s to service_role, postgres', v_fn);
  end loop;

  foreach v_fn in array v_public loop
    execute format('grant execute on function public.%s to anon, authenticated', v_fn);
  end loop;
end;
$$;

grant execute on function public.handle_new_user() to supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- Table privileges
--
-- RLS only filters rows a role is already allowed to touch, so the GRANTs
-- below are what make the policies above reachable at all. Writes are granted
-- wherever a policy exists to gate them — including the admin-only tables,
-- where the policy is the thing that restricts the write to platform admins.
-- ---------------------------------------------------------------------------

grant usage on schema public to anon, authenticated;

grant select on
  public.profiles, public.sports, public.venues, public.courts,
  public.court_sports, public.court_availability, public.court_price_rules,
  public.sessions, public.session_venue_preferences, public.bookings
to anon;

grant select on all tables in schema public to authenticated;

grant insert, update, delete on
  public.profile_contacts, public.venue_members, public.courts,
  public.court_sports, public.court_availability, public.court_price_rules,
  public.session_venue_preferences
to authenticated;

grant insert, update, delete on public.sessions to authenticated;
grant update on public.profiles to authenticated;
grant update, delete on public.venues to authenticated;
grant update on public.notifications to authenticated;

-- Gated to platform admins by policy, not by grant.
grant insert, update, delete on
  public.sports, public.session_participants, public.waitlist_entries,
  public.bookings, public.payments, public.refunds
to authenticated;

-- Deliberately read-only for every end user: holds are created by the
-- orchestrator and the audit trail is append-only.
revoke insert, update, delete on public.court_holds from anon, authenticated;
revoke insert, update, delete on public.audit_logs from anon, authenticated;

-- The service role bypasses RLS but is still subject to table privileges, and
-- the orchestration RPCs run as invoker. Without these grants every
-- service-role read silently returns nothing.
grant usage on schema public to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

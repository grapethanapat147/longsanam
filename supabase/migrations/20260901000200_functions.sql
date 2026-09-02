-- ===========================================================================
-- Longsanam — transactional RPCs
--
-- Everything that must not race lives here rather than in application code.
-- Each court-touching routine takes a transaction-scoped advisory lock keyed
-- on the court id, so concurrent attempts on the same court serialize. The
-- GiST exclusion constraints remain the last line of defence: even if a lock
-- were skipped the database still refuses an overlapping booking.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Audit
-- ---------------------------------------------------------------------------

create or replace function public.app_log(
  p_actor       uuid  default null,
  p_entity_type text  default 'unknown',
  p_entity_id   uuid  default null,
  p_session_id  uuid  default null,
  p_action      text  default 'unknown',
  p_from        text  default null,
  p_to          text  default null,
  p_metadata    jsonb default '{}'::jsonb
) returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.audit_logs
    (actor_id, entity_type, entity_id, session_id, action, from_state, to_state, metadata)
  values
    (p_actor, p_entity_type, p_entity_id, p_session_id, p_action, p_from, p_to,
     coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function public.notify_user(
  p_user_id    uuid,
  p_session_id uuid,
  p_kind       text,
  p_title      text,
  p_body       text,
  p_action_url text default null
) returns uuid
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.notifications (user_id, session_id, kind, title, body, action_url, sent_at)
  values (p_user_id, p_session_id, p_kind, p_title, p_body, p_action_url, now())
  returning id;
$$;

-- ---------------------------------------------------------------------------
-- Identity bootstrap
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_role public.app_role;
begin
  v_role := case
    when new.raw_user_meta_data ->> 'role' in ('player', 'venue_admin', 'platform_admin')
      then (new.raw_user_meta_data ->> 'role')::public.app_role
    else 'player'::public.app_role
  end;

  insert into public.profiles (id, display_name, role)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''),
             split_part(coalesce(new.email, ''), '@', 1),
             'ผู้ใช้ใหม่'),
    v_role
  )
  on conflict (id) do nothing;

  insert into public.profile_contacts (user_id, phone, line_user_id, email)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    nullif(new.raw_user_meta_data ->> 'line_user_id', ''),
    new.email
  )
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Session share codes
-- ---------------------------------------------------------------------------

create or replace function public.generate_session_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i integer;
begin
  loop
    v_code := '';
    for v_i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.sessions_assign_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null or new.public_code = '' then
    new.public_code := public.generate_session_code();
  end if;
  return new;
end;
$$;

alter table public.sessions alter column public_code drop not null;

create trigger sessions_assign_code
  before insert on public.sessions
  for each row execute function public.sessions_assign_code();

-- ---------------------------------------------------------------------------
-- Court availability and pricing
-- ---------------------------------------------------------------------------

create or replace function public.court_is_open(
  p_court_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
) returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  with local as (
    select (p_starts_at at time zone 'Asia/Bangkok') as s,
           (p_ends_at   at time zone 'Asia/Bangkok') as e
  )
  select exists (
    select 1
    from public.court_availability ca
    cross join local l
    where ca.court_id = p_court_id
      and ca.kind = 'opening_hours'
      and ca.weekday = extract(dow from l.s)::integer
      and ca.opens_at <= l.s::time
      and ca.closes_at >= l.e::time
      and l.s::date = l.e::date
  );
$$;

comment on function public.court_is_open is
  'Opening hours are stored as Asia/Bangkok wall-clock time. A booking must fit entirely inside one window on one local day.';

create or replace function public.court_has_conflict(
  p_court_id       uuid,
  p_starts_at      timestamptz,
  p_ends_at        timestamptz,
  p_ignore_hold    uuid default null,
  p_ignore_booking uuid default null
) returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select
    exists (
      select 1 from public.court_availability ca
      where ca.court_id = p_court_id
        and ca.kind in ('blackout', 'manual_block')
        and tstzrange(ca.starts_at, ca.ends_at, '[)')
            && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    or exists (
      select 1 from public.court_holds h
      where h.court_id = p_court_id
        and h.status = 'active'
        and h.expires_at > now()
        and (p_ignore_hold is null or h.id <> p_ignore_hold)
        and tstzrange(h.starts_at, h.ends_at, '[)')
            && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    or exists (
      select 1 from public.bookings b
      where b.court_id = p_court_id
        and b.status in ('requested', 'held', 'confirmed')
        and (p_ignore_booking is null or b.id <> p_ignore_booking)
        and tstzrange(b.starts_at, b.ends_at, '[)')
            && tstzrange(p_starts_at, p_ends_at, '[)')
    );
$$;

create or replace function public.court_price_for(
  p_court_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
) returns integer
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_local timestamp := p_starts_at at time zone 'Asia/Bangkok';
  v_hours numeric   := extract(epoch from (p_ends_at - p_starts_at)) / 3600.0;
  v_rate  integer;
begin
  select r.price_thb into v_rate
  from public.court_price_rules r
  where r.court_id = p_court_id
    and extract(dow from v_local)::integer = any (r.weekdays)
    and r.starts_time <= v_local::time
    and r.ends_time   >  v_local::time
    and (r.valid_from is null or r.valid_from <= v_local::date)
    and (r.valid_to   is null or r.valid_to   >= v_local::date)
  order by r.priority asc, r.price_thb desc
  limit 1;

  if v_rate is null then
    select c.base_price_thb into v_rate from public.courts c where c.id = p_court_id;
  end if;

  return ceil(coalesce(v_rate, 0) * v_hours)::integer;
end;
$$;

create or replace function public.court_availability_report(
  p_court_id  uuid,
  p_starts_at timestamptz,
  p_ends_at   timestamptz
) returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_court   public.courts%rowtype;
  v_venue   public.venues%rowtype;
begin
  select * into v_court from public.courts where id = p_court_id;
  if not found then
    return jsonb_build_object('available', false, 'reason', 'court_not_found');
  end if;

  select * into v_venue from public.venues where id = v_court.venue_id;

  if not v_court.is_active then
    return jsonb_build_object('available', false, 'reason', 'court_inactive');
  end if;
  if not v_venue.is_active then
    return jsonb_build_object('available', false, 'reason', 'venue_inactive');
  end if;
  if extract(epoch from (p_ends_at - p_starts_at)) / 60.0 < v_court.min_booking_minutes then
    return jsonb_build_object('available', false, 'reason', 'below_minimum_duration');
  end if;
  if p_starts_at < now() + make_interval(mins => v_venue.booking_lead_minutes) then
    return jsonb_build_object('available', false, 'reason', 'inside_lead_time');
  end if;
  if not public.court_is_open(p_court_id, p_starts_at, p_ends_at) then
    return jsonb_build_object('available', false, 'reason', 'outside_opening_hours');
  end if;
  if public.court_has_conflict(p_court_id, p_starts_at, p_ends_at) then
    return jsonb_build_object('available', false, 'reason', 'slot_taken');
  end if;

  return jsonb_build_object(
    'available', true,
    'priceThb', public.court_price_for(p_court_id, p_starts_at, p_ends_at)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Joining a session
-- ---------------------------------------------------------------------------

create or replace function public.join_session(
  p_session_id uuid,
  p_actor      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user        uuid := coalesce(auth.uid(), p_actor);
  v_session     public.sessions%rowtype;
  v_participant public.session_participants%rowtype;
  v_wait        public.waitlist_entries%rowtype;
  v_taken       integer;
  v_position    integer;
  v_id          uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status not in ('open', 'ready_to_book', 'holding_court') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_open');
  end if;
  if v_session.payment_deadline <= now() then
    return jsonb_build_object('ok', false, 'reason', 'deadline_passed');
  end if;
  if v_session.starts_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'session_started');
  end if;

  select * into v_participant
  from public.session_participants
  where session_id = p_session_id and user_id = v_user;

  if v_participant.id is not null
     and v_participant.status in ('joined_pending_payment', 'paid_confirmed') then
    return jsonb_build_object(
      'ok', true, 'outcome', 'already_joined',
      'participantId', v_participant.id, 'status', v_participant.status
    );
  end if;

  select count(*) into v_taken
  from public.session_participants
  where session_id = p_session_id
    and status in ('joined_pending_payment', 'paid_confirmed');

  if v_taken >= v_session.target_players then
    select * into v_wait
    from public.waitlist_entries
    where session_id = p_session_id and user_id = v_user;

    if v_wait.id is not null and v_wait.status in ('waiting', 'promoted') then
      return jsonb_build_object(
        'ok', true, 'outcome', 'waitlisted',
        'waitlistId', v_wait.id, 'position', v_wait.position
      );
    end if;

    select coalesce(max(position), 0) + 1 into v_position
    from public.waitlist_entries
    where session_id = p_session_id;

    if v_wait.id is not null then
      update public.waitlist_entries
      set status = 'waiting', position = v_position,
          promoted_at = null, promotion_expires_at = null
      where id = v_wait.id
      returning id into v_id;
    else
      insert into public.waitlist_entries (session_id, user_id, position)
      values (p_session_id, v_user, v_position)
      returning id into v_id;
    end if;

    perform public.app_log(v_user, 'waitlist_entry', v_id, p_session_id,
      'waitlist.joined', null, 'waiting', jsonb_build_object('position', v_position));

    return jsonb_build_object(
      'ok', true, 'outcome', 'waitlisted', 'waitlistId', v_id, 'position', v_position
    );
  end if;

  insert into public.session_participants
    (session_id, user_id, status, amount_due_thb, payment_due_at)
  values
    (p_session_id, v_user, 'joined_pending_payment',
     v_session.budget_per_person_thb, v_session.payment_deadline)
  on conflict (session_id, user_id) do update
    set status         = 'joined_pending_payment',
        amount_due_thb = excluded.amount_due_thb,
        payment_due_at = excluded.payment_due_at,
        cancelled_at   = null,
        confirmed_at   = null
  returning id into v_id;

  perform public.app_log(v_user, 'session_participant', v_id, p_session_id,
    'participant.joined', null, 'joined_pending_payment',
    jsonb_build_object('amountDueThb', v_session.budget_per_person_thb));

  return jsonb_build_object(
    'ok', true, 'outcome', 'joined',
    'participantId', v_id, 'amountDueThb', v_session.budget_per_person_thb,
    'paymentDueAt', v_session.payment_deadline
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------

create or replace function public.start_payment(
  p_participant_id  uuid,
  p_idempotency_key text,
  p_provider        text default 'mock',
  p_actor           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant public.session_participants%rowtype;
  v_payment     public.payments%rowtype;
  v_id          uuid;
begin
  select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  if v_payment.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'paymentId', v_payment.id, 'status', v_payment.status,
      'amountThb', v_payment.amount_thb);
  end if;

  select * into v_participant from public.session_participants where id = p_participant_id;
  if v_participant.id is null then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_found');
  end if;
  if v_participant.status <> 'joined_pending_payment' then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_awaiting_payment',
      'status', v_participant.status);
  end if;
  if v_participant.payment_due_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'payment_window_closed');
  end if;

  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status in ('pending', 'paid')
  limit 1;

  if v_payment.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'paymentId', v_payment.id, 'status', v_payment.status,
      'amountThb', v_payment.amount_thb);
  end if;

  insert into public.payments
    (session_id, participant_id, user_id, amount_thb, status, provider,
     idempotency_key, expires_at)
  values
    (v_participant.session_id, v_participant.id, v_participant.user_id,
     v_participant.amount_due_thb, 'pending', p_provider,
     p_idempotency_key, v_participant.payment_due_at)
  returning id into v_id;

  perform public.app_log(coalesce(p_actor, v_participant.user_id), 'payment', v_id,
    v_participant.session_id, 'payment.created', null, 'pending',
    jsonb_build_object('amountThb', v_participant.amount_due_thb, 'provider', p_provider));

  return jsonb_build_object('ok', true, 'replayed', false, 'paymentId', v_id,
    'status', 'pending', 'amountThb', v_participant.amount_due_thb);
end;
$$;

create or replace function public.settle_payment(
  p_payment_id   uuid,
  p_succeeded    boolean,
  p_provider_ref text default null,
  p_failure      text default null,
  p_actor        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payment  public.payments%rowtype;
  v_session  public.sessions%rowtype;
  v_paid_n   integer;
  v_paid_sum integer;
  v_status   public.session_status;
begin
  select * into v_payment from public.payments where id = p_payment_id for update;
  if v_payment.id is null then
    return jsonb_build_object('ok', false, 'reason', 'payment_not_found');
  end if;

  if v_payment.status <> 'pending' then
    -- Idempotent replay: a settled payment stays settled.
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_payment.status);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_payment.session_id::text, 0));

  if not p_succeeded then
    update public.payments
    set status = 'failed', failure_reason = coalesce(p_failure, 'unknown')
    where id = p_payment_id;

    perform public.app_log(coalesce(p_actor, v_payment.user_id), 'payment', p_payment_id,
      v_payment.session_id, 'payment.failed', 'pending', 'failed',
      jsonb_build_object('reason', coalesce(p_failure, 'unknown')));

    return jsonb_build_object('ok', true, 'status', 'failed');
  end if;

  update public.payments
  set status = 'paid', paid_at = now(), provider_ref = p_provider_ref
  where id = p_payment_id;

  update public.session_participants
  set status = 'paid_confirmed', confirmed_at = now()
  where id = v_payment.participant_id;

  update public.waitlist_entries
  set status = 'converted'
  where session_id = v_payment.session_id
    and user_id = v_payment.user_id
    and status = 'promoted';

  perform public.app_log(coalesce(p_actor, v_payment.user_id), 'payment', p_payment_id,
    v_payment.session_id, 'payment.paid', 'pending', 'paid',
    jsonb_build_object('amountThb', v_payment.amount_thb, 'providerRef', p_provider_ref));

  perform public.app_log(coalesce(p_actor, v_payment.user_id), 'session_participant',
    v_payment.participant_id, v_payment.session_id,
    'participant.confirmed', 'joined_pending_payment', 'paid_confirmed', '{}'::jsonb);

  select * into v_session from public.sessions where id = v_payment.session_id;

  select count(*), coalesce(sum(p.amount_thb), 0)
  into v_paid_n, v_paid_sum
  from public.session_participants sp
  join public.payments p on p.participant_id = sp.id and p.status = 'paid'
  where sp.session_id = v_payment.session_id and sp.status = 'paid_confirmed';

  v_status := v_session.status;
  if v_session.status = 'open' and v_paid_n >= v_session.min_players then
    update public.sessions set status = 'ready_to_book' where id = v_session.id;
    v_status := 'ready_to_book';
    perform public.app_log(coalesce(p_actor, v_payment.user_id), 'session', v_session.id,
      v_session.id, 'session.ready_to_book', 'open', 'ready_to_book',
      jsonb_build_object('paidParticipants', v_paid_n, 'paidTotalThb', v_paid_sum));
  end if;

  return jsonb_build_object(
    'ok', true, 'status', 'paid',
    'sessionStatus', v_status,
    'paidParticipants', v_paid_n,
    'paidTotalThb', v_paid_sum
  );
end;
$$;

create or replace function public.expire_overdue_payments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payments integer := 0;
  v_row record;
begin
  for v_row in
    select p.id as payment_id, p.participant_id, p.session_id, p.user_id
    from public.payments p
    where p.status = 'pending'
      and p.expires_at is not null
      and p.expires_at <= now()
    for update of p skip locked
  loop
    update public.payments set status = 'expired' where id = v_row.payment_id;
    update public.session_participants
    set status = 'payment_expired'
    where id = v_row.participant_id and status = 'joined_pending_payment';

    update public.waitlist_entries
    set status = 'expired'
    where session_id = v_row.session_id and user_id = v_row.user_id and status = 'promoted';

    perform public.app_log(null, 'payment', v_row.payment_id, v_row.session_id,
      'payment.expired', 'pending', 'expired', '{}'::jsonb);

    v_payments := v_payments + 1;
  end loop;

  -- Participants who never started a payment at all.
  update public.session_participants
  set status = 'payment_expired'
  where status = 'joined_pending_payment'
    and payment_due_at <= now();

  return jsonb_build_object('expiredPayments', v_payments);
end;
$$;

-- ---------------------------------------------------------------------------
-- Court holds
-- ---------------------------------------------------------------------------

create or replace function public.try_hold_court(
  p_session_id      uuid,
  p_court_id        uuid,
  p_starts_at       timestamptz,
  p_ends_at         timestamptz,
  p_hold_minutes    integer,
  p_idempotency_key text,
  p_actor           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold      public.court_holds%rowtype;
  v_report    jsonb;
  v_id        uuid;
  v_expires   timestamptz;
begin
  select * into v_hold from public.court_holds where idempotency_key = p_idempotency_key;
  if v_hold.id is not null then
    return jsonb_build_object('ok', v_hold.status = 'active', 'replayed', true,
      'holdId', v_hold.id, 'status', v_hold.status, 'expiresAt', v_hold.expires_at);
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_court_id::text, 0));

  v_report := public.court_availability_report(p_court_id, p_starts_at, p_ends_at);
  if not (v_report ->> 'available')::boolean then
    perform public.app_log(p_actor, 'court_hold', null, p_session_id,
      'hold.rejected', null, null,
      jsonb_build_object('courtId', p_court_id, 'reason', v_report ->> 'reason'));
    return jsonb_build_object('ok', false, 'reason', v_report ->> 'reason');
  end if;

  v_expires := now() + make_interval(mins => greatest(p_hold_minutes, 1));

  begin
    insert into public.court_holds
      (session_id, court_id, starts_at, ends_at, status, expires_at, idempotency_key)
    values
      (p_session_id, p_court_id, p_starts_at, p_ends_at, 'active', v_expires, p_idempotency_key)
    returning id into v_id;
  exception when exclusion_violation then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;

  perform public.app_log(p_actor, 'court_hold', v_id, p_session_id,
    'hold.created', null, 'active',
    jsonb_build_object('courtId', p_court_id, 'expiresAt', v_expires,
      'priceThb', (v_report ->> 'priceThb')::integer));

  return jsonb_build_object('ok', true, 'replayed', false, 'holdId', v_id,
    'expiresAt', v_expires, 'priceThb', (v_report ->> 'priceThb')::integer);
end;
$$;

create or replace function public.release_hold(
  p_hold_id uuid,
  p_reason  text default 'released',
  p_actor   uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold public.court_holds%rowtype;
begin
  select * into v_hold from public.court_holds where id = p_hold_id for update;
  if v_hold.id is null then
    return jsonb_build_object('ok', false, 'reason', 'hold_not_found');
  end if;
  if v_hold.status <> 'active' then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_hold.status);
  end if;

  update public.court_holds
  set status = 'released', released_reason = p_reason
  where id = p_hold_id;

  perform public.app_log(p_actor, 'court_hold', p_hold_id, v_hold.session_id,
    'hold.released', 'active', 'released', jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'status', 'released');
end;
$$;

create or replace function public.expire_stale_holds()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_holds    integer := 0;
  v_bookings integer := 0;
  v_row      record;
begin
  for v_row in
    select id, session_id from public.court_holds
    where status = 'active' and expires_at <= now()
    for update skip locked
  loop
    update public.court_holds set status = 'expired' where id = v_row.id;
    perform public.app_log(null, 'court_hold', v_row.id, v_row.session_id,
      'hold.expired', 'active', 'expired', '{}'::jsonb);
    v_holds := v_holds + 1;
  end loop;

  for v_row in
    select id, session_id, status from public.bookings
    where status in ('requested', 'held')
      and expires_at is not null and expires_at <= now()
    for update skip locked
  loop
    update public.bookings set status = 'expired' where id = v_row.id;
    perform public.app_log(null, 'booking', v_row.id, v_row.session_id,
      'booking.expired', v_row.status::text, 'expired', '{}'::jsonb);
    v_bookings := v_bookings + 1;
  end loop;

  return jsonb_build_object('expiredHolds', v_holds, 'expiredBookings', v_bookings);
end;
$$;

-- ---------------------------------------------------------------------------
-- Bookings
-- ---------------------------------------------------------------------------

create or replace function public.request_booking(
  p_hold_id         uuid,
  p_idempotency_key text,
  p_actor           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_hold     public.court_holds%rowtype;
  v_court    public.courts%rowtype;
  v_venue    public.venues%rowtype;
  v_booking  public.bookings%rowtype;
  v_price    integer;
  v_attempt  integer;
  v_status   public.booking_status;
  v_expires  timestamptz;
  v_id       uuid;
begin
  select * into v_booking from public.bookings where idempotency_key = p_idempotency_key;
  if v_booking.id is not null then
    return jsonb_build_object('ok', v_booking.status in ('requested', 'held', 'confirmed'),
      'replayed', true, 'bookingId', v_booking.id, 'status', v_booking.status);
  end if;

  select * into v_hold from public.court_holds where id = p_hold_id for update;
  if v_hold.id is null then
    return jsonb_build_object('ok', false, 'reason', 'hold_not_found');
  end if;
  if v_hold.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', 'hold_' || v_hold.status::text);
  end if;
  if v_hold.expires_at <= now() then
    update public.court_holds set status = 'expired' where id = p_hold_id;
    return jsonb_build_object('ok', false, 'reason', 'hold_expired');
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_hold.court_id::text, 0));

  select * into v_court from public.courts where id = v_hold.court_id;
  select * into v_venue from public.venues where id = v_court.venue_id;

  -- The hold itself is ours; anything else overlapping is a genuine conflict.
  if public.court_has_conflict(v_hold.court_id, v_hold.starts_at, v_hold.ends_at, p_hold_id, null) then
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end if;

  v_price := public.court_price_for(v_hold.court_id, v_hold.starts_at, v_hold.ends_at);

  select coalesce(max(attempt_no), 0) + 1 into v_attempt
  from public.bookings where session_id = v_hold.session_id;

  if v_venue.auto_confirm_bookings then
    v_status  := 'confirmed';
    v_expires := null;
  else
    v_status  := 'requested';
    v_expires := least(v_hold.starts_at, now() + interval '24 hours');
  end if;

  -- Converting the hold first frees its exclusion slot for the booking row.
  update public.court_holds set status = 'converted' where id = p_hold_id;

  begin
    insert into public.bookings
      (session_id, venue_id, court_id, hold_id, starts_at, ends_at, status,
       price_thb, attempt_no, expires_at, idempotency_key, confirmed_at)
    values
      (v_hold.session_id, v_court.venue_id, v_hold.court_id, p_hold_id,
       v_hold.starts_at, v_hold.ends_at, v_status, v_price, v_attempt,
       v_expires, p_idempotency_key,
       case when v_status = 'confirmed' then now() else null end)
    returning id into v_id;
  exception when exclusion_violation then
    update public.court_holds set status = 'active' where id = p_hold_id;
    return jsonb_build_object('ok', false, 'reason', 'slot_taken');
  end;

  if v_status = 'confirmed' then
    update public.sessions
    set status = 'booked', booking_id = v_id, failure_reason = null
    where id = v_hold.session_id;
    perform public.app_log(p_actor, 'session', v_hold.session_id, v_hold.session_id,
      'session.booked', 'holding_court', 'booked',
      jsonb_build_object('bookingId', v_id, 'venueId', v_court.venue_id));
  else
    update public.sessions
    set status = 'holding_court', booking_id = v_id
    where id = v_hold.session_id;
  end if;

  perform public.app_log(p_actor, 'booking', v_id, v_hold.session_id,
    'booking.' || v_status::text, null, v_status::text,
    jsonb_build_object('courtId', v_hold.court_id, 'venueId', v_court.venue_id,
      'priceThb', v_price, 'attemptNo', v_attempt,
      'autoConfirm', v_venue.auto_confirm_bookings));

  return jsonb_build_object('ok', true, 'replayed', false, 'bookingId', v_id,
    'status', v_status, 'priceThb', v_price, 'attemptNo', v_attempt,
    'autoConfirmed', v_venue.auto_confirm_bookings);
end;
$$;

create or replace function public.venue_decide_booking(
  p_booking_id uuid,
  p_approve    boolean,
  p_reason     text default null,
  p_actor      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_actor   uuid := coalesce(auth.uid(), p_actor);
begin
  select * into v_booking from public.bookings where id = p_booking_id for update;
  if v_booking.id is null then
    return jsonb_build_object('ok', false, 'reason', 'booking_not_found');
  end if;

  if not (public.is_venue_member(v_booking.venue_id) or public.is_platform_admin()) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if v_booking.status not in ('requested', 'held') then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_booking.status);
  end if;

  if p_approve then
    update public.bookings
    set status = 'confirmed', confirmed_at = now(),
        decided_by = v_actor, decision_reason = p_reason, expires_at = null
    where id = p_booking_id;

    update public.sessions
    set status = 'booked', booking_id = p_booking_id, failure_reason = null
    where id = v_booking.session_id;

    perform public.app_log(v_actor, 'booking', p_booking_id, v_booking.session_id,
      'booking.confirmed', v_booking.status::text, 'confirmed',
      jsonb_build_object('reason', p_reason));
    perform public.app_log(v_actor, 'session', v_booking.session_id, v_booking.session_id,
      'session.booked', 'holding_court', 'booked',
      jsonb_build_object('bookingId', p_booking_id));

    return jsonb_build_object('ok', true, 'status', 'confirmed');
  end if;

  update public.bookings
  set status = 'rejected', decided_by = v_actor, decision_reason = p_reason
  where id = p_booking_id;

  update public.sessions
  set booking_id = null
  where id = v_booking.session_id and booking_id = p_booking_id;

  perform public.app_log(v_actor, 'booking', p_booking_id, v_booking.session_id,
    'booking.rejected', v_booking.status::text, 'rejected',
    jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'status', 'rejected');
end;
$$;

create or replace function public.fail_session_booking(
  p_session_id uuid,
  p_reason     text,
  p_actor      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  update public.sessions
  set status = 'booking_failed', failure_reason = p_reason
  where id = p_session_id;

  perform public.app_log(p_actor, 'session', p_session_id, p_session_id,
    'session.booking_failed', v_session.status::text, 'booking_failed',
    jsonb_build_object('reason', p_reason));

  perform public.notify_user(v_session.organizer_id, p_session_id, 'booking_failed',
    'จองสนามไม่สำเร็จ',
    'ระบบลองจองสนามที่คุณเลือกไว้ครบทุกแห่งแล้วแต่ไม่สำเร็จ กรุณาเพิ่มสนามสำรองหรือเปลี่ยนเวลา',
    '/organizer/sessions/' || p_session_id::text);

  return jsonb_build_object('ok', true, 'status', 'booking_failed');
end;
$$;

-- ---------------------------------------------------------------------------
-- Waitlist
-- ---------------------------------------------------------------------------

create or replace function public.promote_waitlist(
  p_session_id     uuid,
  p_window_minutes integer default 60,
  p_actor          uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session   public.sessions%rowtype;
  v_entry     public.waitlist_entries%rowtype;
  v_taken     integer;
  v_expires   timestamptz;
  v_id        uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status in ('cancelled', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  select count(*) into v_taken
  from public.session_participants
  where session_id = p_session_id
    and status in ('joined_pending_payment', 'paid_confirmed');

  if v_taken >= v_session.target_players then
    return jsonb_build_object('ok', false, 'reason', 'no_free_slot');
  end if;

  select * into v_entry
  from public.waitlist_entries
  where session_id = p_session_id and status = 'waiting'
  order by position asc
  limit 1
  for update skip locked;

  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'reason', 'waitlist_empty');
  end if;

  v_expires := least(
    now() + make_interval(mins => greatest(p_window_minutes, 5)),
    v_session.starts_at
  );

  update public.waitlist_entries
  set status = 'promoted', promoted_at = now(), promotion_expires_at = v_expires
  where id = v_entry.id;

  insert into public.session_participants
    (session_id, user_id, status, amount_due_thb, payment_due_at)
  values
    (p_session_id, v_entry.user_id, 'joined_pending_payment',
     v_session.budget_per_person_thb, v_expires)
  on conflict (session_id, user_id) do update
    set status         = 'joined_pending_payment',
        amount_due_thb = excluded.amount_due_thb,
        payment_due_at = excluded.payment_due_at,
        cancelled_at   = null,
        confirmed_at   = null
  returning id into v_id;

  perform public.app_log(p_actor, 'waitlist_entry', v_entry.id, p_session_id,
    'waitlist.promoted', 'waiting', 'promoted',
    jsonb_build_object('position', v_entry.position, 'expiresAt', v_expires));

  perform public.notify_user(v_entry.user_id, p_session_id, 'waitlist_promoted',
    'คุณได้สิทธิ์เข้าร่วมแล้ว',
    'มีที่ว่างในก๊วนที่คุณรออยู่ กรุณาชำระเงินภายในเวลาที่กำหนด มิฉะนั้นสิทธิ์จะถูกส่งต่อ',
    '/s/' || v_session.public_code);

  return jsonb_build_object('ok', true, 'waitlistId', v_entry.id,
    'participantId', v_id, 'userId', v_entry.user_id,
    'position', v_entry.position, 'expiresAt', v_expires);
end;
$$;

create or replace function public.expire_waitlist_promotions()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select w.id, w.session_id, w.user_id
    from public.waitlist_entries w
    where w.status = 'promoted'
      and w.promotion_expires_at is not null
      and w.promotion_expires_at <= now()
    for update skip locked
  loop
    update public.waitlist_entries set status = 'expired' where id = v_row.id;

    update public.session_participants
    set status = 'payment_expired'
    where session_id = v_row.session_id
      and user_id = v_row.user_id
      and status = 'joined_pending_payment';

    perform public.app_log(null, 'waitlist_entry', v_row.id, v_row.session_id,
      'waitlist.promotion_expired', 'promoted', 'expired', '{}'::jsonb);

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('expiredPromotions', v_count);
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancellation and refunds
-- ---------------------------------------------------------------------------

create or replace function public.cancel_participation(
  p_participant_id  uuid,
  p_refund_thb      integer,
  p_reason          text,
  p_policy_snapshot jsonb,
  p_idempotency_key text,
  p_actor           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant public.session_participants%rowtype;
  v_payment     public.payments%rowtype;
  v_refund      public.refunds%rowtype;
  v_amount      integer := greatest(coalesce(p_refund_thb, 0), 0);
  v_refund_id   uuid;
  v_from        text;
begin
  select * into v_refund from public.refunds where idempotency_key = p_idempotency_key;
  if v_refund.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'refundId', v_refund.id, 'refundThb', v_refund.amount_thb);
  end if;

  select * into v_participant
  from public.session_participants where id = p_participant_id for update;

  if v_participant.id is null then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_found');
  end if;
  if v_participant.status in ('cancelled', 'refunded') then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_participant.status);
  end if;

  v_from := v_participant.status::text;

  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status = 'paid'
  order by paid_at desc nulls last
  limit 1;

  -- The database, not the caller, decides the ceiling on a refund.
  if v_payment.id is null then
    v_amount := 0;
  else
    v_amount := least(v_amount, v_payment.amount_thb);
  end if;

  update public.session_participants
  set status = case when v_amount > 0 then 'refunded'::public.participant_status
                    else 'cancelled'::public.participant_status end,
      cancelled_at = now()
  where id = p_participant_id;

  if v_payment.id is not null and v_amount > 0 then
    insert into public.refunds
      (payment_id, session_id, user_id, amount_thb, status, reason,
       policy_snapshot, idempotency_key)
    values
      (v_payment.id, v_participant.session_id, v_participant.user_id, v_amount,
       'pending', p_reason, p_policy_snapshot, p_idempotency_key)
    returning id into v_refund_id;

    perform public.app_log(p_actor, 'refund', v_refund_id, v_participant.session_id,
      'refund.created', null, 'pending',
      jsonb_build_object('amountThb', v_amount, 'paymentId', v_payment.id,
        'policy', p_policy_snapshot));
  end if;

  -- Cancel any payment that never completed.
  update public.payments
  set status = 'failed', failure_reason = 'participant_cancelled'
  where participant_id = p_participant_id and status = 'pending';

  perform public.app_log(p_actor, 'session_participant', p_participant_id,
    v_participant.session_id, 'participant.cancelled', v_from,
    case when v_amount > 0 then 'refunded' else 'cancelled' end,
    jsonb_build_object('reason', p_reason, 'refundThb', v_amount));

  return jsonb_build_object('ok', true, 'refundId', v_refund_id,
    'refundThb', v_amount, 'sessionId', v_participant.session_id);
end;
$$;

create or replace function public.settle_refund(
  p_refund_id    uuid,
  p_succeeded    boolean,
  p_provider_ref text default null,
  p_actor        uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_refund public.refunds%rowtype;
begin
  select * into v_refund from public.refunds where id = p_refund_id for update;
  if v_refund.id is null then
    return jsonb_build_object('ok', false, 'reason', 'refund_not_found');
  end if;
  if v_refund.status in ('completed', 'failed') then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_refund.status);
  end if;

  if p_succeeded then
    update public.refunds
    set status = 'completed', processed_at = now(), provider_ref = p_provider_ref
    where id = p_refund_id;

    update public.payments set status = 'refunded' where id = v_refund.payment_id;

    perform public.app_log(p_actor, 'refund', p_refund_id, v_refund.session_id,
      'refund.completed', v_refund.status::text, 'completed',
      jsonb_build_object('amountThb', v_refund.amount_thb, 'providerRef', p_provider_ref));

    perform public.notify_user(v_refund.user_id, v_refund.session_id, 'refund_completed',
      'คืนเงินเรียบร้อยแล้ว',
      'เราคืนเงินจำนวน ' || v_refund.amount_thb::text || ' บาท ให้คุณแล้ว',
      '/app/payments');

    return jsonb_build_object('ok', true, 'status', 'completed');
  end if;

  update public.refunds set status = 'failed' where id = p_refund_id;
  perform public.app_log(p_actor, 'refund', p_refund_id, v_refund.session_id,
    'refund.failed', v_refund.status::text, 'failed', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'status', 'failed');
end;
$$;

create or replace function public.cancel_session(
  p_session_id uuid,
  p_reason     text,
  p_actor      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
  v_actor   uuid := coalesce(auth.uid(), p_actor);
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  -- auth.uid() is null for service-role callers, which have already been
  -- authorized by the server action that invoked this.
  if auth.uid() is not null
     and v_session.organizer_id <> auth.uid()
     and not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  if v_session.status = 'cancelled' then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', 'cancelled');
  end if;

  update public.sessions
  set status = 'cancelled', cancelled_at = now(), cancelled_reason = p_reason
  where id = p_session_id;

  update public.court_holds
  set status = 'released', released_reason = 'session_cancelled'
  where session_id = p_session_id and status = 'active';

  update public.bookings
  set status = 'cancelled', decision_reason = coalesce(p_reason, 'session_cancelled')
  where session_id = p_session_id and status in ('requested', 'held', 'confirmed');

  update public.waitlist_entries
  set status = 'cancelled'
  where session_id = p_session_id and status in ('waiting', 'promoted');

  perform public.app_log(v_actor, 'session', p_session_id, p_session_id,
    'session.cancelled', v_session.status::text, 'cancelled',
    jsonb_build_object('reason', p_reason));

  return jsonb_build_object('ok', true, 'status', 'cancelled',
    'previousStatus', v_session.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Session lifecycle helpers used by the orchestrator
-- ---------------------------------------------------------------------------

create or replace function public.mark_session_holding(
  p_session_id uuid,
  p_actor      uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status not in ('ready_to_book', 'booking_failed') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_ready',
      'status', v_session.status);
  end if;

  update public.sessions set status = 'holding_court' where id = p_session_id;

  perform public.app_log(p_actor, 'session', p_session_id, p_session_id,
    'session.holding_court', v_session.status::text, 'holding_court', '{}'::jsonb);

  return jsonb_build_object('ok', true, 'status', 'holding_court');
end;
$$;

create or replace function public.session_progress(p_session_id uuid)
returns jsonb
language sql
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'paidParticipants', count(*) filter (where sp.status = 'paid_confirmed'),
    'pendingParticipants', count(*) filter (where sp.status = 'joined_pending_payment'),
    'paidTotalThb', coalesce(sum(p.amount_thb) filter (where p.status = 'paid'), 0),
    'refundedTotalThb', coalesce((
      select sum(r.amount_thb) from public.refunds r
      where r.session_id = p_session_id and r.status = 'completed'
    ), 0)
  )
  from public.session_participants sp
  left join public.payments p on p.participant_id = sp.id
  where sp.session_id = p_session_id;
$$;

-- ---------------------------------------------------------------------------
-- Venue onboarding
--
-- Creating a venue and claiming ownership of it must happen together: a venue
-- with no owner would be unreachable, and a membership row inserted first
-- would reference a venue that does not exist.
-- ---------------------------------------------------------------------------

create or replace function public.create_venue(
  p_name        text,
  p_slug        text,
  p_address     text,
  p_district    text,
  p_province    text default 'กรุงเทพมหานคร',
  p_phone       text default null,
  p_description text default null,
  p_actor       uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := coalesce(auth.uid(), p_actor);
  v_id    uuid;
  v_slug  text := lower(trim(p_slug));
begin
  if v_actor is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if coalesce(trim(p_name), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'name_required');
  end if;
  if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_slug');
  end if;
  if exists (select 1 from public.venues where slug = v_slug) then
    return jsonb_build_object('ok', false, 'reason', 'slug_taken');
  end if;

  insert into public.venues
    (slug, name, description, address, district, province, phone, created_by, is_active)
  values
    (v_slug, trim(p_name), nullif(trim(coalesce(p_description, '')), ''),
     trim(p_address), trim(p_district), trim(p_province),
     nullif(trim(coalesce(p_phone, '')), ''), v_actor, true)
  returning id into v_id;

  insert into public.venue_members (venue_id, user_id, role)
  values (v_id, v_actor, 'owner');

  -- Owning a venue implies the venue_admin capability.
  update public.profiles
  set role = 'venue_admin'
  where id = v_actor and role = 'player';

  perform public.app_log(v_actor, 'venue', v_id, null, 'venue.created', null, 'active',
    jsonb_build_object('slug', v_slug, 'name', trim(p_name)));

  return jsonb_build_object('ok', true, 'venueId', v_id, 'slug', v_slug);
end;
$$;

-- Pay later, and the credit that backs it (LSN-0019).
--
-- An organizer can hand one named player a seat now and payment later. The
-- system, not the organizer, does the chasing afterwards. A credit score decays
-- while the debt stands and gates nothing but the privilege itself.
--
-- The invariant this must not break: only a settled seat counts toward the
-- booking threshold. `settle_payment()` gates on participants that are
-- `paid_confirmed`, and a pay-later seat is not, so it is excluded already —
-- see tests/pay-later-invariants.test.ts, which exists because that exclusion
-- is currently incidental rather than stated.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.session_participants
  add column if not exists pay_later_granted_at timestamptz,
  add column if not exists pay_later_granted_by uuid references public.profiles (id),
  add column if not exists last_chased_at       timestamptz;

comment on column public.session_participants.last_chased_at is
  'Guard for the five-minute sweep: at most one reminder per overdue day.';

-- ---------------------------------------------------------------------------
-- Credit
-- ---------------------------------------------------------------------------

create table if not exists public.player_credit (
  user_id    uuid primary key references public.profiles (id) on delete cascade,
  score      integer not null default 100 check (score between 0 and 100),
  updated_at timestamptz not null default now()
);

drop trigger if exists player_credit_updated_at on public.player_credit;
create trigger player_credit_updated_at
  before update on public.player_credit
  for each row execute function public.set_updated_at();

-- Append-only. A score nobody can explain is a score nobody will accept.
create table if not exists public.credit_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete set null,
  delta      integer not null,
  reason     text not null,
  created_at timestamptz not null default now()
);

create index if not exists credit_events_user_idx
  on public.credit_events (user_id, created_at desc);

create index if not exists session_participants_chase_idx
  on public.session_participants (status, last_chased_at)
  where status in ('joined_pay_later', 'payment_overdue');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.player_credit enable row level security;
alter table public.credit_events enable row level security;

drop policy if exists player_credit_self_read on public.player_credit;
create policy player_credit_self_read on public.player_credit
  for select using (user_id = auth.uid());

-- An organizer sees the score of people in their own sessions and nobody
-- else's. `shares_session_with` is the existing helper for exactly this.
drop policy if exists player_credit_organizer_read on public.player_credit;
create policy player_credit_organizer_read on public.player_credit
  for select using (public.shares_session_with(user_id));

drop policy if exists player_credit_admin_read on public.player_credit;
create policy player_credit_admin_read on public.player_credit
  for select using (public.is_platform_admin());

drop policy if exists credit_events_self_read on public.credit_events;
create policy credit_events_self_read on public.credit_events
  for select using (user_id = auth.uid());

drop policy if exists credit_events_admin_read on public.credit_events;
create policy credit_events_admin_read on public.credit_events
  for select using (public.is_platform_admin());

-- No insert/update/delete policies at all: every write goes through a
-- SECURITY DEFINER function, so a compromised client cannot mint credit.
grant select on public.player_credit, public.credit_events to authenticated;
grant select, insert, update on public.player_credit to service_role;
grant select, insert on public.credit_events to service_role;

-- ---------------------------------------------------------------------------
-- Granting
-- ---------------------------------------------------------------------------

create or replace function public.grant_pay_later(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.session_participants%rowtype;
  v_session public.sessions%rowtype;
  v_payment public.payments%rowtype;
  v_score   integer;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select * into v_session from public.sessions where id = v_p.session_id;

  if not public.is_session_organizer(v_session.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  if v_session.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  if v_p.status <> 'joined_pending_payment' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  select score into v_score from public.player_credit where user_id = v_p.user_id;
  -- A player with no row has never been scored, which is not the same as
  -- scoring zero. Treat them as new.
  if coalesce(v_score, 100) < 70 then
    return jsonb_build_object('ok', false, 'reason', 'credit_too_low',
      'score', coalesce(v_score, 100));
  end if;

  update public.session_participants
  set status = 'joined_pay_later',
      pay_later_granted_at = now(),
      pay_later_granted_by = auth.uid()
  where id = p_participant_id;

  -- The debt is real from this moment, and `expires_at` must end up null so
  -- expire_overdue_payments() leaves it alone.
  --
  -- A player who joined normally already has a live pending payment carrying
  -- the original deadline, and `payments_one_live_per_participant` allows only
  -- one. So the existing row is adopted — clearing its deadline — rather than a
  -- second one inserted. Getting this wrong is not cosmetic: a granted seat
  -- whose payment row kept its expires_at would be swept away as an expired
  -- payment, silently, some minutes later.
  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status in ('pending', 'paid')
  limit 1;

  if v_payment.id is null then
    insert into public.payments
      (session_id, participant_id, user_id, amount_thb, status, idempotency_key, expires_at)
    values
      (v_p.session_id, p_participant_id, v_p.user_id, v_p.amount_due_thb, 'pending',
       'paylater:' || p_participant_id::text, null);
  elsif v_payment.status = 'pending' then
    update public.payments set expires_at = null where id = v_payment.id;
  end if;

  perform public.app_log(auth.uid(), 'session_participant', p_participant_id, v_p.session_id,
    'participant.pay_later_granted', 'joined_pending_payment', 'joined_pay_later',
    jsonb_build_object('amountThb', v_p.amount_due_thb));

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.revoke_pay_later(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p    public.session_participants%rowtype;
  v_next public.participant_status;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null or v_p.status not in ('joined_pay_later', 'payment_overdue') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  if not public.is_session_organizer(v_p.session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  update public.payments
  set status = 'expired'
  where participant_id = p_participant_id and status = 'pending';

  v_next := case
    when v_p.payment_due_at <= now() then 'payment_expired'::public.participant_status
    else 'joined_pending_payment'::public.participant_status
  end;

  update public.session_participants
  set status = v_next,
      pay_later_granted_at = null,
      pay_later_granted_by = null,
      last_chased_at = null
  where id = p_participant_id;

  perform public.app_log(auth.uid(), 'session_participant', p_participant_id, v_p.session_id,
    'participant.pay_later_revoked', v_p.status::text, v_next::text, '{}'::jsonb);

  return jsonb_build_object('ok', true, 'status', v_next);
end;
$$;

-- ---------------------------------------------------------------------------
-- Chasing. Postgres lists who is in the window; the decision is TypeScript's,
-- in src/lib/domain/credit.ts, where tests can reach it.
-- ---------------------------------------------------------------------------

create or replace function public.list_chaseable_participants()
returns table (
  participant_id uuid,
  user_id        uuid,
  session_id     uuid,
  session_title  text,
  amount_due_thb integer,
  ends_at        timestamptz,
  last_chased_at timestamptz,
  status         public.participant_status,
  line_user_id   text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select sp.id, sp.user_id, sp.session_id, s.title, sp.amount_due_thb,
         s.ends_at, sp.last_chased_at, sp.status, pc.line_user_id
  from public.session_participants sp
  join public.sessions s on s.id = sp.session_id
  left join public.profile_contacts pc on pc.user_id = sp.user_id
  where sp.status in ('joined_pay_later', 'payment_overdue')
    and s.ends_at + interval '2 hours' <= now()
    and s.ends_at + interval '14 days' > now();
$$;

create or replace function public.record_chase(
  p_participant_id uuid,
  p_delta          integer,
  p_reason         text,
  p_title          text,
  p_body           text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p   public.session_participants%rowtype;
  v_new integer;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_p.status = 'joined_pay_later' then
    update public.session_participants set status = 'payment_overdue' where id = p_participant_id;
    perform public.app_log(null, 'session_participant', p_participant_id, v_p.session_id,
      'participant.payment_overdue', 'joined_pay_later', 'payment_overdue', '{}'::jsonb);
  end if;

  update public.session_participants set last_chased_at = now() where id = p_participant_id;

  if p_delta <> 0 then
    insert into public.player_credit (user_id, score) values (v_p.user_id, 100)
    on conflict (user_id) do nothing;

    update public.player_credit
    set score = greatest(0, least(100, score + p_delta))
    where user_id = v_p.user_id
    returning score into v_new;

    insert into public.credit_events (user_id, session_id, delta, reason)
    values (v_p.user_id, v_p.session_id, p_delta, p_reason);

    perform public.app_log(null, 'player_credit', v_p.user_id, v_p.session_id,
      'credit.charged', null, v_new::text, jsonb_build_object('delta', p_delta));
  end if;

  perform public.notify_user(v_p.user_id, v_p.session_id, 'payment_overdue',
    p_title, p_body, null);

  return jsonb_build_object('ok', true, 'score', v_new);
end;
$$;

-- ---------------------------------------------------------------------------
-- Settling. A trigger rather than an edit to settle_payment(): the payment path
-- is long and already correct, and copying it into this migration to add five
-- lines would be an invitation to drift.
-- ---------------------------------------------------------------------------

create or replace function public.award_credit_on_pay_later_settled()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_ends  timestamptz;
  v_delta integer;
  v_new   integer;
begin
  if new.status <> 'paid_confirmed' then return new; end if;
  if old.status not in ('joined_pay_later', 'payment_overdue') then return new; end if;

  select ends_at into v_ends from public.sessions where id = new.session_id;

  -- Inside the grace window the debt cost nothing, so settling returns a small
  -- credit. Past it the score has already fallen, and +10 is what makes
  -- recovery possible rather than permanent.
  v_delta := case
    when now() < v_ends + interval '2 hours' + interval '3 days' then 5
    else 10
  end;

  insert into public.player_credit (user_id, score) values (new.user_id, 100)
  on conflict (user_id) do nothing;

  update public.player_credit
  set score = greatest(0, least(100, score + v_delta))
  where user_id = new.user_id
  returning score into v_new;

  insert into public.credit_events (user_id, session_id, delta, reason)
  values (new.user_id, new.session_id, v_delta,
    case when v_delta = 5 then 'paid_in_grace' else 'settled_late' end);

  perform public.app_log(null, 'player_credit', new.user_id, new.session_id,
    'credit.restored', old.status::text, v_new::text, jsonb_build_object('delta', v_delta));

  return new;
end;
$$;

drop trigger if exists session_participants_pay_later_settled on public.session_participants;
create trigger session_participants_pay_later_settled
  after update of status on public.session_participants
  for each row
  when (old.status is distinct from new.status)
  execute function public.award_credit_on_pay_later_settled();

-- ---------------------------------------------------------------------------
-- Execution rights. Organizer-facing functions are reachable by signed-in
-- users and check the caller themselves; sweep functions are service_role only.
-- ---------------------------------------------------------------------------

revoke execute on function public.grant_pay_later(uuid) from public;
revoke execute on function public.revoke_pay_later(uuid) from public;
grant execute on function public.grant_pay_later(uuid) to authenticated;
grant execute on function public.revoke_pay_later(uuid) to authenticated;

revoke execute on function public.list_chaseable_participants() from public, authenticated;
revoke execute on function public.record_chase(uuid, integer, text, text, text)
  from public, authenticated;
grant execute on function public.list_chaseable_participants() to service_role;
grant execute on function public.record_chase(uuid, integer, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- Retrying a declined pay-later payment.
--
-- start_payment() refuses a pay-later debt twice over: the status is not
-- `joined_pending_payment`, and payment_due_at has passed by design. That is
-- correct for it and useless here, because a declined card must not make a debt
-- permanently unpayable — settle_payment() marks the row `failed`, and without
-- this function there is no live row left for the player to settle against.
-- ---------------------------------------------------------------------------

create or replace function public.open_pay_later_payment(
  p_participant_id  uuid,
  p_idempotency_key text,
  p_provider        text default 'mock'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.session_participants%rowtype;
  v_payment public.payments%rowtype;
  v_id      uuid;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_found');
  end if;

  if v_p.status not in ('joined_pay_later', 'payment_overdue') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  -- A live row already exists (the usual case): settle against that one.
  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status in ('pending', 'paid')
  limit 1;

  if v_payment.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true, 'paymentId', v_payment.id,
      'status', v_payment.status, 'amountThb', v_payment.amount_thb);
  end if;

  -- expires_at stays null, as it must for every pay-later row.
  insert into public.payments
    (session_id, participant_id, user_id, amount_thb, status, provider,
     idempotency_key, expires_at)
  values
    (v_p.session_id, v_p.id, v_p.user_id, v_p.amount_due_thb, 'pending', p_provider,
     p_idempotency_key, null)
  returning id into v_id;

  perform public.app_log(coalesce(auth.uid(), v_p.user_id), 'payment', v_id, v_p.session_id,
    'payment.created', null, 'pending',
    jsonb_build_object('amountThb', v_p.amount_due_thb, 'provider', p_provider,
      'payLaterRetry', true));

  return jsonb_build_object('ok', true, 'replayed', false, 'paymentId', v_id,
    'status', 'pending', 'amountThb', v_p.amount_due_thb);
end;
$$;

revoke execute on function public.open_pay_later_payment(uuid, text, text) from public;
grant execute on function public.open_pay_later_payment(uuid, text, text) to authenticated;

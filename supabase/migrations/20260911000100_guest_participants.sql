-- Guests: sign a friend up without an account (LSN-0022).
--
-- "พี่ต้น +1" is how a group fills its last seats. Until now
-- session_participants.user_id was NOT NULL, so the organizer's only options
-- were to make their friend sign up or to leave them off the list and take cash
-- on the side — at which point the headcount, the receipt and the booking
-- threshold were all wrong.
--
-- A guest is a participant with a name and no user. Everything downstream that
-- assumed a user is hardened in this same migration rather than left to fail
-- later: a guest is never chased, never credited, and never notified, because
-- there is nobody to chase, credit or notify.

alter table public.session_participants
  alter column user_id drop not null,
  add column if not exists guest_name text,
  add column if not exists added_by_organizer uuid references public.profiles (id);

alter table public.session_participants
  add constraint session_participants_user_or_guest
  check (
    (user_id is not null and guest_name is null)
    or (user_id is null and guest_name is not null and length(btrim(guest_name)) > 0)
  );

comment on column public.session_participants.guest_name is
  'Set only for a guest — a participant the organizer vouched for who has no account. Exactly one of user_id and guest_name is present.';

-- A cash-paid guest needs a real payment row so that settle_payment()'s
-- "paid seats have money behind them" join still holds. That means payments
-- must tolerate a null user too.
alter table public.payments alter column user_id drop not null;

comment on column public.payments.user_id is
  'Null for a guest paying cash to the organizer. The payment is still real; it just has no account behind it.';

-- ---------------------------------------------------------------------------
-- Guards. A guest row is reachable from the organizer's own actions, so the
-- functions those actions call must say no rather than dereference a null.
--
-- The other six functions that read user_id are unreachable for a guest:
-- join_session and start_payment begin from auth.uid(), and payForSlotAction
-- compares participant.user_id to the caller's id — null never matches, so it
-- already refuses. That last one is correct by accident, so the test file pins
-- it rather than trusting the accident to survive.
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

  -- A guest has no credit to stake, so there is nothing for pay-later to gate.
  -- The organizer already chose how a guest's seat is paid when they added it.
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'guest_has_no_account');
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

  -- Nobody to notify and no score to move. list_chaseable_participants already
  -- filters guests out; this is the second guard, because a wrong charge lands
  -- on a real person's record.
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'guest_has_no_account');
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

-- The chase listing left-joins profile_contacts on sp.user_id, which yields a
-- row with a null contact for a guest rather than no row at all. Filter it.

drop function if exists public.list_chaseable_participants();

create function public.list_chaseable_participants()
returns table (
  participant_id uuid,
  user_id        uuid,
  session_id     uuid,
  session_title  text,
  amount_due_thb integer,
  ends_at        timestamptz,
  last_chased_at timestamptz,
  status         public.participant_status,
  line_user_id   text,
  checked_in_at  timestamptz
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select sp.id, sp.user_id, sp.session_id, s.title, sp.amount_due_thb,
         s.ends_at, sp.last_chased_at, sp.status, pc.line_user_id, sp.checked_in_at
  from public.session_participants sp
  join public.sessions s on s.id = sp.session_id
  left join public.profile_contacts pc on pc.user_id = sp.user_id
  where sp.status in ('joined_pay_later', 'payment_overdue')
    and sp.user_id is not null
    and s.ends_at + interval '2 hours' <= now()
    and s.ends_at + interval '14 days' > now();
$$;

revoke execute on function public.list_chaseable_participants() from public, authenticated;
grant execute on function public.list_chaseable_participants() to service_role;

-- ---------------------------------------------------------------------------
-- The organizer vouches for a guest.
--
-- Cash-paid means the organizer says they have the money. That is a trust
-- extension, and a deliberate one: it is their session, their money, and their
-- word is already what the venue relies on. Nothing verifies the cash exists;
-- the audit log records who claimed it, which is the most the system can
-- honestly offer.
-- ---------------------------------------------------------------------------

create or replace function public.add_guest_participant(
  p_session_id uuid,
  p_guest_name text,
  p_paid_cash  boolean
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
  v_taken   integer;
  v_id      uuid;
  v_amount  integer;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  if v_session.status not in ('open', 'ready_to_book', 'holding_court', 'booked') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_open');
  end if;

  if p_guest_name is null or length(btrim(p_guest_name)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'guest_name_required');
  end if;

  select count(*) into v_taken
  from public.session_participants
  where session_id = p_session_id
    and status in ('joined_pending_payment', 'paid_confirmed',
                   'joined_pay_later', 'payment_overdue');

  if v_taken >= v_session.target_players then
    return jsonb_build_object('ok', false, 'reason', 'session_full');
  end if;

  -- A guest added after the session was settled owes the settled figure, not
  -- the organizer's original guess.
  v_amount := coalesce(v_session.settled_per_person_thb, v_session.budget_per_person_thb);

  insert into public.session_participants
    (session_id, user_id, guest_name, added_by_organizer, status,
     amount_due_thb, payment_due_at)
  values
    (p_session_id, null, btrim(p_guest_name), auth.uid(),
     case when p_paid_cash then 'paid_confirmed'::public.participant_status
          else 'joined_pay_later'::public.participant_status end,
     v_amount, v_session.payment_deadline)
  returning id into v_id;

  -- Both paths get a real payment row. A paid seat has money behind it; an
  -- unpaid one has a debt with no deadline, exactly like a granted pay-later.
  insert into public.payments
    (session_id, participant_id, user_id, amount_thb, status, provider,
     idempotency_key, expires_at, paid_at)
  values
    (p_session_id, v_id, null, v_amount,
     case when p_paid_cash then 'paid'::public.payment_status
          else 'pending'::public.payment_status end,
     'cash', 'guest:' || v_id::text, null,
     case when p_paid_cash then now() else null end);

  perform public.app_log(auth.uid(), 'session_participant', v_id, p_session_id,
    'participant.guest_added', null,
    case when p_paid_cash then 'paid_confirmed' else 'joined_pay_later' end,
    jsonb_build_object('guestName', btrim(p_guest_name), 'paidCash', p_paid_cash,
      'amountThb', v_amount, 'attestedBy', auth.uid()));

  return jsonb_build_object('ok', true, 'participantId', v_id, 'amountThb', v_amount);
end;
$$;

create or replace function public.remove_guest_participant(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.session_participants%rowtype;
  v_session public.sessions%rowtype;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_p.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_guest');
  end if;

  if not public.is_session_organizer(v_p.session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  select * into v_session from public.sessions where id = v_p.session_id;
  if v_session.status in ('completed', 'cancelled', 'booking_failed') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  update public.payments set status = 'expired'
  where participant_id = p_participant_id and status = 'pending';

  update public.session_participants
  set status = 'cancelled', cancelled_at = now()
  where id = p_participant_id;

  perform public.app_log(auth.uid(), 'session_participant', p_participant_id, v_p.session_id,
    'participant.guest_removed', v_p.status::text, 'cancelled',
    jsonb_build_object('guestName', v_p.guest_name));

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.add_guest_participant(uuid, text, boolean) from public;
revoke execute on function public.remove_guest_participant(uuid) from public;
grant execute on function public.add_guest_participant(uuid, text, boolean) to authenticated;
grant execute on function public.remove_guest_participant(uuid) to authenticated;

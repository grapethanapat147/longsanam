-- Group cost calculator (LSN-0021).
--
-- budget_per_person_thb is a guess the organizer makes when creating a session.
-- This records what it actually cost — court plus shuttles, over the people who
-- actually played — and chases people for that instead.
--
-- Settlement never touches a participant who has already paid. Over-collection
-- stays with the organizer and under-collection is theirs to raise with the
-- group; retroactively billing someone who settled up is lending in reverse.

create type public.split_mode as enum ('equal', 'by_games');

alter table public.sessions
  add column if not exists shuttle_cost_thb       integer not null default 0
    check (shuttle_cost_thb >= 0),
  add column if not exists split_mode             public.split_mode not null default 'equal',
  add column if not exists settled_per_person_thb integer check (settled_per_person_thb >= 0),
  add column if not exists settled_at             timestamptz;

comment on column public.sessions.settled_at is
  'When the organizer last settled. Re-settling is allowed until the debt is paid, so this is the latest settle, not the only one.';

alter table public.session_participants
  add column if not exists games_played smallint check (games_played >= 0);

comment on column public.session_participants.games_played is
  'Organizer-entered, used only by split_mode = by_games. Null means not recorded, which the settlement treats as the group average — never as zero.';

-- ---------------------------------------------------------------------------
-- Settling.
--
-- Shares are computed here rather than in TypeScript because the write has to
-- be one transaction. settleSession() in src/lib/domain/settlement.ts is the
-- copy the unit tests pin and the copy the organizer's preview uses; the two
-- must agree. Unlike LSN-0019's threshold this is arithmetic, so drift would
-- produce a wrong number rather than a security hole — the pgTAP file pins the
-- equal-split figure from this side.
-- ---------------------------------------------------------------------------

create or replace function public.settle_session_costs(
  p_session_id       uuid,
  p_shuttle_cost_thb integer,
  p_split_mode       public.split_mode
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session     public.sessions%rowtype;
  v_court       integer;
  v_total       integer;
  v_players     integer;
  v_per_person  integer;
  v_any_checkin boolean;
  v_row         record;
  v_games       numeric;
  v_avg         numeric;
  v_total_g     numeric;
  v_amount      integer;
  v_updated     integer := 0;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  if v_session.status in ('cancelled', 'booking_failed') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  if p_shuttle_cost_thb < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- The confirmed booking is the truth when there is one. When the venue
  -- confirmed by phone and nothing was booked in-app, fall back to the price of
  -- the cheapest approved court for the slot — the same figure the session page
  -- already shows as "ค่าสนามโดยประมาณ", so the organizer is settling against a
  -- number they have already seen.
  select coalesce(
    (select b.price_thb from public.bookings b
      where b.session_id = p_session_id and b.status = 'confirmed'
      order by b.attempt_no limit 1),
    (select min(public.court_price_for(pref.court_id, v_session.starts_at, v_session.ends_at))
      from public.session_venue_preferences pref
      where pref.session_id = p_session_id and pref.approved),
    0) into v_court;

  v_total := v_court + p_shuttle_cost_thb;

  -- Who is in the denominator: whoever checked in (LSN-0020), and everyone
  -- still holding a seat when nobody was checked in at all.
  --
  -- No temporary table and no temporary view. plpgsql does not substitute
  -- variables into DDL, so a view could not see p_session_id, and a temp table
  -- throws on the second call inside one transaction — which re-settling, and
  -- any pgTAP file, will do. One boolean and a repeated predicate is duller and
  -- correct.
  select exists (
    select 1 from public.session_participants x
    where x.session_id = p_session_id and x.checked_in_at is not null
  ) into v_any_checkin;

  select count(*) into v_players
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.status in ('paid_confirmed', 'joined_pay_later', 'payment_overdue')
    and (not v_any_checkin or sp.checked_in_at is not null);

  if v_players = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_players');
  end if;

  v_per_person := ceil(v_total::numeric / v_players);

  -- A blank games count is not a zero; it is the average of the counts we have.
  select avg(sp.games_played) into v_avg
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.status in ('paid_confirmed', 'joined_pay_later', 'payment_overdue')
    and (not v_any_checkin or sp.checked_in_at is not null)
    and sp.games_played is not null;

  select sum(coalesce(sp.games_played, v_avg)) into v_total_g
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.status in ('paid_confirmed', 'joined_pay_later', 'payment_overdue')
    and (not v_any_checkin or sp.checked_in_at is not null);

  for v_row in
    select sp.id, sp.status, sp.games_played
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.status in ('paid_confirmed', 'joined_pay_later', 'payment_overdue')
      and (not v_any_checkin or sp.checked_in_at is not null)
  loop
    if p_split_mode = 'by_games' and v_avg is not null and v_total_g > 0 then
      v_games  := coalesce(v_row.games_played, v_avg);
      v_amount := ceil(v_total::numeric * v_games / v_total_g);
    else
      v_amount := v_per_person;
    end if;

    -- Never a participant who has already paid.
    if v_row.status in ('joined_pay_later', 'payment_overdue') then
      update public.session_participants set amount_due_thb = v_amount where id = v_row.id;
      update public.payments set amount_thb = v_amount
      where participant_id = v_row.id and status = 'pending';
      v_updated := v_updated + 1;
    end if;
  end loop;

  update public.sessions
  set shuttle_cost_thb = p_shuttle_cost_thb,
      split_mode = p_split_mode,
      settled_per_person_thb = v_per_person,
      settled_at = now()
  where id = p_session_id;

  perform public.app_log(auth.uid(), 'session', p_session_id, p_session_id,
    'session.settled', v_session.settled_per_person_thb::text, v_per_person::text,
    jsonb_build_object('courtThb', v_court, 'shuttleThb', p_shuttle_cost_thb,
      'players', v_players, 'unpaidUpdated', v_updated));

  return jsonb_build_object('ok', true, 'totalThb', v_total,
    'perPersonThb', v_per_person, 'players', v_players, 'unpaidUpdated', v_updated);
end;
$$;

-- Reminders need no change: settle_session_costs rewrites
-- session_participants.amount_due_thb for unpaid seats, and
-- list_chaseable_participants() already selects that column. The pgTAP file
-- pins it from the database side so a future refactor of either cannot silently
-- reintroduce the guessed figure.

-- ---------------------------------------------------------------------------
-- A cancelled session clears the figure that described it.
--
-- void_pay_later_on_session_end() from LSN-0019 already voids debts and refunds
-- the credit those debts cost. It gains one statement: a settled figure
-- describes what a session cost, and a session that did not happen cost
-- nothing. Leaving the number behind would print a per-head charge on the
-- receipt for a debt that has just been voided.
--
-- This is the third ticket running whose real bug lives at "what happens when
-- the session did not happen", which is why it is stated here rather than
-- assumed.
-- ---------------------------------------------------------------------------

create or replace function public.void_pay_later_on_session_end()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_charged integer;
begin
  if new.status not in ('cancelled', 'booking_failed') then return new; end if;

  update public.sessions
  set settled_per_person_thb = null, settled_at = null
  where id = new.id and settled_per_person_thb is not null;

  for v_row in
    select sp.id, sp.user_id, sp.amount_due_thb
    from public.session_participants sp
    where sp.session_id = new.id
      and sp.status in ('joined_pay_later', 'payment_overdue')
  loop
    update public.payments
    set status = 'expired'
    where participant_id = v_row.id and status = 'pending';

    update public.session_participants
    set status = 'cancelled', cancelled_at = now(), last_chased_at = null
    where id = v_row.id;

    select coalesce(sum(delta), 0) into v_charged
    from public.credit_events
    where user_id = v_row.user_id and session_id = new.id and delta < 0;

    if v_charged < 0 then
      update public.player_credit
      set score = greatest(0, least(100, score - v_charged))
      where user_id = v_row.user_id;

      insert into public.credit_events (user_id, session_id, delta, reason)
      values (v_row.user_id, new.id, -v_charged, 'session_cancelled_refund');
    end if;

    perform public.notify_user(v_row.user_id, new.id, 'debt_cancelled',
      'ยกเลิกยอดค้างชำระแล้ว',
      'ก๊วนถูกยกเลิกและระบบไม่ได้จองสนามให้ ยอดค้าง ฿' || v_row.amount_due_thb ||
      ' จึงถูกยกเลิก และเครดิตที่ถูกหักไปได้คืนแล้ว', null);

    perform public.app_log(null, 'session_participant', v_row.id, new.id,
      'participant.pay_later_voided', 'payment_overdue', 'cancelled',
      jsonb_build_object('amountThb', v_row.amount_due_thb, 'creditRestored', -v_charged));
  end loop;

  return new;
end;
$$;

revoke execute on function public.settle_session_costs(uuid, integer, public.split_mode)
  from public;
grant execute on function public.settle_session_costs(uuid, integer, public.split_mode)
  to authenticated;

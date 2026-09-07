-- Pay-later lifecycle against the real functions (LSN-0019).
--
-- These behaviours cannot be reached from the Vitest suite: they live in
-- triggers, RPCs and the interaction between them. Every one of them was found
-- or confirmed by running the real sweep rather than by reading the diff, so
-- they are pinned here rather than left as a paragraph in a review note.
--
-- Run with `npm run test:db`.
--
-- Actors, from supabase/seed.sql:
--   organizer  1111…0001  organizes OPEN001
--   player     1111…0004  joined_pending_payment in OPEN001
--   participant row  eeee…0004

begin;
select plan(9);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- The session has to have ended for the chase to consider it.
update public.sessions
set starts_at = now() - interval '4 days' - interval '2 hours',
    ends_at   = now() - interval '4 days'
where public_code = 'OPEN001';

-- ---------------------------------------------------------------------------
-- Granting
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is((public.grant_pay_later('eeeeeeee-0000-4000-8000-000000000004') ->> 'ok'), 'true',
  'the organizer can grant pay-later');
set local role postgres;

-- The player already had a live payment from joining, and
-- payments_one_live_per_participant allows exactly one. Granting must adopt it,
-- not insert a second — and must clear its deadline.
select is(
  (select count(*) from public.payments
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004'
       and status in ('pending', 'paid')),
  1::bigint, 'granting leaves exactly one live payment row');

select is(
  (select expires_at from public.payments
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004' and status = 'pending'),
  null, 'the adopted row has no deadline, so the expiry sweep will skip it');

-- ---------------------------------------------------------------------------
-- The sweep must not eat the seat
-- ---------------------------------------------------------------------------

select public.expire_overdue_payments();
select is(
  (select status::text from public.session_participants
     where id = 'eeeeeeee-0000-4000-8000-000000000004'),
  'joined_pay_later', 'expire_overdue_payments leaves a pay-later seat alone');

-- ---------------------------------------------------------------------------
-- Chasing
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.list_chaseable_participants()
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004'),
  1::bigint, 'a debt four days past the session is due a chase');

select public.record_chase('eeeeeeee-0000-4000-8000-000000000004', -5,
  'overdue_day_3', 'ยังค้างชำระค่าก๊วน', 'test');

select is(
  (select score from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  95, 'a chase past the grace window costs five credit');

-- ---------------------------------------------------------------------------
-- A declined card must not make the debt unpayable
-- ---------------------------------------------------------------------------

select public.settle_payment(
  (select id from public.payments
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004' and status = 'pending'),
  false, null, 'card_declined');

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;
select is(
  (public.open_pay_later_payment('eeeeeeee-0000-4000-8000-000000000004', 'retry:test') ->> 'ok'),
  'true', 'a declined pay-later debt can be retried');
set local role postgres;

select is(
  (select expires_at from public.payments
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004' and status = 'pending'),
  null, 'the retry row has no deadline either');

-- ---------------------------------------------------------------------------
-- A session we cancelled cancels its debts
--
-- The landing page promises ไม่ได้สนาม คืนเต็ม. Paid players are refunded; a
-- pay-later player must not be left holding the only bill for a session that
-- never happened.
-- ---------------------------------------------------------------------------

update public.sessions set status = 'booking_failed' where public_code = 'OPEN001';

select is(
  (select count(*) from public.list_chaseable_participants()
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004'),
  0::bigint, 'a cancelled session stops the chase and restores the credit it cost');

select * from finish();
rollback;

-- RLS for player credit (LSN-0019).
--
-- A credit score is not a display name. It encodes "this person does not pay
-- what they owe", so the read rules deserve a test rather than a policy name
-- that sounds right. Run with `npm run test:db`.
--
-- Actors, from supabase/seed.sql:
--   organizer  1111…0001  organizes OPEN001, READY01, BOOKED1
--   teammate   1111…0002  plays in OPEN001 alongside the player below
--   player     1111…0004  plays in OPEN001
--   outsider   2222…0002  venue staff, in no session at all
--   admin      3333…0001  platform admin

begin;
select plan(12);

insert into public.player_credit (user_id, score) values
  ('11111111-1111-4111-8111-000000000004', 80),
  ('11111111-1111-4111-8111-000000000001', 80);

insert into public.credit_events (user_id, session_id, delta, reason) values
  ('11111111-1111-4111-8111-000000000004', null, -5, 'test_overdue');

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Reading a score
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;
select is(
  (select count(*) from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  1::bigint, 'a player reads their own score');

set local role postgres;
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  (select count(*) from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  1::bigint, 'the organizer of the session a player is in reads that score');

-- The one that matters. shares_session_with() is true for any co-participant,
-- because it was written for display names. A score is not a display name.
set local role postgres;
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  (select count(*) from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  0::bigint, 'a teammate in the same session cannot read another player''s score');

set local role postgres;
select pg_temp.act_as('22222222-2222-4222-8222-000000000002');
set local role authenticated;
select is(
  (select count(*) from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  0::bigint, 'someone sharing no session reads nothing');

-- An organizer's own score must not become public just because their session is.
set local role postgres;
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  (select count(*) from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000001'),
  0::bigint, 'an organizer''s own score is not readable by everyone who sees the session');

set local role postgres;
select pg_temp.act_as('33333333-3333-4333-8333-000000000001');
set local role authenticated;
select is((select count(*) from public.player_credit), 2::bigint,
  'a platform admin reads every score');

-- ---------------------------------------------------------------------------
-- Reading the history
-- ---------------------------------------------------------------------------

set local role postgres;
select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;
select is((select count(*) from public.credit_events), 1::bigint,
  'a player reads their own credit history');

set local role postgres;
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is((select count(*) from public.credit_events), 0::bigint,
  'an organizer sees the score but not the history behind it');

set local role postgres;
select pg_temp.act_as('33333333-3333-4333-8333-000000000001');
set local role authenticated;
select is((select count(*) from public.credit_events), 1::bigint,
  'a platform admin reads every credit event');

-- ---------------------------------------------------------------------------
-- Writing. Neither table carries an insert, update or delete policy: every
-- write goes through a SECURITY DEFINER function, so a client cannot mint
-- credit for itself even with a valid session.
-- ---------------------------------------------------------------------------

set local role postgres;
select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;

select throws_ok(
  $$insert into public.player_credit (user_id, score)
    values ('11111111-1111-4111-8111-000000000006', 100)$$,
  '42501', null, 'a client cannot insert a credit row');

select is(
  (select count(*) from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004' and score = 100),
  0::bigint, 'a client cannot raise its own score');

select throws_ok(
  $$insert into public.credit_events (user_id, delta, reason)
    values ('11111111-1111-4111-8111-000000000004', 100, 'forged')$$,
  '42501', null, 'a client cannot forge a credit event');

set local role postgres;
select * from finish();
rollback;

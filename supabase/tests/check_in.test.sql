-- Check-in and no-shows against the real functions (LSN-0020).
--
-- The window, the charge, its idempotency and the cancelled-session guard all
-- live in SQL, where the Vitest suite cannot reach them. Run with
-- `npm run test:db`.
--
-- Actors, from supabase/seed.sql:
--   organizer  1111…0001  organizes OPEN001
--   player     1111…0002  แนน, plays in OPEN001
--   player     1111…0003  บอส, plays in OPEN001
--   player     1111…0004  มีน, plays in OPEN001 (participant eeee…0004)

begin;
select plan(8);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- The session ended four days ago, so the window shut two hours after that.
update public.sessions
set starts_at = now() - interval '4 days' - interval '2 hours',
    ends_at   = now() - interval '4 days'
where public_code = 'OPEN001';

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is((public.set_check_in('eeeeeeee-0000-4000-8000-000000000004', true) ->> 'reason'),
  'outside_check_in_window', 'check-in is refused once the window has closed');
set local role postgres;

-- Reopen it: started half an hour ago, ends in an hour.
update public.sessions
set starts_at = now() - interval '30 minutes', ends_at = now() + interval '1 hour'
where public_code = 'OPEN001';

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is((public.set_check_in('eeeeeeee-0000-4000-8000-000000000004', true) ->> 'reason'),
  'not_organizer', 'a player cannot mark anyone present');
set local role postgres;

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is((public.set_check_in('eeeeeeee-0000-4000-8000-000000000004', true) ->> 'ok'),
  'true', 'the organizer can mark a player present');
set local role postgres;

select isnt(
  (select checked_in_at from public.session_participants
     where id = 'eeeeeeee-0000-4000-8000-000000000004'),
  null, 'the check-in time is stored');

-- A pay-later seat that never showed, on a session that ended four days ago.
-- `completed` on purpose: a no-show is only meaningful for a session that
-- actually happened, and the allowlist in mark_no_shows() enforces exactly that.
update public.sessions
set starts_at = now() - interval '4 days' - interval '2 hours',
    ends_at   = now() - interval '4 days',
    status    = 'completed'
where public_code = 'OPEN001';
update public.session_participants
set status = 'joined_pay_later', checked_in_at = null, no_show_marked_at = null
where id = 'eeeeeeee-0000-4000-8000-000000000004';

select public.mark_no_shows();
select is(
  (select score from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  90, 'a pay-later no-show costs ten credit');

-- The five-minute sweep comes round again a moment later.
select public.mark_no_shows();
select is(
  (select score from public.player_credit
     where user_id = '11111111-1111-4111-8111-000000000004'),
  90, 'and only once, however often the sweep runs');

-- The guard that matters: we cancelled the session ourselves.
update public.session_participants
set status = 'joined_pay_later', checked_in_at = null, no_show_marked_at = null
where session_id = (select id from public.sessions where public_code = 'OPEN001')
  and user_id = '11111111-1111-4111-8111-000000000002';
update public.sessions set status = 'booking_failed' where public_code = 'OPEN001';
select public.mark_no_shows();
select is(
  (select count(*) from public.credit_events
     where user_id = '11111111-1111-4111-8111-000000000002' and reason = 'no_show_unpaid'),
  0::bigint, 'nobody is charged for a session we could not deliver');

-- The same guard from the other side. A session still `open` never secured a
-- court and never happened; charging its players for not attending it is the
-- bug the allowlist exists to prevent. The stranded loop normally cancels these
-- first, but it gives up when cancel_session fails, so this must not depend on
-- that having run.
update public.sessions
set status = 'open', starts_at = now() - interval '4 days' - interval '2 hours',
    ends_at = now() - interval '4 days'
where public_code = 'OPEN001';
-- บอส, untouched by the earlier assertions, so the count measures this run alone.
update public.session_participants
set status = 'joined_pay_later', checked_in_at = null, no_show_marked_at = null
where id = 'eeeeeeee-0000-4000-8000-000000000003';
select public.mark_no_shows();
select is(
  (select count(*) from public.credit_events
     where user_id = '11111111-1111-4111-8111-000000000003' and reason = 'no_show_unpaid'),
  0::bigint, 'a session that never secured a court charges nobody for missing it');

select * from finish();
rollback;

-- Settlement against the real functions (LSN-0021). Run with `npm run test:db`.
--
-- Actors, from supabase/seed.sql:
--   organizer  1111…0001  organizes OPEN001
--   แนน        1111…0002  participant eeee…0002 — made paid_confirmed below
--   มีน        1111…0004  participant eeee…0004 — made joined_pay_later below

begin;
select plan(6);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- A confirmed booking of ฿600 so the court figure is known rather than derived.
insert into public.bookings (session_id, court_id, venue_id, status, price_thb,
                             attempt_no, starts_at, ends_at, idempotency_key)
select s.id, pref.court_id, pref.venue_id, 'confirmed', 600, 1, s.starts_at, s.ends_at,
       'test:settlement:' || s.id::text
from public.sessions s
join public.session_venue_preferences pref on pref.session_id = s.id
where s.public_code = 'OPEN001'
order by pref.priority
limit 1;

update public.session_participants set status = 'joined_pay_later'
where id = 'eeeeeeee-0000-4000-8000-000000000004';
update public.session_participants set status = 'paid_confirmed', amount_due_thb = 100
where id = 'eeeeeeee-0000-4000-8000-000000000002';

-- Only the organizer may settle.
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  (public.settle_session_costs(
     (select id from public.sessions where public_code = 'OPEN001'), 400, 'equal') ->> 'reason'),
  'not_organizer', 'a player cannot settle someone else''s session');
set local role postgres;

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  (public.settle_session_costs(
     (select id from public.sessions where public_code = 'OPEN001'), 400, 'equal') ->> 'ok'),
  'true', 'the organizer can settle');
set local role postgres;

-- ฿600 court + ฿400 shuttles over four seats = ฿250 each.
select is(
  (select settled_per_person_thb from public.sessions where public_code = 'OPEN001'),
  250, 'the settled figure is court plus shuttles over the players');

select is(
  (select amount_due_thb from public.session_participants
     where id = 'eeeeeeee-0000-4000-8000-000000000004'),
  250, 'an unpaid seat is rebilled at the settled amount');

-- The guard that matters.
select is(
  (select amount_due_thb from public.session_participants
     where id = 'eeeeeeee-0000-4000-8000-000000000002'),
  100, 'a seat that already paid is left exactly as it was');

-- And the figure does not outlive the session it describes.
update public.sessions set status = 'booking_failed' where public_code = 'OPEN001';
select is(
  (select settled_per_person_thb from public.sessions where public_code = 'OPEN001'),
  null, 'cancelling the session clears the figure that described it');

select * from finish();
rollback;

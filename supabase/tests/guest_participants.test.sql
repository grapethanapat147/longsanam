-- Guests (LSN-0022). Run with `npm run test:db`.
--
-- A guest is a seat with no account: session_participants.user_id is null and
-- guest_name carries who they are. Every assertion here exists because some
-- piece of the system reads user_id and had to be taught that it can be null.
--
-- Actors, from supabase/seed.sql:
--   organizer  1111…0001  organizes OPEN001
--   แนน        1111…0002  a player in OPEN001, not the organizer
--   มีน        1111…0004  a player in OPEN001 (participant eeee…0004)

begin;
select plan(19);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- Only the organizer may add a guest.
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  (public.add_guest_participant(
     (select id from public.sessions where public_code = 'OPEN001'), 'พี่ต้น', true) ->> 'reason'),
  'not_organizer', 'a player cannot add a guest to someone else''s session');
set local role postgres;

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  (public.add_guest_participant(
     (select id from public.sessions where public_code = 'OPEN001'), '   ', true) ->> 'reason'),
  'guest_name_required', 'a blank name is refused');

select is(
  (public.add_guest_participant(
     (select id from public.sessions where public_code = 'OPEN001'), 'พี่ต้น', true) ->> 'ok'),
  'true', 'the organizer can add a cash-paid guest');
set local role postgres;

select is(
  (select count(*) from public.session_participants
     where session_id = (select id from public.sessions where public_code = 'OPEN001')
       and guest_name = 'พี่ต้น' and user_id is null),
  1::bigint, 'the guest has a name and no account');

-- The invariant this whole approach exists to keep: a seat that claims to be
-- paid has money behind it. Widening payments.user_id was the price of keeping
-- it rather than loosening settle_payment()'s join.
select is(
  (select p.status::text from public.payments p
     join public.session_participants sp on sp.id = p.participant_id
     where sp.guest_name = 'พี่ต้น'),
  'paid', 'a cash-paid guest has a real paid payment row behind the seat');

-- Three-valued logic: user_id is null, so the first clause of payments_read is
-- null rather than false and the organizer clause decides.
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  (select count(*) from public.payments p
     join public.session_participants sp on sp.id = p.participant_id
     where sp.guest_name = 'พี่ต้น'),
  1::bigint, 'the organizer can read a guest payment despite the null user_id');
set local role postgres;

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  (select count(*) from public.payments p
     join public.session_participants sp on sp.id = p.participant_id
     where sp.guest_name = 'พี่ต้น'),
  0::bigint, 'another player cannot read it');
set local role postgres;

-- The reason payments.user_id was widened at all: a cash-paid guest has to
-- reach min_players. settle_payment() counts paid_confirmed seats joined to a
-- paid payment row, and the guest now has one.
select is(
  (select count(*)
     from public.session_participants sp
     join public.payments p on p.participant_id = sp.id and p.status = 'paid'
     where sp.session_id = (select id from public.sessions where public_code = 'OPEN001')
       and sp.status = 'paid_confirmed'
       and sp.guest_name = 'พี่ต้น'),
  1::bigint, 'a cash guest satisfies the paid-seat join that min_players counts');

-- payForSlotAction compares participant.user_id to the caller's id. For a guest
-- that is null is distinct from uuid, so it already refuses — by accident of
-- the comparison rather than by a written rule, which is why it is pinned.
select ok(
  (select user_id is distinct from '11111111-1111-4111-8111-000000000001'::uuid
     from public.session_participants where guest_name = 'พี่ต้น'),
  'a guest row never matches a caller, so the pay action refuses it');

-- ---------------------------------------------------------------------------
-- The arithmetic the cancel dialog does.
--
-- session_progress() counts a cash guest in paidParticipants and their money in
-- paidTotalThb, which is right: they hold a genuinely paid seat and belong in
-- the progress meter and in min_players. But refundAllPaidParticipants() skips
-- them, so the cancel dialog subtracts the guest-cash figures before saying
-- "will be refunded". These two assertions pin that the subtraction lands
-- exactly on the set that function actually processes — its query is
-- `status = 'paid_confirmed'` with `user_id is not null`.
-- ---------------------------------------------------------------------------

select is(
  ((public.session_progress((select id from public.sessions where public_code = 'OPEN001'))
    ->> 'paidParticipants')::integer
   - (select count(*)::integer from public.session_participants
        where session_id = (select id from public.sessions where public_code = 'OPEN001')
          and guest_name is not null and status = 'paid_confirmed')),
  (select count(*)::integer from public.session_participants
     where session_id = (select id from public.sessions where public_code = 'OPEN001')
       and status = 'paid_confirmed' and user_id is not null),
  'paid seats minus cash guests is exactly what the refund fan-out processes');

select is(
  ((public.session_progress((select id from public.sessions where public_code = 'OPEN001'))
    ->> 'paidTotalThb')::integer
   - (select coalesce(sum(amount_due_thb), 0)::integer from public.session_participants
        where session_id = (select id from public.sessions where public_code = 'OPEN001')
          and guest_name is not null and status = 'paid_confirmed')),
  (select coalesce(sum(p.amount_thb), 0)::integer
     from public.payments p
     join public.session_participants sp on sp.id = p.participant_id
     where sp.session_id = (select id from public.sessions where public_code = 'OPEN001')
       and p.status = 'paid' and sp.user_id is not null),
  'and the money left over is exactly what the platform can hand back');

-- ---------------------------------------------------------------------------
-- Guests are outside the credit system entirely.
--
-- Each exclusion below is paired with a positive control on มีน, a real account
-- put into the identical state. Without the control, "the guest is absent"
-- would also pass if the function returned nothing at all, or if the setup
-- silently failed to qualify anybody — the assertion has to distinguish the
-- guard from an empty result.
--
-- Both guards were falsified by removing them and re-running. The chase guard
-- fails assertion 11 cleanly. The mark_no_shows() guard fails harder: without
-- it the function reaches `insert into player_credit (user_id, ...)` with a null
-- and raises, which aborts the whole sweep — so a guest would cost every real
-- no-show their marking too. That raise, not assertion 13, is what actually
-- catches its removal; 13 is a pin against a refactor that moves the
-- no_show_marked_at update ahead of the credit insert.
-- ---------------------------------------------------------------------------

update public.sessions
set starts_at = now() - interval '4 days' - interval '2 hours',
    ends_at   = now() - interval '4 days',
    status    = 'completed'
where public_code = 'OPEN001';

update public.session_participants set status = 'joined_pay_later'
where guest_name = 'พี่ต้น';

update public.session_participants set status = 'joined_pay_later'
where id = 'eeeeeeee-0000-4000-8000-000000000004';

select is(
  (select count(*) from public.list_chaseable_participants()
     where participant_id = 'eeeeeeee-0000-4000-8000-000000000004'),
  1::bigint, 'a real player in this state is chaseable');

select is(
  (select count(*) from public.list_chaseable_participants()
     where participant_id = (select id from public.session_participants
                               where guest_name = 'พี่ต้น')),
  0::bigint, 'but a guest is never in the chase list');

select public.mark_no_shows();

select isnt(
  (select no_show_marked_at from public.session_participants
     where id = 'eeeeeeee-0000-4000-8000-000000000004'),
  null, 'a real player in this state is marked a no-show');

select is(
  (select no_show_marked_at from public.session_participants
     where guest_name = 'พี่ต้น'),
  null, 'but a guest is never marked, so it never costs anybody credit');

-- ---------------------------------------------------------------------------
-- Cancelling a session that holds an unpaid guest.
--
-- sessions_void_pay_later fires on the status change and loops joined_pay_later
-- seats. Before review it had no user_id filter, so it reached
-- notify_user(null, ...) and notifications.user_id is NOT NULL — the raise
-- aborted the UPDATE, making such a session impossible to cancel.
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  (public.add_guest_participant(
     (select id from public.sessions where public_code = 'READY01'), 'เจ๊หมวย', false) ->> 'ok'),
  'true', 'an unpaid guest can be added');
set local role postgres;

select lives_ok(
  $$update public.sessions set status = 'cancelled' where public_code = 'READY01'$$,
  'a session holding an unpaid guest can still be cancelled');

select is(
  (select status::text from public.session_participants where guest_name = 'เจ๊หมวย'),
  'cancelled', 'and the guest seat is voided like anyone else''s');

select is(
  (select p.status::text from public.payments p
     join public.session_participants sp on sp.id = p.participant_id
     where sp.guest_name = 'เจ๊หมวย'),
  'expired', 'and their pending payment is expired, not left live');

select * from finish();
rollback;

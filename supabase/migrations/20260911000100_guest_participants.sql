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

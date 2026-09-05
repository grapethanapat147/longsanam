-- New participant statuses for pay-later seats (LSN-0019).
--
-- These live alone in their own migration on purpose. Postgres allows
-- `alter type ... add value` inside a transaction, but forbids *using* the new
-- value in the same one — and the next migration uses both in a partial index
-- predicate. Splitting the files gives each its own transaction.

alter type public.participant_status add value if not exists 'joined_pay_later';
alter type public.participant_status add value if not exists 'payment_overdue';

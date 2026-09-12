/**
 * Who counts as having played, for the receipt.
 *
 * This is a TypeScript copy of the denominator inside
 * `session_receipt_public()`, which is itself a copy of the one inside
 * `settle_session_costs()` (LSN-0021). Three copies of one rule is two too
 * many, but the named half of the receipt cannot call the RPC — the RPC
 * deliberately returns no names — so the list has to select its own rows. The
 * rule therefore lives here once, with a test, instead of being spelled out a
 * third time inside a query builder where nothing can reach it.
 *
 * The two halves disagreeing is not hypothetical: the header counted only
 * players who checked in while the list below it showed everyone holding a
 * seat, so a session where one of four checked in read "ผู้เล่น 1" above four
 * named rows.
 */

/** Seats that hold a place in the session. Anything else never played. */
const COUNTED_STATUSES = ['paid_confirmed', 'joined_pay_later', 'payment_overdue'];

export type RosterSeat = {
  status: string;
  checked_in_at: string | null;
};

/**
 * `seats` must be **every** seat in the session, not a pre-filtered set: the
 * "did anyone check in" question is asked across all of them in SQL, including
 * statuses that are not themselves counted. Narrowing the input first is what
 * would make this drift from the database.
 */
export function receiptRoster<T extends RosterSeat>(seats: T[]): T[] {
  const anyCheckIn = seats.some((s) => s.checked_in_at !== null);
  return seats.filter(
    (s) => COUNTED_STATUSES.includes(s.status) && (!anyCheckIn || s.checked_in_at !== null),
  );
}

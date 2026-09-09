# Group cost calculator

## Problem

`budget_per_person_thb` is a number the organizer guesses when creating the
session. The real cost is `court_price_for(...)` plus shuttlecocks, split across
the people who actually played. Today the amount a pay-later player is chased
for is the guess, not the truth. ตีแบด's calculator is one of its most-used
tools for exactly this reason: every group does this sum by hand, every week.

## Design

**Settlement, not re-billing.** The calculator produces one number —
`settled_per_person_thb` — computed once, when the organizer presses
"สรุปยอด" after the session. It changes two things and only two:

1. What pay-later and overdue players are chased for.
2. What the receipt (LSN-0023) shows.

It does **not** touch anyone who already paid. Over-collection stays with the
organizer, as it does today; under-collection is the organizer's to raise with
the group. Retroactively charging paid players is lending in reverse and stays
out.

**Inputs.**

- `sessions.shuttle_cost_thb integer default 0` — organizer enters a total, or
  tubes × price with a small helper. Brand is not modelled; the number is.
- Court cost from the confirmed booking's `price_thb`, falling back to
  `court_price_for` on the first approved court when there is no booking.
- `sessions.split_mode` enum `equal | by_games`, default `equal`.
- For `by_games`: `session_participants.games_played smallint` entered by the
  organizer per player. Missing counts fall back to the group average so one
  blank does not break the split.

**Who is in the denominator.** Players who checked in (LSN-0020). If no
check-in data exists for the session, players who are `paid_confirmed`,
`joined_pay_later` or `payment_overdue`. Guests (LSN-0022) count.

**Rounding.** Per-head rounds *up* to the baht, as `costPerPersonThb` already
does; the organizer absorbs the rounding, never the players.

**Pure function first.** `settleSession(...)` in `src/lib/domain/settlement.ts`
takes the inputs above and returns per-participant amounts. Vitest pins the
arithmetic; the RPC `settle_session_costs(session_id)` stores the result and
updates `amount_due_thb` for unpaid participants only.

## Out of scope

Tracking shuttle brands. Refunding paid players a difference. Any change to
the pre-session budget or to when a session becomes bookable.

## Acceptance criteria

- [ ] Organizer can enter shuttle cost and choose the split mode; the page
      shows the resulting per-head before confirming.
- [ ] Confirming stores `settled_per_person_thb` and updates `amount_due_thb`
      for unpaid participants only; paid participants are untouched, pinned.
- [ ] `by_games` with a missing count uses the group average, pinned.
- [ ] Chase reminders use the settled amount when one exists.
- [ ] `npm run verify` and `npm run test:db` pass.

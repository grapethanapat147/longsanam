# Pay later, and the credit that backs it

## Problem

Today a player either pays before the deadline or loses the seat:
`joined_pending_payment` becomes `payment_expired` and the slot is released.
That is correct for strangers and wrong for the people this product is actually
built around — a regular group where somebody forgot their phone, is between
paydays, or simply says "เดี๋ยวโอนให้ทีหลัง". The organizer already extends that
trust informally; the app just has no way to record it, so the organizer ends up
chasing money in the LINE chat by hand, which is the exact chore the product
exists to remove.

We want the organizer to be able to grant one named player a seat now and
payment later, and we want the system — not the organizer — to do the chasing
afterwards.

## The constraint this must not break

The landing page states, and the code enforces, that a session is booked only
when the money is in: **จ่ายครบ ถึงจอง — ไม่ครบยอด ระบบไม่จอง**. A player who has
not paid has not paid, whatever we call them. So:

> **Only a settled seat counts toward the booking threshold. A pay-later seat
> counts for nothing until it is actually paid.**

Concretely: `settle_payment()` flips a session to `ready_to_book` when
`count(participants where status = 'paid_confirmed' and payment = 'paid') >=
sessions.min_players`. A `joined_pay_later` participant is not `paid_confirmed`,
so it is already excluded — the constraint costs no change to that function. A
test must pin that, because the exclusion is incidental today and a future
refactor could quietly break it.

The consequence the organizer must see before granting, not discover afterwards:
that seat stops counting toward `min_players`, so the session needs one more
*paying* player to become bookable. The grant dialog states the resulting count
against `min_players`, and the baht that will not arrive before the session. The
organizer can close the gap by finding another paying player, by paying it
themselves, or by not granting.

We are deliberately not building the alternatives — organizer fronts the money,
or the platform fronts it. The first quietly turns organizers into lenders; the
second turns Longsanam into one, with the capital requirements and the consumer
credit rules that come with it.

## Scope

### 1. Granting

- The organizer grants pay-later **per participant**, from the session's
  participant list. Never automatic, never a session-wide setting.
- Eligible only when the player's credit score is at or above
  `PAY_LATER_MIN_SCORE` (default 70). Below that the action renders disabled
  with the reason and the score shown — not hidden, so the organizer
  understands why.
- Granting requires the session to be in a state where money is still being
  collected. Not available once the session is `completed` or `cancelled`.
- The grant dialog shows: the resulting paid count against `min_players`,
  whether the session can still reach `ready_to_book`, and the baht that will
  not arrive before the session.
- Revocable by the organizer while the session has not started. Revoking
  returns the participant to `joined_pending_payment` with the original
  deadline, or releases the seat if that deadline has passed.

### 2. States

New `participant_status` values (the enum is `participant_status`, holding
`joined_pending_payment`, `paid_confirmed`, `cancelled`, `waitlisted`,
`payment_expired`, `refunded`):

| Status | Meaning |
| --- | --- |
| `joined_pay_later` | Organizer granted. Holds a seat, owes money, is not chased yet. |
| `payment_overdue` | Session ended, still unpaid. In the chase cycle. |

The payment row for a pay-later participant is created immediately with status
`pending` and **`expires_at = null`**. `expire_overdue_payments()` already
filters on `expires_at is not null`, so it will skip these rows without change —
but the spec asserts that as a requirement, and a test pins it. A pay-later seat
must never be swept away as an expired payment.

### 3. Chasing

Runs from the existing sweep (`/api/cron/expire`, already firing every five
minutes) as a new SECURITY DEFINER RPC `chase_unpaid_participants()`.

| When | What happens |
| --- | --- |
| Session `ends_at` + 2h | Participant moves to `payment_overdue`. First reminder. |
| + 1 day, + 2 days | Reminder. No credit change — this is the grace window. |
| + 3 days, then daily | Reminder, and **−5 credit per day**. |
| + 14 days | Reminders stop. Credit stops falling. The debt stays visible to the organizer and on the player's record. |

Reminders stop at 14 days on purpose. Past that point the notification has
stopped being a reminder and started being harassment, and it is not going to
be the thing that recovers the money.

Idempotency: each participant carries `last_chased_at`. A reminder is sent only
when the next scheduled time has passed, so the five-minute sweep cannot send
fourteen reminders in an hour, and a sweep that runs twice sends one message.

Notifications go through the existing notification table (always written) and
LINE push (best-effort — `pushLineMessage` already returns `not_configured`
rather than throwing, so an unconfigured channel must not fail the sweep).

### 4. Credit

New table `player_credit`: `user_id` (pk), `score` (integer, default 100),
`updated_at`. New append-only `credit_events`: `id`, `user_id`, `session_id`,
`delta`, `reason`, `created_at` — every movement is explainable, and the player
can see why their score is what it is.

| Event | Delta |
| --- | --- |
| Paid within the grace window | +5, capped at 100 |
| Each day overdue past grace | −5, floored at 0 |
| Debt settled late | +10, capped at 100 — recovery must be possible |

Score is **only** consulted for pay-later eligibility. It does not block joining
a session, does not block paying up front, and is not shown as a public badge.
A player who always pays on time never encounters this system at all.

Visibility: the player sees their own score and its history. An organizer sees
the score of players in their own sessions, at the moment of granting. Platform
admin sees everything. Nobody else.

### 5. Money owed

No fees, no interest, no escalating charges. The amount owed is exactly the
amount that was owed on the day of the session. Anything else is lending, and
we are not lending.

## Out of scope

- Automatic pay-later based on score alone (rejected: the organizer knows
  things the score does not).
- Blocking a player from joining sessions because of a low score.
- Platform or organizer fronting the unpaid amount.
- Debt transfer, collections, or any real-money enforcement.

## Acceptance criteria

- [ ] Organizer can grant and revoke pay-later per participant, with the
      `min_players` impact stated in the dialog before confirming.
- [ ] The grant action is disabled with a visible reason when the player's
      score is below the threshold or the session no longer accepts it.
- [ ] `joined_pay_later` participants are excluded from the `min_players`
      count in `settle_payment()`, proven by a test.
- [ ] `expire_overdue_payments()` never touches a pay-later payment row.
- [ ] `chase_unpaid_participants()` moves participants to `payment_overdue`,
      sends reminders on the stated schedule, and is idempotent under a
      five-minute sweep.
- [ ] Credit moves exactly as tabulated, floors at 0, caps at 100, and every
      movement writes a `credit_events` row.
- [ ] Credit gates pay-later eligibility and nothing else.
- [ ] Player sees own score and history; organizer sees scores only for players
      in their own sessions; RLS proves both.
- [ ] Every new status transition writes to `audit_logs`.
- [ ] Unit tests cover the credit arithmetic and the chase schedule as pure
      functions, without a database.
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm test` pass.

## Open question for later

Whether a player with an outstanding debt to *this* organizer should be
grantable pay-later again by the same organizer. Current answer: yes, it is the
organizer's call and the score already reflects the history. Revisit if it
turns out organizers want a hard stop.

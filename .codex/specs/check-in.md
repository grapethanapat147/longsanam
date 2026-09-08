# Check-in at the venue

## Problem

LSN-0019 made a debt real and chased it, but nothing in the system knows
whether a player actually turned up. Two consequences:

- A pay-later player who came, played, and now owes ฿193 has exactly the same
  record as one who never showed. The reminder cannot say "you were there".
- A paid player who no-shows costs nobody but themselves; a pay-later player
  who took a seat, never came and never cancelled costs the group a seat *and*
  the money, and today that is indistinguishable from an honest late payer.

ตีแบด has check-in and uses it to hand out bonus points. Longsanam needs it for
something heavier: attendance is the evidence the credit system was missing.

## Design

**The organizer marks attendance.** Not GPS self-check-in. The organizer is
already the person who knows who came, the session page is already open on
their phone, and a tap per name is faster than any geofence — and it raises no
question of spoofing. Self-check-in by players is explicitly out of scope.

**Window.** The control is live from `starts_at − 30 min` to `ends_at + 2 h`,
matching the moment the chase begins. Outside the window it renders disabled
with the reason shown.

**Data.** `session_participants.checked_in_at timestamptz`,
`checked_in_by uuid references profiles(id)`. One RPC `set_check_in(participant,
present boolean)` — organizer only, idempotent, writes `audit_logs`.

**Credit, narrowly.** Only one new event, and only where the behaviour is
unambiguous:

| Situation at `ends_at + 2h` | Credit |
| --- | --- |
| Pay-later seat, not checked in, not cancelled | **−10**, reason `no_show_unpaid` |
| Paid seat, not checked in | 0 — they paid; their absence cost only them |
| Anyone checked in | 0 from this ticket; LSN-0019 rules still apply |

A no-show never applies to a `cancelled` or `booking_failed` session — the
same guard `void_pay_later_on_session_end()` already enforces.

**Chase message.** When `checked_in_at` is set, the reminder says so:
"คุณเช็คอินเมื่อ 19:05 · ยอดค้าง ฿193". Proof, stated plainly.

**Sweep.** `mark_no_shows()` joins the existing five-minute sweep after
`complete_finished_sessions()`. Idempotent via a `no_show_marked_at` column.

## Out of scope

GPS or QR self-check-in. Attendance history views. Any change to paid players'
money.

## Acceptance criteria

- [ ] Organizer can mark and unmark each participant inside the window; the
      control is disabled with a visible reason outside it.
- [ ] `set_check_in` refuses non-organizers and writes `audit_logs`.
- [ ] A pay-later seat with no check-in and no cancel is charged −10 once, with
      a `credit_events` row, and never on a cancelled session.
- [ ] A paid no-show is charged nothing.
- [ ] Chase reminders include the check-in time when one exists.
- [ ] pgTAP covers the window, the no-show charge, and the cancelled-session
      guard. `npm run verify` and `npm run test:db` pass.

# Guests: sign a friend up without an account

## Problem

"พี่ต้น +1" is how every group actually fills its last seats, and today
Longsanam cannot represent it: `session_participants.user_id` is `NOT NULL`.
The organizer's only options are to ask the friend to install and sign up, or
to leave them off the list and collect cash on the side — at which point the
receipt, the headcount and the booking threshold are all wrong.

For a LINE-first product this is not a nice-to-have. It is the difference
between "open the link" and "go make an account first".

## Design

**A guest is a participant with a name and no user.** `user_id` becomes
nullable; `guest_name text` is added; a check constraint requires exactly one
of the two. The `unique (session_id, user_id)` constraint already treats nulls
as distinct, so two guests may share a name — that is correct, guests are
identified by the organizer, not by us.

**Only the organizer adds guests**, and says at that moment how the seat is
paid:

| Organizer's choice | Participant status | Payment row |
| --- | --- | --- |
| "รับเงินสดแล้ว" | `paid_confirmed` | `paid`, provider `cash`, attested by organizer |
| "จ่ายทีหลัง" | `joined_pay_later` | `pending`, `expires_at = null` |

A cash-paid guest **counts toward `min_players`**. This is a deliberate trust
extension: it is the organizer's own session, their own money, and their word
is already what the venue relies on. The attestation is logged with the
organizer's id in `audit_logs`.

**Guests are never chased.** There is no user to notify and no credit to
charge. A guest's unpaid seat appears on the receipt (LSN-0023) as owing, and
the organizer settles it with their friend the way they always have. Stating
this is what keeps the credit system honest — a score must never move because
of someone who could not see it.

**RLS.** Guests never authenticate. Every read of a guest row goes through the
organizer or the session's participant views, which existing policies already
cover. `payForSlotAction` and `join_session` refuse a null `user_id` explicitly.

**Claiming.** Deferred. When the friend does sign up, the organizer will be
able to link the guest row to their account; that is a follow-up ticket, not
this one.

## Out of scope

Guest self-service of any kind. Claiming. Chasing or crediting guests.

## Acceptance criteria

- [ ] Organizer can add a guest by name with either payment choice; the row
      appears in the participant list with a "ผู้เล่นรับเชิญ" chip.
- [ ] A cash-paid guest counts toward `min_players`; a pay-later guest does
      not, pinned.
- [ ] `list_chaseable_participants()` never returns a guest, pinned.
- [ ] `payForSlotAction`, `join_session`, `grant_pay_later` and
      `record_chase` refuse a guest row with a clear reason.
- [ ] Every existing pgTAP test still passes with `user_id` nullable.
- [ ] `npm run verify` and `npm run test:db` pass.

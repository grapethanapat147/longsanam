# Longsanam — Architecture

How the pieces fit, and why they are shaped this way: venue integration today,
the two integrations planned next, the payment abstraction, the booking state
machine, how races are prevented, and the realtime, image and authorization
layers.

---

## 1. Partner Portal integration (shipped)

The MVP assumes venues have no API. Instead they get an account in the app.

**Availability** lives in our database. `court_availability` holds three kinds of
row behind one discriminator:

| `kind` | Meaning | Shape |
| --- | --- | --- |
| `opening_hours` | Recurring weekly hours | `weekday`, `opens_at`, `closes_at` |
| `blackout` | Planned closure | `starts_at`, `ends_at` |
| `manual_block` | Ad-hoc block by staff | `starts_at`, `ends_at` |

One table means the availability check is a single query rather than three, and
a `CHECK` constraint enforces that each kind carries the right columns.

**Pricing** is `courts.base_price_thb` plus ordered `court_price_rules`
(weekday mask, time window, validity dates, priority). `court_price_for()`
resolves the rate for a specific slot and multiplies by duration, which is why
the organizer dashboard shows the true cost of *their* window rather than a
headline hourly rate.

**Confirmation** has two modes, per venue:

- `auto_confirm_bookings = true` → `request_booking()` writes the booking as
  `confirmed` in the same transaction that converts the hold.
- `auto_confirm_bookings = false` → the booking lands as `requested` with an
  expiry, appears in the partner inbox, and a human calls
  `venue_decide_booking()`.

Both paths converge on the same booking row and the same audit events, so the
rest of the system does not care which mode a venue uses.

### Why the seam exists anyway

`src/lib/venues/adapters.ts` declares a `VenueAdapter` interface —
`checkAvailability`, `hold`, `confirm`, `release`. The Partner Portal is one
implementation. The orchestrator is written against the *shape* of that
interface even though it currently calls the RPCs directly, so introducing the
adapter dispatch later is a substitution rather than a rewrite.

---

## 2. Calendar Sync (planned)

Many venues already run on Google Calendar. The plan:

- **Inbound**: a scheduled job reads each linked calendar and mirrors busy
  blocks into `court_availability` as `blackout` rows tagged with an external
  id. Availability checks then work unchanged, because they already consult that
  table.
- **Outbound**: on `booking.confirmed`, write an event back to the venue's
  calendar and store the event id on the booking.
- **Holds stay local.** A calendar has no concept of a 15-minute reservation, so
  `court_holds` remains ours. This is the reason holds are a separate table from
  bookings rather than a booking status.
- **Conflict policy**: the calendar is authoritative for the venue's own
  bookings; Longsanam is authoritative for Longsanam bookings. A collision
  discovered during sync raises a partner-inbox alert instead of silently
  cancelling a paid session.

The sync interval is the honest weakness: a venue booking made in the last few
minutes may not be mirrored yet. `try_hold_court` re-checks availability
immediately before holding, which narrows but does not close the window — which
is precisely why the hold is short-lived and the booking is confirmed rather
than assumed.

---

## 3. Court API adapter (planned)

For venues with a real booking system, `CourtApiAdapter` implements the same
interface over HTTP:

- `checkAvailability` becomes a network call; results are cached briefly and
  never trusted past the hold.
- `hold` maps to the vendor's reservation-hold endpoint and returns their
  reference, stored on `court_holds`.
- `confirm` maps to their confirm endpoint; the remote reference goes on
  `bookings`.
- `release` is best-effort and idempotent.

Two rules keep this safe:

1. **The remote system is authoritative for its own inventory.** We never assume
   a hold succeeded because our database says so.
2. **Our exclusion constraints still apply.** Even with a remote authority, a
   court cannot be double-sold *on our side*, so a bug in an adapter cannot
   produce two Longsanam sessions on one court.

Failures map onto the existing `AttemptOutcome` vocabulary
(`unavailable`, `hold_failed`, `rejected`, `error`), so the fallback walker
handles a misbehaving vendor exactly as it handles a busy court.

---

## 4. Payment provider abstraction

`src/lib/payments/types.ts` defines `PaymentProvider`:

```ts
createCharge(intent)   capture(ref, key)   cancel(ref, key)
refund(intent)         getStatus(ref)
```

Two invariants every implementation must hold:

1. **Every mutating call takes an idempotency key.** Two calls with the same key
   produce one charge and the same result.
2. **The provider never decides business outcomes.** It reports what the money
   did. Whether that confirms a slot, triggers a booking, or releases a seat is
   decided by the database.

`MockPaymentProvider` is the local implementation. It is deliberately not a
happy-path stub: `MOCK_PAYMENT_FAILURE_RATE` produces declines so the failure
and retry UI is reachable, and outcomes are derived deterministically from the
idempotency key so a retry behaves consistently. It recognises its own
`mock*` references, which lets it refund charges written by the seed or by a
previous dev-server process.

Real gateways are reserved in `getPaymentProvider()` and **throw** rather than
returning a half-working provider — telling a player a payment succeeded when
nothing was charged is the worst failure this system could have.

### The payment sequence

```
start_payment()          durable pending row, before any money moves
   ↓
provider.createCharge()  the only network call
   ↓
settle_payment()         paid | failed, participant confirmed, session re-evaluated
```

A crash between steps leaves a `pending` payment that `expire_overdue_payments()`
cleans up. It can never leave a charged player with no record.

Refunds mirror this: `cancel_participation()` records the refund as `pending`,
the provider is called, then `settle_refund()` records the true outcome. The UI
reports `completed` / `pending` / `failed` distinctly and never claims money
moved on the strength of a calculated amount.

---

## 5. Booking state machine

Three aggregates, defined in `src/lib/domain/state-machines.ts` and enforced by
Postgres enums.

### Session

```
draft ──► open ──► ready_to_book ──► holding_court ──► booked ──► completed
             ▲          │                  │
             └──────────┘                  ├──► booking_failed ──► holding_court
          (paid player                     │         (retry after the organizer
           cancels, drops                  │          adds another venue)
           below minimum)                  ▼
                                       cancelled   (reachable from any live state)
```

`ready_to_book → open` matters: if a paid player cancels and the session falls
back below its minimum, it must stop being bookable.

### Participant

```
joined_pending_payment ──► paid_confirmed ──► refunded
         │                       │
         ├──► payment_expired    └──► cancelled
         └──► cancelled

waitlisted ──► joined_pending_payment   (on promotion)
```

`payment_expired` and `cancelled` both allow re-joining; `refunded` is terminal.

### Booking

```
requested ──► held ──► confirmed ──► cancelled
    │           │
    └───────────┴──► rejected | expired | failed   (all terminal)
```

An auto-confirming venue goes `requested → confirmed` directly.

### The automatic workflow

`runBookingOrchestration()` (`src/lib/orchestration/book-session.ts`) fires when
a payment settles and pushes the session over both thresholds:

1. `evaluateBookingEligibility` — paid headcount **and** collected total, plus at
   least one approved venue and a start time still in the future.
2. `mark_session_holding` — session becomes `holding_court`.
3. `selectFallbackCourt` — the next approved court, in priority order, skipping
   courts whose attempts already failed.
4. `try_hold_court` — re-checks availability under a lock, creates an expiring
   hold.
5. `request_booking` — converts the hold into a booking; confirmed immediately
   for auto-confirm venues, otherwise queued to the partner inbox.
6. Notify the organizer and every paid participant.
7. On failure, record the attempt and loop to step 3. When the approved list is
   exhausted, `fail_session_booking` marks the session `booking_failed` and tells
   the organizer what to do next.

**An unapproved venue is never booked.** `session_venue_preferences.approved` is
the gate, `approvedPreferences()` filters before anything else happens, and this
is covered by unit tests as well as an end-to-end check. If every approved court
is unavailable, the session fails — even when an unapproved court is free.

The ordering logic is pure and unit-tested; the race-sensitive parts live in
Postgres. That split is the central design decision of the whole system.

---

## 6. Race conditions and double booking

Four layers, deliberately overlapping.

### Layer 1 — exclusion constraints

```sql
alter table bookings add constraint bookings_no_overlap
  exclude using gist (court_id with =, tstzrange(starts_at, ends_at, '[)') with &&)
  where (status in ('requested','held','confirmed'));
```

`court_holds` carries the equivalent constraint for `status = 'active'`. This is
the guarantee that does not depend on application code being correct: the
database physically refuses a second overlapping booking, even from a superuser
running raw SQL.

### Layer 2 — advisory locks

Every court-touching RPC takes `pg_advisory_xact_lock(hashtextextended(court_id))`
first, so concurrent attempts on the same court serialize instead of racing to
the constraint. Verified: with one transaction holding a court, a second
connection blocked for the full duration and then correctly lost.

### Layer 3 — transactional RPCs

The hold-to-booking conversion is one transaction. It updates the hold to
`converted` *before* inserting the booking, which frees the hold's exclusion slot
so the booking can take it. If the insert still conflicts, the hold is restored
to `active` and the caller sees `slot_taken`.

Session capacity works the same way: `join_session()` takes a session-scoped
advisory lock, counts occupying participants, and either creates a participant or
a numbered waitlist entry — inside one transaction, so a session cannot be
oversold by simultaneous joins.

### Layer 4 — idempotency

Holds, bookings, payments and refunds all carry a unique `idempotency_key`.
Keys are derived from stable inputs (`hold:{session}:{attempt}:{court}`), so a
retried orchestration re-uses the existing row instead of creating a duplicate.
Every RPC checks for an existing row by key first and returns it with
`replayed: true`.

### What is *not* protected

Cross-system races with an external calendar or court API, discussed in §2–3.
The hold window is the mitigation, not a cure.

---

## 7. Realtime

Realtime is a **change signal, not a data source**. A Postgres change triggers
`router.refresh()`; the server re-renders the page under RLS and the event
payload is discarded. That keeps one place — the policies — deciding who may
see a row, and means a subscriber holding an old channel cannot outlive a
policy change.

Two behaviours the implementation has to respect, neither of which surfaces as
an error:

1. **The socket does not inherit the page's session.** Without an explicit
   `realtime.setAuth(token)` the subscription is evaluated as `anon`, whatever
   the cookies say.
2. **A binding on a table the subscriber cannot read kills the whole channel.**
   It is not skipped, and the channel still reports `SUBSCRIBED` — every other
   binding simply goes silent. Bindings are therefore narrowed to what the
   viewer may actually read, which is why anonymous visitors subscribe only to
   `sessions` and `bookings`.

Channel topics are unique per connection attempt, because `supabase.channel()`
returns an existing channel when one is still registered and adding a binding
to an already-subscribed channel throws.

## 8. Images

Two public-read buckets, `avatars` and `venue-images`. Public here means the
rendered URL needs no signing, which is what a link shared into a LINE group
requires. Writes are constrained by path: the first folder segment must be the
owner's id, checked by `public.storage_owner_id()`, which returns NULL for a
segment that is not a UUID so a malformed path is denied rather than raising.

`next/image` needs the storage host in `remotePatterns`. It is derived from
`NEXT_PUBLIC_SUPABASE_URL`, loaded through `@next/env` because `next.config` is
evaluated before Next reads the env files. Next also refuses upstream images
that resolve to a private IP — a sensible SSRF default — so that exception is
enabled only when the configured Supabase host is this machine.

## 9. Authorization

RLS is the boundary; route guards are UX.

- Helper functions (`is_platform_admin`, `is_venue_member`,
  `is_session_organizer`, …) are `SECURITY DEFINER` so a policy on one table can
  consult another without re-entering that table's policy. Three helpers exist
  purely to break the `sessions ↔ bookings` policy cycle.
- Contact details live in `profile_contacts`, separate from `profiles`, so
  co-participants can see a display name without seeing a phone number.
- Function privileges start closed: every non-trigger function in `public` is
  revoked from `anon`/`authenticated`, then a small allow-list is granted back.
  Money and court RPCs are service-role only, callable exclusively from server
  actions that have already authorized the caller.
- `join_session`, `create_venue` and `venue_decide_booking` are callable by
  users because each performs its own authorization internally and resolves the
  actor from `auth.uid()` first — so a caller cannot act as somebody else by
  passing a different id.
- `audit_logs` is append-only: a trigger raises on `UPDATE` and `DELETE`, and no
  role is granted write access.

The service role bypasses RLS but is still subject to table privileges, so it is
granted explicitly — a detail that silently returns empty result sets if missed.

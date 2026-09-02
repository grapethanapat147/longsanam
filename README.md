# ลงสนาม (Longsanam)

A LINE-first group booking platform for amateur sports in Thailand. An organizer
creates a session, players join and pay through a shared link, and once enough
money is in the pot the platform secures a court automatically — walking a
ranked list of organizer-approved venues, and refunding everyone if it cannot.

This is an MVP built for one geographic area and 5–10 partner venues. Venues are
integrated through a **Partner Portal** rather than direct APIs; the architecture
leaves seams for Calendar Sync and Court API adapters later.

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router) + React 19 + TypeScript strict |
| Styling | Tailwind CSS v4 (CSS-first theme in `src/app/globals.css`) |
| Data | Supabase — Postgres, Auth, Row Level Security, Realtime, Storage |
| Transactions | Postgres RPCs called from server actions |
| Payments | Provider abstraction; `MockPaymentProvider` locally |
| Tests | Vitest (pure domain logic) |

---

## Prerequisites

- Node.js 20+ (developed on 24)
- Docker Desktop running
- [Supabase CLI](https://supabase.com/docs/guides/cli) 2.x

---

## Setup

```bash
npm install
```

Start the local Supabase stack. This applies every migration and loads the demo
seed:

```bash
npm run db:start
```

The stack uses the **544xx** port range so it can coexist with other local
Supabase projects:

| Service | URL |
| --- | --- |
| API | http://127.0.0.1:54421 |
| Postgres | postgresql://postgres:postgres@127.0.0.1:54422/postgres |
| Studio | http://127.0.0.1:54423 |
| Mailpit | http://127.0.0.1:54424 |

Copy the env template and fill in the keys that `npm run db:start` prints:

```bash
cp .env.example .env.local
```

You need `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. Run
`supabase status` at any time to print them again.

Then:

```bash
npm run dev
```

The app runs at http://localhost:3210.

---

## Demo accounts

Every account uses the password `password123`.

| Email | Role in the demo |
| --- | --- |
| `organizer@longsanam.test` | Organizes all seeded sessions |
| `player1@longsanam.test` … `player7@longsanam.test` | Players, some paid, some waitlisted |
| `venue@longsanam.test` | Owns the badminton centre and the pickleball club |
| `venue2@longsanam.test` | Owns the football arena (manual booking approval) |
| `admin@longsanam.test` | Platform admin |

### What the seed contains

- 3 Bangkok venues, 7 courts, badminton / football / pickleball / tennis
- Opening hours for every court, one blackout window, peak and weekend pricing
- Sessions in **Draft**, **Open**, **ReadyToBook**, **Booked** and **Cancelled**
- Paid participants, a pending payment, a 3-person waitlist
- A confirmed booking, a booking request waiting in the partner inbox
- Completed refunds on the cancelled session, plus an audit trail

### A five-minute tour

1. Sign in as `organizer@longsanam.test`, open **จัดการก๊วน → พิคเคิลบอลมือใหม่**
   (ReadyToBook) and press **สั่งจองสนามตอนนี้**. The session holds a court,
   books it, and flips to **ได้สนามแล้ว**.
2. Sign in as `player7@longsanam.test`, open `/s/OPEN001`, join and pay. The
   mock payment confirms the slot immediately.
3. Sign in as `player4@longsanam.test`, open `/s/READY01` and give up the slot.
   The refund is calculated from the policy and the first waitlisted player is
   promoted with a payment window.
4. Sign in as `venue2@longsanam.test` and approve the request in
   **คำขอจอง** — the organizer's session becomes Booked.
5. Sign in as `admin@longsanam.test` for platform counters, the audit log, and
   manual refund support.

---

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Dev server on :3210 |
| `npm run build` | Production build |
| `npm test` | Vitest unit tests |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run verify` | lint + typecheck + test |
| `npm run db:start` / `db:stop` | Local Supabase stack |
| `npm run db:reset` | Re-run migrations and reseed (wipes local data) |
| `npm run db:types` | Regenerate `src/types/database.ts` |

---

## Tests

```bash
npm test
```

77 unit tests covering the four areas where a mistake costs real money:

- `tests/booking-eligibility.test.ts` — headcount **and** collected-total gating
- `tests/fallback.test.ts` — priority order, and never booking an unapproved court
- `tests/refund.test.ts` — policy tiers, boundaries, clamping
- `tests/waitlist.test.ts` — promotion order, payment windows, expiry cascade
- `tests/state-machines.test.ts` — legal transitions for all three aggregates

The domain layer in `src/lib/domain/` imports nothing from Supabase, which is
what keeps it testable without a database.

---

## Live updates

Session pages, the organizer dashboard and the venue booking inbox update
themselves through Supabase Realtime. An **อัปเดตสด** badge appears only while
the channel is genuinely connected.

Realtime is used as a change signal, not a data source: an event triggers a
server re-render, which re-fetches under RLS. Nothing from the event payload is
displayed, so a subscriber can never see a row the page could not fetch.

Anonymous visitors receive session and booking events only — `anon` holds no
SELECT grant on the participation tables, and a binding that fails RLS would
take the whole channel down rather than being skipped.

## Images

`avatars` and `venue-images` are public-read Supabase Storage buckets, created
by migration with MIME and size limits (2 MB and 5 MB). Writes are scoped by
storage policy: a user may only write to the folder named after their own id,
and a venue folder only by that venue's members. Replacing an image deletes the
one it replaced.

Players upload an avatar from **โปรไฟล์**; venue admins upload a cover from the
venue overview.

## Scheduled jobs

Court holds, unpaid slots, unclaimed waitlist promotions, finished sessions and
sessions that never secured a court are all handled by one sweep. Point a
scheduler at:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3210/api/cron/expire
```

The sweep also moves finished sessions to `completed`, and cancels any session
that reached its start time without a court — refunding every paid player in
full, because that failure is the platform's rather than theirs. Every routine
is idempotent, so a short interval is safe.

Platform admins can run the same sweep on demand from `/admin`.

---

## Payments

`PAYMENT_PROVIDER=mock` is the default and moves no money. Every mock surface is
labelled **โหมดทดลอง** — the banner is not dismissible, because a demo must never
be mistakable for a live transaction.

Set `MOCK_PAYMENT_FAILURE_RATE=0.3` to make roughly 30% of charges decline, which
is how the failure and retry states are exercised. Failures are deterministic per
idempotency key, so a retry of the same charge behaves consistently.

Real gateways (Omise, 2C2P, PromptPay) are reserved in
`src/lib/payments/index.ts` and deliberately throw rather than half-work. See
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

---

## LINE

The app is designed to be opened from a LINE chat but runs entirely on email auth
during development. LINE Login, LIFF and Messaging are declared in
`src/lib/line/` and report "not configured" when their environment variables are
absent. The sign-in button for LINE renders **disabled with the reason shown**
rather than as a control that silently does nothing.

Sharing works today with no LINE channel at all — the share endpoint takes a
plain URL.

---

## Project layout

```
src/
  app/                     routes (public, /app, /organizer, /venue, /admin)
  components/              UI primitives, status chips, feature panels
  i18n/                    all user-facing Thai copy
  lib/
    actions/               server actions — the only write path from the UI
    domain/                pure logic + state machines (unit tested)
    orchestration/         automatic booking workflow
    payments/              provider abstraction + mock
    venues/                partner portal / calendar / court API adapter seam
    line/                  LINE integration points
    supabase/              browser, server, admin and middleware clients
supabase/
  migrations/              schema, RPCs, RLS
  seed.sql                 demo data
tests/                     Vitest unit tests
docs/ARCHITECTURE.md       design notes
.codex/                    ticket board (LSN-xxxx)
```

---

## Conventions

- User-facing copy lives in `src/i18n/th.ts`. Adding `en.ts` with the same shape
  is the whole localization story.
- Money is whole Thai baht as `integer`. Never floats.
- Times are `timestamptz`; the UI renders in `Asia/Bangkok`.
- Anything that must not race is a Postgres RPC, not a sequence of client calls.
- RLS is the authorization boundary. Route guards are UX.
- Every meaningful status transition writes to `audit_logs`, which is
  append-only at the database level.

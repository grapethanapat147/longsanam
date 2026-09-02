# ลงสนาม (Longsanam) — Project Instructions

LINE-first amateur sports group booking platform for Thailand.

## Stack
- Next.js 16 (App Router) + React 19 + TypeScript (strict)
- Tailwind CSS v4 (CSS-first config in `src/app/globals.css`)
- Supabase: Postgres, Auth, RLS, Realtime, Storage — local CLI for development
- Vitest for unit tests

## Non-negotiables
1. **Never present a non-functional control.** Every button either performs its
   action or is disabled with a visible reason. No fake success toasts.
2. **Never claim a payment or booking happened unless it did.** Mock payments are
   labelled `โหมดทดลอง` in the UI wherever they appear.
3. **Server-side truth.** Availability, headcount, payment totals and refund amounts
   are always recomputed on the server. Client validation is a convenience only.
4. **Idempotency.** Every payment and booking mutation takes an idempotency key.
5. **Audit everything.** Each meaningful status transition writes an `audit_logs` row.
6. **RLS is the authorization layer.** Route guards are UX, not security.

## Conventions
- User-facing copy is Thai, sourced from `src/i18n/th.ts`. Never hardcode Thai
  strings in components — add a key. English lives in `src/i18n/en.ts`.
- Pure domain logic lives in `src/lib/domain/` and must stay free of Supabase
  imports so it is unit-testable.
- Database writes that must be atomic go through a Postgres RPC in
  `supabase/migrations/`, not through multiple client calls.
- Money is stored in whole Thai baht as `integer`. Never floats.
- Times are `timestamptz`; the app renders in `Asia/Bangkok`.

## Commands
- `npm run dev` — Next dev server on :3000
- `npm test` — Vitest unit tests
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run db:start` / `db:reset` / `db:stop` — local Supabase stack
- `npm run verify` — lint + typecheck + test

## Workflow
Ticket-first. See `.codex/context/kanban-flow.md`. Tickets are `LSN-XXXX`.

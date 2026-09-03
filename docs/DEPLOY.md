# Deploying Longsanam

Target: **Vercel** for the app, **Supabase Cloud** for the database.

## Live deployment

| | |
| --- | --- |
| Production URL | https://longsanam.vercel.app |
| Vercel project | `grapethanapat147-gmailcoms-projects/longsanam` |
| Supabase ref | `xqhptxkmllahptzhjaup` (ap-southeast-1) |
| Payment provider | `mock` — no money moves, every surface is labelled |

Deployment-specific URLs (`longsanam-<hash>-...vercel.app`) sit behind Vercel
Deployment Protection and answer 302; the production alias above is the public
one.

Two things only you can do — creating the Supabase project and logging into
Vercel. Everything else is scripted.

---

## Before you start

Two facts about what gets deployed, so there are no surprises:

- **The demo seed never reaches production.** `supabase/seed.sql` runs only on a
  local `db reset`. `supabase db push` applies migrations and nothing else, so
  the eleven demo accounts with the password `password123` stay on your machine.
- **Sports are reference data, not demo data.** They ship in
  `20260901000700_reference_data.sql` because the create-session wizard cannot
  work without them. A freshly deployed database has the six sports and nothing
  else — no venues, no sessions, no users.

And one thing to decide before sharing the URL:

- **Payments are still the mock provider.** No money moves, and every payment
  surface carries a non-dismissible **โหมดทดลอง** banner. That is honest, but it
  is also the only thing standing between a visitor and the belief that they
  have paid for a real game. Keep the deployment private, or accept that it is
  a demo, until a real gateway is wired in.

---

## 1. Create the Supabase project — *you*

At [supabase.com/dashboard](https://supabase.com/dashboard):

1. **New project**, name it `longsanam`.
2. Region **Southeast Asia (Singapore) `ap-southeast-1`** — closest to Thai users.
3. Set a database password and **save it in your password manager**. You will
   need it once, in the next step.
4. Copy the **project ref** from the URL
   (`https://supabase.com/dashboard/project/<ref>`).

Send me the ref. Nothing else — I never need the database password beyond the
one-time link, which you can run yourself if you prefer.

---

## 2. Link and push the schema

```bash
npm run db:link -- --project-ref <ref>
npm run db:push
```

`db:link` asks for the database password once. `db:push` then applies all eight
migrations — schema, RLS helpers, RPCs, policies, lifecycle, realtime, storage
and reference data.

Verify:

```bash
npm run db:diff
```

A clean result means the cloud schema matches the migrations exactly.

---

## 3. Configure Supabase auth

In the dashboard, **Authentication → URL Configuration**:

| Field | Value |
| --- | --- |
| Site URL | `https://<your-app>.vercel.app` |
| Redirect URLs | `https://<your-app>.vercel.app/**` |

Without this, sign-in redirects fail in production.

Under **Authentication → Providers → Email**, decide whether to require email
confirmation. It is off locally so the demo accounts work immediately; for a
real deployment, turn it **on**.

---

## 4. Log into Vercel — *you*

```bash
npx vercel login
```

This opens a browser. Once it says logged in, tell me and I will take it from
there.

---

## 5. Link, configure and deploy

```bash
npx vercel link
```

Then the environment variables. Take the values from **Supabase → Project
Settings → API**:

| Variable | Value | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the `anon` key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | **server only — never prefix `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_SITE_URL` | `https://<your-app>.vercel.app` | |
| `PAYMENT_PROVIDER` | `mock` | |
| `CRON_SECRET` | a fresh random value | generate, never reuse the dev one |

Generate the cron secret without it ever touching your clipboard or this
terminal's history:

```bash
openssl rand -hex 32 | npx vercel env add CRON_SECRET production
```

Keep a copy in a password manager. If you mark the variable **Sensitive** in
Vercel it becomes write-only, and GitHub secrets are write-only too — lose your
copy and the only way forward is rotating it everywhere at once.

Then deploy:

```bash
npm run deploy
```

---

## 6. Schedule the lifecycle sweep

The sweep releases expired holds and unpaid slots, completes finished sessions,
and refunds sessions that never secured a court. **It needs to run every few
minutes**, not daily: an unpaid slot stays occupied until it runs.

`vercel.json` ships with a daily schedule, because sub-daily cron requires a
Vercel **Pro** plan. Pick one of these for the five-minute cadence:

- **External scheduler — recommended, works on any plan.** Point cron-job.org
  or equivalent at `https://<your-app>.vercel.app/api/cron/expire` with method
  `POST` and the header `Authorization: Bearer <CRON_SECRET>`. The route also
  accepts `?secret=`, but do not use it: a query string lands in every access
  log between you and the function.
- **Vercel Pro.** Change the schedule in `vercel.json` to `*/5 * * * *` and
  redeploy. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

`.github/workflows/sweep.yml` used to carry a `*/5` schedule and no longer
does. GitHub queues scheduled workflows best-effort, and measured on this repo
they landed roughly four hours apart — fine as a backstop, useless as the
primary. It is kept as a manual button, still needing the `SWEEP_URL` and
`CRON_SECRET` repository secrets.

Check it manually at any time:

```bash
curl -X POST -H "Authorization: Bearer <your-cron-secret>" \
  https://<your-app>.vercel.app/api/cron/expire
```

A `401` means the secret does not match; a `503` means `CRON_SECRET` is unset.

---

## 7. First-run checklist

A fresh production database is empty apart from sports, so:

1. Sign up for an account through the app.
2. Promote it to platform admin — the role cannot be self-assigned, which is
   deliberate. Run once in the Supabase SQL editor:

   ```sql
   update public.profiles
   set role = 'platform_admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

3. Register a venue from **สำหรับเจ้าของสนาม → ลงทะเบียนสนาม**, add courts and
   opening hours.
4. Create a session and confirm the booking flow end to end.

---

## Rolling back

Vercel keeps every deployment; promote a previous one from the dashboard.

Database migrations are forward-only — there are no down migrations. To undo a
schema change, write a new migration that reverses it. Take a backup from
**Database → Backups** before any migration you are unsure about.

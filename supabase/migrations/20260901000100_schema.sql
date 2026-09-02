-- ===========================================================================
-- Longsanam — core schema
-- Money is stored as whole Thai baht (integer). Times are timestamptz.
-- ===========================================================================

create extension if not exists "btree_gist";
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerations (the state machines from the product spec)
-- ---------------------------------------------------------------------------

create type public.app_role as enum ('player', 'venue_admin', 'platform_admin');

create type public.venue_member_role as enum ('owner', 'manager', 'staff');

create type public.session_status as enum (
  'draft', 'open', 'ready_to_book', 'holding_court',
  'booked', 'booking_failed', 'cancelled', 'completed'
);

create type public.participant_status as enum (
  'joined_pending_payment', 'paid_confirmed', 'cancelled',
  'waitlisted', 'payment_expired', 'refunded'
);

create type public.booking_status as enum (
  'requested', 'held', 'confirmed', 'rejected', 'expired', 'cancelled', 'failed'
);

create type public.payment_status as enum (
  'pending', 'paid', 'failed', 'refunded', 'expired'
);

create type public.refund_status as enum ('pending', 'processing', 'completed', 'failed');

create type public.hold_status as enum ('active', 'converted', 'released', 'expired');

create type public.waitlist_status as enum (
  'waiting', 'promoted', 'converted', 'expired', 'cancelled'
);

create type public.availability_kind as enum ('opening_hours', 'blackout', 'manual_block');

create type public.notification_channel as enum ('in_app', 'line', 'email');

-- ---------------------------------------------------------------------------
-- Shared helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------

-- Public identity. Visible to people you share a session with, so it carries
-- nothing sensitive.
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text        not null default 'ผู้ใช้ใหม่',
  avatar_url   text,
  role         public.app_role not null default 'player',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

comment on column public.profiles.role is
  'Baseline capability. "Organizer" is contextual: any player organizes the sessions they create.';

-- Contact details. Readable only by the owner and platform admins, which is why
-- they are split out of `profiles` rather than living alongside display_name.
create table public.profile_contacts (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  phone        text,
  line_user_id text unique,
  email        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger profile_contacts_updated_at
  before update on public.profile_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sports catalogue
-- ---------------------------------------------------------------------------

create table public.sports (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name_th         text not null,
  name_en         text not null,
  emoji           text not null default '🏅',
  default_players integer not null default 10 check (default_players > 0),
  is_active       boolean not null default true,
  sort_order      integer not null default 100
);

-- ---------------------------------------------------------------------------
-- Venues and courts
-- ---------------------------------------------------------------------------

create table public.venues (
  id                     uuid primary key default gen_random_uuid(),
  slug                   text not null unique,
  name                   text not null,
  description            text,
  address                text not null,
  district               text not null,
  province               text not null default 'กรุงเทพมหานคร',
  latitude               numeric(9, 6),
  longitude              numeric(9, 6),
  phone                  text,
  cover_image_url        text,
  is_active              boolean not null default true,
  auto_confirm_bookings  boolean not null default false,
  booking_lead_minutes   integer not null default 60 check (booking_lead_minutes >= 0),
  created_by             uuid references public.profiles (id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create trigger venues_updated_at
  before update on public.venues
  for each row execute function public.set_updated_at();

comment on column public.venues.auto_confirm_bookings is
  'When true a booking request is confirmed immediately. When false it waits in the partner inbox.';

create table public.venue_members (
  venue_id   uuid not null references public.venues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       public.venue_member_role not null default 'manager',
  created_at timestamptz not null default now(),
  primary key (venue_id, user_id)
);

create index venue_members_user_idx on public.venue_members (user_id);

create table public.courts (
  id                  uuid primary key default gen_random_uuid(),
  venue_id            uuid not null references public.venues (id) on delete cascade,
  name                text not null,
  capacity            integer not null default 4 check (capacity > 0),
  base_price_thb      integer not null check (base_price_thb >= 0),
  min_booking_minutes integer not null default 60 check (min_booking_minutes > 0),
  slot_step_minutes   integer not null default 30 check (slot_step_minutes > 0),
  is_active           boolean not null default true,
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (venue_id, name)
);

create trigger courts_updated_at
  before update on public.courts
  for each row execute function public.set_updated_at();

create table public.court_sports (
  court_id uuid not null references public.courts (id) on delete cascade,
  sport_id uuid not null references public.sports (id) on delete cascade,
  primary key (court_id, sport_id)
);

create index court_sports_sport_idx on public.court_sports (sport_id);

-- Opening hours, blackout ranges and manual blocks share one table so that the
-- availability check is a single query rather than three.
create table public.court_availability (
  id         uuid primary key default gen_random_uuid(),
  court_id   uuid not null references public.courts (id) on delete cascade,
  kind       public.availability_kind not null,
  weekday    integer check (weekday between 0 and 6),
  opens_at   time,
  closes_at  time,
  starts_at  timestamptz,
  ends_at    timestamptz,
  reason     text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint court_availability_shape check (
    (kind = 'opening_hours'
      and weekday is not null and opens_at is not null and closes_at is not null
      and opens_at < closes_at
      and starts_at is null and ends_at is null)
    or
    (kind in ('blackout', 'manual_block')
      and starts_at is not null and ends_at is not null and starts_at < ends_at
      and weekday is null and opens_at is null and closes_at is null)
  )
);

create index court_availability_court_kind_idx
  on public.court_availability (court_id, kind);

create index court_availability_range_idx
  on public.court_availability (court_id, starts_at, ends_at)
  where kind in ('blackout', 'manual_block');

create table public.court_price_rules (
  id          uuid primary key default gen_random_uuid(),
  court_id    uuid not null references public.courts (id) on delete cascade,
  name        text not null,
  weekdays    integer[] not null default '{0,1,2,3,4,5,6}',
  starts_time time not null default '00:00',
  ends_time   time not null default '23:59',
  price_thb   integer not null check (price_thb >= 0),
  priority    integer not null default 100,
  valid_from  date,
  valid_to    date,
  created_at  timestamptz not null default now(),
  constraint court_price_rules_time_order check (starts_time < ends_time)
);

create index court_price_rules_court_idx on public.court_price_rules (court_id, priority);

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

create table public.sessions (
  id                    uuid primary key default gen_random_uuid(),
  public_code           text not null unique,
  organizer_id          uuid not null references public.profiles (id) on delete cascade,
  sport_id              uuid not null references public.sports (id) on delete restrict,
  title                 text not null,
  description           text,
  area_text             text not null,
  district              text,
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  budget_per_person_thb integer not null check (budget_per_person_thb >= 0),
  target_players        integer not null check (target_players > 0),
  min_players           integer not null check (min_players > 0),
  payment_deadline      timestamptz not null,
  status                public.session_status not null default 'draft',
  cancellation_policy   jsonb not null default jsonb_build_object(
                          'fullRefundHoursBefore', 48,
                          'partialRefundHoursBefore', 24,
                          'partialRefundPercent', 50,
                          'noRefundWithinHours', 24,
                          'organizerCancelAlwaysFullRefund', true
                        ),
  booking_id            uuid,
  failure_reason        text,
  cancelled_at          timestamptz,
  cancelled_reason      text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint sessions_time_order check (ends_at > starts_at),
  constraint sessions_player_counts check (min_players <= target_players)
);

create trigger sessions_updated_at
  before update on public.sessions
  for each row execute function public.set_updated_at();

create index sessions_status_starts_idx on public.sessions (status, starts_at);
create index sessions_organizer_idx on public.sessions (organizer_id);
create index sessions_sport_idx on public.sessions (sport_id);

create table public.session_venue_preferences (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions (id) on delete cascade,
  venue_id   uuid not null references public.venues (id) on delete cascade,
  court_id   uuid not null references public.courts (id) on delete cascade,
  priority   integer not null check (priority > 0),
  approved   boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, court_id),
  unique (session_id, priority) deferrable initially deferred
);

comment on column public.session_venue_preferences.approved is
  'Only approved preferences may be booked. An unapproved row is never a fallback candidate.';

create index session_venue_preferences_session_idx
  on public.session_venue_preferences (session_id, priority);

create table public.session_participants (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references public.sessions (id) on delete cascade,
  user_id        uuid not null references public.profiles (id) on delete cascade,
  status         public.participant_status not null default 'joined_pending_payment',
  amount_due_thb integer not null check (amount_due_thb >= 0),
  payment_due_at timestamptz not null,
  joined_at      timestamptz not null default now(),
  confirmed_at   timestamptz,
  cancelled_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (session_id, user_id)
);

create trigger session_participants_updated_at
  before update on public.session_participants
  for each row execute function public.set_updated_at();

create index session_participants_session_status_idx
  on public.session_participants (session_id, status);
create index session_participants_user_idx on public.session_participants (user_id);

create table public.waitlist_entries (
  id                   uuid primary key default gen_random_uuid(),
  session_id           uuid not null references public.sessions (id) on delete cascade,
  user_id              uuid not null references public.profiles (id) on delete cascade,
  position             integer not null check (position > 0),
  status               public.waitlist_status not null default 'waiting',
  promoted_at          timestamptz,
  promotion_expires_at timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (session_id, user_id)
);

create trigger waitlist_entries_updated_at
  before update on public.waitlist_entries
  for each row execute function public.set_updated_at();

create index waitlist_entries_session_idx
  on public.waitlist_entries (session_id, status, position);

-- ---------------------------------------------------------------------------
-- Holds and bookings
-- ---------------------------------------------------------------------------

create table public.court_holds (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  court_id        uuid not null references public.courts (id) on delete cascade,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          public.hold_status not null default 'active',
  expires_at      timestamptz not null,
  idempotency_key text not null unique,
  released_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint court_holds_time_order check (ends_at > starts_at)
);

create trigger court_holds_updated_at
  before update on public.court_holds
  for each row execute function public.set_updated_at();

-- Two active holds may never overlap on the same court.
alter table public.court_holds
  add constraint court_holds_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status = 'active');

create index court_holds_expiry_idx on public.court_holds (status, expires_at);

create table public.bookings (
  id              uuid primary key default gen_random_uuid(),
  session_id      uuid not null references public.sessions (id) on delete cascade,
  venue_id        uuid not null references public.venues (id) on delete restrict,
  court_id        uuid not null references public.courts (id) on delete restrict,
  hold_id         uuid references public.court_holds (id) on delete set null,
  starts_at       timestamptz not null,
  ends_at         timestamptz not null,
  status          public.booking_status not null default 'requested',
  price_thb       integer not null check (price_thb >= 0),
  attempt_no      integer not null default 1 check (attempt_no > 0),
  expires_at      timestamptz,
  idempotency_key text not null unique,
  requested_at    timestamptz not null default now(),
  confirmed_at    timestamptz,
  decided_by      uuid references public.profiles (id) on delete set null,
  decision_reason text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint bookings_time_order check (ends_at > starts_at)
);

create trigger bookings_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

-- The double-booking guarantee. A court can hold at most one live booking for
-- any instant in time; the database refuses the second writer regardless of
-- what the application does.
alter table public.bookings
  add constraint bookings_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('requested', 'held', 'confirmed'));

create index bookings_session_idx on public.bookings (session_id, attempt_no);
create index bookings_venue_status_idx on public.bookings (venue_id, status, starts_at);
create index bookings_court_window_idx on public.bookings (court_id, starts_at, ends_at);

alter table public.sessions
  add constraint sessions_booking_fk
  foreign key (booking_id) references public.bookings (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references public.sessions (id) on delete cascade,
  participant_id   uuid not null references public.session_participants (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  amount_thb       integer not null check (amount_thb >= 0),
  status           public.payment_status not null default 'pending',
  provider         text not null default 'mock',
  provider_ref     text,
  idempotency_key  text not null unique,
  expires_at       timestamptz,
  paid_at          timestamptz,
  failure_reason   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger payments_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

create index payments_session_status_idx on public.payments (session_id, status);
create index payments_user_idx on public.payments (user_id);
create unique index payments_one_live_per_participant
  on public.payments (participant_id)
  where status in ('pending', 'paid');

create table public.refunds (
  id              uuid primary key default gen_random_uuid(),
  payment_id      uuid not null references public.payments (id) on delete cascade,
  session_id      uuid not null references public.sessions (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  amount_thb      integer not null check (amount_thb >= 0),
  status          public.refund_status not null default 'pending',
  reason          text not null,
  policy_snapshot jsonb,
  provider_ref    text,
  idempotency_key text not null unique,
  processed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger refunds_updated_at
  before update on public.refunds
  for each row execute function public.set_updated_at();

create index refunds_payment_idx on public.refunds (payment_id);
create index refunds_user_idx on public.refunds (user_id);

-- ---------------------------------------------------------------------------
-- Notifications and audit
-- ---------------------------------------------------------------------------

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  session_id uuid references public.sessions (id) on delete cascade,
  channel    public.notification_channel not null default 'in_app',
  kind       text not null,
  title      text not null,
  body       text not null,
  action_url text,
  read_at    timestamptz,
  sent_at    timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references public.profiles (id) on delete set null,
  entity_type text not null,
  entity_id   uuid,
  session_id  uuid references public.sessions (id) on delete cascade,
  action      text not null,
  from_state  text,
  to_state    text,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, created_at desc);
create index audit_logs_session_idx on public.audit_logs (session_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- The audit trail is append-only. Nothing in the application may rewrite history.
create or replace function public.audit_logs_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only (attempted %)', tg_op;
end;
$$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_immutable();

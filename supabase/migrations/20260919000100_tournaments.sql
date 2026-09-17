-- ทัวร์นาเมนต์ + สมัครเป็นทีม + คืนเงินเมื่อไม่ครบ (LSN-0029)
--
-- หัวใจของ flow ทัวร์นาเมนต์ จากคนหลายคนในนัดเดียว เป็นก๊วนหลายก๊วนในงานเดียว
-- ประตูสองบาน (คน + เงิน) กลายเป็นสามบาน (ทีม + เงิน + คอร์ต)
--
-- ⚠️ ไฟล์นี้ **ไม่แตะตาราง payments แม้แต่บรรทัดเดียว** โดยตั้งใจ
-- payments.session_id และ participant_id เป็น NOT NULL ทั้งคู่ และมีจุดอ้างถึง
-- 73 จุดใน 10 migration การยัดค่าสมัครเข้าไปแปลว่าต้องทำสอง NOT NULL ให้เป็น
-- nullable แล้วไล่ผู้อ่านทั้ง 73 จุดตาม Definition of Done — บนตารางที่เพิ่ง
-- ผลิตบั๊กกินเงินผู้ใช้ และเพื่อฟีเจอร์ที่ payment provider ยังไม่มีอยู่จริง

create type public.tournament_tier as enum ('N', 'S', 'P', 'C', 'B', 'A');

comment on type public.tournament_tier is
  'ลำดับมือที่แพลตฟอร์มนี้เลือกใช้ เรียงจากใหม่ไปเก่ง · ไม่ใช่มาตรฐานกลางของวงการ';

create type public.tournament_status as enum
  ('draft', 'open', 'ready', 'booked', 'cancelled', 'completed');

-- ---------------------------------------------------------------------------
-- ตาราง
-- ---------------------------------------------------------------------------

create table public.tournaments (
  id                    uuid primary key default gen_random_uuid(),
  public_code           text unique,
  host_group_id         uuid not null references public.groups(id),
  title                 text not null check (btrim(title) <> '' and length(title) <= 120),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  registration_deadline timestamptz not null,
  min_teams             integer not null check (min_teams >= 2),
  max_teams             integer check (max_teams is null or max_teams >= min_teams),
  entry_fee_thb         integer not null check (entry_fee_thb > 0 and entry_fee_thb <= 100000),
  tier                  public.tournament_tier not null,
  status                public.tournament_status not null default 'draft',
  court_confirmed_at    timestamptz,
  venue_note            text,
  created_by            uuid not null references public.profiles(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (ends_at > starts_at),
  check (registration_deadline <= starts_at)
);

comment on column public.tournaments.court_confirmed_at is
  'ประตูบานที่สาม · เจ้าภาพกดยืนยันเมื่อไรก็ได้ ไม่กั้นและไม่ถูกกั้นโดยการรับทีม';

create table public.tournament_teams (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  group_id      uuid not null references public.groups(id) on delete cascade,
  is_host       boolean not null default false,
  joined_at     timestamptz not null default now(),
  primary key (tournament_id, group_id)
);

-- PK (tournament_id, group_id) ทำให้ก๊วนเดียวสมัครซ้ำไม่ได้โดยโครงสร้าง
-- ไม่ต้องพึ่งการตรวจในโค้ด เหตุผลเดียวกับ group_members

create table public.tournament_team_payments (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null,
  group_id        uuid not null,
  paid_by         uuid not null references public.profiles(id),
  amount_thb      integer not null check (amount_thb > 0),
  status          public.payment_status not null default 'pending',
  provider        text not null default 'mock',
  provider_ref    text,
  idempotency_key text not null unique,
  paid_at         timestamptz,
  refunded_at     timestamptz,
  created_at      timestamptz not null default now(),
  foreign key (tournament_id, group_id)
    references public.tournament_teams (tournament_id, group_id) on delete cascade
);

-- หนึ่งทีมมีการจ่ายที่ยังไม่ปิดได้แถวเดียว — รูปเดียวกับ
-- payments_one_live_per_participant แต่ขอบเขตเป็นทีม ไม่ใช่รายคน
create unique index tournament_team_one_live_payment
  on public.tournament_team_payments (tournament_id, group_id)
  where status in ('pending', 'paid');

-- ---------------------------------------------------------------------------
-- โค้ดสมัคร — ตัวใหม่อีกตัว ด้วยเหตุผลเดียวกับ generate_group_code()
-- คือตัวเดิมตรวจซ้ำกับตารางของมันเองเท่านั้น
-- ---------------------------------------------------------------------------

create or replace function public.generate_tournament_code()
returns text language plpgsql volatile as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text; v_i integer;
begin
  loop
    v_code := '';
    for v_i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.tournaments where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.tournaments_assign_code()
returns trigger language plpgsql as $$
begin
  if new.public_code is null or new.public_code = '' then
    new.public_code := public.generate_tournament_code();
  end if;
  return new;
end;
$$;

create trigger tournaments_assign_code
  before insert on public.tournaments
  for each row execute function public.tournaments_assign_code();

-- ---------------------------------------------------------------------------
-- Helper — security definer เพราะ policy ที่ถามตารางตัวเองจะวนลูปไม่รู้จบ
-- แบบแผนเดียวกับ is_group_member ใน 20260918000100_groups.sql
-- ---------------------------------------------------------------------------

create or replace function public.is_tournament_host(p_tournament_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.tournaments t
    join public.group_members m on m.group_id = t.host_group_id
    where t.id = p_tournament_id and m.user_id = auth.uid() and m.role = 'owner'
  );
$$;

create or replace function public.is_tournament_team_member(p_tournament_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.tournament_teams tt
    join public.group_members m on m.group_id = tt.group_id
    where tt.tournament_id = p_tournament_id and m.user_id = auth.uid()
  );
$$;

-- ก๊วนที่อยู่ในทัวร์นาเมนต์เดียวกันต้องเห็นชื่อกันและกัน
--
-- เจอตอนตรวจหน้าจอจริง: policy groups_read เดิมให้อ่านได้เฉพาะก๊วนที่ตัวเอง
-- เป็นสมาชิก เจ้าภาพจึงเห็นทีมที่สมัครเป็นคำว่า "ก๊วน" เฉย ๆ ซึ่งใช้จัดงานไม่ได้
--
-- ขอบเขตที่เปิดคือ **ชื่อก๊วนของทีมที่อยู่ในงานเดียวกัน** เท่านั้น
-- คนนอกยังไม่เห็นอะไร และหน้ารับสมัครก็ยังไม่บอกว่าก๊วนไหนสมัครแล้ว
create or replace function public.shares_tournament_with_group(p_group_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1
    from public.tournament_teams theirs
    join public.tournament_teams mine on mine.tournament_id = theirs.tournament_id
    join public.group_members m on m.group_id = mine.group_id
    where theirs.group_id = p_group_id and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.shares_tournament_with_group(uuid) from public;
grant execute on function public.shares_tournament_with_group(uuid) to authenticated, service_role;

drop policy if exists groups_read on public.groups;
create policy groups_read on public.groups
  for select to authenticated
  using (public.is_group_member(id)
         or public.shares_tournament_with_group(id)
         or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.tournaments             enable row level security;
alter table public.tournament_teams        enable row level security;
alter table public.tournament_team_payments enable row level security;

create policy tournaments_read on public.tournaments
  for select to authenticated
  using (public.is_tournament_host(id)
         or public.is_tournament_team_member(id)
         or public.is_platform_admin());

create policy tournament_teams_read on public.tournament_teams
  for select to authenticated
  using (public.is_tournament_host(tournament_id)
         or public.is_tournament_team_member(tournament_id)
         or public.is_platform_admin());

create policy tournament_payments_read on public.tournament_team_payments
  for select to authenticated
  using (public.is_tournament_host(tournament_id)
         or public.is_group_member(group_id)
         or public.is_platform_admin());

grant select on public.tournaments, public.tournament_teams,
                public.tournament_team_payments to authenticated;
revoke insert, update, delete on public.tournaments             from anon, authenticated;
revoke insert, update, delete on public.tournament_teams        from anon, authenticated;
revoke insert, update, delete on public.tournament_team_payments from anon, authenticated;

-- ตารางที่สร้างทีหลังไม่ได้สิทธิ์จาก `grant ... on all tables` ที่รันครั้งเดียว
grant all privileges on public.tournaments             to service_role;
grant all privileges on public.tournament_teams        to service_role;
grant all privileges on public.tournament_team_payments to service_role;

-- ---------------------------------------------------------------------------
-- สร้างทัวร์นาเมนต์ — ทีมเจ้าภาพถูกใส่ในทรานแซกชันเดียวกัน
--
-- เจ้าภาพนับเป็นหนึ่งทีมและต้องจ่ายเหมือนทีมอื่น เพราะประตูที่มีข้อยกเว้น
-- คือประตูที่เขียนเทสไม่ได้และอ่านไม่ออก — รูปเดียวกับที่ LSN-0024 พังมาแล้ว
-- ---------------------------------------------------------------------------

create or replace function public.create_tournament(
  p_host_group_id uuid,
  p_title         text,
  p_starts_at     timestamptz,
  p_ends_at       timestamptz,
  p_deadline      timestamptz,
  p_min_teams     integer,
  p_max_teams     integer,
  p_entry_fee_thb integer,
  p_tier          public.tournament_tier
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.is_group_owner(p_host_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  insert into public.tournaments
    (host_group_id, title, starts_at, ends_at, registration_deadline,
     min_teams, max_teams, entry_fee_thb, tier, created_by)
  values
    (p_host_group_id, btrim(p_title), p_starts_at, p_ends_at, p_deadline,
     p_min_teams, p_max_teams, p_entry_fee_thb, p_tier, v_user)
  returning id into v_id;

  insert into public.tournament_teams (tournament_id, group_id, is_host)
  values (v_id, p_host_group_id, true);

  perform public.app_log(v_user, 'tournament', v_id, null, 'tournament.created',
    null, 'draft', jsonb_build_object('title', btrim(p_title), 'minTeams', p_min_teams));

  return jsonb_build_object('ok', true, 'tournamentId', v_id,
    'publicCode', (select public_code from public.tournaments where id = v_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- หน้ารับสมัคร — ไม่บอกว่าก๊วนไหนสมัครแล้ว บอกแค่จำนวน
-- ---------------------------------------------------------------------------

create or replace function public.tournament_invite_public(p_code text)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select case when t.id is null then null else jsonb_build_object(
    'title', t.title,
    'tier', t.tier::text,
    'entryFeeThb', t.entry_fee_thb,
    'minTeams', t.min_teams,
    'maxTeams', t.max_teams,
    'teamCount', (select count(*) from public.tournament_teams x where x.tournament_id = t.id),
    'startsAt', t.starts_at,
    'registrationDeadline', t.registration_deadline,
    'status', t.status::text
  ) end
  from (select 1) _
  left join public.tournaments t on t.public_code = upper(btrim(p_code));
$$;

-- ---------------------------------------------------------------------------
-- เผยแพร่ — ร่างยังรับสมัครไม่ได้
--
-- เขียนไว้เพราะเทสจับได้ว่าเดิม join_tournament ยอมรับทั้ง draft และ open
-- ซึ่งแปลว่าก๊วนอื่นสมัครเข้างานที่เจ้าภาพยังไม่ตั้งใจเปิดได้ · นัดที่เป็นร่าง
-- ยังไม่มีใครเข้าร่วมได้อยู่แล้ว ทัวร์นาเมนต์จึงต้องเหมือนกัน
-- ---------------------------------------------------------------------------

create or replace function public.publish_tournament(p_tournament_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare v_from public.tournament_status;
begin
  if not public.is_tournament_host(p_tournament_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_host');
  end if;

  select status into v_from from public.tournaments where id = p_tournament_id;
  if v_from <> 'draft' then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_from);
  end if;

  update public.tournaments set status = 'open', updated_at = now()
  where id = p_tournament_id;

  perform public.app_log(auth.uid(), 'tournament', p_tournament_id, null,
    'tournament.published', 'draft', 'open', '{}'::jsonb);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- สมัครเข้าแข่ง — เฉพาะเจ้าของก๊วน
-- ---------------------------------------------------------------------------

create or replace function public.join_tournament(p_code text, p_group_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_t    public.tournaments%rowtype;
  v_n    integer;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.is_group_owner(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  select * into v_t from public.tournaments where public_code = upper(btrim(p_code));
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  end if;
  if v_t.status = 'draft' then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_published');
  end if;
  if v_t.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'tournament_closed');
  end if;
  if now() > v_t.registration_deadline then
    return jsonb_build_object('ok', false, 'reason', 'registration_closed');
  end if;

  select count(*) into v_n from public.tournament_teams where tournament_id = v_t.id;
  if v_t.max_teams is not null and v_n >= v_t.max_teams then
    return jsonb_build_object('ok', false, 'reason', 'tournament_full');
  end if;

  insert into public.tournament_teams (tournament_id, group_id)
  values (v_t.id, p_group_id)
  on conflict (tournament_id, group_id) do nothing;

  if found then
    perform public.app_log(v_user, 'tournament', v_t.id, null, 'tournament.team_joined',
      null, null, jsonb_build_object('groupId', p_group_id));
  end if;

  return jsonb_build_object('ok', true, 'tournamentId', v_t.id, 'joined', found);
end;
$$;

-- ---------------------------------------------------------------------------
-- จ่ายค่าสมัคร — หนึ่งทีม หนึ่งการจ่าย
-- ---------------------------------------------------------------------------

create or replace function public.pay_tournament_team(
  p_tournament_id uuid,
  p_group_id      uuid,
  p_idempotency_key text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_t    public.tournaments%rowtype;
  v_existing public.tournament_team_payments%rowtype;
  v_id   uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.is_group_owner(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;
  if not exists (select 1 from public.tournament_teams
                 where tournament_id = p_tournament_id and group_id = p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'team_not_registered');
  end if;

  select * into v_t from public.tournaments where id = p_tournament_id;

  select * into v_existing from public.tournament_team_payments
  where tournament_id = p_tournament_id and group_id = p_group_id
    and status in ('pending', 'paid');

  if v_existing.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'paymentId', v_existing.id, 'status', v_existing.status);
  end if;

  insert into public.tournament_team_payments
    (tournament_id, group_id, paid_by, amount_thb, idempotency_key, status, paid_at)
  values
    (p_tournament_id, p_group_id, v_user, v_t.entry_fee_thb, p_idempotency_key, 'paid', now())
  returning id into v_id;

  perform public.app_log(v_user, 'tournament', p_tournament_id, null,
    'tournament.team_paid', null, 'paid',
    jsonb_build_object('groupId', p_group_id, 'amountThb', v_t.entry_fee_thb));

  perform public.evaluate_tournament_gates(p_tournament_id);

  return jsonb_build_object('ok', true, 'paymentId', v_id, 'status', 'paid');
end;
$$;

-- ---------------------------------------------------------------------------
-- คอร์ต — ประตูบานที่สาม กดเมื่อไรก็ได้
--
-- ไม่กั้นการรับทีม และไม่ถูกการรับทีมกั้น เพราะ Insight ของโปรดักต์เขียนไว้ว่า
-- เงินกับสนามต้องถูกตัดสิน **พร้อมกัน ไม่ใช่ตามลำดับ** การบังคับลำดับคือการ
-- ทำสิ่งที่โปรดักต์ตั้งขึ้นมาเพื่อแก้
-- ---------------------------------------------------------------------------

create or replace function public.confirm_tournament_court(
  p_tournament_id uuid,
  p_venue_note    text
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_tournament_host(p_tournament_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_host');
  end if;

  update public.tournaments
  set court_confirmed_at = now(), venue_note = nullif(btrim(coalesce(p_venue_note, '')), ''),
      updated_at = now()
  where id = p_tournament_id and court_confirmed_at is null;

  if not found then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  perform public.app_log(auth.uid(), 'tournament', p_tournament_id, null,
    'tournament.court_confirmed', null, null, jsonb_build_object('venueNote', p_venue_note));

  perform public.evaluate_tournament_gates(p_tournament_id);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- ประตูสามบาน
--
-- ทีมครบขั้นต่ำ · ทุกทีมจ่ายแล้ว · คอร์ตยืนยันแล้ว
-- นับทุกทีมเท่ากัน **รวมเจ้าภาพ ไม่มีข้อยกเว้น**
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_tournament_gates(p_tournament_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_t       public.tournaments%rowtype;
  v_teams   integer;
  v_paid    integer;
  v_ready   boolean;
begin
  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  end if;

  select count(*) into v_teams from public.tournament_teams where tournament_id = p_tournament_id;

  select count(*) into v_paid
  from public.tournament_teams tt
  where tt.tournament_id = p_tournament_id
    and exists (select 1 from public.tournament_team_payments p
                where p.tournament_id = tt.tournament_id and p.group_id = tt.group_id
                  and p.status = 'paid');

  v_ready := v_teams >= v_t.min_teams
             and v_paid = v_teams
             and v_t.court_confirmed_at is not null;

  if v_ready and v_t.status = 'open' then
    update public.tournaments set status = 'ready', updated_at = now()
    where id = p_tournament_id;
    perform public.app_log(null, 'tournament', p_tournament_id, null,
      'tournament.ready', v_t.status::text, 'ready',
      jsonb_build_object('teams', v_teams, 'paid', v_paid));
  end if;

  return jsonb_build_object('ok', true, 'teams', v_teams, 'paidTeams', v_paid,
    'courtConfirmed', v_t.court_confirmed_at is not null, 'ready', v_ready);
end;
$$;

-- ---------------------------------------------------------------------------
-- ถึงกำหนดแล้วไม่ครบ → คืนเต็มทุกทีม
--
-- นี่คือคำสัญญาหลักของโปรดักต์ในระดับทัวร์นาเมนต์ ไม่มีใครต้องรับความเสี่ยง
-- คนเดียว · เรียกซ้ำได้ผลเท่าเดิม เพราะกรองด้วย refunded_at
-- ---------------------------------------------------------------------------

create or replace function public.close_unfilled_tournaments()
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_row      record;
  v_closed   integer := 0;
  v_refunded integer := 0;
  v_n        integer;
begin
  for v_row in
    select t.* from public.tournaments t
    where t.status = 'open'
      and t.registration_deadline <= now()
    for update of t skip locked
  loop
    select count(*) into v_n from public.tournament_teams where tournament_id = v_row.id;
    if v_n >= v_row.min_teams then
      continue;
    end if;

    update public.tournament_team_payments
    set status = 'refunded', refunded_at = now()
    where tournament_id = v_row.id and status = 'paid' and refunded_at is null;

    get diagnostics v_n = row_count;
    v_refunded := v_refunded + v_n;

    update public.tournaments set status = 'cancelled', updated_at = now()
    where id = v_row.id;

    perform public.app_log(null, 'tournament', v_row.id, null,
      'tournament.cancelled_unfilled', v_row.status::text, 'cancelled',
      jsonb_build_object('refundedTeams', v_n));

    v_closed := v_closed + 1;
  end loop;

  return jsonb_build_object('ok', true, 'cancelled', v_closed, 'refundedPayments', v_refunded);
end;
$$;

-- ---------------------------------------------------------------------------
-- สิทธิ์เรียก
-- ---------------------------------------------------------------------------

revoke execute on function public.is_tournament_host(uuid)        from public;
revoke execute on function public.is_tournament_team_member(uuid) from public;
revoke execute on function public.create_tournament(uuid, text, timestamptz, timestamptz, timestamptz, integer, integer, integer, public.tournament_tier) from public;
revoke execute on function public.publish_tournament(uuid)        from public;
revoke execute on function public.join_tournament(text, uuid)     from public;
revoke execute on function public.pay_tournament_team(uuid, uuid, text) from public;
revoke execute on function public.confirm_tournament_court(uuid, text)  from public;
revoke execute on function public.evaluate_tournament_gates(uuid) from public;
revoke execute on function public.close_unfilled_tournaments()    from public;
revoke execute on function public.tournament_invite_public(text)  from public;

grant execute on function public.is_tournament_host(uuid)        to authenticated, service_role;
grant execute on function public.is_tournament_team_member(uuid) to authenticated, service_role;
grant execute on function public.create_tournament(uuid, text, timestamptz, timestamptz, timestamptz, integer, integer, integer, public.tournament_tier) to authenticated, service_role;
grant execute on function public.publish_tournament(uuid)        to authenticated, service_role;
grant execute on function public.join_tournament(text, uuid)     to authenticated, service_role;
grant execute on function public.pay_tournament_team(uuid, uuid, text) to authenticated, service_role;
grant execute on function public.confirm_tournament_court(uuid, text)  to authenticated, service_role;
grant execute on function public.evaluate_tournament_gates(uuid) to authenticated, service_role;
grant execute on function public.close_unfilled_tournaments()    to service_role;
grant execute on function public.tournament_invite_public(text)  to anon, authenticated, service_role;

-- คะแนนความประทับใจ (LSN-0039)
--
-- นี่คือ "แกนที่สอง" ที่สเปกวางไว้ตั้งแต่ต้นแต่ยังไม่เคยสร้าง
--
-- สเปกห้ามให้ความเห็นไปกำหนดรุ่นที่ลงได้ เพราะถ้ากำหนดได้เมื่อไหร่ ความเห็นจะมี
-- มูลค่าให้โกงทันที (กดคะแนนคู่แข่งเพื่อผลักไปรุ่นที่สู้ไม่ไหว) แกนนี้จึง
-- **ไม่มีผลต่ออะไรเลยนอกจากการแสดงผล** — ไม่แตะ player_skill ไม่แตะ player_credit
--
-- ⚠️ ถ้าวันหนึ่งมีคนอยากเอาคะแนนชุดนี้ไปคัดรุ่น ให้กลับมาอ่านย่อหน้าบน
-- แล้วอ่านหัวข้อ "เรื่องที่อันตรายที่สุด" ใน .codex/specs/tournaments.md ก่อน

-- ---------------------------------------------------------------------------
-- ให้คะแนน "คน"
-- ---------------------------------------------------------------------------

create table public.player_impressions (
  id            uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  rater_id      uuid not null references public.profiles(id) on delete cascade,
  ratee_id      uuid not null references public.profiles(id) on delete cascade,
  punctuality   smallint not null check (punctuality between 1 and 5),
  manners       smallint not null check (manners     between 1 and 5),
  fun           smallint not null check (fun         between 1 and 5),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- ให้ซ้ำแล้วทับของเดิม ไม่ใช่เพิ่มแถว ไม่งั้นคนขยันกดจะถ่วงค่าเฉลี่ยได้
  constraint player_impressions_once unique (tournament_id, rater_id, ratee_id),
  constraint player_impressions_not_self check (rater_id <> ratee_id)
);

-- ---------------------------------------------------------------------------
-- ให้คะแนน "งาน" — สภาพสนามกับการจัดงานไม่ใช่คุณสมบัติของคน
-- ---------------------------------------------------------------------------

create table public.tournament_impressions (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  rater_id        uuid not null references public.profiles(id) on delete cascade,
  court_condition smallint not null check (court_condition between 1 and 5),
  organisation    smallint not null check (organisation    between 1 and 5),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint tournament_impressions_once unique (tournament_id, rater_id)
);

-- ---------------------------------------------------------------------------
-- ไม่มี policy ของ select เลยโดยตั้งใจ
--
-- ถ้าเปิดให้อ่านตารางตรง ๆ `rater_id` จะหลุดทันที และการปกปิดบนหน้าจอไม่นับ
-- เป็นการปกปิด — RLS เป็น row-level ไม่ใช่ column-level (บทเรียน LSN-0023)
-- ทางเดียวที่อ่านได้คือผ่านฟังก์ชันสรุปข้างล่างซึ่งไม่คืน rater_id ออกไปเลย
-- ---------------------------------------------------------------------------

alter table public.player_impressions     enable row level security;
alter table public.tournament_impressions enable row level security;

revoke insert, update, delete on public.player_impressions     from anon, authenticated;
revoke insert, update, delete on public.tournament_impressions from anon, authenticated;
grant all privileges on public.player_impressions     to service_role;
grant all privileges on public.tournament_impressions to service_role;

-- ---------------------------------------------------------------------------
-- ก๊วนของผู้ใช้คนหนึ่งในทัวร์นาเมนต์หนึ่ง
-- ---------------------------------------------------------------------------

create or replace function public.tournament_groups_of(p_tournament_id uuid, p_user uuid)
returns setof uuid language sql stable security definer
set search_path = public, pg_temp as $$
  select tt.group_id
  from public.tournament_teams tt
  join public.group_members gm on gm.group_id = tt.group_id
  where tt.tournament_id = p_tournament_id and gm.user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- ให้คะแนนคน
-- ---------------------------------------------------------------------------

create or replace function public.rate_player(
  p_tournament_id uuid,
  p_ratee_id      uuid,
  p_punctuality   smallint,
  p_manners       smallint,
  p_fun           smallint
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user   uuid := auth.uid();
  v_status public.tournament_status;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if v_user = p_ratee_id then
    return jsonb_build_object('ok', false, 'reason', 'cannot_rate_self');
  end if;

  select status into v_status from public.tournaments where id = p_tournament_id;
  if v_status is null then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  end if;
  -- allowlist ไม่ใช่ denylist — งานที่ยังรับสมัครอยู่ยังไม่มีใครเจอใคร
  if v_status not in ('ready', 'booked', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_played');
  end if;

  if not exists (select 1 from public.tournament_groups_of(p_tournament_id, v_user)) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_tournament');
  end if;
  if not exists (select 1 from public.tournament_groups_of(p_tournament_id, p_ratee_id)) then
    return jsonb_build_object('ok', false, 'reason', 'ratee_not_in_tournament');
  end if;

  -- ต้องอยู่คนละก๊วน ถ้าซ้อนกันแม้ก๊วนเดียวก็ถือว่าเป็นพวกเดียวกัน
  -- เหตุผลเดียวกับที่คนบันทึกผลยืนยันผลตัวเองไม่ได้ใน LSN-0030
  if exists (
    select 1 from public.tournament_groups_of(p_tournament_id, v_user) g
    where g in (select public.tournament_groups_of(p_tournament_id, p_ratee_id))
  ) then
    return jsonb_build_object('ok', false, 'reason', 'same_group_cannot_rate');
  end if;

  insert into public.player_impressions
    (tournament_id, rater_id, ratee_id, punctuality, manners, fun)
  values (p_tournament_id, v_user, p_ratee_id, p_punctuality, p_manners, p_fun)
  on conflict (tournament_id, rater_id, ratee_id) do update
    set punctuality = excluded.punctuality,
        manners     = excluded.manners,
        fun         = excluded.fun,
        updated_at  = now();

  -- ช่องที่สี่ของ app_log คือ session_id ซึ่งมี FK ชี้ไปตาราง sessions
  -- ส่ง tournament_id ลงไปจะ FK พัง — ของฝั่งทัวร์นาเมนต์ส่ง null เหมือนที่ LSN-0029 ทำ
  perform public.app_log(v_user, 'player_impression', p_ratee_id, null,
    'impression.rated', null, null,
    jsonb_build_object('tournamentId', p_tournament_id));

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- ให้คะแนนงาน — เจ้าภาพให้คะแนนงานตัวเองไม่ได้
-- ---------------------------------------------------------------------------

create or replace function public.rate_tournament(
  p_tournament_id   uuid,
  p_court_condition smallint,
  p_organisation    smallint
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_t    public.tournaments%rowtype;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  end if;
  if v_t.status not in ('ready', 'booked', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_played');
  end if;
  if not exists (select 1 from public.tournament_groups_of(p_tournament_id, v_user)) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_tournament');
  end if;
  -- เจ้าภาพให้คะแนนงานของตัวเองคือการชมตัวเอง
  if exists (
    select 1 from public.group_members
    where group_id = v_t.host_group_id and user_id = v_user
  ) then
    return jsonb_build_object('ok', false, 'reason', 'host_cannot_rate_own_event');
  end if;

  insert into public.tournament_impressions
    (tournament_id, rater_id, court_condition, organisation)
  values (p_tournament_id, v_user, p_court_condition, p_organisation)
  on conflict (tournament_id, rater_id) do update
    set court_condition = excluded.court_condition,
        organisation    = excluded.organisation,
        updated_at      = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- ตัวอ่าน — ไม่คืน rater_id ออกไปเลยไม่ว่ากรณีใด
--
-- และไม่แสดงค่าเฉลี่ยจนกว่าจะมีผู้ให้อย่างน้อย 3 คน เพราะที่ 1–2 คน
-- ผู้รับเดาตัวผู้ให้ได้ง่ายเกินไป ซึ่งทำลายเหตุผลทั้งหมดของการปกปิด
-- ---------------------------------------------------------------------------

create or replace function public.player_impression_summary(p_user_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select case when count(*) < 3 then
    jsonb_build_object('raters', count(*)::integer, 'ready', false)
  else
    jsonb_build_object(
      'raters', count(*)::integer,
      'ready', true,
      'punctuality', round(avg(punctuality)::numeric, 1),
      'manners',     round(avg(manners)::numeric, 1),
      'fun',         round(avg(fun)::numeric, 1),
      'overall',     round(avg((punctuality + manners + fun) / 3.0)::numeric, 1))
  end
  from public.player_impressions where ratee_id = p_user_id;
$$;

/**
 * ค่าเฉลี่ยของก๊วน — คำนวณสดจากสมาชิกปัจจุบันเสมอ
 *
 * สเปกสั่งห้ามเก็บเป็นคอลัมน์ เพราะมันจะเพี้ยนทันทีที่มีคนเข้าออกก๊วน
 * ต่างจากส่วนแบ่งค่าใช้จ่ายใน LSN-0024 ที่ต้องเก็บเป็นแถวเพราะนั่นคือ *หนี้*
 * ที่ต้องนิ่ง ส่วนอันนี้คือ *ภาพปัจจุบัน* ที่ต้องสด
 */
create or replace function public.group_impression_summary(p_group_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select case when count(*) < 3 then
    jsonb_build_object('raters', count(*)::integer, 'ready', false)
  else
    jsonb_build_object(
      'raters', count(*)::integer,
      'ready', true,
      'punctuality', round(avg(pi.punctuality)::numeric, 1),
      'manners',     round(avg(pi.manners)::numeric, 1),
      'fun',         round(avg(pi.fun)::numeric, 1),
      'overall',     round(avg((pi.punctuality + pi.manners + pi.fun) / 3.0)::numeric, 1))
  end
  from public.player_impressions pi
  where pi.ratee_id in (select user_id from public.group_members where group_id = p_group_id);
$$;

create or replace function public.tournament_impression_summary(p_tournament_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select case when count(*) < 3 then
    jsonb_build_object('raters', count(*)::integer, 'ready', false)
  else
    jsonb_build_object(
      'raters', count(*)::integer,
      'ready', true,
      'courtCondition', round(avg(court_condition)::numeric, 1),
      'organisation',   round(avg(organisation)::numeric, 1))
  end
  from public.tournament_impressions where tournament_id = p_tournament_id;
$$;

/** คะแนนที่ผู้ใช้คนนี้เคยให้ไว้ ใช้เติมฟอร์มตอนกลับมาแก้ — เห็นได้เฉพาะของตัวเอง */
create or replace function public.my_player_impressions(p_tournament_id uuid)
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(jsonb_object_agg(ratee_id::text, jsonb_build_object(
    'punctuality', punctuality, 'manners', manners, 'fun', fun)), '{}'::jsonb)
  from public.player_impressions
  where tournament_id = p_tournament_id and rater_id = auth.uid();
$$;

revoke execute on function public.tournament_groups_of(uuid, uuid)        from public;
revoke execute on function public.rate_player(uuid, uuid, smallint, smallint, smallint) from public;
revoke execute on function public.rate_tournament(uuid, smallint, smallint) from public;
revoke execute on function public.player_impression_summary(uuid)        from public;
revoke execute on function public.group_impression_summary(uuid)         from public;
revoke execute on function public.tournament_impression_summary(uuid)    from public;
revoke execute on function public.my_player_impressions(uuid)            from public;

grant execute on function public.rate_player(uuid, uuid, smallint, smallint, smallint) to authenticated, service_role;
grant execute on function public.rate_tournament(uuid, smallint, smallint) to authenticated, service_role;
grant execute on function public.player_impression_summary(uuid)     to authenticated, service_role;
grant execute on function public.group_impression_summary(uuid)      to authenticated, service_role;
grant execute on function public.tournament_impression_summary(uuid) to authenticated, service_role;
grant execute on function public.my_player_impressions(uuid)         to authenticated, service_role;

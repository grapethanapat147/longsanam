-- Badge หลังจบทัวร์นาเมนต์ (LSN-0028)
--
-- artwork เสร็จมาตั้งแต่ต้น ตั๋วนี้คือฐานข้อมูล กติกา และหน้าจอ
--
-- ### สามข้อที่ตั๋วค้างไว้ ตัดสินแล้ว 23 ก.ย. 2569
--
-- 1. **แชมป์มาจากระบบคำนวณ ไม่ใช่เจ้าภาพประกาศ** และต้องมีอย่างน้อยสี่ก๊วน
--    สเปกเดิมเสนอให้เจ้าภาพประกาศเพราะไม่มี bracket แต่ LSN-0046 คำนวณแชมป์
--    จากผลแมตช์ที่ยืนยันแล้วไปแล้ว การให้เจ้าภาพประกาศซ้ำจะเปิดช่องให้ประกาศ
--    ก๊วนตัวเองโดยไม่เคยลงแข่ง ส่วนขั้นต่ำสี่ก๊วนกัน badge ระดับ elite เฟ้อจาก
--    งานสองก๊วนที่เพื่อนผลัดกันเป็นแชมป์
--
-- 2. **คิดใหม่ทั้งชุดทุกครั้ง ถอนได้** แพตเทิร์นเดียวกับ `recompute_player_skill`
--    (LSN-0031) ถ้าผลแมตช์ถูกยกเลิก badge ที่อิงผลนั้นต้องหายตาม ไม่งั้นจะมี
--    แชมป์สองคนของงานเดียวกัน
--
-- 3. **ผู้ใช้ที่ล็อกอินแล้วเห็น badge ของกันและกันได้** ไม่ขัดกับ LSN-0023 ที่ปิด
--    *รายชื่อสมาชิกก๊วน* จากคนนอก เพราะ badge เป็นผลงาน ไม่ใช่รายชื่อ และ
--    ค่าเฉลี่ยความประทับใจก็เปิดให้ผู้ใช้ทุกคนอยู่แล้ว (ตรวจไว้ใน LSN-0050)
--
-- ### ทำไมย้ายตารางคะแนนมาไว้ใน SQL
--
-- LSN-0046 คำนวณตารางคะแนนใน TypeScript เพราะตอนนั้นมีผู้ใช้รายเดียวคือหน้าจอ
-- ตั๋วนี้เพิ่มผู้ใช้รายที่สองคือการให้ badge ซึ่งต้องทำงานฝั่งฐานข้อมูล
-- **ถ้าเขียนกติกาไว้สองที่ วันหนึ่งหน้าจอกับ badge จะบอกคนละคน** จึงย้ายมาไว้
-- ที่เดียวแล้วให้หน้าจอเรียกผ่าน RPC แทน

-- ---------------------------------------------------------------------------
-- ตารางคะแนน — แหล่งความจริงเดียว
-- ---------------------------------------------------------------------------

/**
 * ตัวคิดจริง ไม่มีด่านสิทธิ์ เพราะถูกเรียกจากสองทางที่ด่านต่างกัน:
 * หน้าจอ (ต้องอยู่ในงาน) กับการให้ badge (เครื่องทำ ไม่มีผู้ใช้)
 */
create or replace function public.tournament_standings_raw(p_tournament_id uuid)
returns table (
  group_id       uuid,
  name           text,
  played         integer,
  wins           integer,
  losses         integer,
  draws          integer,
  points_for     integer,
  points_against integer,
  diff           integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  with sides as (
    -- แต่ละแมตช์ให้สองแถว มองจากฝั่งตัวเอง
    select m.side_a_group_id as gid, m.score_a as gf, m.score_b as ga
    from public.matches m
    where m.tournament_id = p_tournament_id and m.status = 'confirmed'
    union all
    select m.side_b_group_id, m.score_b, m.score_a
    from public.matches m
    where m.tournament_id = p_tournament_id and m.status = 'confirmed'
  ),
  tallied as (
    select s.gid,
           count(*)::integer                                    as played,
           count(*) filter (where s.gf > s.ga)::integer          as wins,
           count(*) filter (where s.gf < s.ga)::integer          as losses,
           -- แบดมินตันไม่มีเสมอ แต่ตารางยอมให้สกอร์เท่ากัน นับแยกไว้
           -- ดีกว่าเงียบ ๆ ยกให้ฝั่งใดฝั่งหนึ่ง
           count(*) filter (where s.gf = s.ga)::integer          as draws,
           coalesce(sum(s.gf), 0)::integer                       as points_for,
           coalesce(sum(s.ga), 0)::integer                       as points_against
    from sides s group by s.gid
  )
  select tt.group_id,
         coalesce(g.name, 'ก๊วน'),
         coalesce(t.played, 0),
         coalesce(t.wins, 0),
         coalesce(t.losses, 0),
         coalesce(t.draws, 0),
         coalesce(t.points_for, 0),
         coalesce(t.points_against, 0),
         coalesce(t.points_for, 0) - coalesce(t.points_against, 0)
  from public.tournament_teams tt
  join public.groups g on g.id = tt.group_id
  left join tallied t on t.gid = tt.group_id
  where tt.tournament_id = p_tournament_id
  order by coalesce(t.wins, 0) desc,
           coalesce(t.points_for, 0) - coalesce(t.points_against, 0) desc,
           coalesce(t.points_for, 0) desc,
           g.name;
$$;

/** ด่านสำหรับหน้าจอ — คนนอกงานไม่ได้อะไรกลับไป */
create or replace function public.tournament_standings(p_tournament_id uuid)
returns table (
  group_id       uuid,
  name           text,
  played         integer,
  wins           integer,
  losses         integer,
  draws          integer,
  points_for     integer,
  points_against integer,
  diff           integer
)
language sql stable security definer
set search_path = public, pg_temp as $$
  select * from public.tournament_standings_raw(p_tournament_id)
  where public.is_tournament_host(p_tournament_id)
     or public.is_tournament_team_member(p_tournament_id)
     or public.is_platform_admin();
$$;

/**
 * แชมป์ หรือ `null` เมื่อยังตัดสินไม่ได้
 *
 * คืน null เมื่อยังไม่มีแมตช์ที่ยืนยัน หรือสองอันดับแรกเท่ากันทุกเกณฑ์ —
 * การหยิบแถวแรกมาประกาศทั้งที่เสมอกันคือการให้รางวัลตามลำดับตัวอักษร
 */
create or replace function public.tournament_champion(p_tournament_id uuid)
returns uuid
language plpgsql stable security definer
set search_path = public, pg_temp as $$
declare
  v_first  record;
  v_second record;
begin
  select * into v_first from public.tournament_standings_raw(p_tournament_id) limit 1;

  if v_first.group_id is null or v_first.played = 0 then
    return null;
  end if;

  select * into v_second from public.tournament_standings_raw(p_tournament_id) offset 1 limit 1;

  if v_second.group_id is not null
     and v_second.wins = v_first.wins
     and v_second.diff = v_first.diff
     and v_second.points_for = v_first.points_for then
    return null;
  end if;

  return v_first.group_id;
end;
$$;

revoke execute on function public.tournament_standings_raw(uuid) from public, anon, authenticated;
revoke execute on function public.tournament_champion(uuid)      from public, anon, authenticated;
revoke execute on function public.tournament_standings(uuid)     from public;
grant execute on function public.tournament_standings(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- badge ที่ผู้เล่นได้
-- ---------------------------------------------------------------------------

/**
 * ไม่มีตาราง catalog — รายการ badge ทั้งหกอยู่ใน
 * `docs/design/social-tournament/badges/badge-definitions.json` และคัดลอกมาเป็น
 * ค่าคงที่ฝั่ง TS ตารางนี้เก็บแค่ "ใครได้ใบไหน"
 *
 * `tournament_id` บอกว่าได้มาจากงานไหน ใบที่สะสมข้ามงาน (03 · 06) เก็บเป็น null
 */
create table if not exists public.player_badges (
  user_id       uuid not null references public.profiles(id) on delete cascade,
  badge_id      text not null,
  tournament_id uuid references public.tournaments(id) on delete set null,
  awarded_at    timestamptz not null default now(),
  primary key (user_id, badge_id)
);

alter table public.player_badges enable row level security;

-- ตัดสินข้อ 3: ผู้ใช้ที่ล็อกอินแล้วเห็นของกันและกันได้
create policy player_badges_read on public.player_badges
  for select to authenticated using (true);

grant select on public.player_badges to authenticated;

-- ---------------------------------------------------------------------------
-- กติกาการให้ badge
-- ---------------------------------------------------------------------------

/**
 * คิดใหม่ทั้งชุดจากข้อมูลปัจจุบัน (ตัดสินข้อ 2)
 *
 * ⚠️ **ไม่ใช่ลบทิ้งแล้วใส่ใหม่** เพราะ `awarded_at` ต้องไม่ขยับเมื่อคิดซ้ำ
 * จึงทำสองจังหวะ: ใส่ใบใหม่ด้วย `do nothing` แล้วค่อยลบใบที่ไม่เข้าเกณฑ์แล้ว
 * ผลคือคิดกี่ครั้งก็ได้ชุดเดิม เวลาที่ได้มาก็ยังเป็นเวลาเดิม
 *
 * ⚠️ `where` ในทุก DELETE/UPDATE ห้ามลบ — บทบาท `authenticator` preload
 * ส่วนขยาย `safeupdate` ไว้ คำสั่งที่ไม่มี WHERE ถูกปฏิเสธ (LSN-0045)
 *
 * ขนาดงานโตตามจำนวนแมตช์ทั้งระบบ เหมือน `recompute_player_skill` ซึ่งรับได้ใน
 * ขนาดปัจจุบัน ถ้าวันหนึ่งช้า ให้แคบลงเป็นรายทัวร์นาเมนต์ ไม่ใช่เลิกคิดใหม่
 */
create or replace function public.recompute_player_badges()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_row record;
begin
  drop table if exists tmp_badge_target;
  create temporary table tmp_badge_target (
    user_id       uuid not null,
    badge_id      text not null,
    tournament_id uuid
  ) on commit drop;

  insert into tmp_badge_target (user_id, badge_id, tournament_id)
  with played as (
    -- แต่ละผู้เล่นในแมตช์ที่ยืนยันแล้ว มองจากฝั่งตัวเอง
    select m.tournament_id,
           t.ends_at,
           t.status as tournament_status,
           p.user_id,
           case when p.user_id = any(m.side_a_players)
                then m.side_a_group_id else m.side_b_group_id end as own_group,
           case when p.user_id = any(m.side_a_players)
                then m.side_b_group_id else m.side_a_group_id end as opp_group
    from public.matches m
    join public.tournaments t on t.id = m.tournament_id
    cross join lateral unnest(m.side_a_players || m.side_b_players) as p(user_id)
    where m.status = 'confirmed'
  ),
  finished as (
    select * from played where tournament_status = 'completed'
  ),
  champions as (
    -- ขั้นต่ำสี่ก๊วน (ตัดสินข้อ 1) — งานสองก๊วนไม่ผลิตแชมป์ระดับ elite
    select t.id as tournament_id, public.tournament_champion(t.id) as champ_group
    from public.tournaments t
    where t.status = 'completed'
      and (select count(*) from public.tournament_teams tt
           where tt.tournament_id = t.id) >= 4
  )

  -- 01 ลงแข่งจนจบทัวร์นาเมนต์แรก · ต้องลงสนามจริง ไม่ใช่แค่สมัคร
  (select distinct on (f.user_id) f.user_id, '01-first-tournament', f.tournament_id
   from finished f
   order by f.user_id, f.ends_at, f.tournament_id)

  union all
  -- 02 จบแมตช์กับก๊วนที่ไม่เคยแข่งด้วย — แมตช์แรกเป็นก๊วนใหม่เสมอ
  (select distinct on (p.user_id) p.user_id, '02-new-opponents', p.tournament_id
   from played p
   order by p.user_id, p.ends_at, p.tournament_id)

  union all
  -- 03 ลงแข่งครบห้ารายการ · นับรายการที่จบแล้วและลงสนามจริง
  (select f.user_id, '03-five-tournaments', null::uuid
   from finished f
   group by f.user_id
   having count(distinct f.tournament_id) >= 5)

  union all
  -- 04 แชมป์ประจำรายการ · เฉพาะคนที่ลงสนามให้ก๊วนที่ชนะ
  (select distinct on (f.user_id) f.user_id, '04-champion', f.tournament_id
   from finished f
   join champions c on c.tournament_id = f.tournament_id
   where c.champ_group is not null and c.champ_group = f.own_group
   order by f.user_id, f.ends_at, f.tournament_id)

  union all
  /*
    05 น้ำใจนักกีฬา

    `rate_player` กันการให้คะแนนตัวเองและก๊วนเดียวกันไว้แล้วตอนเขียน แต่ตรงนี้
    ตรวจซ้ำ เพราะสมาชิกก๊วนย้ายได้หลังให้คะแนนไปแล้ว และเพราะกติกาที่สำคัญ
    ขนาดนี้ไม่ควรฝากไว้กับด่านเดียว

    `manners >= 4` เป็นการตีความคำว่า "ชื่นชม" — สเปกไม่ได้กำหนดเกณฑ์ไว้
    แต่การให้ badge น้ำใจนักกีฬาจากคะแนนมารยาท 1 เต็ม 5 คงไม่ใช่สิ่งที่ตั้งใจ
  */
  (select distinct on (pi.ratee_id) pi.ratee_id, '05-fair-play', pi.tournament_id
   from public.player_impressions pi
   where pi.manners >= 4
     and pi.rater_id <> pi.ratee_id
     and exists (select 1 from played p
                 where p.user_id = pi.ratee_id and p.tournament_id = pi.tournament_id)
     and not exists (
       select 1 from public.tournament_groups_of(pi.tournament_id, pi.rater_id) g
       where g in (select public.tournament_groups_of(pi.tournament_id, pi.ratee_id))
     )
   order by pi.ratee_id, pi.created_at, pi.tournament_id)

  union all
  -- 06 แข่งกับก๊วนต่างกันครบสามก๊วน · นับจากแมตช์ที่ยืนยัน ไม่ใช่การสมัคร
  (select p.user_id, '06-three-squads', null::uuid
   from played p
   group by p.user_id
   having count(distinct p.opp_group) >= 3);

  -- ใบใหม่ · `do nothing` เพื่อให้ awarded_at ของใบเดิมไม่ขยับ
  --
  -- วนทีละแถวเพื่อเขียน app_log ไม่ใช่เพราะต้องวน แต่เพราะการให้และการถอน badge
  -- ต้องมีร่องรอย — โดยเฉพาะการถอน ซึ่งเป็นของที่หายไปจากหน้าจอผู้ใช้
  for v_row in
    with ins as (
      insert into public.player_badges (user_id, badge_id, tournament_id)
      select t.user_id, t.badge_id, t.tournament_id from tmp_badge_target t
      on conflict (user_id, badge_id) do nothing
      returning user_id, badge_id
    ) select * from ins
  loop
    perform public.app_log(null, 'player_badge', v_row.user_id, null,
      'badge.awarded', null, v_row.badge_id,
      jsonb_build_object('badgeId', v_row.badge_id));
  end loop;

  -- ใบที่ไม่เข้าเกณฑ์แล้ว (ผลแมตช์ถูกยกเลิกหรือแก้)
  for v_row in
    with del as (
      delete from public.player_badges pb
      where not exists (
        select 1 from tmp_badge_target t
        where t.user_id = pb.user_id and t.badge_id = pb.badge_id
      )
      returning user_id, badge_id
    ) select * from del
  loop
    perform public.app_log(null, 'player_badge', v_row.user_id, null,
      'badge.revoked', v_row.badge_id, null,
      jsonb_build_object('badgeId', v_row.badge_id));
  end loop;
end;
$$;

revoke execute on function public.recompute_player_badges() from public, anon, authenticated;
grant execute on function public.recompute_player_badges() to service_role;

-- ---------------------------------------------------------------------------
-- ต่อเข้ากับจุดที่ชุดแมตช์ที่ยืนยันแล้ว หรือสถานะทัวร์นาเมนต์ เปลี่ยน
--
-- สามจุดเท่านั้น: ยืนยันผล · ยกเลิกผล · ปิดงานที่แข่งจบแล้ว
-- dispute ไม่ต้อง เพราะแมตช์ที่ถูกโต้แย้งยังไม่เคยเข้าชุดตั้งแต่แรก
--
-- เนื้อฟังก์ชันคัดลอกมาจากของเดิมทั้งดุ้น เติมเฉพาะบรรทัดที่เรียก
-- `recompute_player_badges()` — แพตเทิร์นเดียวกับที่ LSN-0031 ทำกับคะแนนฝีมือ
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_match(p_match_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_m    public.matches%rowtype;
  v_recorder_side char;
  v_user_side     char;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'reason', 'match_not_found');
  end if;
  if v_m.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', 'confirmed');
  end if;
  if v_m.status = 'voided' then
    return jsonb_build_object('ok', false, 'reason', 'match_voided');
  end if;

  -- ตรวจ "คนบันทึกเอง" ก่อนคำนวณฝั่ง ไม่งั้นสาขานี้ไม่มีวันถูกเรียกถึง เพราะ
  -- ฝั่งของคนบันทึกย่อมเท่ากับฝั่งของตัวเองเสมอ แล้ว same_side_cannot_confirm
  -- จะตอบไปก่อน — เหตุผลที่ผู้ใช้เห็นจึงเคยเป็นคนละเรื่องกับสิ่งที่เกิดขึ้นจริง
  if v_user = v_m.recorded_by then
    return jsonb_build_object('ok', false, 'reason', 'recorder_cannot_confirm');
  end if;

  -- ผู้บันทึกอยู่ฝั่งไหน
  v_recorder_side := case
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_a_group_id and user_id = v_m.recorded_by) then 'a'
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_b_group_id and user_id = v_m.recorded_by) then 'b'
    else 'h'   -- เจ้าภาพที่ไม่ได้อยู่ทั้งสองก๊วน
  end;

  -- คนหนึ่งอยู่ได้หลายก๊วน (LSN-0026 ตัดสินไว้) จึงเป็นไปได้ที่เขาอยู่ทั้งสองก๊วน
  -- ในแมตช์เดียวกัน คนแบบนั้น **ยืนยันไม่ได้** เพราะเขาอยู่ฝั่งผู้บันทึกด้วย
  -- เขียนไว้ชัด ๆ แทนที่จะปล่อยให้ลำดับของ CASE เป็นคนตัดสินโดยบังเอิญ
  if exists (select 1 from public.group_members
             where group_id = v_m.side_a_group_id and user_id = v_user)
     and exists (select 1 from public.group_members
                 where group_id = v_m.side_b_group_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'in_both_sides_cannot_confirm');
  end if;

  v_user_side := case
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_a_group_id and user_id = v_user) then 'a'
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_b_group_id and user_id = v_user) then 'b'
    else null
  end;

  if v_user_side is null then
    return jsonb_build_object('ok', false, 'reason', 'not_in_match');
  end if;
  -- เพื่อนร่วมก๊วนของผู้บันทึกยืนยันแทนไม่ได้
  if v_user_side = v_recorder_side then
    return jsonb_build_object('ok', false, 'reason', 'same_side_cannot_confirm');
  end if;
  update public.matches
  set status = 'confirmed', confirmed_by = v_user, confirmed_at = now()
  where id = p_match_id;

  perform public.app_log(v_user, 'match', p_match_id, null, 'match.confirmed',
    v_m.status::text, 'confirmed', '{}'::jsonb);


  -- คะแนนฝีมือคิดใหม่ทั้งชุดจากแมตช์ที่ยืนยันแล้ว (LSN-0031)
  perform public.recompute_player_skill();

  -- badge คิดใหม่ด้วยเหตุผลเดียวกัน — ชุดแมตช์ที่ยืนยันแล้วเพิ่งเปลี่ยน (LSN-0028)
  perform public.recompute_player_badges();
  return jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$function$;

CREATE OR REPLACE FUNCTION public.void_match(p_match_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_user uuid := auth.uid();
  v_m    public.matches%rowtype;
begin
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'reason', 'match_not_found');
  end if;
  if not public.is_tournament_host(v_m.tournament_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_host');
  end if;
  if v_m.status = 'voided' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  update public.matches
  set status = 'voided', voided_by = v_user, voided_at = now(),
      void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_match_id;

  perform public.app_log(v_user, 'match', p_match_id, null, 'match.voided',
    v_m.status::text, 'voided', jsonb_build_object('reason', p_reason));


  -- คะแนนฝีมือคิดใหม่ทั้งชุดจากแมตช์ที่ยืนยันแล้ว (LSN-0031)
  perform public.recompute_player_skill();

  -- badge คิดใหม่ด้วยเหตุผลเดียวกัน — ชุดแมตช์ที่ยืนยันแล้วเพิ่งเปลี่ยน (LSN-0028)
  perform public.recompute_player_badges();
  return jsonb_build_object('ok', true, 'status', 'voided');
end;
$function$;

CREATE OR REPLACE FUNCTION public.complete_finished_tournaments()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select id, status from public.tournaments
    -- allowlist ไม่ใช่ denylist — บทเรียนจาก LSN-0020 · LSN-0029 · LSN-0030
    --
    -- `ready` คือสถานะที่ประตูครบสามบานแล้ว ส่วน `booked` อยู่ใน enum และแปลว่า
    -- ได้คอร์ตแล้วเหมือนกัน ตอนนี้ยังไม่มีโค้ดไหนตั้งค่านั้น แต่ถ้าวันหนึ่งมี
    -- งานพวกนั้นต้องจบได้ด้วย ไม่ใช่ค้างเงียบ ๆ แบบที่ตั๋วนี้กำลังแก้อยู่
    --
    -- `draft` กับ `open` ไม่รวม เพราะงานที่ไม่เคยพร้อมแข่งไม่ได้ "จบ" มันไม่เคยเกิด
    -- ส่วนงานที่เลยกำหนดปิดรับสมัครโดยทีมไม่ครบเป็นหน้าที่ของ
    -- `close_unfilled_tournaments()` ซึ่งยกเลิกและคืนเงินให้
    where status in ('ready', 'booked')
      and ends_at <= now()
    for update skip locked
  loop
    update public.tournaments
    set status = 'completed', updated_at = now()
    where id = v_row.id;

    perform public.app_log(null, 'tournament', v_row.id, null,
      'tournament.completed', v_row.status::text, 'completed', '{}'::jsonb);

    v_count := v_count + 1;
  end loop;

  -- badge 01 กับ 04 ขึ้นกับสถานะ `completed` งานที่เพิ่งปิดจึงต้องคิดใหม่ (LSN-0028)
  if v_count > 0 then
    perform public.recompute_player_badges();
  end if;

  return jsonb_build_object('completedTournaments', v_count);
end;
$function$;

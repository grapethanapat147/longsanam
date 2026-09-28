-- Badge หลังจบทัวร์นาเมนต์ (LSN-0028)
--
-- ด่านที่ต้องเฝ้ามีสามกลุ่ม
--   1. คิดซ้ำแล้วต้องได้ชุดเดิม และ `awarded_at` ต้องไม่ขยับ
--   2. อะไรที่ *ไม่ควร* ได้ badge แล้วได้ — ให้คะแนนตัวเอง · ก๊วนเดียวกัน ·
--      งานสองก๊วนที่ผลิตแชมป์ · การสมัครที่ไม่ได้ลงสนาม
--   3. อะไรที่ *ไม่ควร* ถูกแตะโดยฟีเจอร์นี้ — player_credit และคะแนนฝีมือ

begin;
select plan(19);

set local role postgres;

create temporary table t on commit drop as
select id from public.tournaments where public_code = 'TOURN01';

-- เริ่มจากกระดานเปล่า เพื่อให้แต่ละข้อคุมข้อมูลของตัวเองได้
delete from public.matches where tournament_id is not null;
delete from public.player_impressions where tournament_id is not null;
delete from public.player_badges where user_id is not null;

create or replace function pg_temp.add_match(
  p_tournament uuid, p_ga uuid, p_gb uuid, p_pa uuid[], p_pb uuid[],
  p_sa integer, p_sb integer, p_status public.match_status default 'confirmed'
) returns void language plpgsql as $$
begin
  insert into public.matches
    (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
     score_a, score_b, played_at, status, recorded_by, confirmed_by, confirmed_at)
  values (p_tournament, p_ga, p_gb, p_pa, p_pb, p_sa, p_sb, now() - interval '1 hour',
          p_status, p_pa[1],
          case when p_status = 'confirmed' then p_pb[1] end,
          case when p_status = 'confirmed' then now() end);
end;
$$;

create or replace function pg_temp.badges_of(p_user uuid) returns text[]
language sql as $$
  select coalesce(array_agg(badge_id order by badge_id), '{}')
  from public.player_badges where user_id = p_user;
$$;

-- ---------------------------------------------------------------------------
-- กลุ่ม 1 — คิดซ้ำได้ผลเดิม
-- ---------------------------------------------------------------------------

select public.recompute_player_badges();

select is(pg_temp.badges_of('11111111-1111-4111-8111-000000000001'), '{}'::text[],
  'ไม่มีแมตช์ก็ไม่มี badge');

select pg_temp.add_match((select id from t),
  'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 15);
select public.recompute_player_badges();

select is(pg_temp.badges_of('11111111-1111-4111-8111-000000000001'),
  array['02-new-opponents'],
  'จบแมตช์แรกที่ยืนยันแล้วได้ใบคู่แข่งใหม่');

select public.recompute_player_badges();
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001'),
  1, 'คิดซ้ำสามครั้งแล้วยังมีแถวเดียว');

/*
  ⚠️ ห้ามเทียบ `awarded_at` กับค่าที่เก็บไว้ก่อนหน้าในทรานแซกชันเดียวกัน
  `now()` คืนเวลาเริ่มทรานแซกชัน ไม่ใช่เวลาปัจจุบัน ค่าจึงเท่ากันเสมอแม้โค้ดจะ
  เขียนทับด้วย `do update set awarded_at = now()` — เทสแบบนั้นเขียวโดยไม่ได้
  เฝ้าอะไร (พิสูจน์แล้วตอน falsify)

  ย้อนเวลาให้เป็นค่าที่ `now()` ผลิตไม่ได้ แล้วดูว่ามันรอด จึงจะจับการเขียนทับได้
*/
update public.player_badges set awarded_at = timestamptz '2020-01-01 00:00:00+00'
where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '02-new-opponents';

select public.recompute_player_badges();

select is(
  (select awarded_at from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '02-new-opponents'),
  timestamptz '2020-01-01 00:00:00+00',
  'awarded_at ไม่ขยับเมื่อคิดซ้ำ — `do nothing` ไม่ใช่ `do update`');

-- ---------------------------------------------------------------------------
-- กลุ่ม 3 — สองด่านที่ฟีเจอร์นี้ห้ามแตะ
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.credit_events
   where reason ilike '%badge%'),
  0, 'การให้ badge ไม่แตะ player_credit เลย');

select is(
  (select count(*)::integer from public.player_skill
   where updated_at > now() - interval '1 second' and matches_played = 0),
  0, 'การให้ badge ไม่สร้างแถวคะแนนฝีมือลอย ๆ');

select cmp_ok(
  (select count(*)::integer from public.audit_logs
   where entity_type = 'player_badge' and action = 'badge.awarded'),
  '>=', 2, 'การให้ badge เขียน audit log');

-- ---------------------------------------------------------------------------
-- 05 น้ำใจนักกีฬา — สองกรณีที่ห้ามให้
-- ---------------------------------------------------------------------------

/*
  ประเมินตัวเอง — ด่านจริงอยู่ที่ **constraint ของตาราง** ไม่ใช่ที่กติกา badge
  แถวแบบนั้นแทรกไม่ได้เลย เทสจึงปักด่านนั้นแทนที่จะแทรกแล้วค่อยดูว่าได้ badge ไหม
  ซึ่งเป็นการเฝ้าของที่เกิดขึ้นไม่ได้อยู่แล้ว
*/
select throws_ok(
  $$ insert into public.player_impressions
       (tournament_id, rater_id, ratee_id, punctuality, manners, fun)
     select id, '11111111-1111-4111-8111-000000000001',
            '11111111-1111-4111-8111-000000000001', 5, 5, 5
     from public.tournaments where public_code = 'TOURN01' $$,
  '23514',
  'new row for relation "player_impressions" violates check constraint "player_impressions_not_self"',
  'ประเมินตัวเองถูกปฏิเสธตั้งแต่ระดับตาราง');

-- คนก๊วนเดียวกันชื่นชม (บอส อยู่ แบดเย็นลาดพร้าว เหมือน ก้อง)
insert into public.player_impressions (tournament_id, rater_id, ratee_id, punctuality, manners, fun)
values ((select id from t), '11111111-1111-4111-8111-000000000003',
        '11111111-1111-4111-8111-000000000001', 5, 5, 5);
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '05-fair-play'),
  0, 'คนก๊วนเดียวกันชื่นชมไม่นับ');

/*
  คู่แข่งจริงชื่นชม

  ⚠️ ใช้ มีน (0004) ไม่ใช่ แนน (0002) — seed ใส่ แนน ไว้ใน **ทั้งสองก๊วน**
  กติกา "ห้ามก๊วนเดียวกัน" จึงตัดเธอออกอย่างถูกต้อง ถ้าใช้ แนน เทสจะแดง
  ทั้งที่โค้ดทำงานถูก (กับดักเดียวกับที่เจอใน tournament_paid_groups.test.sql)
*/
delete from public.player_impressions where rater_id = '11111111-1111-4111-8111-000000000003';
insert into public.player_impressions (tournament_id, rater_id, ratee_id, punctuality, manners, fun)
values ((select id from t), '11111111-1111-4111-8111-000000000004',
        '11111111-1111-4111-8111-000000000001', 5, 5, 5);
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '05-fair-play'),
  1, 'คู่แข่งจากก๊วนอื่นชื่นชมแล้วได้ใบน้ำใจนักกีฬา');

-- มารยาทต่ำไม่ใช่คำชื่นชม
update public.player_impressions set manners = 2
where rater_id = '11111111-1111-4111-8111-000000000004';
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '05-fair-play'),
  0, 'คะแนนมารยาทต่ำไม่ใช่คำชื่นชม และใบที่เคยให้ถูกถอนคืน');

select cmp_ok(
  (select count(*)::integer from public.audit_logs
   where entity_type = 'player_badge' and action = 'badge.revoked'),
  '>=', 1, 'การถอน badge เขียน audit log');

-- ---------------------------------------------------------------------------
-- 04 แชมป์ — ขั้นต่ำสี่ก๊วน และเสมอกันไม่ผลิตแชมป์
-- ---------------------------------------------------------------------------

-- งานสองก๊วนที่มีผู้ชนะชัดเจน ต้องไม่ให้ใบแชมป์
update public.tournaments set status = 'completed' where id = (select id from t);
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges where badge_id = '04-champion'),
  0, 'งานสองก๊วนไม่ผลิตแชมป์ แม้จะมีผู้ชนะชัดเจน');

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '01-first-tournament'),
  1, 'งานที่จบแล้วและลงสนามจริงได้ใบทัวร์นาเมนต์แรก');

-- เติมให้ครบสี่ก๊วน
insert into public.groups (id, name, sport_id, home_district, created_by)
values ('eeeeeeee-0000-4000-8000-00000000000a', 'ก๊วนเทสสาม',
        (select id from public.sports where slug = 'badminton'), 'เทส',
        '11111111-1111-4111-8111-000000000005'),
       ('eeeeeeee-0000-4000-8000-00000000000b', 'ก๊วนเทสสี่',
        (select id from public.sports where slug = 'badminton'), 'เทส',
        '11111111-1111-4111-8111-000000000006');

insert into public.tournament_teams (tournament_id, group_id)
values ((select id from t), 'eeeeeeee-0000-4000-8000-00000000000a'),
       ((select id from t), 'eeeeeeee-0000-4000-8000-00000000000b');

select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '04-champion'),
  1, 'ครบสี่ก๊วนแล้วผู้ชนะได้ใบแชมป์');

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000002' and badge_id = '04-champion'),
  0, 'ฝ่ายแพ้ไม่ได้ใบแชมป์');

-- ---------------------------------------------------------------------------
-- 06 นับเฉพาะแมตช์ที่ยืนยัน ไม่นับการสมัคร
-- ---------------------------------------------------------------------------

-- ก้อง อยู่ในงานที่มีสี่ก๊วนแล้ว แต่เจอจริงแค่ก๊วนเดียว
select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '06-three-squads'),
  0, 'สมัครร่วมงานกับสี่ก๊วนแต่ยังไม่ได้เจอจริง ไม่ได้ใบเพื่อนร่วมสนาม');

-- เจอเพิ่มอีกสองก๊วนแบบยืนยันผลแล้ว
select pg_temp.add_match((select id from t),
  'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-00000000000a',
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000005']::uuid[], 21, 10);
select pg_temp.add_match((select id from t),
  'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-00000000000b',
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000006']::uuid[], 21, 12, 'recorded');
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '06-three-squads'),
  0, 'แมตช์ที่ยังไม่ยืนยันไม่นับเป็นก๊วนที่สาม');

update public.matches set status = 'confirmed', confirmed_at = now(),
       confirmed_by = '11111111-1111-4111-8111-000000000006'
where status = 'recorded';
select public.recompute_player_badges();

select is(
  (select count(*)::integer from public.player_badges
   where user_id = '11111111-1111-4111-8111-000000000001' and badge_id = '06-three-squads'),
  1, 'ยืนยันครบสามก๊วนแล้วได้ใบเพื่อนร่วมสนาม');

select * from finish();
rollback;

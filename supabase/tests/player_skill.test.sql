-- คะแนนฝีมือจากผลแมตช์ (LSN-0031)
--
-- สเปกเรียกฟีเจอร์นี้ว่า "เรื่องที่อันตรายที่สุด" เพราะคะแนนที่กำหนดรุ่นมีมูลค่าให้โกง
-- ด่านที่ต้องเฝ้าจึงมีสองกลุ่ม
--   1. อะไรที่ *ไม่ควร* ขยับคะแนน แล้วมันขยับ — ผลที่ยังไม่ยืนยัน · ผลที่ถูกยกเลิก
--   2. อะไรที่ *ไม่ควร* ถูกแตะโดยฟีเจอร์นี้เลย — player_credit
--
-- เทสส่วนใหญ่ใส่แมตช์ตรงเข้าตารางแล้วสั่งคิดใหม่ เพราะสิ่งที่กำลังทดสอบคือ
-- **สูตร** ไม่ใช่เส้นทางของ RPC ซึ่ง matches.test.sql ปักไว้ครบแล้ว

begin;
select plan(14);

set local role postgres;

create temporary table t on commit drop as
select id from public.tournaments where public_code = 'TOURN01';

-- ล้างแมตช์ของ seed ออกก่อน เพื่อให้ทุกคนเริ่มที่ 1000 เท่ากัน
delete from public.matches;
select public.recompute_player_skill();

select is(
  (select count(*)::integer from public.player_skill),
  0, 'ไม่มีแมตช์ก็ไม่มีแถวคะแนน');

-- ---------------------------------------------------------------------------
-- helper: ใส่แมตช์หนึ่งแถว
-- ---------------------------------------------------------------------------

create or replace function pg_temp.add_match(
  p_a uuid[], p_b uuid[], p_sa integer, p_sb integer,
  p_status public.match_status, p_when timestamptz
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.matches
    (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
     score_a, score_b, played_at, status, recorded_by, confirmed_by, confirmed_at)
  select (select id from t), 'eeeeeeee-0000-4000-8000-000000000001',
         'eeeeeeee-0000-4000-8000-000000000002', p_a, p_b, p_sa, p_sb, p_when, p_status,
         '11111111-1111-4111-8111-000000000001',
         case when p_status = 'confirmed'
              then '11111111-1111-4111-8111-000000000004'::uuid end,
         case when p_status = 'confirmed' then now() end
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- ชนะขึ้น แพ้ลง และเฉพาะผลที่ยืนยันแล้วเท่านั้นที่นับ
-- ---------------------------------------------------------------------------

select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000004']::uuid[],
  21, 15, 'confirmed', now() - interval '3 hours');
select public.recompute_player_skill();

select is(
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  1020, 'ผู้ชนะได้คะแนนเพิ่ม (K=40 ตอนยังไม่ยืนยัน คูณ 0.5)');

select is(
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000004'),
  980, 'ผู้แพ้เสียคะแนนเท่ากับที่ผู้ชนะได้');

-- แมตช์ที่ยังไม่ยืนยันต้องไม่ขยับอะไรเลย
select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000004']::uuid[],
  21, 3, 'recorded', now() - interval '2 hours');
select public.recompute_player_skill();

select is(
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  1020, 'ผลที่ยังไม่ยืนยันไม่ขยับคะแนน');

-- แมตช์ที่ถูกโต้แย้งก็ต้องไม่ขยับ
update public.matches set status = 'disputed'
where status = 'recorded';
select public.recompute_player_skill();

select is(
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  1020, 'ผลที่ถูกโต้แย้งไม่ขยับคะแนน');

-- ---------------------------------------------------------------------------
-- ยกเลิกผลแล้วคะแนนต้องกลับไปเท่าก่อนมีแมตช์นั้น
--
-- ข้อนี้คือเหตุผลทั้งหมดที่เลือกคิดใหม่ทั้งชุดแทนการบวกสะสม
-- ---------------------------------------------------------------------------

select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000004']::uuid[],
  21, 9, 'confirmed', now() - interval '1 hour');
select public.recompute_player_skill();

select isnt(
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  1020, 'แมตช์ที่สองที่ยืนยันแล้วขยับคะแนนจริง');

update public.matches set status = 'voided'
where played_at = (select max(played_at) from public.matches where status = 'confirmed');
select public.recompute_player_skill();

select is(
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  1020, 'ยกเลิกผลแล้วคะแนนกลับไปเท่าก่อนมีแมตช์นั้นเป๊ะ');

select is(
  (select matches_played from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  1, 'จำนวนแมตช์ก็ถอยกลับด้วย ไม่ได้ค้างไว้');

-- ---------------------------------------------------------------------------
-- ชนะฝั่งที่แข็งกว่าต้องได้มากกว่าชนะฝั่งที่อ่อนกว่า
--
-- ถ้าข้อนี้พัง แปลว่าสูตรไม่ได้ดูคะแนนคู่แข่งเลย ซึ่งจะทำให้การไล่ถล่มมือใหม่
-- เป็นวิธีไต่อันดับที่เร็วที่สุด
-- ---------------------------------------------------------------------------

set local role postgres;
delete from public.matches;
-- ดันให้ บอส แข็งกว่า มีน ชัด ๆ ด้วยผลจริง แล้วค่อยวัด
select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000003']::uuid[],
  array['11111111-1111-4111-8111-000000000004']::uuid[],
  21, 5, 'confirmed', now() - interval '10 hours');
select public.recompute_player_skill();

create temporary table baseline on commit drop as
select
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000003') as boss,
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000004') as meen;

-- ก้อง (1000) ชนะ บอส (แข็งกว่า)
select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000003']::uuid[],
  21, 19, 'confirmed', now() - interval '5 hours');
select public.recompute_player_skill();

create temporary table beat_strong on commit drop as
select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001';

-- ย้อนกลับ แล้วให้ ก้อง ชนะ มีน (อ่อนกว่า) แทน
delete from public.matches where side_b_players = array['11111111-1111-4111-8111-000000000003']::uuid[];
select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000001']::uuid[],
  array['11111111-1111-4111-8111-000000000004']::uuid[],
  21, 19, 'confirmed', now() - interval '5 hours');
select public.recompute_player_skill();

select cmp_ok(
  (select rating from beat_strong), '>',
  (select rating from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  'ชนะฝั่งที่แข็งกว่าได้คะแนนมากกว่าชนะฝั่งที่อ่อนกว่า');

-- ---------------------------------------------------------------------------
-- ผู้เล่นในฝั่งเดียวกันได้เดลต้าเท่ากัน — ผลเป็นของทีม ไม่ใช่ของคน
-- ---------------------------------------------------------------------------

delete from public.matches;
select pg_temp.add_match(
  array['11111111-1111-4111-8111-000000000001',
        '11111111-1111-4111-8111-000000000003']::uuid[],
  array['11111111-1111-4111-8111-000000000004']::uuid[],
  21, 11, 'confirmed', now() - interval '1 hour');
select public.recompute_player_skill();

select is(
  (select count(distinct rating)::integer from public.player_skill
   where user_id in ('11111111-1111-4111-8111-000000000001',
                     '11111111-1111-4111-8111-000000000003')),
  1, 'คู่ที่ลงด้วยกันได้คะแนนเท่ากันเป๊ะ');

-- ---------------------------------------------------------------------------
-- provisional และ tier
-- ---------------------------------------------------------------------------

select is(
  (select provisional from public.player_skill where user_id = '11111111-1111-4111-8111-000000000001'),
  true, 'แข่งไม่ถึงสิบแมตช์ยังเป็น provisional');

select is(
  array[public.skill_tier_of(850)::text, public.skill_tier_of(950)::text,
        public.skill_tier_of(1050)::text, public.skill_tier_of(1150)::text,
        public.skill_tier_of(1250)::text, public.skill_tier_of(1400)::text],
  array['N','S','P','C','B','A'],
  'รุ่นตรงกับตารางเกณฑ์ทุกช่วง');

-- ---------------------------------------------------------------------------
-- สองด่านที่ทั้งฟีเจอร์นี้ตั้งใจปิด
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.credit_events
   where reason ilike '%match%' or reason ilike '%skill%'),
  0, 'การแข่งไม่แตะ player_credit เลย');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}', true);
select throws_ok(
  $$ update public.player_skill set rating = 9999
     where user_id = '11111111-1111-4111-8111-000000000001' $$,
  '42501',
  'permission denied for table player_skill',
  'ผู้ใช้เขียนคะแนนตัวเองไม่ได้ — ถ้าเขียนได้ก็เท่ากับให้คะแนนตัวเอง');

select * from finish();
rollback;

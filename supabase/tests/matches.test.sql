-- บันทึกผลแมตช์ + ยืนยันสองฝั่ง (LSN-0030)
--
-- หัวใจของไฟล์นี้คือสามเทส: คนบันทึกยืนยันเองไม่ได้ · เพื่อนร่วมก๊วนยืนยันแทน
-- ไม่ได้ · และฐานข้อมูลเองก็ปฏิเสธแถวที่ผู้ยืนยันเป็นคนเดียวกับผู้บันทึก
-- ถ้าสามข้อนี้พัง คะแนนฝีมือใน LSN-0031 ก็ไร้ความหมายตั้งแต่วันแรก

begin;
select plan(29);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

set local role postgres;

-- เพิ่มสมาชิกคนที่สองให้ก๊วนเจ้าภาพ เพื่อทดสอบว่าเพื่อนร่วมก๊วนยืนยันแทนไม่ได้
insert into public.group_members (group_id, user_id, role)
values ('eeeeeeee-0000-4000-8000-000000000001',
        '11111111-1111-4111-8111-000000000005', 'member')
on conflict do nothing;

-- ดันงาน TOURN01 ให้พร้อมแข่ง
update public.tournaments set status = 'ready' where public_code = 'TOURN01';

create temporary table tt on commit drop as
select id as tid from public.tournaments where public_code = 'TOURN01';
grant select on tt to authenticated;

-- seed มีแมตช์อยู่ก่อนแล้ว จึงวัดเป็น **ส่วนต่างจากฐาน** ไม่ใช่ตัวเลขตายตัว
-- เทสที่ผูกกับจำนวนใน seed จะแดงทุกครั้งที่ seed โต ซึ่งไม่ใช่ความผิดของโค้ด
create temporary table base on commit drop as
select count(*)::integer as n from public.confirmed_matches(
  (select tid from tt));

-- ---------------------------------------------------------------------------
-- บันทึกผล
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000008');   -- ต้น ไม่อยู่ก๊วนไหนเลย
set local role authenticated;
select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000001']::uuid[],
    array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 15) ->> 'reason',
  'not_in_match', 'คนที่ไม่ได้อยู่ในแมตช์บันทึกผลไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');   -- ก้อง เจ้าของก๊วน A
select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000008']::uuid[],
    array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 15) ->> 'reason',
  'player_not_in_group', 'ใส่ผู้เล่นที่ไม่ได้อยู่ก๊วนฝั่งนั้นไม่ได้');

-- ---------------------------------------------------------------------------
-- รูปร่างของรายชื่อผู้เล่น
--
-- สามข้อนี้เจอตอน review ไม่ใช่ตอนเขียน — constraint เดิมเขียนว่า
-- `array_length(side_a_players, 1) between 1 and 2` ซึ่ง **ไม่กันอาเรย์ว่าง**
-- เพราะ array_length ของ '{}' คือ NULL และ CHECK ที่ได้ NULL คือ CHECK ที่ผ่าน
-- ---------------------------------------------------------------------------

select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    '{}'::uuid[],
    array['11111111-1111-4111-8111-000000000004']::uuid[], 21, 9) ->> 'reason',
  'bad_player_count', 'บันทึกแมตช์โดยไม่ใส่ผู้เล่นฝั่งหนึ่งเลยไม่ได้');

-- แนนอยู่ทั้ง GROUP01 และ GROUP02 จึงใส่ชื่อเธอทั้งสองฝั่งได้ถ้าไม่มีด่าน
-- ผลคือเธอแข่งกับตัวเอง และ LSN-0031 จะบวกและลบคะแนนคนเดียวกันจากแมตช์เดียว
select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000002']::uuid[],
    array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 9) ->> 'reason',
  'player_on_both_sides', 'ใส่ชื่อคนเดียวกันทั้งสองฝั่งไม่ได้');

select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000001',
          '11111111-1111-4111-8111-000000000001']::uuid[],
    array['11111111-1111-4111-8111-000000000004']::uuid[], 21, 9) ->> 'reason',
  'duplicate_player', 'ใส่ชื่อซ้ำในฝั่งเดียวกันไม่ได้');

-- ด่านต้องอยู่ที่ตารางด้วย ไม่ใช่แค่ใน RPC — เหตุผลเดียวกับ
-- matches_confirmer_is_not_recorder คือ RPC ตัวที่สองหรือ service_role
-- เขียนตรงเข้าตารางได้
set local role postgres;
select throws_ok(
  $$ insert into public.matches
       (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
        score_a, score_b, recorded_by)
     select tid, 'eeeeeeee-0000-4000-8000-000000000001',
            'eeeeeeee-0000-4000-8000-000000000002',
            '{}'::uuid[], array['11111111-1111-4111-8111-000000000004']::uuid[],
            21, 9, '11111111-1111-4111-8111-000000000001'
     from tt $$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_side_a_size"',
  'ฐานข้อมูลปฏิเสธฝั่งที่ไม่มีผู้เล่น แม้ insert ตรง ๆ');

select throws_ok(
  $$ insert into public.matches
       (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
        score_a, score_b, recorded_by)
     select tid, 'eeeeeeee-0000-4000-8000-000000000001',
            'eeeeeeee-0000-4000-8000-000000000002',
            array['11111111-1111-4111-8111-000000000002']::uuid[],
            array['11111111-1111-4111-8111-000000000002']::uuid[],
            21, 9, '11111111-1111-4111-8111-000000000001'
     from tt $$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_no_player_on_both_sides"',
  'ฐานข้อมูลปฏิเสธคนที่อยู่ทั้งสองฝั่ง แม้ insert ตรง ๆ');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;

select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000001']::uuid[],
    array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 15, 'คอร์ต 3') ->> 'status',
  'recorded', 'บันทึกผลได้ และเริ่มที่สถานะ recorded');

set local role postgres;
create temporary table mm on commit drop as
select id as mid from public.matches where score_a = 21 and score_b = 15;
grant select on mm to authenticated;

select is(
  (select count(*)::integer from public.confirmed_matches((select tid from tt)))
    - (select n from base),
  0, 'แมตช์ที่เพิ่งบันทึกยังไม่นับเป็นผล');

select is(
  (select court_label from public.matches where id = (select mid from mm)),
  'คอร์ต 3', 'court_label เก็บเป็นข้อความตามที่ตัดสินไว้');

-- ---------------------------------------------------------------------------
-- ยืนยัน — หัวใจของตั๋วนี้
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');   -- คนบันทึกเอง
set local role authenticated;
select is(
  public.confirm_match((select mid from mm)) ->> 'reason',
  'recorder_cannot_confirm', 'คนที่บันทึกยืนยันเองไม่ได้');

-- ⚠️ ข้อที่พลาดง่ายที่สุด — เช็คแค่ auth.uid() <> recorded_by จะปล่อยข้อนี้ผ่าน
select pg_temp.act_as('11111111-1111-4111-8111-000000000005');   -- จูน อยู่ก๊วนเดียวกับก้อง
select is(
  public.confirm_match((select mid from mm)) ->> 'reason',
  'same_side_cannot_confirm', 'เพื่อนร่วมก๊วนของผู้บันทึกยืนยันแทนไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000008');   -- ต้น ไม่อยู่ในแมตช์
select is(
  public.confirm_match((select mid from mm)) ->> 'reason',
  'not_in_match', 'คนนอกแมตช์ยืนยันไม่ได้');

-- แนนอยู่ทั้ง GROUP01 และ GROUP02 จึงอยู่ทั้งสองฝั่งของแมตช์นี้
-- คนแบบนั้นยืนยันไม่ได้ เพราะเขาอยู่ฝั่งผู้บันทึกด้วย
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
select is(
  public.confirm_match((select mid from mm)) ->> 'reason',
  'in_both_sides_cannot_confirm', 'คนที่อยู่ทั้งสองก๊วนในแมตช์เดียวกันยืนยันไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');   -- มีน อยู่แต่ก๊วน B
select is(
  public.confirm_match((select mid from mm)) ->> 'status',
  'confirmed', 'สมาชิกก๊วนฝั่งตรงข้ามยืนยันได้');

select is(
  (public.confirm_match((select mid from mm)) ->> 'replayed')::boolean,
  true, 'ยืนยันซ้ำได้ผลเท่าเดิม');

set local role postgres;
select is(
  (select count(*)::integer from public.confirmed_matches((select tid from tt)))
    - (select n from base),
  1, 'ยืนยันแล้วจึงนับเป็นผล');

-- ---------------------------------------------------------------------------
-- สกอร์ของแถวที่ยืนยันแล้วแก้ไม่ได้
--
-- ด่านจริงไม่ใช่ check constraint แต่เป็น "ไม่มีสิทธิ์ update เลย" —
-- revoke update ... from authenticated บวกกับที่ตาราง matches มีแต่ policy
-- ของ select ทางเดียวที่แก้ผลได้จึงเป็น void แล้วบันทึกใหม่ ตามที่ตั๋วตัดสิน
-- ปักเป็น errcode 42501 ไม่ใช่ "update แล้วได้ 0 แถว" เพราะถ้าวันหนึ่งมีคน
-- เพิ่ม policy ของ update เข้ามา เทสแบบนับแถวจะยังเขียว
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');   -- ก้อง คนบันทึกเอง
set local role authenticated;
select throws_ok(
  $$ update public.matches set score_a = 30
     where id = (select mid from mm) $$,
  '42501',
  'permission denied for table matches',
  'สกอร์ของแมตช์ที่ยืนยันแล้วแก้ในแถวเดิมไม่ได้');

set local role postgres;

-- ---------------------------------------------------------------------------
-- ฐานข้อมูลเองก็ต้องปฏิเสธ ไม่ใช่พึ่ง RPC อย่างเดียว
--
-- ปักถึง **ชื่อ constraint** เพราะถ้าเช็คแค่ SQLSTATE เทสจะเขียวต่อไปแม้
-- constraint ถูกถอดออกแล้วมี check อื่นในตารางไปดังแทน — บทเรียนจาก LSN-0024
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.matches
       (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
        score_a, score_b, status, recorded_by, confirmed_by, confirmed_at)
     select tid, 'eeeeeeee-0000-4000-8000-000000000001',
            'eeeeeeee-0000-4000-8000-000000000002',
            array['11111111-1111-4111-8111-000000000001']::uuid[],
            array['11111111-1111-4111-8111-000000000002']::uuid[],
            21, 10, 'confirmed',
            '11111111-1111-4111-8111-000000000001',
            '11111111-1111-4111-8111-000000000001', now()
     from tt $$,
  '23514',
  'new row for relation "matches" violates check constraint "matches_confirmer_is_not_recorder"',
  'ฐานข้อมูลปฏิเสธแถวที่ผู้ยืนยันเป็นคนเดียวกับผู้บันทึก แม้ insert ตรง ๆ');

-- ---------------------------------------------------------------------------
-- โต้แย้ง
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000001']::uuid[],
    array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 5) ->> 'status',
  'recorded', 'บันทึกแมตช์ที่สอง');

set local role postgres;
-- ระบุแถวด้วยสกอร์ที่ไม่ซ้ำกับของ seed เพราะ now() ใน Postgres คือเวลาของ
-- **ทรานแซกชัน** สองแมตช์ในทรานแซกชันเดียวกันจึงมี created_at เท่ากันเป๊ะ
-- order by created_at limit 1 จึงหยิบแถวไหนก็ได้
create temporary table m2 on commit drop as
select id as mid from public.matches where score_a = 21 and score_b = 5;
grant select on m2 to authenticated;

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;
select is(
  public.dispute_match((select mid from m2), 'สกอร์ไม่ตรงกับที่จำได้') ->> 'status',
  'disputed', 'ฝั่งตรงข้ามโต้แย้งผลได้');

-- โต้แย้งซ้ำต้องไม่เลื่อน disputed_at เพราะถ้าเลื่อนได้ ทีมที่เสียเปรียบก็กด
-- ซ้ำเพื่อดันแมตช์ขึ้นหัวคิวข้อพิพาทได้เรื่อย ๆ
select is(
  (public.dispute_match((select mid from m2), 'กดซ้ำ') ->> 'replayed')::boolean,
  true, 'โต้แย้งซ้ำได้ผลเท่าเดิม');

set local role postgres;
select is(
  (select count(*)::integer from public.confirmed_matches((select tid from tt)))
    - (select n from base),
  1, 'แมตช์ที่ disputed ไม่ถูกนับ เหมือนที่ยังไม่ยืนยัน');

-- ---------------------------------------------------------------------------
-- ยกเลิกผล — เฉพาะเจ้าภาพ และใช้กับผลที่ยืนยันแล้วได้
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');   -- มีน เป็นทีม ไม่ใช่เจ้าภาพ
set local role authenticated;
select is(
  public.void_match((select mid from mm), 'อยากลบผลที่แพ้') ->> 'reason',
  'not_host', 'ทีมใดทีมหนึ่ง void ผลไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');   -- ก้อง เจ้าของก๊วนเจ้าภาพ
select is(
  public.void_match((select mid from mm), 'กรอกสกอร์ผิด') ->> 'status',
  'voided', 'เจ้าภาพ void ผลที่ยืนยันแล้วได้');

set local role postgres;
select is(
  (select count(*)::integer from public.confirmed_matches((select tid from tt)))
    - (select n from base),
  0, 'แมตช์ที่ voided ไม่ถูกนับอีกต่อไป');

-- ---------------------------------------------------------------------------
-- allowlist ของสถานะทัวร์นาเมนต์
-- ---------------------------------------------------------------------------

update public.tournaments set status = 'cancelled' where public_code = 'TOURN01';
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  public.record_match((select tid from tt),
    'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
    array['11111111-1111-4111-8111-000000000001']::uuid[],
    array['11111111-1111-4111-8111-000000000002']::uuid[], 21, 3) ->> 'reason',
  'tournament_not_playable', 'บันทึกแมตช์ในงานที่ถูกยกเลิกไม่ได้');

-- ---------------------------------------------------------------------------
-- คนนอกอ่านไม่ได้ · เครดิตไม่ขยับ
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000008');
select is(
  (select count(*)::integer from public.matches), 0,
  'คนนอกทัวร์นาเมนต์อ่าน matches ไม่ได้เลย');

set local role postgres;
select is(
  (select count(*)::integer from public.credit_events
   where reason ilike '%match%' or reason ilike '%tournament%'),
  0, 'ไม่มี credit_events ที่เกิดจากแมตช์เลย');

select * from finish();
rollback;

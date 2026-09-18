-- รายการทัวร์นาเมนต์สาธารณะ (LSN-0036)
--
-- ด่านที่ต้องเฝ้ามีสองเรื่องเท่านั้น และทั้งคู่เป็นเรื่องของ "อะไรหลุดออกไปสาธารณะ"
--   1. งานที่ยังไม่เปิด หรือปิดไปแล้ว ต้องไม่โผล่
--   2. ฟิลด์ที่ไม่ได้ตั้งใจเปิด ต้องไม่ติดออกไปด้วย
--
-- ข้อสองปักด้วยการ **นับและระบุชื่อคีย์ทั้งชุด** ไม่ใช่เช็คว่า "ไม่มีคำว่า payment"
-- เพราะการเช็คแบบหลังจะเขียวต่อไปเมื่อมีคนเผลอเพิ่มคอลัมน์ชื่ออื่นที่ไม่ควรเปิด

begin;
select plan(9);

set local role postgres;

create temporary table tid on commit drop as
select id from public.tournaments where public_code = 'TOURN02';

-- ---------------------------------------------------------------------------
-- anon ต้องเรียกได้ เพราะหน้าค้นหาเปิดให้คนที่ยังไม่ล็อกอิน
-- ---------------------------------------------------------------------------

set local role anon;

select is(
  jsonb_typeof(public.public_open_tournaments()),
  'array', 'anon เรียกได้และได้อาเรย์กลับมา');

select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  1, 'งานที่เปิดรับสมัครอยู่โผล่ในรายการ');

-- ---------------------------------------------------------------------------
-- รูปร่างของข้อมูลที่หลุดออกสาธารณะ
-- ---------------------------------------------------------------------------

select is(
  (select array_agg(k order by k)
   from jsonb_array_elements(public.public_open_tournaments()) e,
        lateral jsonb_object_keys(e) k
   where e ->> 'publicCode' = 'TOURN02'),
  array['entryFeeThb','hostGroupName','maxTeams','minTeams','publicCode',
        'registrationDeadline','startsAt','teamCount','tier','title'],
  'คืนเฉพาะสิบฟิลด์ที่ตั้งใจเปิด ไม่มีอย่างอื่นติดมา');

-- ---------------------------------------------------------------------------
-- allowlist ของสถานะ — ทดสอบทีละสถานะที่ "ไม่ใช่ open"
--
-- ปักครบทุกสถานะ ไม่ใช่แค่ draft เพราะข้อผิดพลาดที่กลัวคือการเขียนเป็น
-- `status <> 'draft'` ซึ่งจะปล่อย cancelled และ completed หลุดออกไปด้วย
-- ---------------------------------------------------------------------------

set local role postgres;
update public.tournaments set status = 'draft' where public_code = 'TOURN02';
set local role anon;
select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  0, 'งาน draft ไม่โผล่');

set local role postgres;
update public.tournaments set status = 'ready' where public_code = 'TOURN02';
set local role anon;
select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  0, 'งาน ready ไม่โผล่');

set local role postgres;
update public.tournaments set status = 'cancelled' where public_code = 'TOURN02';
set local role anon;
select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  0, 'งาน cancelled ไม่โผล่');

set local role postgres;
update public.tournaments set status = 'completed' where public_code = 'TOURN02';
set local role anon;
select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  0, 'งาน completed ไม่โผล่');

-- ---------------------------------------------------------------------------
-- เลยกำหนดปิดรับสมัครแล้วต้องหายไป แม้สถานะยังเป็น open
--
-- สถานะนี้เกิดจริงทุกครั้งที่เลยกำหนด เพราะ close_unfilled_tournaments()
-- ทำงานตามรอบ ไม่ได้ทำงานทันทีที่ถึงเวลา
-- ---------------------------------------------------------------------------

set local role postgres;
update public.tournaments
set status = 'open', registration_deadline = now() - interval '1 minute'
where public_code = 'TOURN02';
set local role anon;
select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  0, 'เลยกำหนดปิดรับสมัครแล้วไม่โผล่ แม้สถานะยังเป็น open');

set local role postgres;
update public.tournaments
set registration_deadline = now() + interval '7 days'
where public_code = 'TOURN02';
set local role anon;
select is(
  (select count(*)::integer from jsonb_array_elements(public.public_open_tournaments()) e
   where e ->> 'publicCode' = 'TOURN02'),
  1, 'คืนกำหนดให้ยังไม่หมดแล้วกลับมาโผล่');

select * from finish();
rollback;

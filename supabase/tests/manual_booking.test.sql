-- ผู้จัดยืนยันคอร์ตเอง (LSN-0025). รันด้วย `npm run test:db`
--
-- Actors จาก supabase/seed.sql:
--   organizer 1111…0001 จัดทุกก๊วนใน seed
--   READY01 = ready_to_book · OPEN001 = open · BOOKED1 = booked · CANCEL1 = cancelled
--   แนน 1111…0002 เป็นผู้เล่น ไม่ใช่ผู้จัด

begin;
select plan(13);

-- fixture: seed ไม่มีก๊วน booking_failed เลย สร้างขึ้นจาก DRAFT01
-- (ไม่มีผู้เล่นก็ได้ เพราะข้อที่ทดสอบคือการย้ายสถานะและการล้าง failure_reason)
update public.sessions
set status = 'booking_failed', failure_reason = 'ลองครบทุกสนามที่อนุมัติแล้ว'
where public_code = 'DRAFT01';

-- ---------------------------------------------------------------------------
-- รูปแถวของ bookings — สอง nullable พร้อมกันเปิดรูปที่ไม่มีความหมายขึ้นมา
-- ---------------------------------------------------------------------------

select throws_ok($$
  insert into public.bookings (session_id, venue_id, court_id, starts_at, ends_at,
    status, price_thb, attempt_no, idempotency_key)
  values ((select id from public.sessions where public_code = 'READY01'),
    'bbbbbbbb-0000-4000-8000-000000000001', null,
    now(), now() + interval '2 hours', 'confirmed', 500, 1, 'shape-1')
$$, '23514', null, 'มีสนามแต่ไม่มีคอร์ต ถูกปฏิเสธที่ระดับฐานข้อมูล');

select throws_ok($$
  insert into public.bookings (session_id, starts_at, ends_at,
    status, price_thb, attempt_no, idempotency_key)
  values ((select id from public.sessions where public_code = 'READY01'),
    now(), now() + interval '2 hours', 'confirmed', 500, 1, 'shape-2')
$$, '23514', null, 'ไม่มีทั้งสนามในระบบและไม่มีชื่อสนามที่พิมพ์เอง ถูกปฏิเสธ');

-- bookings_price_thb_check เดิมยอม >= 0 ข้อนี้จึงปักของใหม่ ไม่ใช่ของเดิม
select throws_ok($$
  insert into public.bookings (session_id, manual_venue_name, starts_at, ends_at,
    status, price_thb, attempt_no, idempotency_key)
  values ((select id from public.sessions where public_code = 'READY01'),
    'คอร์ตแบดลุงหมี', now(), now() + interval '2 hours', 'confirmed', 0, 1, 'shape-3')
$$, '23514', null, 'การจองที่กรอกเอง ราคา ฿0 ถูกปฏิเสธ');

-- bookings_no_overlap กันซ้ำด้วย (court_id WITH =) และ null ไม่เท่ากับอะไรเลย
-- คอร์ตนอกระบบจึงไม่ไปกันคิวคอร์ตในระบบ แม้เวลาทับกันสนิท
select lives_ok($$
  insert into public.bookings (session_id, manual_venue_name, starts_at, ends_at,
    status, price_thb, attempt_no, idempotency_key)
  select b.session_id, 'คอร์ตแบดลุงหมี', b.starts_at, b.ends_at,
         'confirmed', 500, 2, 'shape-4'
  from public.bookings b where b.status = 'confirmed' and b.court_id is not null limit 1
$$, 'คอร์ตนอกระบบไม่ชนกับคอร์ตในระบบที่เวลาทับกันสนิท');

-- ---------------------------------------------------------------------------
-- allowlist ของสถานะ และขอบเขตสิทธิ์
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}';

-- open = เงินยังไม่ครบ ทางนี้ต้องปิด และก๊วนต้องไม่ขยับ
select is(
  public.confirm_court_manually(
    (select id from public.sessions where public_code = 'OPEN001'),
    'คอร์ตแบดลุงหมี', 600) ->> 'reason',
  'session_not_ready', 'ก๊วนที่เงินยังไม่ครบ ยืนยันคอร์ตไม่ได้');

select is(
  (select status::text from public.sessions where public_code = 'OPEN001'),
  'open', 'ก๊วนที่ถูกปฏิเสธต้องยังเป็น open ไม่ขยับ');

select is(
  public.confirm_court_manually(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'คอร์ตแบดลุงหมี', 600) ->> 'reason',
  'session_not_ready', 'ก๊วนที่จองแล้ว ยืนยันซ้ำไม่ได้');

-- ready_to_book → booked
select is(
  public.confirm_court_manually(
    (select id from public.sessions where public_code = 'READY01'),
    'คอร์ตแบดลุงหมี', 900) ->> 'ok',
  'true', 'ผู้จัดยืนยันคอร์ตจาก ready_to_book ได้');

select is(
  (select status::text from public.sessions where public_code = 'READY01'),
  'booked', 'ก๊วนกลายเป็น booked');

-- ราคาที่กรอกต้องเป็นฐานคิดเงินจริง ไม่ใช่ราคาคอร์ตที่อนุมัติไว้
-- ข้อนี้คือข้อที่พิสูจน์ว่าครึ่งแรกกับครึ่งหลังต่อกันติด
select is(
  (public.settle_session_costs(
     (select id from public.sessions where public_code = 'READY01'),
     100, 'equal') ->> 'totalThb')::integer,
  1000, 'settle คิดจากราคาที่ผู้จัดกรอก ฿900 บวกค่าลูก ฿100');

-- booking_failed คือเคสที่ตั๋วนี้มีไว้เพื่อ: ระบบลองแล้วไม่ได้ ผู้จัดไปหามาเอง
select is(
  public.confirm_court_manually(
    (select id from public.sessions where public_code = 'DRAFT01'),
    'คอร์ตแบดลุงหมี', 700) ->> 'ok',
  'true', 'ผู้จัดยืนยันคอร์ตจาก booking_failed ได้');

select ok(
  (select status = 'booked' and failure_reason is null
     from public.sessions where public_code = 'DRAFT01'),
  'ก๊วนกลายเป็น booked และ failure_reason ถูกล้าง');

-- คนที่ไม่ใช่ผู้จัดก๊วนนั้น
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-000000000002","role":"authenticated"}';
select is(
  public.confirm_court_manually(
    (select id from public.sessions where public_code = 'CANCEL1'),
    'คอร์ตแบดลุงหมี', 600) ->> 'reason',
  'not_organizer', 'คนที่ไม่ใช่ผู้จัด ยืนยันคอร์ตไม่ได้');

set local role postgres;
select * from finish();
rollback;

-- ใบสรุปก๊วน (LSN-0023). รันด้วย `npm run test:db`
--
-- Actors จาก supabase/seed.sql:
--   organizer 1111…0001 จัด OPEN001
--   OPEN001 มี 4 ที่นั่ง: paid_confirmed 3 · joined_pending_payment 1
--   ที่นั่ง eeee…0001 เป็น paid_confirmed ยอด ฿100

begin;
select plan(9);

-- ยังไม่ completed → ต้องได้ null ไม่ใช่ยอด
select is(
  public.session_receipt_public(
    (select id from public.sessions where public_code = 'OPEN001')),
  null, 'ก๊วนที่ยังเปิดรับอยู่ ไม่มีใบสรุป');

-- booked ก็ยังไม่พอ แม้ settle ไปแล้วก็ตาม
-- settle_session_costs() ยอมให้ settle ก๊วนที่ยัง booked ได้ ใบสรุปจึงต้องปฏิเสธเอง
update public.sessions set status = 'booked', settled_per_person_thb = 250
where public_code = 'OPEN001';
select is(
  public.session_receipt_public(
    (select id from public.sessions where public_code = 'OPEN001')),
  null, 'ก๊วนที่จองแล้วแต่ยังไม่เล่น ก็ยังไม่มีใบสรุป');

update public.sessions set status = 'completed' where public_code = 'OPEN001';

select is(
  (public.session_receipt_public(
     (select id from public.sessions where public_code = 'OPEN001')) ->> 'perHeadThb')::integer,
  250, 'ยอดต่อหัวมาจาก settled_per_person_thb เมื่อมี');

-- fallback: ถ้ายังไม่ settle ต้องใช้ยอดที่ผู้จัดตั้งไว้ตอนสร้างก๊วน
update public.sessions set settled_per_person_thb = null where public_code = 'OPEN001';
select is(
  (public.session_receipt_public(
     (select id from public.sessions where public_code = 'OPEN001')) ->> 'perHeadThb')::integer,
  100, 'ยังไม่ settle ก็ตกไปที่ budget_per_person_thb');
update public.sessions set settled_per_person_thb = 250 where public_code = 'OPEN001';

select is(
  (public.session_receipt_public(
     (select id from public.sessions where public_code = 'OPEN001')) ->> 'players')::integer,
  3, 'ไม่มีใครเช็คอิน จึงนับทุกคนที่ถือที่นั่ง — joined_pending_payment ไม่นับ');

-- ตัวหารต้องขยับตามเช็คอิน กติกาเดียวกับ settle_session_costs()
update public.session_participants set checked_in_at = now()
where id = 'eeeeeeee-0000-4000-8000-000000000001';
select is(
  (public.session_receipt_public(
     (select id from public.sessions where public_code = 'OPEN001')) ->> 'players')::integer,
  1, 'พอมีคนเช็คอิน ตัวหารเหลือเฉพาะคนที่เช็คอิน');
update public.session_participants set checked_in_at = null
where id = 'eeeeeeee-0000-4000-8000-000000000001';

-- สิ่งที่ไม่ได้คืน คือสิ่งที่หลุดไม่ได้
select bag_eq(
  $$select jsonb_object_keys(public.session_receipt_public(
      (select id from public.sessions where public_code = 'OPEN001')))$$,
  $$values ('players'),('paid'),('owing'),('perHeadThb'),('totalThb'),('title'),('startsAt')$$,
  'ผลลัพธ์มีเฉพาะคีย์ที่ตั้งใจ ไม่มีชื่อ ไม่มี id ผู้เล่น');

-- ขอบเขตสิทธิ์ สองด้าน ต้องจริงพร้อมกันทั้งคู่
select ok(
  has_function_privilege('anon', 'public.session_receipt_public(uuid)', 'execute'),
  'anon เรียก RPC ใบสรุปได้');

-- และเรียกแล้วได้ผลจริง ไม่ใช่แค่มีสิทธิ์บนกระดาษ
-- session_progress() ก็ถูก grant ให้ anon เหมือนกันแต่เป็น SECURITY INVOKER
-- พอ anon เรียกจึงตายที่ permission denied — ข้อนี้กันไม่ให้ซ้ำรอยนั้น
set local role anon;
select isnt(
  public.session_receipt_public(
    (select id from public.sessions where public_code = 'OPEN001')),
  null, 'anon เรียกแล้วได้ยอดจริง ไม่ใช่ permission denied');
set local role postgres;

select * from finish();
rollback;

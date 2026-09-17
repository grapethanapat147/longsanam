-- ตัวหาร "ใครนับว่าได้เล่น" (LSN-0024). รันด้วย `npm run test:db`
--
-- กติกานี้เคยอยู่ 6 ที่ และฝั่ง SQL ไม่เคยมีใครปักมันตรง ๆ เลย
-- มีแต่ปักผ่านผลลัพธ์ของ settle_session_costs() กับ session_receipt_public()
-- ไฟล์นี้ปักตัวกติกาเอง
--
-- Actors จาก supabase/seed.sql:
--   OPEN001 มี 4 ที่นั่ง: paid_confirmed 3 · joined_pending_payment 1

begin;
select plan(5);

-- ยังไม่มีใครเช็คอิน: นับทุกคนที่ถือที่นั่ง แต่ไม่นับคนที่ยังไม่จ่าย
select is(
  (select count(*)::integer from public.session_denominator(
     (select id from public.sessions where public_code = 'OPEN001'))),
  3, 'ไม่มีใครเช็คอิน นับทุกคนที่ถือที่นั่ง');

select is(
  (select count(*)::integer from public.session_denominator(
     (select id from public.sessions where public_code = 'OPEN001')) d
   where d.status = 'joined_pending_payment'),
  0, 'คนที่ยังไม่จ่าย ไม่เคยถูกนับ');

-- พอมีคนเช็คอิน ตัวหารหดเหลือเฉพาะคนที่มา
update public.session_participants set checked_in_at = now()
where id = 'eeeeeeee-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.session_denominator(
     (select id from public.sessions where public_code = 'OPEN001'))),
  1, 'พอมีคนเช็คอิน เหลือเฉพาะคนที่เช็คอิน');
update public.session_participants set checked_in_at = null
where id = 'eeeeeeee-0000-4000-8000-000000000001';

-- ข้อที่มีค่าที่สุด: คำถาม "มีใครเช็คอินไหม" ถามข้ามทุกสถานะ
-- คนที่เช็คอินแต่ยังไม่จ่าย ทำให้ตัวหารหด แต่ตัวเองไม่ถูกนับ
-- ถ้ากติกานี้ถามเฉพาะสถานะที่นับ ตัวหารจะกว้างเป็น 3 ซึ่งผิด
update public.session_participants set checked_in_at = now()
where session_id = (select id from public.sessions where public_code = 'OPEN001')
  and status = 'joined_pending_payment';
select is(
  (select count(*)::integer from public.session_denominator(
     (select id from public.sessions where public_code = 'OPEN001'))),
  0, 'คนที่เช็คอินแต่ยังไม่จ่าย ทำให้ตัวหารหด แต่ไม่ถูกนับเอง');

select is(
  (select count(*)::integer from public.session_denominator(
     '00000000-0000-4000-8000-000000000000'::uuid)),
  0, 'นัดที่ไม่มีอยู่ ได้ศูนย์แถว ไม่ใช่ error');

select * from finish();
rollback;

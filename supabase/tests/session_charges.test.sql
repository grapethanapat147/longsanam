-- รายการเก็บเงินเพิ่มหลังจบก๊วน (LSN-0024). รันด้วย `npm run test:db`
--
-- Actors จาก supabase/seed.sql:
--   organizer 1111…0001 จัดทุกก๊วน · แนน 1111…0002 เป็นผู้เล่น ไม่ใช่ผู้จัด
--   BOOKED1 = booked มี 8 ที่นั่ง paid_confirmed ทั้งหมด
--   OPEN001 = open มี 3 ที่นั่งที่นับ

begin;
select plan(19);

-- fixture: seed ไม่มีผู้เล่นรับเชิญเลย เพิ่มเข้า BOOKED1 หนึ่งคน
-- เพื่อทดสอบว่ามีส่วนแบ่งแต่ไม่มีหนี้
insert into public.session_participants
  (session_id, user_id, guest_name, status, amount_due_thb, payment_due_at)
select s.id, null, 'พี่เอก (เพื่อนก้อง)', 'paid_confirmed', 150, s.starts_at
from public.sessions s where s.public_code = 'BOOKED1';

-- snapshot ก่อนทำอะไร เอาไว้เทียบว่าของเดิมไม่ถูกแตะ
create temporary table before_state on commit drop as
select sp.id, sp.amount_due_thb, sp.status
from public.session_participants sp
where sp.session_id = (select id from public.sessions where public_code = 'BOOKED1');

create temporary table before_payments on commit drop as
select id, participant_id, amount_thb, status from public.payments;

-- temp table สร้างในฐานะ postgres · assertion ข้างล่างรันในฐานะ authenticated
grant select on before_state, before_payments to authenticated;

set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}';

-- ---------------------------------------------------------------------------
-- allowlist ของสถานะ และสิทธิ์
-- ---------------------------------------------------------------------------

select is(
  public.create_session_charge(
    (select id from public.sessions where public_code = 'OPEN001'),
    'ค่าลูกแบด', 300, 'all') ->> 'reason',
  'session_not_played', 'ก๊วนที่ยังไม่ได้เล่น สร้างรายการไม่ได้');

select is(
  public.create_session_charge(
    (select id from public.sessions where public_code = 'CANCEL1'),
    'ค่าลูกแบด', 300, 'all') ->> 'reason',
  'session_not_played', 'ก๊วนที่ยกเลิกแล้ว สร้างรายการไม่ได้');

-- ---------------------------------------------------------------------------
-- สร้างรายการ: split all / named และการปัดเศษ
-- ---------------------------------------------------------------------------

-- BOOKED1 ไม่มีใครเช็คอิน จึงนับทุกคนที่ถือที่นั่ง = 9 (8 + ผู้เล่นรับเชิญ)
select is(
  (public.create_session_charge(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'ค่าลูกแบด 3 ลูก', 100, 'all') ->> 'people')::integer,
  9, 'split all ลงทุกคนในตัวหาร รวมผู้เล่นรับเชิญ');

-- ฿100 หาร 9 = 11.1 ปัดขึ้นเป็น 12 — ผู้จัดรับส่วนต่าง กติกาเดียวกับ LSN-0021
select is(
  (select s.amount_thb from public.session_charge_shares s
   join public.session_charges c on c.id = s.charge_id
   where c.label = 'ค่าลูกแบด 3 ลูก' limit 1),
  12, 'ปัดขึ้น ผู้จัดรับส่วนต่าง');

select is(
  (public.create_session_charge(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'ค่าไม้ที่ยืม', 300, 'named',
    array['eeeeeeee-0000-4000-8000-000000000022',
          'eeeeeeee-0000-4000-8000-000000000023']::uuid[]) ->> 'people')::integer,
  2, 'split named เลือกผู้เล่นได้มากกว่าหนึ่งคน');

select is(
  public.create_session_charge(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'ค่าอะไรก็ไม่รู้', 300, 'named', '{}'::uuid[]) ->> 'reason',
  'no_participants', 'named ที่ไม่เลือกใครเลย ถูกปฏิเสธ');

-- ---------------------------------------------------------------------------
-- ยังไม่กดส่ง = ยังไม่มีหนี้ ยังไม่แจ้งใคร
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.payments p
   where not exists (select 1 from before_payments b where b.id = p.id)),
  0, 'ยังไม่กดส่ง payments ไม่เพิ่มขึ้นเลย');

-- นับนอก RLS: notifications_read ให้เห็นเฉพาะแถวของตัวเอง
-- ถ้านับในฐานะผู้จัด จะได้เลขของผู้จัดคนเดียว ไม่ใช่ของทั้งก๊วน
set local role postgres;
select is(
  (select count(*)::integer from public.notifications where kind = 'extra_charge'),
  0, 'ยังไม่กดส่ง ไม่มีใครได้รับแจ้งเตือน');
set local role authenticated;

-- ลบรายการที่ยังไม่ส่ง ต้องเงียบสนิท
-- สร้างรายการทิ้งขึ้นมาใหม่ เพราะ 'ค่าอะไรก็ไม่รู้' ข้างบนถูกปฏิเสธจึงไม่มีอยู่จริง
select ok(
  (public.create_session_charge(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'ค่าน้ำที่พิมพ์ผิด', 60, 'all') ->> 'ok')::boolean,
  'สร้างรายการทิ้งไว้ก่อนลบ');

select is(
  public.void_session_charge(
    (select id from public.session_charges where label = 'ค่าน้ำที่พิมพ์ผิด')) ->> 'ok',
  'true', 'ลบรายการฉบับร่างได้');

set local role postgres;
select is(
  (select count(*)::integer from public.notifications where kind = 'extra_charge'),
  0, 'ลบรายการที่ยังไม่ส่ง ไม่มีใครได้รับแจ้งเตือนเลย');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- กดส่ง — หนี้เกิดตรงนี้ และแจ้งหนึ่งครั้งต่อคน
-- ---------------------------------------------------------------------------

select is(
  (public.send_session_charges(
    (select id from public.sessions where public_code = 'BOOKED1')) ->> 'charges')::integer,
  2, 'ส่งสองบรรทัดที่ยังเป็นฉบับร่าง');

-- 9 คนมีส่วนแบ่งค่าลูก แต่ผู้เล่นรับเชิญไม่มีบัญชี จึงมี payment 8 + 2 (ค่าไม้) = 10
select is(
  (select count(*)::integer from public.payments p
   where not exists (select 1 from before_payments b where b.id = p.id)),
  10, 'payments เกิดเท่าจำนวนส่วนแบ่งของคนที่มีบัญชี');

-- ข้อที่มีค่าที่สุด: แจ้งหนึ่งครั้งต่อคน ไม่ใช่ต่อบรรทัด
-- แนนกับบอสโดนสองบรรทัด แต่ต้องได้แจ้งเตือนคนละแถวเดียว
set local role postgres;
select is(
  (select count(*)::integer from public.notifications where kind = 'extra_charge'),
  8, 'แจ้งเตือนหนึ่งแถวต่อคน ไม่ใช่ต่อบรรทัด');

select is(
  (select count(*)::integer from public.notifications
   where kind = 'extra_charge' and user_id = '11111111-1111-4111-8111-000000000002'),
  1, 'คนที่โดนสองบรรทัด ยังได้แจ้งเตือนแถวเดียว');
set local role authenticated;

-- ---------------------------------------------------------------------------
-- ผู้เล่นรับเชิญ · เครดิต · และของเดิมที่ห้ามแตะ
-- ---------------------------------------------------------------------------

select ok(
  (select not exists (
     select 1 from public.payments p where p.charge_share_id = s.id)
   from public.session_charge_shares s
   join public.session_participants sp on sp.id = s.participant_id
   where sp.guest_name is not null limit 1),
  'ผู้เล่นรับเชิญมีส่วนแบ่ง แต่ไม่มี payments');

select is(
  (select count(*)::integer from public.credit_events
   where reason like '%charge%'),
  0, 'รายการเพิ่มเติมไม่ทำให้เกิด credit_events เลย');

-- กติกาของ LSN-0021: ห้ามเขียนทับยอดที่ตกลงไปแล้ว
select is(
  (select count(*)::integer from public.session_participants sp
   join before_state b on b.id = sp.id
   where sp.amount_due_thb is distinct from b.amount_due_thb
      or sp.status is distinct from b.status),
  0, 'amount_due_thb และสถานะของทุกคนไม่ถูกแตะเลย');

-- ---------------------------------------------------------------------------
-- ลบรายการที่ส่งแล้ว — payment ที่ยัง pending กลายเป็น expired ไม่ใช่หายไป
-- ---------------------------------------------------------------------------

select is(
  (public.void_session_charge(
    (select id from public.session_charges where label = 'ค่าไม้ที่ยืม')) ->> 'paymentsExpired')::integer,
  2, 'ลบรายการที่ส่งแล้ว payment ที่ pending กลายเป็น expired');

set local role postgres;
select * from finish();
rollback;

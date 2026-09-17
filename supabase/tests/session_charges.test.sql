-- รายการเก็บเงินเพิ่มหลังจบนัด (LSN-0024). รันด้วย `npm run test:db`
--
-- Actors จาก supabase/seed.sql:
--   organizer 1111…0001 จัดทุกนัด · แนน 1111…0002 เป็นผู้เล่น ไม่ใช่ผู้จัด
--   BOOKED1 = booked มี 8 ที่นั่ง paid_confirmed ทั้งหมด
--   OPEN001 = open มี 3 ที่นั่งที่นับ

begin;
select plan(23);

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
  'session_not_played', 'นัดที่ยังไม่ได้เล่น สร้างรายการไม่ได้');

select is(
  public.create_session_charge(
    (select id from public.sessions where public_code = 'CANCEL1'),
    'ค่าลูกแบด', 300, 'all') ->> 'reason',
  'session_not_played', 'นัดที่ยกเลิกแล้ว สร้างรายการไม่ได้');

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
-- ถ้านับในฐานะผู้จัด จะได้เลขของผู้จัดคนเดียว ไม่ใช่ของทั้งนัด
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

-- ---------------------------------------------------------------------------
-- เพดานยอดชั้นที่สอง — ฐานข้อมูลปฏิเสธเอง ไม่ได้พึ่ง UI
--
-- ชั้นแรกคือกล่องยืนยันฝั่ง TS (CHARGE_CONFIRM_THRESHOLD_THB) ซึ่งผู้ใช้กดผ่านได้
-- ชั้นนี้คือ CHECK บนตาราง ซึ่งกดผ่านไม่ได้ และดักคนที่ยิง RPC ตรง ๆ ด้วย
-- ต้องเป็น throws_ok ไม่ใช่ is() เพราะ create_session_charge ไม่ได้เช็คเอง
-- แต่ปล่อยให้ constraint ยิง 23514 ขึ้นมา
-- ---------------------------------------------------------------------------

-- ปักถึง **ชื่อ constraint** ไม่ใช่แค่ SQLSTATE เพราะยอด 0 ไปตกที่
-- session_charge_shares.amount_thb > 0 ได้ด้วย ซึ่งเป็น 23514 เหมือนกัน
-- ถ้าเช็คแค่ errcode เทสข้อนี้จะเขียวต่อไปแม้ constraint บน session_charges
-- จะถูกถอดออก — เคยพลาดแบบนี้มาแล้วตอนตรวจ ไม่ใช่การเดา
select throws_ok(
  $$ select public.create_session_charge(
       (select id from public.sessions where public_code = 'BOOKED1'),
       'ยอดศูนย์', 0, 'all') $$,
  '23514',
  'new row for relation "session_charges" violates check constraint "session_charges_amount_thb_check"',
  'amount_thb = 0 ถูกปฏิเสธด้วย constraint ของ session_charges เอง');

select throws_ok(
  $$ select public.create_session_charge(
       (select id from public.sessions where public_code = 'BOOKED1'),
       'เผลอใส่ศูนย์เกิน', 100001, 'all') $$,
  '23514',
  'new row for relation "session_charges" violates check constraint "session_charges_amount_thb_check"',
  'amount_thb เกิน 100,000 ถูกปฏิเสธด้วย constraint ของ session_charges เอง');

-- ---------------------------------------------------------------------------
-- ส่วนแบ่งถูกปักตอนสร้าง — สมาชิกที่เข้ามาทีหลังไม่ทำให้ของเดิมขยับ
--
-- นี่คือเหตุผลที่ session_charge_shares เก็บเป็นแถว แทนที่จะคำนวณสดตอนอ่าน
-- ถ้าคำนวณสด คนที่เข้านัดมาทีหลังจะทำให้ยอดของคนที่ถูกเรียกเก็บไปแล้วเปลี่ยน
-- ซึ่งแปลว่าหนี้ที่ตกลงกันไปแล้วขยับได้เอง
-- ---------------------------------------------------------------------------

select is(
  public.create_session_charge(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'ค่าคอร์ตต่อเวลา', 90, 'all') ->> 'ok',
  'true', 'สร้างรายการไว้ก่อนจะมีคนเข้านัดใหม่');

set local role postgres;

create temporary table frozen_before on commit drop as
select participant_id, amount_thb from public.session_charge_shares
where charge_id = (select id from public.session_charges where label = 'ค่าคอร์ตต่อเวลา');

insert into public.session_participants
  (session_id, user_id, guest_name, status, amount_due_thb, payment_due_at)
select s.id, null, 'คนมาทีหลัง', 'paid_confirmed', 150, s.starts_at
from public.sessions s where s.public_code = 'BOOKED1';

-- symmetric difference = 0 แปลว่าไม่มีแถวไหนเพิ่ม หาย หรือยอดเปลี่ยน
-- เขียนแบบนี้เพื่อไม่ต้อง hardcode จำนวนคน ซึ่งจะพังเงียบ ๆ ถ้า seed เปลี่ยน
select is(
  (select count(*)::integer from (
     (select participant_id, amount_thb from public.session_charge_shares
      where charge_id = (select id from public.session_charges where label = 'ค่าคอร์ตต่อเวลา')
      except
      select participant_id, amount_thb from frozen_before)
     union all
     (select participant_id, amount_thb from frozen_before
      except
      select participant_id, amount_thb from public.session_charge_shares
      where charge_id = (select id from public.session_charges where label = 'ค่าคอร์ตต่อเวลา'))
   ) diff),
  0, 'คนเข้านัดทีหลัง ส่วนแบ่งที่ปักไว้แล้วไม่ขยับสักแถว');

set local role postgres;
select * from finish();
rollback;

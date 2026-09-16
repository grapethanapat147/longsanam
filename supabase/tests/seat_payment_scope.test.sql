-- LSN-0024 review: แถวของรายการเก็บเพิ่มต้องไม่ถูกเข้าใจผิดว่าเป็นแถวของที่นั่ง
--
-- ตั้งแต่ 20260915000300 ผู้เล่นหนึ่งคนมีแถว payments ที่ยังไม่ปิดได้หลายแถว
-- คำค้นหาที่เขียนไว้สมัยที่ "หนึ่งคนมีแถวเดียว" ยังจริง จึงหยิบผิดแถวได้
--
-- ข้อที่แพงที่สุดคือเพดานคืนเงิน ซึ่งกินเงินผู้ใช้จริง ไม่ใช่แค่แสดงผลผิด

begin;
select plan(4);

set local role postgres;

-- ให้ทุกคนใน BOOKED1 นับได้ในตัวหาร แล้วสร้างรายการเก็บเพิ่มที่ส่งแล้ว
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-000000000001","role":"authenticated"}';
set local role authenticated;

select is(
  public.create_session_charge(
    (select id from public.sessions where public_code = 'BOOKED1'),
    'ค่าลูกแบด', 272, 'all') ->> 'ok',
  'true', 'สร้างรายการเก็บเพิ่มได้');

select is(
  public.send_session_charges(
    (select id from public.sessions where public_code = 'BOOKED1')) ->> 'ok',
  'true', 'ส่งเรียกเก็บแล้ว');

set local role postgres;

-- แนนจ่ายค่าลูกแบด **หลัง** ค่าที่นั่ง ซึ่งเป็นลำดับปกติของชีวิตจริง
-- order by paid_at desc จึงหยิบแถวนี้ ไม่ใช่แถวค่าที่นั่ง ฿150
update public.payments
set status = 'paid', paid_at = now()
where charge_share_id is not null
  and participant_id = (
    select sp.id from public.session_participants sp
    join public.sessions s on s.id = sp.session_id
    where s.public_code = 'BOOKED1' and sp.user_id = '11111111-1111-4111-8111-000000000002');

select is(
  (select count(*)::integer from public.payments p
   join public.session_participants sp on sp.id = p.participant_id
   join public.sessions s on s.id = sp.session_id
   where s.public_code = 'BOOKED1'
     and sp.user_id = '11111111-1111-4111-8111-000000000002'
     and p.status = 'paid'),
  2, 'แนนมีแถวจ่ายแล้วสองแถว — ค่าที่นั่งกับค่าลูกแบด');

-- ก่อนแก้: เพดานคือ ฿34 เพราะเป็นแถวที่จ่ายทีหลัง → คืนได้แค่ ฿34
-- หลังแก้: เพดานคือ ฿150 ของแถวที่นั่ง
select is(
  (public.cancel_participation(
    (select sp.id from public.session_participants sp
     join public.sessions s on s.id = sp.session_id
     where s.public_code = 'BOOKED1'
       and sp.user_id = '11111111-1111-4111-8111-000000000002'),
    150, 'organizer_cancelled', '{}'::jsonb, 'test:refund-ceiling')
   ->> 'refundThb')::integer,
  150, 'เพดานคืนเงินมาจากแถวค่าที่นั่ง ไม่ใช่แถวค่าลูกแบดที่จ่ายทีหลัง');

select * from finish();
rollback;

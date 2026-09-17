-- ทัวร์นาเมนต์ + สมัครเป็นทีม + คืนเงินเมื่อไม่ครบ (LSN-0029)
--
-- Actors: ก้อง 1111…0001 เป็นเจ้าของ GROUP01 · แนน 1111…0002 เป็นสมาชิก
-- สร้างก๊วนเพิ่มอีกสองก๊วนให้แนนกับบอสเป็นเจ้าของ เพื่อให้มีทีมมาสมัครจริง

begin;
select plan(31);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

set local role postgres;

-- เครดิตเป็นคนละเรื่องกับทัวร์นาเมนต์โดยสิ้นเชิง สเปกเน้นข้อนี้ไว้ชัดเจน
-- จับภาพไว้ตั้งแต่ต้นแล้วเทียบตอนท้ายว่าไม่มีอะไรในตั๋วนี้ไปขยับมัน
create temporary table credit_before on commit drop as
select user_id, score from public.player_credit;

-- ก๊วนเพิ่มอีกสองก๊วน เจ้าของคนละคน
insert into public.groups (id, public_code, name, sport_id, created_by)
select 'eeeeeeee-0000-4000-8000-00000000000a', 'GRPAAA1', 'ก๊วนแนน', id,
       '11111111-1111-4111-8111-000000000002' from public.sports where slug='badminton';
insert into public.groups (id, public_code, name, sport_id, created_by)
select 'eeeeeeee-0000-4000-8000-00000000000b', 'GRPBBB1', 'ก๊วนบอส', id,
       '11111111-1111-4111-8111-000000000003' from public.sports where slug='badminton';
insert into public.group_members (group_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-00000000000a', '11111111-1111-4111-8111-000000000002', 'owner'),
  ('eeeeeeee-0000-4000-8000-00000000000b', '11111111-1111-4111-8111-000000000003', 'owner');

-- ---------------------------------------------------------------------------
-- สร้างทัวร์นาเมนต์ — เฉพาะเจ้าของก๊วน
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  public.create_tournament('eeeeeeee-0000-4000-8000-000000000001', 'งานของคนอื่น',
    now() + interval '20 days', now() + interval '20 days 6 hours',
    now() + interval '10 days', 3, 8, 800, 'P') ->> 'reason',
  'not_owner', 'คนที่ไม่ใช่เจ้าของก๊วนสร้างทัวร์นาเมนต์ในนามก๊วนนั้นไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  public.create_tournament('eeeeeeee-0000-4000-8000-000000000001', 'ศึกแบดลาดพร้าว',
    now() + interval '20 days', now() + interval '20 days 6 hours',
    now() + interval '10 days', 3, 4, 800, 'P') ->> 'ok',
  'true', 'เจ้าของก๊วนสร้างทัวร์นาเมนต์ได้');

set local role postgres;
create temporary table tcode on commit drop as
select id as tid, public_code from public.tournaments where title = 'ศึกแบดลาดพร้าว';
grant select on tcode to authenticated;

-- ---------------------------------------------------------------------------
-- เจ้าภาพนับเป็นหนึ่งทีมอัตโนมัติ
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.tournament_teams where tournament_id = (select tid from tcode)),
  1, 'เจ้าภาพมีแถวทีมทันทีที่สร้าง');

select ok(
  (select is_host from public.tournament_teams
   where tournament_id = (select tid from tcode)
     and group_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  'แถวนั้นถูกทำเครื่องหมายว่าเป็นเจ้าภาพ');

-- ---------------------------------------------------------------------------
-- สมัคร — เฉพาะเจ้าของก๊วน · ซ้ำไม่เพิ่มแถว · เต็มแล้วปฏิเสธ
-- ---------------------------------------------------------------------------

-- ร่างยังรับสมัครไม่ได้
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000a') ->> 'reason',
  'tournament_not_published', 'ทัวร์นาเมนต์ที่ยังเป็นร่าง สมัครไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  public.publish_tournament((select tid from tcode)) ->> 'ok',
  'true', 'เจ้าภาพเผยแพร่ทัวร์นาเมนต์ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');   -- มีน ไม่ได้เป็นเจ้าของก๊วนไหน
select is(
  public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000a') ->> 'reason',
  'not_owner', 'คนที่ไม่ใช่เจ้าของก๊วนสมัครแทนก๊วนไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
select is(
  (public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000a') ->> 'joined')::boolean,
  true, 'เจ้าของก๊วนสมัครได้');

select is(
  (public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000a') ->> 'joined')::boolean,
  false, 'สมัครซ้ำไม่นับว่าเพิ่งสมัคร');

select pg_temp.act_as('11111111-1111-4111-8111-000000000003');
select is(
  (public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000b') ->> 'joined')::boolean,
  true, 'ก๊วนที่สามสมัครได้');

set local role postgres;
select is(
  (select count(*)::integer from public.tournament_teams where tournament_id = (select tid from tcode)),
  3, 'สมัครซ้ำไม่สร้างแถวซ้ำ · รวมสามทีมพอดี');

-- ---------------------------------------------------------------------------
-- ประตูสามบาน — นับทุกทีมเท่ากัน รวมเจ้าภาพ ไม่มีข้อยกเว้น
--
-- นี่คือเทสที่เฝ้าการตัดสินข้อ 3 ถ้าใครใส่เงื่อนไข "ยกเว้นเจ้าภาพ" เข้าไป
-- ในภายหลัง เทสนี้จะแดงทันที
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  public.pay_tournament_team((select tid from tcode),
    'eeeeeeee-0000-4000-8000-00000000000a', 'pay:a') ->> 'ok', 'true', 'ก๊วนแนนจ่ายแล้ว');

select pg_temp.act_as('11111111-1111-4111-8111-000000000003');
select is(
  public.pay_tournament_team((select tid from tcode),
    'eeeeeeee-0000-4000-8000-00000000000b', 'pay:b') ->> 'ok', 'true', 'ก๊วนบอสจ่ายแล้ว');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  public.confirm_tournament_court((select tid from tcode), 'ลาดพร้าว 6 คอร์ต') ->> 'ok',
  'true', 'เจ้าภาพยืนยันคอร์ตได้ แม้ยังจ่ายไม่ครบ — สามประตูเป็นอิสระต่อกัน');

set local role postgres;
select is(
  (select status::text from public.tournaments where id = (select tid from tcode)),
  'open', 'ทุกทีมจ่ายยกเว้นเจ้าภาพ + คอร์ตยืนยันแล้ว → **ยังไม่ถึง ready**');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  public.pay_tournament_team((select tid from tcode),
    'eeeeeeee-0000-4000-8000-000000000001', 'pay:host') ->> 'ok',
  'true', 'เจ้าภาพจ่ายค่าสมัครของตัวเองเหมือนทีมอื่น');

set local role postgres;
select is(
  (select status::text from public.tournaments where id = (select tid from tcode)),
  'ready', 'ครบสามประตูแล้วจึงเป็น ready');

-- ---------------------------------------------------------------------------
-- หนึ่งทีม หนึ่งการจ่ายที่ยังไม่ปิด — ปักถึงชื่อ index ไม่ใช่แค่ SQLSTATE
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.tournament_team_payments
       (tournament_id, group_id, paid_by, amount_thb, idempotency_key, status)
     values ((select tid from tcode), 'eeeeeeee-0000-4000-8000-00000000000a',
             '11111111-1111-4111-8111-000000000002', 800, 'pay:dup', 'pending') $$,
  '23505',
  'duplicate key value violates unique constraint "tournament_team_one_live_payment"',
  'หนึ่งทีมมีการจ่ายที่ยังไม่ปิดได้แถวเดียว');

-- ---------------------------------------------------------------------------
-- ไม่ครบตามกำหนด → คืนเต็มทุกทีม · เรียกซ้ำได้ผลเท่าเดิม
-- ---------------------------------------------------------------------------

insert into public.tournaments
  (id, public_code, host_group_id, title, starts_at, ends_at, registration_deadline,
   min_teams, entry_fee_thb, tier, status, created_by)
values
  ('aaaaaaaa-0000-4000-8000-00000000000f', 'TRNFAIL', 'eeeeeeee-0000-4000-8000-000000000001',
   'งานที่ทีมไม่ครบ', now() + interval '3 days', now() + interval '3 days 4 hours',
   now() - interval '1 hour', 4, 500, 'C', 'open',
   '11111111-1111-4111-8111-000000000001');
insert into public.tournament_teams (tournament_id, group_id, is_host) values
  ('aaaaaaaa-0000-4000-8000-00000000000f', 'eeeeeeee-0000-4000-8000-000000000001', true),
  ('aaaaaaaa-0000-4000-8000-00000000000f', 'eeeeeeee-0000-4000-8000-00000000000a', false);
insert into public.tournament_team_payments
  (tournament_id, group_id, paid_by, amount_thb, idempotency_key, status, paid_at)
values
  ('aaaaaaaa-0000-4000-8000-00000000000f', 'eeeeeeee-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-000000000001', 500, 'fail:host', 'paid', now()),
  ('aaaaaaaa-0000-4000-8000-00000000000f', 'eeeeeeee-0000-4000-8000-00000000000a',
   '11111111-1111-4111-8111-000000000002', 500, 'fail:a', 'paid', now());

select is(
  (public.close_unfilled_tournaments() ->> 'refundedPayments')::integer,
  2, 'ถึงกำหนดแล้วทีมไม่ครบ → คืนเงินทุกทีมที่จ่ายไว้');

select is(
  (select status::text from public.tournaments where public_code = 'TRNFAIL'),
  'cancelled', 'ทัวร์นาเมนต์ที่ทีมไม่ครบกลายเป็น cancelled');

-- เรียกกวาดซ้ำ — ด่านที่กันจริงคือ **สถานะทัวร์นาเมนต์** ที่กลายเป็น cancelled
-- ไปแล้ว ไม่ใช่ refunded_at · เขียนให้ตรงกับสิ่งที่มันเฝ้าจริง เพราะเทสที่
-- อ้างว่าเฝ้าอย่างหนึ่งแต่จริง ๆ เฝ้าอีกอย่าง คือเทสที่หลอกคนอ่าน
select is(
  (public.close_unfilled_tournaments() ->> 'refundedPayments')::integer,
  0, 'เรียกกวาดซ้ำไม่คืนเงินซ้ำ เพราะงานถูกปิดไปแล้วไม่เข้าเงื่อนไขอีก');

-- ดันสถานะกลับไป open แล้วกวาดอีกรอบ ซึ่งเกิดได้จริงถ้ามีการเปิดงานใหม่
-- หรือมี race
--
-- ด่านที่กันการคืนซ้ำตรงนี้คือ **status = 'paid'** เพราะการกวาดรอบแรกเปลี่ยน
-- สถานะแถวเป็น refunded ไปแล้ว ส่วน `refunded_at is null` ในฟังก์ชันเป็น
-- เงื่อนไขซ้ำซ้อน — ทดลองถอดออกแล้วเทสยังเขียว จึงไม่อ้างว่าเทสนี้เฝ้ามัน
update public.tournaments set status = 'open' where public_code = 'TRNFAIL';
select is(
  (public.close_unfilled_tournaments() ->> 'refundedPayments')::integer,
  0, 'แถวที่คืนไปแล้วไม่ถูกคืนซ้ำ แม้งานกลับมาเข้าเงื่อนไขอีกครั้ง (กันด้วย status)');

-- ---------------------------------------------------------------------------
-- AC ที่เหลือ — เจอตอนไล่รายการก่อนย้าย Review ว่ายังไม่มีอะไรเฝ้า
-- ---------------------------------------------------------------------------

set local role postgres;

-- เต็ม max_teams แล้วปฏิเสธ · งานนี้ max_teams = 4 มีแล้วสามทีม เติมอีกหนึ่ง
insert into public.groups (id, public_code, name, sport_id, created_by)
select 'eeeeeeee-0000-4000-8000-00000000000c', 'GRPCCC1', 'ก๊วนมีน', id,
       '11111111-1111-4111-8111-000000000004' from public.sports where slug='badminton';
insert into public.groups (id, public_code, name, sport_id, created_by)
select 'eeeeeeee-0000-4000-8000-00000000000d', 'GRPDDD1', 'ก๊วนปอนด์', id,
       '11111111-1111-4111-8111-000000000005' from public.sports where slug='badminton';
insert into public.group_members (group_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-00000000000c', '11111111-1111-4111-8111-000000000004', 'owner'),
  ('eeeeeeee-0000-4000-8000-00000000000d', '11111111-1111-4111-8111-000000000005', 'owner');

-- งานถูกดันเป็น ready ไปแล้วจากเทสก่อนหน้า ดันกลับเป็น open เพื่อทดสอบการรับทีม
update public.tournaments set status = 'open' where id = (select tid from tcode);

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;
select is(
  (public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000c') ->> 'joined')::boolean,
  true, 'ทีมที่สี่สมัครได้ เพราะยังไม่เต็ม');

select pg_temp.act_as('11111111-1111-4111-8111-000000000005');
select is(
  public.join_tournament((select public_code from tcode),
    'eeeeeeee-0000-4000-8000-00000000000d') ->> 'reason',
  'tournament_full', 'ทีมที่ห้าถูกปฏิเสธเพราะเต็ม max_teams');

-- คนนอกงานอ่านตารางทีมตรง ๆ ไม่ได้
select pg_temp.act_as('11111111-1111-4111-8111-000000000006');
select is(
  (select count(*)::integer from public.tournament_teams
   where tournament_id = (select tid from tcode)),
  0, 'คนนอกงานอ่าน tournament_teams ไม่ได้เลย');

-- แต่หน้ารับสมัครบอกจำนวนทีมได้ โดยไม่บอกว่าก๊วนไหน
select ok(
  not (public.tournament_invite_public((select public_code from tcode)) ? 'teams')
  and (public.tournament_invite_public((select public_code from tcode)) ? 'teamCount'),
  'หน้ารับสมัครคืนแค่จำนวนทีม ไม่คืนรายชื่อก๊วนที่สมัครแล้ว');

set local role postgres;

-- ทุกการเปลี่ยนสถานะเขียน audit ผ่าน app_log
select ok(
  (select count(distinct action) from public.audit_logs
   where entity_type = 'tournament' and entity_id = (select tid from tcode)) >= 4,
  'สร้าง เผยแพร่ สมัคร และจ่าย เขียน audit ครบ');

-- ---------------------------------------------------------------------------
-- เงินเข้าได้เฉพาะงานที่ยังเปิดรับจริง
--
-- เจอตอน review ว่า pay_tournament_team ไม่ตรวจสถานะและกำหนดปิดรับเลย
-- จ่ายเข้างานที่ยกเลิกแล้วได้ ซึ่งเป็นเงินที่ **ค้างถาวร** เพราะตัวกวาด
-- ดูแค่งานสถานะ open การคืนอัตโนมัติจึงไม่มีทางแตะมันได้
--
-- ใช้ allowlist ไม่ใช่ denylist ด้วยเหตุผลเดียวกับ LSN-0020
-- ---------------------------------------------------------------------------

set local role postgres;
update public.tournaments set status = 'cancelled' where id = (select tid from tcode);

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;
select is(
  public.pay_tournament_team((select tid from tcode),
    'eeeeeeee-0000-4000-8000-00000000000c', 'late:cancelled') ->> 'reason',
  'tournament_closed', 'จ่ายเข้างานที่ยกเลิกแล้วไม่ได้');

set local role postgres;
update public.tournaments
set status = 'open', registration_deadline = now() - interval '1 day'
where id = (select tid from tcode);

set local role authenticated;
select is(
  public.pay_tournament_team((select tid from tcode),
    'eeeeeeee-0000-4000-8000-00000000000c', 'late:deadline') ->> 'reason',
  'registration_closed', 'จ่ายหลังเลยกำหนดปิดรับไม่ได้');

-- ---------------------------------------------------------------------------
-- evaluate_tournament_gates ต้องไม่บอกคนนอกว่ามีกี่ทีมและจ่ายแล้วกี่ทีม
--
-- หน้ารับสมัครตั้งใจไม่บอกจำนวนที่จ่ายแล้ว การให้ RPC อีกตัวบอกได้
-- ก็เท่ากับเปิดประตูหลัง
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000006');
select is(
  public.evaluate_tournament_gates((select tid from tcode)) ->> 'reason',
  'not_participant', 'คนนอกงานเรียก evaluate_tournament_gates ไม่ได้');

set local role postgres;

select is(
  (select count(*)::integer from public.player_credit c
   full join credit_before b on b.user_id = c.user_id
   where c.score is distinct from b.score),
  0, 'player_credit ไม่ขยับเลยสักแถวจากอะไรก็ตามในตั๋วนี้');

select * from finish();
rollback;

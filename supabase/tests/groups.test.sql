-- ก๊วนที่คงอยู่ข้ามครั้ง (LSN-0026). รันด้วย `npm run test:db`
--
-- Actors จาก supabase/seed.sql:
--   ก้อง 1111…0001 (ผู้จัด) · แนน 1111…0002 · บอส 1111…0003 · มีน 1111…0004

begin;
select plan(19);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- สร้างก๊วน — ผู้สร้างเป็นเจ้าของทันที
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;

select is(
  public.create_group('ก๊วนแบดลาดพร้าว',
    (select id from public.sports where slug = 'badminton'), 'ลาดพร้าว') ->> 'ok',
  'true', 'สร้างก๊วนได้');

set local role postgres;

-- เก็บโค้ดไว้ก่อนสลับเป็นผู้ใช้คนอื่น เพราะ RLS จะซ่อนก๊วนจากคนที่ยังไม่ใช่
-- สมาชิก (ซึ่งถูกต้อง) ในแอปจริงโค้ดมาจาก URL ไม่ได้มาจากการ query ฐานข้อมูล
create temporary table gcode on commit drop as
select id as group_id, public_code from public.groups where name = 'ก๊วนแบดลาดพร้าว';
grant select on gcode to authenticated;

select is(
  (select role from public.group_members
   where group_id = (select group_id from gcode)
     and user_id = '11111111-1111-4111-8111-000000000001'),
  'owner', 'ผู้สร้างกลายเป็น owner อัตโนมัติ');

select isnt(
  (select public_code from gcode),
  null, 'trigger ใส่โค้ดเชิญให้เอง');

select is(
  (select length(public_code) from gcode),
  7, 'โค้ดยาว 7 ตัวเหมือนโค้ดนัด');

-- ---------------------------------------------------------------------------
-- owner คนเดียวต่อก๊วน — บังคับที่ระดับฐานข้อมูล
--
-- ปักถึง **ชื่อ index** ไม่ใช่แค่ SQLSTATE เพราะถ้าเช็คแค่ errcode เทสจะเขียว
-- ต่อไปแม้ index ถูกถอดออก แล้วมี unique อื่นในตารางไปดังแทน
-- บทเรียนจาก LSN-0024
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.group_members (group_id, user_id, role)
     values ((select group_id from gcode),
             '11111111-1111-4111-8111-000000000002', 'owner') $$,
  '23505',
  'duplicate key value violates unique constraint "groups_single_owner"',
  'owner คนที่สองถูกปฏิเสธด้วย groups_single_owner');

-- ---------------------------------------------------------------------------
-- เข้าร่วมผ่านลิงก์
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;

select is(
  (public.join_group((select public_code from gcode))
   ->> 'joined')::boolean,
  true, 'เข้าร่วมด้วยโค้ดได้');

select is(
  (public.join_group((select public_code from gcode))
   ->> 'joined')::boolean,
  false, 'เข้าซ้ำไม่นับว่าเพิ่งเข้า');

set local role postgres;

select is(
  (select count(*)::integer from public.group_members
   where group_id = (select group_id from gcode)),
  2, 'เข้าซ้ำไม่สร้างแถวซ้ำ');

-- ---------------------------------------------------------------------------
-- คนนอกอ่านรายชื่อสมาชิกไม่ได้
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
set local role authenticated;

select is(
  (select count(*)::integer from public.group_members
   where group_id = (select group_id from gcode)),
  0, 'คนนอกก๊วนอ่าน group_members ไม่ได้เลย');

-- แต่หน้ารับเชิญต้องบอกได้ว่ากำลังจะเข้าก๊วนอะไร โดยไม่บอกว่าใครอยู่บ้าง
select is(
  public.group_invite_public((select public_code from gcode)) ->> 'name',
  'ก๊วนแบดลาดพร้าว', 'หน้ารับเชิญเห็นชื่อก๊วนได้');

select ok(
  not (public.group_invite_public((select public_code from gcode)) ? 'members'),
  'หน้ารับเชิญไม่คืนรายชื่อสมาชิกออกมาเลย');

-- ---------------------------------------------------------------------------
-- ออกจากก๊วน
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
set local role authenticated;
select is(
  public.leave_group((select group_id from gcode)) ->> 'ok',
  'true', 'สมาชิกออกจากก๊วนได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  public.leave_group((select group_id from gcode)) ->> 'reason',
  'owner_cannot_leave', 'เจ้าของออกไม่ได้ ไม่งั้นก๊วนจะเหลือสถานะที่ซ่อมไม่ได้');

-- ---------------------------------------------------------------------------
-- ตั้งนัดจากก๊วน — แจ้งเตือนหนึ่งแถวต่อคน ไม่รวมผู้ตั้ง
--
-- ไม่ต้อง group by เพราะ PK ของ group_members คือ (group_id, user_id)
-- ซ้ำเกิดไม่ได้โดยโครงสร้าง เทสนี้ยืนยันว่าข้อสมมตินั้นจริง
-- ---------------------------------------------------------------------------

set local role postgres;

-- คืนแนนกลับเข้าก๊วน แล้วเพิ่มบอสอีกคน รวมสมาชิก 3 คน (ก้องเป็นผู้ตั้ง)
insert into public.group_members (group_id, user_id, role) values
  ((select group_id from gcode), '11111111-1111-4111-8111-000000000002', 'member'),
  ((select group_id from gcode), '11111111-1111-4111-8111-000000000003', 'member')
on conflict do nothing;

update public.sessions set group_id = (select group_id from gcode)
where public_code = 'OPEN001';

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;

select is(
  (public.notify_group_new_session(
    (select id from public.sessions where public_code = 'OPEN001')) ->> 'notified')::integer,
  2, 'แจ้งเตือนสองคน คือสมาชิกทุกคนยกเว้นผู้ตั้งเอง');

set local role postgres;

-- ---------------------------------------------------------------------------
-- ทุกการเปลี่ยนสถานะของก๊วนต้องเขียน audit
--
-- helper ชื่อ app_log() ไม่ใช่ตาราง audit_logs โดยตรง — เคย grep ผิดมาแล้ว
-- ตอน review LSN-0024 แล้วสรุปผิดว่าไม่มี audit
-- ---------------------------------------------------------------------------

select is(
  (select count(distinct action)::integer from public.audit_logs
   where entity_type = 'group' and entity_id = (select group_id from gcode)),
  3, 'สร้าง เข้าร่วม และออก เขียน audit ครบสามเหตุการณ์');

-- ---------------------------------------------------------------------------
-- ตั้งนัดโดยไม่มีก๊วน ต้องได้เหมือนเดิมทุกอย่าง
--
-- นี่คือด่านที่กันไม่ให้ตั๋วนี้ทำลายทางเข้าหลักของโปรดักต์ คือลิงก์เดียว
-- ที่ใครก็ตั้งนัดได้โดยไม่ต้องมีก๊วนก่อน
-- ---------------------------------------------------------------------------

set local role postgres;

select lives_ok(
  $$ insert into public.sessions
       (organizer_id, sport_id, title, area_text, starts_at, ends_at,
        budget_per_person_thb, target_players, min_players, payment_deadline, status)
     select '11111111-1111-4111-8111-000000000001', id, 'นัดไม่มีก๊วน', 'ลาดพร้าว',
            now() + interval '7 days', now() + interval '7 days 2 hours',
            150, 8, 4, now() + interval '5 days', 'draft'
     from public.sports where slug = 'badminton' $$,
  'ตั้งนัดโดยไม่มีก๊วนยังทำได้เหมือนเดิม');

select is(
  (select group_id from public.sessions where title = 'นัดไม่มีก๊วน'),
  null, 'นัดที่ไม่ผูกก๊วนมี group_id เป็น null ไม่มี default มาใส่ให้');

-- ---------------------------------------------------------------------------
-- archive แล้วนัดเก่าต้องไม่หาย
-- ---------------------------------------------------------------------------

update public.sessions
set group_id = (select group_id from gcode)
where public_code = 'BOOKED1';

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
set local role authenticated;
select is(
  public.archive_group((select group_id from gcode)) ->> 'ok',
  'true', 'เจ้าของ archive ก๊วนได้');

set local role postgres;
select is(
  (select count(*)::integer from public.sessions where public_code = 'BOOKED1'),
  1, 'archive ก๊วนแล้วนัดเก่ายังอยู่');

select * from finish();
rollback;

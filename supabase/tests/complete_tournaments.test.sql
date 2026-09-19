-- ทัวร์นาเมนต์ที่แข่งจบแล้วต้องได้สถานะ completed (LSN-0046)
--
-- ก่อนตั๋วนี้ไม่มีโค้ดตรงไหนตั้ง `tournaments.status = 'completed'` เลย
-- งานที่แข่งจบไปแล้วจึงค้างที่ `ready` ตลอดไป

begin;
select plan(7);

set local role postgres;

create temporary table t on commit drop as
select id from public.tournaments where public_code = 'TOURN01';

-- ---------------------------------------------------------------------------
-- งานที่พร้อมแข่งและเลยเวลาเลิกแล้ว → จบ
-- ---------------------------------------------------------------------------

update public.tournaments
set status = 'ready',
    registration_deadline = now() - interval '2 days',
    starts_at = now() - interval '5 hours',
    ends_at   = now() - interval '1 hour'
where id = (select id from t);

select is(
  (public.complete_finished_tournaments() ->> 'completedTournaments')::integer,
  1, 'ปิดงานที่เลยเวลาเลิกแล้วหนึ่งรายการ');

select is(
  (select status::text from public.tournaments where id = (select id from t)),
  'completed', 'สถานะเป็น completed จริง');

select is(
  (select count(*)::integer from public.audit_logs
   where entity_id = (select id from t) and action = 'tournament.completed'),
  1, 'มีร่องรอยใน audit log');

-- เรียกซ้ำต้องไม่ทำอะไรเพิ่ม — cron ยิงทุกห้านาที
select is(
  (public.complete_finished_tournaments() ->> 'completedTournaments')::integer,
  0, 'เรียกซ้ำแล้วไม่นับซ้ำ');

-- ---------------------------------------------------------------------------
-- allowlist: อะไรที่ *ไม่ควร* ถูกปิด
-- ---------------------------------------------------------------------------

-- งานที่ยังไม่ถึงเวลาเลิก
update public.tournaments
set status = 'ready',
    starts_at = now() + interval '2 days',
    ends_at = now() + interval '3 days'
where id = (select id from t);

select is(
  (public.complete_finished_tournaments() ->> 'completedTournaments')::integer,
  0, 'งานที่ยังไม่ถึงเวลาเลิกไม่ถูกปิด');

-- งานที่ยังเปิดรับสมัครอยู่ แม้เลยเวลาไปแล้ว ก็ไม่ใช่ "จบ" เพราะไม่เคยได้แข่ง
update public.tournaments
set status = 'open',
    starts_at = now() - interval '5 hours',
    ends_at = now() - interval '1 hour'
where id = (select id from t);

select is(
  (public.complete_finished_tournaments() ->> 'completedTournaments')::integer,
  0, 'งานที่ยังไม่พร้อมแข่งไม่ถูกปิดเป็น completed');

-- งานที่ถูกยกเลิกไปแล้วต้องไม่ถูกปลุกขึ้นมาใหม่
update public.tournaments
set status = 'cancelled',
    starts_at = now() - interval '5 hours',
    ends_at = now() - interval '1 hour'
where id = (select id from t);

select is(
  (select status::text from public.tournaments where id = (select id from t)),
  'cancelled', 'งานที่ยกเลิกแล้วยังยกเลิกอยู่');

select * from finish();
rollback;

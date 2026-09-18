-- ผู้ใช้ตั้งนัดได้จริง (LSN-0043)
--
-- บั๊กที่ตั๋วนี้แก้อยู่ได้นานเพราะเทสเดิมทั้งหมด insert นัดในสิทธิ์ postgres
-- ซึ่งผ่านเสมอ ส่วนผู้ใช้จริงเป็น authenticated แล้วโดน 42501 ทุกครั้ง
--
-- เทสนี้จึงต้อง **สวมบทบาท authenticated จริง** ถ้ารันในสิทธิ์ postgres
-- มันจะเขียวโดยไม่ได้เฝ้าอะไรเลย ซึ่งเป็นความผิดพลาดเดิมที่ทำให้บั๊กหลุดมาได้

begin;
select plan(3);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');

select lives_ok(
  $$ insert into public.sessions
       (organizer_id, sport_id, title, area_text, starts_at, ends_at,
        budget_per_person_thb, target_players, min_players, payment_deadline, status)
     select '11111111-1111-4111-8111-000000000001',
            (select id from public.sports where slug = 'badminton'),
            'นัดที่ผู้ใช้สร้างเอง', 'ลาดพร้าว',
            now() + interval '10 days', now() + interval '10 days 2 hours',
            120, 8, 4, now() + interval '9 days', 'draft' $$,
  'ผู้ใช้ทั่วไป insert นัดได้ ไม่โดน permission denied');

select isnt(
  (select public_code from public.sessions
   where title = 'นัดที่ผู้ใช้สร้างเอง'),
  null, 'trigger ใส่รหัสแชร์ให้อัตโนมัติ');

select is(
  (select length(public_code) from public.sessions
   where title = 'นัดที่ผู้ใช้สร้างเอง'),
  7, 'รหัสยาวเจ็ดตัวตามที่ generate_session_code กำหนด');

select * from finish();
rollback;

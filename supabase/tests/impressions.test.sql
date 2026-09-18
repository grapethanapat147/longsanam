-- คะแนนความประทับใจ (LSN-0039)
--
-- แกนนี้ไม่กำหนดรุ่นและไม่แตะเงิน แรงจูงใจให้โกงจึงต่ำกว่าคะแนนฝีมือมาก
-- แต่ด่านที่ยังต้องเฝ้ามีสามเรื่อง
--   1. ใครให้คะแนนใครได้บ้าง — ปั่นคะแนนให้พวกตัวเองไม่ได้
--   2. rater_id ต้องไม่หลุดออกไปทางไหนเลย
--   3. แกนนี้ต้องไม่ไปขยับ player_skill หรือ player_credit

begin;
select plan(16);

set local role postgres;

create temporary table tt on commit drop as
select id from public.tournaments where public_code = 'TOURN01';
grant select on tt to authenticated;

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

-- TOURN01 เป็น ready อยู่แล้วจาก seed · GROUP01 = ก้อง แนน บอส · GROUP02 = แนน มีน
-- เพิ่มคนกลุ่ม 2 ให้พอสำหรับเทสเกณฑ์ 3 คน
insert into public.group_members (group_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000005', 'member'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000006', 'member')
on conflict do nothing;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- ใครให้คะแนนใครได้
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');   -- มีน อยู่ GROUP02
select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000001', 5::smallint, 5::smallint, 5::smallint) ->> 'ok',
  'true', 'ให้คะแนนคนจากก๊วนอื่นได้');

select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000004', 5::smallint, 5::smallint, 5::smallint) ->> 'reason',
  'cannot_rate_self', 'ให้คะแนนตัวเองไม่ได้');

-- บอส อยู่ GROUP01 เหมือน ก้อง จึงเป็นพวกเดียวกัน
select pg_temp.act_as('11111111-1111-4111-8111-000000000003');
select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000001', 5::smallint, 5::smallint, 5::smallint) ->> 'reason',
  'same_group_cannot_rate', 'ให้คะแนนคนในก๊วนตัวเองไม่ได้');

-- แนน อยู่ทั้งสองก๊วน จึงเป็นพวกเดียวกับทุกคนในงานนี้
select pg_temp.act_as('11111111-1111-4111-8111-000000000002');
select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000001', 5::smallint, 5::smallint, 5::smallint) ->> 'reason',
  'same_group_cannot_rate', 'คนที่อยู่ทั้งสองก๊วนให้คะแนนใครในงานนั้นไม่ได้');

-- ต้น ไม่ได้อยู่ในงานนี้เลย
select pg_temp.act_as('11111111-1111-4111-8111-000000000008');
select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000001', 5::smallint, 5::smallint, 5::smallint) ->> 'reason',
  'not_in_tournament', 'คนนอกงานให้คะแนนไม่ได้');

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000008', 5::smallint, 5::smallint, 5::smallint) ->> 'reason',
  'ratee_not_in_tournament', 'ให้คะแนนคนที่ไม่ได้อยู่ในงานไม่ได้');

-- ---------------------------------------------------------------------------
-- allowlist ของสถานะ
-- ---------------------------------------------------------------------------

set local role postgres;
update public.tournaments set status = 'open' where public_code = 'TOURN01';
set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
select is(
  public.rate_player((select id from tt),
    '11111111-1111-4111-8111-000000000001', 5::smallint, 5::smallint, 5::smallint) ->> 'reason',
  'tournament_not_played', 'งานที่ยังรับสมัครอยู่ให้คะแนนไม่ได้');

set local role postgres;
update public.tournaments set status = 'ready' where public_code = 'TOURN01';
set local role authenticated;

-- ---------------------------------------------------------------------------
-- ให้ซ้ำแล้วทับ ไม่เพิ่มแถว
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
select public.rate_player((select id from tt),
  '11111111-1111-4111-8111-000000000001', 1::smallint, 2::smallint, 3::smallint);

set local role postgres;
select is(
  (select count(*)::integer from public.player_impressions
   where rater_id = '11111111-1111-4111-8111-000000000004'
     and ratee_id = '11111111-1111-4111-8111-000000000001'),
  1, 'ให้ซ้ำแล้วยังมีแถวเดียว');
select is(
  (select punctuality::integer from public.player_impressions
   where rater_id = '11111111-1111-4111-8111-000000000004'
     and ratee_id = '11111111-1111-4111-8111-000000000001'),
  1, 'ค่าใหม่ทับค่าเก่า');

-- ---------------------------------------------------------------------------
-- rater_id ต้องไม่หลุด และต้องมีผู้ให้ครบ 3 คนก่อนถึงจะโชว์ค่าเฉลี่ย
-- ---------------------------------------------------------------------------

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  (public.player_impression_summary('11111111-1111-4111-8111-000000000001') ->> 'ready')::boolean,
  false, 'ผู้ให้ยังไม่ถึงสามคน ไม่โชว์ค่าเฉลี่ย');

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-000000000005');
select public.rate_player((select id from tt),
  '11111111-1111-4111-8111-000000000001', 4::smallint, 4::smallint, 4::smallint);
select pg_temp.act_as('11111111-1111-4111-8111-000000000006');
select public.rate_player((select id from tt),
  '11111111-1111-4111-8111-000000000001', 4::smallint, 4::smallint, 4::smallint);

select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  (public.player_impression_summary('11111111-1111-4111-8111-000000000001') ->> 'ready')::boolean,
  true, 'ครบสามคนแล้วโชว์ค่าเฉลี่ย');

select is(
  (select array_agg(k order by k)
   from jsonb_object_keys(public.player_impression_summary(
     '11111111-1111-4111-8111-000000000001')) k),
  array['fun','manners','overall','punctuality','raters','ready'],
  'สรุปคืนเฉพาะหกคีย์นี้ ไม่มี rater_id ติดออกไป');

select is(
  (select count(*)::integer from jsonb_object_keys(
     public.group_impression_summary('eeeeeeee-0000-4000-8000-000000000001')) k
   where k ilike '%rater_id%' or k ilike '%raterId%'),
  0, 'สรุปของก๊วนก็ไม่มี rater_id');

-- ---------------------------------------------------------------------------
-- สองด่านที่ต้องไม่ถูกแตะ
-- ---------------------------------------------------------------------------

set local role postgres;
select is(
  (select count(*)::integer from public.player_skill
   where user_id = '11111111-1111-4111-8111-000000000001'
     and rating <> 1020),
  0, 'การให้คะแนนความประทับใจไม่ขยับ player_skill');

select is(
  (select count(*)::integer from public.credit_events
   where reason ilike '%impression%'),
  0, 'และไม่แตะ player_credit');

set local role authenticated;
select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
select throws_ok(
  $$ insert into public.player_impressions
       (tournament_id, rater_id, ratee_id, punctuality, manners, fun)
     select id, '11111111-1111-4111-8111-000000000004',
            '11111111-1111-4111-8111-000000000003', 5, 5, 5 from tt $$,
  '42501',
  'permission denied for table player_impressions',
  'เขียนตารางตรง ๆ ไม่ได้ ต้องผ่าน RPC เท่านั้น');

select * from finish();
rollback;

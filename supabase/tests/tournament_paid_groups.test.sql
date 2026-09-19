-- ประตู "ทุกทีมจ่ายแล้ว" ต้องตอบเหมือนกันทุกคนในงาน (LSN-0045)
--
-- บั๊กเดิม: หน้ารายละเอียดนับจาก `tournament_team_payments` ตรง ๆ ซึ่ง policy
-- เปิดให้ก๊วนที่ไม่ใช่เจ้าภาพอ่านได้แค่แถวของตัวเอง เจ้าภาพจึงเห็น 2/2
-- ส่วนอีกก๊วนเห็น 1/2 จากข้อมูลชุดเดียวกัน

begin;
select plan(6);

create or replace function pg_temp.act_as(p_id uuid) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', p_id, 'role', 'authenticated')::text, true);
end;
$$;

set local role postgres;

create temporary table t on commit drop as
select id from public.tournaments where public_code = 'TOURN01';

-- ให้ทั้งสองก๊วนในงานจ่ายครบ
insert into public.tournament_team_payments
  (tournament_id, group_id, paid_by, amount_thb, status, idempotency_key, paid_at)
select (select id from t), tt.group_id,
       '11111111-1111-4111-8111-000000000001', 800, 'paid',
       'test:' || tt.group_id::text, now()
from public.tournament_teams tt
where tt.tournament_id = (select id from t)
on conflict do nothing;

create temporary table expected on commit drop as
select count(*)::integer as n from public.tournament_teams
where tournament_id = (select id from t);

-- ตารางชั่วคราวเป็นของ postgres ต้องเปิดให้บทบาทที่สวมบทบาทอ่านได้ด้วย
grant select on t, expected to authenticated;

select cmp_ok((select n from expected), '>=', 2,
  'งานตัวอย่างมีอย่างน้อยสองทีม ไม่งั้นเทสนี้ไม่ได้เฝ้าอะไร');

-- ---------------------------------------------------------------------------
-- เจ้าภาพกับผู้เข้าแข่งต้องได้ตัวเลขเดียวกัน
-- ---------------------------------------------------------------------------

set local role authenticated;

-- ก้อง เป็นเจ้าของก๊วนเจ้าภาพ
select pg_temp.act_as('11111111-1111-4111-8111-000000000001');
select is(
  (select count(*)::integer from public.tournament_paid_groups((select id from t))),
  (select n from expected),
  'เจ้าภาพเห็นครบทุกทีมที่จ่ายแล้ว');

-- มีน อยู่ใน แบดเช้าพระราม 9 ก๊วนเดียว ไม่ใช่เจ้าภาพ และไม่ได้อยู่ก๊วนเจ้าภาพด้วย
--
-- ⚠️ ห้ามใช้ แนน ตรงนี้ — seed ใส่ แนน ไว้ใน *ทั้งสอง* ก๊วน เธอจึงอ่านแถวของทั้งคู่
-- ได้อยู่แล้วแม้ตอนที่ยังมีบั๊ก เทสจะเขียวโดยไม่ได้เฝ้าอะไรเลย
select pg_temp.act_as('11111111-1111-4111-8111-000000000004');
select is(
  (select count(*)::integer from public.tournament_paid_groups((select id from t))),
  (select n from expected),
  'ก๊วนที่ไม่ใช่เจ้าภาพเห็นตัวเลขเดียวกับเจ้าภาพ');

-- อ่านตารางตรง ๆ ยังแคบเหมือนเดิม — ฟังก์ชันไม่ได้ไปคลาย RLS ของตาราง
select cmp_ok(
  (select count(*)::integer from public.tournament_team_payments
   where tournament_id = (select id from t)),
  '<', (select n from expected),
  'policy ของตารางยังแคบอยู่ ฟังก์ชันไม่ได้เปิดตารางให้ใคร');

-- ---------------------------------------------------------------------------
-- คนนอกงานไม่ได้อะไรกลับไป
-- ---------------------------------------------------------------------------

select pg_temp.act_as('11111111-1111-4111-8111-000000000007');
select is(
  (select count(*)::integer from public.tournament_paid_groups((select id from t))),
  0, 'คนที่ไม่ได้อยู่ในงานไม่เห็นอะไรเลย');

-- ---------------------------------------------------------------------------
-- คืนเฉพาะ group_id ไม่มีจำนวนเงินหรือคนจ่ายติดมา
-- ---------------------------------------------------------------------------

set local role postgres;
select is(
  (select array_agg(a.attname::text order by a.attnum)
   from pg_proc p
   join unnest(coalesce(p.proallargtypes, array[p.proargtypes[0]])) with ordinality as u(t, ord) on true
   join lateral (select p.proargnames[u.ord] as attname, u.ord as attnum) a on true
   where p.proname = 'tournament_paid_groups'
     and p.pronamespace = 'public'::regnamespace
     and p.proargmodes[u.ord] = 't'),
  array['group_id'],
  'คืนแค่ group_id — ไม่มี amount_thb · paid_by · provider_ref หลุดออกไป');

select * from finish();
rollback;

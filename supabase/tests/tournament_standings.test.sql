-- ตารางคะแนนและแชมป์ (LSN-0028 · ย้ายมาจาก LSN-0046)
--
-- LSN-0046 คิดตารางคะแนนใน TypeScript และมีเทส vitest สิบข้อ ตั๋วนี้ย้ายกติกา
-- มาไว้ที่ฐานข้อมูลเพราะ badge ต้องใช้กติกาเดียวกัน เทสจึงย้ายตามมาด้วย
-- ไม่ใช่หายไป

begin;
select plan(9);

set local role postgres;

create temporary table t on commit drop as
select id from public.tournaments where public_code = 'TOURN01';

delete from public.matches where tournament_id is not null;

create or replace function pg_temp.add_match(
  p_ga uuid, p_gb uuid, p_sa integer, p_sb integer,
  p_status public.match_status default 'confirmed'
) returns void language plpgsql as $$
begin
  insert into public.matches
    (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
     score_a, score_b, played_at, status, recorded_by, confirmed_by, confirmed_at)
  values ((select id from t), p_ga, p_gb,
          array['11111111-1111-4111-8111-000000000001']::uuid[],
          array['11111111-1111-4111-8111-000000000002']::uuid[],
          p_sa, p_sb, now() - interval '1 hour', p_status,
          '11111111-1111-4111-8111-000000000001',
          case when p_status = 'confirmed' then '11111111-1111-4111-8111-000000000002'::uuid end,
          case when p_status = 'confirmed' then now() end);
end;
$$;

-- เติมก๊วนที่สามเพื่อทดสอบการเรียงและการเสมอ
insert into public.groups (id, name, sport_id, home_district, created_by)
values ('eeeeeeee-0000-4000-8000-0000000000c1', 'ก๊วนซี',
        (select id from public.sports where slug = 'badminton'), 'เทส',
        '11111111-1111-4111-8111-000000000005');
insert into public.tournament_teams (tournament_id, group_id)
values ((select id from t), 'eeeeeeee-0000-4000-8000-0000000000c1');

-- ---------------------------------------------------------------------------

select is(
  (select count(*)::integer from public.tournament_standings_raw((select id from t))),
  3, 'ทุกก๊วนในงานมีแถวของตัวเอง แม้ยังไม่ได้ลงแข่ง');

select is(
  (select sum(played)::integer from public.tournament_standings_raw((select id from t))),
  0, 'ยังไม่มีแมตช์ก็ยังไม่มีใครลงแข่ง');

select is(public.tournament_champion((select id from t)), null,
  'ไม่มีผลที่ยืนยันก็ไม่มีแชมป์');

-- ผลที่ยังไม่ยืนยันต้องไม่นับ
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-000000000002', 21, 0, 'recorded');
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-000000000002', 21, 0, 'disputed');
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-000000000002', 21, 0, 'voided');

select is(
  (select sum(played)::integer from public.tournament_standings_raw((select id from t))),
  0, 'ผลที่ยังไม่ยืนยัน ถูกโต้แย้ง หรือถูกยกเลิก ไม่นับ');

-- นับแพ้ชนะและแต้มได้เสียจากทั้งสองฝั่ง
delete from public.matches where tournament_id is not null;
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-000000000002', 21, 15);

select is(
  (select array[wins, losses, points_for, points_against, diff]
   from public.tournament_standings_raw((select id from t))
   where group_id = 'eeeeeeee-0000-4000-8000-000000000001'),
  array[1, 0, 21, 15, 6], 'ฝ่ายชนะนับถูกทุกช่อง');

select is(
  (select array[wins, losses, points_for, points_against, diff]
   from public.tournament_standings_raw((select id from t))
   where group_id = 'eeeeeeee-0000-4000-8000-000000000002'),
  array[0, 1, 15, 21, -6], 'ฝ่ายแพ้นับถูกทุกช่อง');

-- เรียงด้วยจำนวนชนะก่อน แล้วค่อยผลต่างแต้ม
delete from public.matches where tournament_id is not null;
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-0000000000c1', 21, 19);
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000002',
                         'eeeeeeee-0000-4000-8000-0000000000c1', 21, 3);

select is(
  (select group_id from public.tournament_standings_raw((select id from t)) limit 1),
  'eeeeeeee-0000-4000-8000-000000000002'::uuid,
  'ชนะเท่ากันตัดสินด้วยผลต่างแต้ม');

-- เสมอกันทุกเกณฑ์ที่หัวตาราง = ยังไม่มีแชมป์
delete from public.matches where tournament_id is not null;
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-0000000000c1', 21, 11);
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000002',
                         'eeeeeeee-0000-4000-8000-0000000000c1', 21, 11);

select is(public.tournament_champion((select id from t)), null,
  'สองอันดับแรกเท่ากันทุกเกณฑ์ = ยังไม่มีแชมป์ ไม่ใช่เรียงตามตัวอักษร');

-- หัวตารางที่ชัดเจนคือแชมป์
select pg_temp.add_match('eeeeeeee-0000-4000-8000-000000000001',
                         'eeeeeeee-0000-4000-8000-000000000002', 21, 5);

select is(public.tournament_champion((select id from t)),
  'eeeeeeee-0000-4000-8000-000000000001'::uuid,
  'หัวตารางที่ชัดเจนคือแชมป์');

select * from finish();
rollback;

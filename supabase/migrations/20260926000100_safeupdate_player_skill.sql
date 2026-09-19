-- ยืนยันผลแมตช์ผ่านหน้าเว็บไม่ได้เลย (LSN-0045)
--
-- ```
-- code:    21000
-- message: DELETE requires a WHERE clause
-- ```
--
-- บทบาท `authenticator` ที่ PostgREST ใช้ต่อฐานข้อมูลถูกตั้งไว้ว่า
--
--   session_preload_libraries = supautils, safeupdate
--
-- ส่วนขยาย `safeupdate` ปฏิเสธ DELETE/UPDATE ที่ไม่มี WHERE **ทุกคำสั่งในคำขอนั้น**
-- รวมถึงคำสั่งที่อยู่ข้างในฟังก์ชัน `security definer` ด้วย เพราะมันเป็นการตั้งค่า
-- ระดับ session ไม่ใช่ระดับสิทธิ์
--
-- `recompute_player_skill()` ล้างตารางด้วย `delete from public.player_skill;`
-- แล้วปิดท้ายด้วย `update ... set tier = ...` ที่ไม่มี WHERE ทั้งคู่จึงถูกปฏิเสธ
-- `confirm_match` และ `void_match` ที่เรียกมันต่อจึงล้มทั้งคำสั่ง
--
-- ### ทำไม pgTAP ถึงเขียวมาตลอด
--
-- `safeupdate` ถูก preload ที่บทบาท `authenticator` เท่านั้น เทสรันในสิทธิ์
-- `postgres` จึงไม่โดน — จุดบอดเดียวกับ LSN-0043 เป๊ะ คือเทสเดินคนละทางกับผู้ใช้จริง
-- ตัวที่เฝ้าเรื่องนี้จึงเป็น `tests/sql-needs-where.test.ts` ที่อ่านไฟล์ migration ตรง ๆ

create or replace function public.recompute_player_skill()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_m       record;
  v_ra      numeric;
  v_rb      numeric;
  v_ea      numeric;
  v_sa      numeric;
  v_ka      integer;
  v_kb      integer;
  v_delta_a numeric;
  v_uid     uuid;
begin
  -- เริ่มจากศูนย์ทุกครั้ง แถวเก่าที่ไม่มีแมตช์แล้วต้องหายไปด้วย
  --
  -- `where user_id is not null` ไม่ได้กรองอะไรออก (`user_id` เป็น primary key)
  -- แต่ **ห้ามลบทิ้ง** — ถ้าไม่มี WHERE `safeupdate` จะปฏิเสธคำสั่งนี้
  delete from public.player_skill where user_id is not null;

  for v_m in
    select * from public.matches
    where status = 'confirmed'
    order by played_at, created_at, id
  loop
    -- ผู้เล่นทุกคนที่โผล่มาต้องมีแถวก่อน จะได้เฉลี่ยได้
    foreach v_uid in array (v_m.side_a_players || v_m.side_b_players) loop
      insert into public.player_skill (user_id) values (v_uid)
      on conflict (user_id) do nothing;
    end loop;

    select avg(rating) into v_ra from public.player_skill
    where user_id = any(v_m.side_a_players);
    select avg(rating) into v_rb from public.player_skill
    where user_id = any(v_m.side_b_players);

    v_ea := 1.0 / (1.0 + power(10.0, (v_rb - v_ra) / 400.0));

    -- แบดมินตันไม่มีเสมอ แต่ตารางยอมให้สกอร์เท่ากันได้ ถ้าเจอจริงให้แบ่งครึ่ง
    -- แทนที่จะให้ฝั่งใดฝั่งหนึ่งได้ไปฟรี ๆ
    v_sa := case
      when v_m.score_a > v_m.score_b then 1.0
      when v_m.score_a < v_m.score_b then 0.0
      else 0.5
    end;

    -- K สูงตอนยังไม่ยืนยัน เพื่อให้คนใหม่เข้าที่เร็ว คิดจากสถานะ *ก่อน* แมตช์นี้
    select case when bool_or(provisional) then 40 else 20 end into v_ka
    from public.player_skill where user_id = any(v_m.side_a_players);
    select case when bool_or(provisional) then 40 else 20 end into v_kb
    from public.player_skill where user_id = any(v_m.side_b_players);

    v_delta_a := v_sa - v_ea;

    -- ผู้เล่นทุกคนในฝั่งเดียวกันได้เดลต้าเท่ากัน เพราะผลเป็นของทีม ไม่ใช่ของคน
    update public.player_skill
    set rating = rating + round(v_ka * v_delta_a),
        matches_played = matches_played + 1,
        updated_at = now()
    where user_id = any(v_m.side_a_players);

    update public.player_skill
    set rating = rating + round(v_kb * (-v_delta_a)),
        matches_played = matches_played + 1,
        updated_at = now()
    where user_id = any(v_m.side_b_players);

    update public.player_skill
    set provisional = matches_played < 10
    where user_id = any(v_m.side_a_players || v_m.side_b_players);
  end loop;

  -- WHERE เดียวกันด้วยเหตุผลเดียวกัน
  update public.player_skill set tier = public.skill_tier_of(rating)
  where user_id is not null;
end;
$$;

-- คะแนนฝีมือจากผลแมตช์ (LSN-0031)
--
-- สเปกเรียกเรื่องนี้ว่า "เรื่องที่อันตรายที่สุด" เพราะ flow เดิมอยากให้คนประเมิน
-- ความสามารถกันเองแล้วเอาคะแนนนั้นมากำหนดว่าใครลงรุ่นไหนได้ ซึ่งเปิดช่องโกงสองทาง
--   1. กดคะแนนตัวเองและพวกให้ต่ำ เพื่อลงรุ่นอ่อนแล้วกวาดรางวัล
--   2. ดันคะแนนคู่แข่งให้สูง เพื่อผลักไปรุ่นที่เขาสู้ไม่ไหว
--
-- ทางออกที่สเปกตัดสินคือ **คะแนนที่กำหนดรุ่นต้องมาจากผลการแข่ง ไม่ใช่ความเห็น**
-- การทำให้คะแนนตัวเองต่ำจึงแปลว่าต้องแพ้จริง ซึ่งมีราคาที่ต้องจ่าย
--
-- ⚠️ ห้ามให้ตารางนี้ไปยุ่งกับ player_credit ไม่ว่าทางใด — คนละเรื่องกันสิ้นเชิง
-- player_credit วัดว่าจ่ายเงินตรงไหม ตารางนี้วัดว่าตีเก่งแค่ไหน มือเก่งที่เบี้ยวเงิน
-- ยังต้องถูกตัดสิทธิ์จ่ายทีหลัง และมือใหม่ที่จ่ายตรงไม่ควรได้ลงรุ่นเกินตัว

create table public.player_skill (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  rating         integer not null default 1000,
  tier           public.tournament_tier not null default 'P',
  -- ยังไม่ผ่านสนามจริงพอที่จะเชื่อตัวเลข — ผู้จัดต้องเห็นข้อนี้ได้
  provisional    boolean not null default true,
  matches_played integer not null default 0 check (matches_played >= 0),
  updated_at     timestamptz not null default now()
);

comment on table public.player_skill is
  'คะแนนฝีมือจากผลแมตช์ที่ยืนยันแล้วเท่านั้น · แยกจาก player_credit เด็ดขาด (LSN-0031)';
comment on column public.player_skill.provisional is
  'true = ยังแข่งไม่ถึง 10 แมตช์ที่ยืนยันแล้ว ตัวเลขยังไม่ผ่านสนามจริงพอ';

alter table public.player_skill enable row level security;

-- คะแนนฝีมือเป็นของสาธารณะในวงการอยู่แล้ว ประกาศรับสมัครเขียน "รับมือ N–S"
-- กันเปิดเผย การซ่อนจึงไม่ได้ปกป้องอะไร แต่ทำให้ผู้จัดคัดรุ่นไม่ได้
create policy player_skill_read on public.player_skill
  for select to authenticated using (true);

grant select on public.player_skill to authenticated;
-- ไม่มีใครเขียนตารางนี้ได้เลยนอกจากระบบ ถ้าเขียนเองได้ก็เท่ากับให้คะแนนตัวเอง
-- ซึ่งเป็นช่องโหว่ที่ทั้งฟีเจอร์นี้ตั้งใจปิด
revoke insert, update, delete on public.player_skill from anon, authenticated;
grant all privileges on public.player_skill to service_role;

-- ---------------------------------------------------------------------------
-- คิดคะแนนใหม่ทั้งชุด ไม่บวกทีละแมตช์
--
-- Elo แบบบวกสะสมขึ้นกับลำดับและย้อนกลับไม่ได้เมื่อมีแมตช์ถูก void
-- คอมเมนต์ใน 20260920000100_matches.sql เขียนไว้เองแล้วว่าให้คิดใหม่จากชุดปัจจุบัน
--
-- ต้นทุนเป็น O(จำนวนแมตช์ทั้งหมด) ต่อการยืนยันหนึ่งครั้ง ซึ่งรับได้ที่ขนาดของ MVP
-- และแลกมาด้วยความถูกต้องที่ไม่มีทางเพี้ยนสะสม ถ้าวันหนึ่งแมตช์เยอะจนช้า
-- ให้ย้ายไปคิดเป็นรอบใน runLifecycleSweeps() แทน ไม่ใช่เปลี่ยนไปบวกสะสม
-- ---------------------------------------------------------------------------

create or replace function public.skill_tier_of(p_rating integer)
returns public.tournament_tier language sql immutable as $$
  select case
    when p_rating <  900 then 'N'
    when p_rating < 1000 then 'S'
    when p_rating < 1100 then 'P'
    when p_rating < 1200 then 'C'
    when p_rating < 1300 then 'B'
    else 'A'
  end::public.tournament_tier;
$$;

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
  delete from public.player_skill;

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

  update public.player_skill set tier = public.skill_tier_of(rating);
end;
$$;

-- ไม่ grant ให้ใครเรียกจากข้างนอกเลย เรียกจาก confirm_match และ void_match เท่านั้น
revoke execute on function public.recompute_player_skill() from public;
revoke execute on function public.skill_tier_of(integer)   from public;
grant execute on function public.skill_tier_of(integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ต่อเข้ากับจุดที่ชุดแมตช์ที่ยืนยันแล้วเปลี่ยน
--
-- มีสองจุดเท่านั้น: ยืนยันผล (ชุดโตขึ้น) และยกเลิกผล (ชุดเล็กลง)
-- ส่วน dispute ไม่ต้อง เพราะแมตช์ที่ถูกโต้แย้งยังไม่เคยเข้าชุดตั้งแต่แรก
--
-- เนื้อฟังก์ชันคัดลอกมาจาก 20260920000100_matches.sql ทั้งดุ้น เติมเฉพาะบรรทัด
-- perform public.recompute_player_skill() ก่อน return
-- ---------------------------------------------------------------------------

create or replace function public.confirm_match(p_match_id uuid)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_m    public.matches%rowtype;
  v_recorder_side char;
  v_user_side     char;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'reason', 'match_not_found');
  end if;
  if v_m.status = 'confirmed' then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', 'confirmed');
  end if;
  if v_m.status = 'voided' then
    return jsonb_build_object('ok', false, 'reason', 'match_voided');
  end if;

  -- ตรวจ "คนบันทึกเอง" ก่อนคำนวณฝั่ง ไม่งั้นสาขานี้ไม่มีวันถูกเรียกถึง เพราะ
  -- ฝั่งของคนบันทึกย่อมเท่ากับฝั่งของตัวเองเสมอ แล้ว same_side_cannot_confirm
  -- จะตอบไปก่อน — เหตุผลที่ผู้ใช้เห็นจึงเคยเป็นคนละเรื่องกับสิ่งที่เกิดขึ้นจริง
  if v_user = v_m.recorded_by then
    return jsonb_build_object('ok', false, 'reason', 'recorder_cannot_confirm');
  end if;

  -- ผู้บันทึกอยู่ฝั่งไหน
  v_recorder_side := case
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_a_group_id and user_id = v_m.recorded_by) then 'a'
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_b_group_id and user_id = v_m.recorded_by) then 'b'
    else 'h'   -- เจ้าภาพที่ไม่ได้อยู่ทั้งสองก๊วน
  end;

  -- คนหนึ่งอยู่ได้หลายก๊วน (LSN-0026 ตัดสินไว้) จึงเป็นไปได้ที่เขาอยู่ทั้งสองก๊วน
  -- ในแมตช์เดียวกัน คนแบบนั้น **ยืนยันไม่ได้** เพราะเขาอยู่ฝั่งผู้บันทึกด้วย
  -- เขียนไว้ชัด ๆ แทนที่จะปล่อยให้ลำดับของ CASE เป็นคนตัดสินโดยบังเอิญ
  if exists (select 1 from public.group_members
             where group_id = v_m.side_a_group_id and user_id = v_user)
     and exists (select 1 from public.group_members
                 where group_id = v_m.side_b_group_id and user_id = v_user) then
    return jsonb_build_object('ok', false, 'reason', 'in_both_sides_cannot_confirm');
  end if;

  v_user_side := case
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_a_group_id and user_id = v_user) then 'a'
    when exists (select 1 from public.group_members
                 where group_id = v_m.side_b_group_id and user_id = v_user) then 'b'
    else null
  end;

  if v_user_side is null then
    return jsonb_build_object('ok', false, 'reason', 'not_in_match');
  end if;
  -- เพื่อนร่วมก๊วนของผู้บันทึกยืนยันแทนไม่ได้
  if v_user_side = v_recorder_side then
    return jsonb_build_object('ok', false, 'reason', 'same_side_cannot_confirm');
  end if;
  update public.matches
  set status = 'confirmed', confirmed_by = v_user, confirmed_at = now()
  where id = p_match_id;

  perform public.app_log(v_user, 'match', p_match_id, null, 'match.confirmed',
    v_m.status::text, 'confirmed', '{}'::jsonb);


  -- คะแนนฝีมือคิดใหม่ทั้งชุดจากแมตช์ที่ยืนยันแล้ว (LSN-0031)
  perform public.recompute_player_skill();
  return jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

create or replace function public.void_match(p_match_id uuid, p_reason text)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_m    public.matches%rowtype;
begin
  select * into v_m from public.matches where id = p_match_id for update;
  if v_m.id is null then
    return jsonb_build_object('ok', false, 'reason', 'match_not_found');
  end if;
  if not public.is_tournament_host(v_m.tournament_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_host');
  end if;
  if v_m.status = 'voided' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  update public.matches
  set status = 'voided', voided_by = v_user, voided_at = now(),
      void_reason = nullif(btrim(coalesce(p_reason, '')), '')
  where id = p_match_id;

  perform public.app_log(v_user, 'match', p_match_id, null, 'match.voided',
    v_m.status::text, 'voided', jsonb_build_object('reason', p_reason));


  -- คะแนนฝีมือคิดใหม่ทั้งชุดจากแมตช์ที่ยืนยันแล้ว (LSN-0031)
  perform public.recompute_player_skill();
  return jsonb_build_object('ok', true, 'status', 'voided');
end;
$$;

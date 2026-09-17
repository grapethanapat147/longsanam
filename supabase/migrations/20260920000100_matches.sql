-- บันทึกผลแมตช์ + ยืนยันสองฝั่ง (LSN-0030)
--
-- ตั๋วนี้ไม่คิดคะแนนอะไรเลย มันสร้าง **แหล่งข้อมูลที่โกงยาก** ให้ LSN-0031
-- ใช้คิดคะแนนฝีมือทีหลัง และการยืนยันสองฝั่งคือหัวใจ ไม่ใช่ของแถม
--
-- สเปกเขียนไว้ตรง ๆ ว่า "ผลแมตช์ที่ฝั่งเดียวกรอกได้เองคือช่องโหว่เดียวกับ
-- การให้คะแนนกันเอง" ถ้าข้อนี้พัง คะแนนฝีมือทั้งระบบก็ไร้ความหมายตั้งแต่วันแรก

create type public.match_status as enum ('recorded', 'confirmed', 'disputed', 'voided');

comment on type public.match_status is
  'มีสถานะเดียวที่นับเป็นผลการแข่งคือ confirmed · recorded disputed voided ไม่นับทั้งหมด';

create table public.matches (
  id              uuid primary key default gen_random_uuid(),
  tournament_id   uuid not null references public.tournaments(id) on delete cascade,
  side_a_group_id uuid not null references public.groups(id),
  side_b_group_id uuid not null references public.groups(id),
  side_a_players  uuid[] not null,
  side_b_players  uuid[] not null,
  score_a         integer not null check (score_a >= 0),
  score_b         integer not null check (score_b >= 0),
  court_label     text,
  played_at       timestamptz not null default now(),
  status          public.match_status not null default 'recorded',
  recorded_by     uuid not null references public.profiles(id),
  confirmed_by    uuid references public.profiles(id),
  confirmed_at    timestamptz,
  disputed_by     uuid references public.profiles(id),
  disputed_at     timestamptz,
  dispute_note    text,
  voided_by       uuid references public.profiles(id),
  voided_at       timestamptz,
  void_reason     text,
  created_at      timestamptz not null default now(),
  constraint matches_two_sides check (side_a_group_id <> side_b_group_id),
  -- coalesce จำเป็น ไม่ใช่ของประดับ: array_length('{}', 1) คืน NULL ไม่ใช่ 0
  -- และ CHECK ที่ได้ NULL คือ CHECK ที่ "ผ่าน" แถวที่ไม่มีผู้เล่นสักคนจึงลอด
  -- ด่านที่หน้าตาเหมือนบังคับ 1 ถึง 2 ไปได้เงียบ ๆ
  constraint matches_side_a_size
    check (coalesce(array_length(side_a_players, 1), 0) between 1 and 2),
  constraint matches_side_b_size
    check (coalesce(array_length(side_b_players, 1), 0) between 1 and 2),
  -- คนหนึ่งอยู่ได้หลายก๊วน (LSN-0026) จึงใส่ชื่อคนเดียวกันทั้งสองฝั่งได้
  -- ซึ่งแปลว่าเขาแข่งกับตัวเอง และ LSN-0031 จะบวกและลบคะแนนคนเดียวกัน
  -- จากแมตช์เดียว
  constraint matches_no_player_on_both_sides
    check (not (side_a_players && side_b_players)),
  -- ⚠️ ด่านนี้คือทั้งหมดของความน่าเชื่อถือของคะแนนใน LSN-0031
  --
  -- อยู่ที่ระดับตาราง **ไม่ใช่แค่ใน RPC** เพราะด่านที่อยู่ในโค้ดอย่างเดียว
  -- คือด่านที่หายไปได้เงียบ ๆ ตอนมีคนเขียน RPC ตัวที่สอง หรือตอนมีใครแก้
  -- แถวตรง ๆ ด้วย service_role
  constraint matches_confirmer_is_not_recorder
    check (status <> 'confirmed'
           or (confirmed_by is not null and confirmed_by <> recorded_by))
);

comment on column public.matches.court_label is
  'ป้ายสำหรับคนอ่านเท่านั้น เช่น "คอร์ต 3" ไม่มีอะไรในระบบคำนวณจากค่านี้';

create index matches_tournament_idx on public.matches (tournament_id);

-- ---------------------------------------------------------------------------
-- ต้นฉบับเดียวของคำว่า "แมตช์ที่นับได้"
--
-- ให้ทุกที่เรียกฟังก์ชันนี้ แทนที่จะให้แต่ละที่เขียน where status = 'confirmed'
-- เอง — บทเรียนเดียวกับ session_denominator() ใน LSN-0024 ที่กติกาตัวหาร
-- เคยถูกคัดลอกไปเจ็ดที่แล้วเริ่มไม่ตรงกัน
-- ---------------------------------------------------------------------------

create or replace function public.confirmed_matches(p_tournament_id uuid)
returns setof public.matches
language sql stable
set search_path = public, pg_temp as $$
  select * from public.matches
  where tournament_id = p_tournament_id and status = 'confirmed';
$$;

-- ---------------------------------------------------------------------------
-- ทีมในทัวร์นาเมนต์เดียวกันต้องเห็น **รายชื่อสมาชิก** ของกันและกัน
--
-- LSN-0029 เปิดให้เห็น *ชื่อก๊วน* ข้ามทีมแล้ว แต่ยังไม่เปิดรายชื่อสมาชิก
-- ซึ่งกลายเป็นปัญหาทันทีที่มีแมตช์ เพราะ
--
--   1. ฟอร์มบันทึกผลต้องเลือกผู้เล่นฝั่งตรงข้าม จึงต้องรู้ว่าฝั่งนั้นมีใคร
--   2. หน้าจอต้องรู้ว่าผู้บันทึกอยู่ฝั่งไหน เพื่อตัดสินว่าจะโชว์ปุ่มยืนยันให้ใคร
--
-- เจอตอนตรวจหน้าจอจริง: คนฝั่งตรงข้ามที่ *ควร* ยืนยันได้กลับไม่เห็นปุ่ม
-- เพราะหน้าจออ่านสมาชิกของอีกก๊วนไม่ได้เลย
--
-- ขอบเขตที่เปิดคือ **สมาชิกของก๊วนที่อยู่ในทัวร์นาเมนต์เดียวกัน** เท่านั้น
-- คนนอกงานยังไม่เห็นอะไร และหน้ารับสมัครก็ยังไม่บอกว่าก๊วนไหนสมัครแล้ว
-- ---------------------------------------------------------------------------

drop policy if exists group_members_read on public.group_members;
create policy group_members_read on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id)
         or public.shares_tournament_with_group(group_id)
         or public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- RLS — ใช้ helper ที่ LSN-0029 สร้างไว้แล้ว ไม่เขียนใหม่
-- ---------------------------------------------------------------------------

alter table public.matches enable row level security;

create policy matches_read on public.matches
  for select to authenticated
  using (public.is_tournament_host(tournament_id)
         or public.is_tournament_team_member(tournament_id)
         or public.is_platform_admin());

grant select on public.matches to authenticated;
revoke insert, update, delete on public.matches from anon, authenticated;
grant all privileges on public.matches to service_role;

-- ---------------------------------------------------------------------------
-- บันทึกผล
-- ---------------------------------------------------------------------------

create or replace function public.record_match(
  p_tournament_id uuid,
  p_side_a_group  uuid,
  p_side_b_group  uuid,
  p_side_a_players uuid[],
  p_side_b_players uuid[],
  p_score_a       integer,
  p_score_b       integer,
  p_court_label   text default null
) returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  v_user uuid := auth.uid();
  v_t    public.tournaments%rowtype;
  v_id   uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_t from public.tournaments where id = p_tournament_id;
  if v_t.id is null then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_found');
  end if;

  -- allowlist ไม่ใช่ denylist — บทเรียนจาก LSN-0020 และ LSN-0029
  -- แมตช์บันทึกได้เฉพาะงานที่พร้อมแข่งหรือแข่งไปแล้วเท่านั้น
  if v_t.status not in ('ready', 'booked', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'tournament_not_playable');
  end if;

  -- ทั้งสองก๊วนต้องเป็นทีมในงานนี้จริง
  if not exists (select 1 from public.tournament_teams
                 where tournament_id = p_tournament_id and group_id = p_side_a_group)
     or not exists (select 1 from public.tournament_teams
                    where tournament_id = p_tournament_id and group_id = p_side_b_group) then
    return jsonb_build_object('ok', false, 'reason', 'team_not_registered');
  end if;

  -- ผู้บันทึกต้องอยู่ในแมตช์นั้น หรือเป็นเจ้าภาพ
  if not (public.is_group_member(p_side_a_group)
          or public.is_group_member(p_side_b_group)
          or public.is_tournament_host(p_tournament_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_match');
  end if;

  -- จำนวนผู้เล่นต้องถูกต้อง ตรวจที่ RPC ด้วยเพื่อให้ได้เหตุผลที่คนอ่านรู้เรื่อง
  -- แทนที่จะปล่อยให้ constraint ดังเป็น error ดิบ
  if coalesce(array_length(p_side_a_players, 1), 0) not between 1 and 2
     or coalesce(array_length(p_side_b_players, 1), 0) not between 1 and 2 then
    return jsonb_build_object('ok', false, 'reason', 'bad_player_count');
  end if;

  -- คนเดียวกันอยู่สองฝั่งไม่ได้ และอยู่ซ้ำในฝั่งเดียวกันก็ไม่ได้
  -- ข้อหลังเขียนที่นี่ ไม่ใช่ที่ constraint เพราะ CHECK มี subquery ไม่ได้
  if p_side_a_players && p_side_b_players then
    return jsonb_build_object('ok', false, 'reason', 'player_on_both_sides');
  end if;
  if cardinality(p_side_a_players)
       <> (select count(distinct u) from unnest(p_side_a_players) u)
     or cardinality(p_side_b_players)
       <> (select count(distinct u) from unnest(p_side_b_players) u) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate_player');
  end if;

  -- ผู้เล่นที่ระบุต้องเป็นสมาชิกของก๊วนฝั่งนั้นจริง
  -- ไม่งั้นใครก็ยัดชื่อคนนอกเข้าไปแล้วทำให้คะแนนเขาขยับได้ใน LSN-0031
  if exists (select 1 from unnest(p_side_a_players) u
             where not exists (select 1 from public.group_members m
                               where m.group_id = p_side_a_group and m.user_id = u))
     or exists (select 1 from unnest(p_side_b_players) u
                where not exists (select 1 from public.group_members m
                                  where m.group_id = p_side_b_group and m.user_id = u)) then
    return jsonb_build_object('ok', false, 'reason', 'player_not_in_group');
  end if;

  insert into public.matches
    (tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
     score_a, score_b, court_label, recorded_by)
  values
    (p_tournament_id, p_side_a_group, p_side_b_group, p_side_a_players, p_side_b_players,
     p_score_a, p_score_b, nullif(btrim(coalesce(p_court_label, '')), ''), v_user)
  returning id into v_id;

  perform public.app_log(v_user, 'match', v_id, null, 'match.recorded', null, 'recorded',
    jsonb_build_object('tournamentId', p_tournament_id,
                       'scoreA', p_score_a, 'scoreB', p_score_b));

  return jsonb_build_object('ok', true, 'matchId', v_id, 'status', 'recorded');
end;
$$;

-- ---------------------------------------------------------------------------
-- ยืนยัน — เฉพาะ **ฝั่งตรงข้ามกับผู้บันทึก**
--
-- จุดที่พลาดง่ายที่สุดของทั้งตั๋ว: เช็คแค่ `auth.uid() <> recorded_by` ไม่พอ
-- เพราะเพื่อนร่วมก๊วนของผู้บันทึกก็ผ่านเงื่อนไขนั้น แล้วการยืนยันก็ไม่ได้
-- แปลว่าอะไรเลย ต้องหาว่าผู้บันทึกอยู่ฝั่งไหน แล้วอนุญาตเฉพาะอีกฝั่ง
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

  return jsonb_build_object('ok', true, 'status', 'confirmed');
end;
$$;

-- ---------------------------------------------------------------------------
-- โต้แย้ง — ผลที่ถูกโต้แย้งไม่นับ เหมือนที่ยังไม่ยืนยัน
-- ---------------------------------------------------------------------------

create or replace function public.dispute_match(p_match_id uuid, p_note text)
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
  if v_m.status = 'disputed' then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;
  if v_m.status = 'voided' then
    return jsonb_build_object('ok', false, 'reason', 'match_voided');
  end if;
  if not (public.is_group_member(v_m.side_a_group_id)
          or public.is_group_member(v_m.side_b_group_id)) then
    return jsonb_build_object('ok', false, 'reason', 'not_in_match');
  end if;

  update public.matches
  set status = 'disputed', disputed_by = v_user, disputed_at = now(),
      dispute_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_match_id;

  perform public.app_log(v_user, 'match', p_match_id, null, 'match.disputed',
    v_m.status::text, 'disputed', jsonb_build_object('note', p_note));

  return jsonb_build_object('ok', true, 'status', 'disputed');
end;
$$;

-- ---------------------------------------------------------------------------
-- ยกเลิกผล — เฉพาะเจ้าภาพ
--
-- ผลที่ยืนยันแล้วแก้ตัวเลขในแถวเดิมไม่ได้เด็ดขาด ถ้าผิดจริงให้ void
-- แล้วบันทึกใหม่ · ผลคือชุดของแมตช์ที่ confirmed แค่เล็กลง LSN-0031 จึงคิด
-- คะแนนใหม่จากชุดปัจจุบันได้เหมือนเดิม ไม่ต้องมีกลไกคิดย้อนหลัง
--
-- ทีมใดทีมหนึ่ง void ไม่ได้ เพราะทีมที่ลบผลที่ตัวเองแพ้ได้คือช่องโกงตรงตัว
-- ---------------------------------------------------------------------------

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

  return jsonb_build_object('ok', true, 'status', 'voided');
end;
$$;

-- ---------------------------------------------------------------------------
-- สิทธิ์เรียก
-- ---------------------------------------------------------------------------

revoke execute on function public.confirmed_matches(uuid) from public;
revoke execute on function public.record_match(uuid, uuid, uuid, uuid[], uuid[], integer, integer, text) from public;
revoke execute on function public.confirm_match(uuid) from public;
revoke execute on function public.dispute_match(uuid, text) from public;
revoke execute on function public.void_match(uuid, text) from public;

grant execute on function public.confirmed_matches(uuid) to authenticated, service_role;
grant execute on function public.record_match(uuid, uuid, uuid, uuid[], uuid[], integer, integer, text) to authenticated, service_role;
grant execute on function public.confirm_match(uuid) to authenticated, service_role;
grant execute on function public.dispute_match(uuid, text) to authenticated, service_role;
grant execute on function public.void_match(uuid, text) to authenticated, service_role;

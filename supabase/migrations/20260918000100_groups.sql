-- ก๊วนที่คงอยู่ข้ามครั้ง (LSN-0026)
--
-- ก่อนไฟล์นี้ "ก๊วน" ในระบบคือ sessions หนึ่งแถว = การนัดเล่นหนึ่งครั้ง
-- ไม่มีอะไรผูกนัดนี้กับนัดหน้าเลย หลังไฟล์นี้ ก๊วนคือ **กลุ่มคน** ที่คงอยู่
-- และนัดจะผูกกับก๊วนก็ได้ ไม่ผูกก็ได้
--
-- ข้อที่สำคัญที่สุดของไฟล์นี้คือสิ่งที่มัน **ไม่** ทำ: sessions.group_id เป็น
-- nullable ไม่มี default ไม่มี trigger การตั้งนัดโดยไม่มีก๊วนจึงเดินเส้นทางเดิม
-- ทุกบรรทัด ซึ่งเป็นทางเข้าหลักของโปรดักต์ที่ห้ามพัง

-- ---------------------------------------------------------------------------
-- ตาราง
-- ---------------------------------------------------------------------------

create table public.groups (
  id            uuid primary key default gen_random_uuid(),
  public_code   text unique,
  name          text not null check (btrim(name) <> '' and length(name) <= 80),
  sport_id      uuid not null references public.sports(id),
  home_district text,
  created_by    uuid not null references public.profiles(id),
  archived_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.groups is
  'กลุ่มคนที่เล่นด้วยกันประจำ · archive ไม่ลบจริง เพราะนัดเก่ามีเงินผูกอยู่';

create table public.group_members (
  group_id  uuid not null references public.groups(id) on delete cascade,
  user_id   uuid not null references public.profiles(id) on delete cascade,
  role      text not null check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- PK (group_id, user_id) ทำให้ "หนึ่งคนหนึ่งแถวต่อก๊วน" จริงโดยโครงสร้าง
-- ซึ่งเป็นสิ่งที่ทำให้แจ้งเตือนซ้ำเป็นไปไม่ได้ ไม่ต้องพึ่ง group by ตอน query

create unique index groups_single_owner
  on public.group_members (group_id) where role = 'owner';

-- ---------------------------------------------------------------------------
-- โค้ดเชิญ
--
-- generate_session_code() ที่มีอยู่แล้วตรวจซ้ำกับ **ตาราง sessions เท่านั้น**
-- เอามาใช้กับ groups ตรง ๆ จะได้โค้ดที่ไม่การันตีว่าไม่ซ้ำในตารางของตัวเอง
-- จึงต้องมีตัวใหม่ ใช้ตัวอักษรชุดเดียวกันและความยาวเท่ากัน
--
-- โค้ดก๊วนชนกับโค้ดนัดได้ และยอมรับได้ เพราะคนละ route (/s/ กับ /g/)
-- ---------------------------------------------------------------------------

create or replace function public.generate_group_code()
returns text
language plpgsql
volatile
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i integer;
begin
  loop
    v_code := '';
    for v_i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.groups_assign_code()
returns trigger
language plpgsql
as $$
begin
  if new.public_code is null or new.public_code = '' then
    new.public_code := public.generate_group_code();
  end if;
  return new;
end;
$$;

create trigger groups_assign_code
  before insert on public.groups
  for each row execute function public.groups_assign_code();

-- ---------------------------------------------------------------------------
-- นัดผูกกับก๊วนก็ได้ ไม่ผูกก็ได้
--
-- on delete set null เพราะ archive_group ไม่ลบจริงอยู่แล้ว แต่ถ้าวันหนึ่ง
-- มีการลบจริง (แอดมิน / GDPR) นัดเก่าต้องไม่หายไปด้วย มันมีเงิน การจ่าย
-- การคืนเงิน และใบสรุปผูกอยู่
-- ---------------------------------------------------------------------------

alter table public.sessions
  add column if not exists group_id uuid references public.groups(id) on delete set null;

create index if not exists sessions_group_id_idx on public.sessions (group_id)
  where group_id is not null;

-- ---------------------------------------------------------------------------
-- Helper สำหรับ RLS
--
-- ⚠️ ต้องเป็น security definer ไม่ใช่เพื่อความสะดวก แต่เพราะ **ถ้าไม่ใช่
-- จะวนลูปไม่รู้จบ** — policy บน group_members ที่ถามว่า "คุณอยู่ก๊วนนี้ไหม"
-- ต้อง query group_members ซึ่งเป็นตารางเดียวกับที่ policy กำลังบังคับอยู่
-- security definer ทำให้ query ข้างในข้าม RLS จึงตัดวงจรนั้น
--
-- แบบแผนเดียวกับ is_session_organizer / is_session_participant ใน
-- 20260901000150_rls_helpers.sql
-- ---------------------------------------------------------------------------

create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_owner(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid() and role = 'owner'
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS — อ่านได้เฉพาะคนในก๊วน เขียนผ่าน RPC เท่านั้น
-- ---------------------------------------------------------------------------

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;

create policy groups_read on public.groups
  for select to authenticated
  using (public.is_group_member(id) or public.is_platform_admin());

create policy group_members_read on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id) or public.is_platform_admin());

grant select on public.groups, public.group_members to authenticated;
revoke insert, update, delete on public.groups        from anon, authenticated;
revoke insert, update, delete on public.group_members from anon, authenticated;

-- service_role ต้อง grant ตรง ๆ ทุกตารางใหม่
-- `grant all privileges on all tables in schema public to service_role` ใน
-- 20260901000300_rls.sql เป็นคำสั่งที่ทำงาน **ครั้งเดียวตอนนั้น** ตารางที่สร้าง
-- ทีหลังไม่ได้สิทธิ์ตามไปด้วย — กับดักเดียวกับที่ LSN-0024 เจอมาแล้ว
grant all privileges on public.groups        to service_role;
grant all privileges on public.group_members to service_role;

-- ---------------------------------------------------------------------------
-- สร้างก๊วน — ผู้สร้างเป็น owner ในทรานแซกชันเดียวกัน
-- ---------------------------------------------------------------------------

create or replace function public.create_group(
  p_name          text,
  p_sport_id      uuid,
  p_home_district text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if btrim(coalesce(p_name, '')) = '' then
    return jsonb_build_object('ok', false, 'reason', 'name_required');
  end if;
  if not exists (select 1 from public.sports where id = p_sport_id) then
    return jsonb_build_object('ok', false, 'reason', 'sport_not_found');
  end if;

  insert into public.groups (name, sport_id, home_district, created_by)
  values (btrim(p_name), p_sport_id, nullif(btrim(coalesce(p_home_district, '')), ''), v_user)
  returning id into v_id;

  -- owner ถูกใส่ในทรานแซกชันเดียวกับการสร้าง ไม่ใช่ขั้นตอนแยก
  -- ก๊วนที่ไม่มีเจ้าของจึงเกิดขึ้นไม่ได้แม้ระหว่างทาง
  insert into public.group_members (group_id, user_id, role)
  values (v_id, v_user, 'owner');

  perform public.app_log(v_user, 'group', v_id, null, 'group.created', null, 'active',
    jsonb_build_object('name', btrim(p_name)));

  return jsonb_build_object('ok', true, 'groupId', v_id,
    'publicCode', (select public_code from public.groups where id = v_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- หน้ารับเชิญ — คนที่ยังไม่ล็อกอินต้องเห็นว่ากำลังจะเข้าก๊วนอะไร
--
-- คืนเฉพาะสามอย่าง ไม่คืนรายชื่อสมาชิก เพราะ RLS เป็น row-level ไม่ใช่
-- column-level การ "ปิดบางคอลัมน์" ทำไม่ได้ด้วย policy ต้องไม่คืนมันออกมา
-- ตั้งแต่ต้น — บทเรียนจาก LSN-0023
-- ---------------------------------------------------------------------------

create or replace function public.group_invite_public(p_code text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select case when g.id is null then null else jsonb_build_object(
    'name', g.name,
    'sportSlug', s.slug,
    'memberCount', (select count(*) from public.group_members m where m.group_id = g.id),
    'archived', g.archived_at is not null
  ) end
  from (select 1) _
  left join public.groups g on g.public_code = upper(btrim(p_code))
  left join public.sports s on s.id = g.sport_id;
$$;

-- ---------------------------------------------------------------------------
-- เข้าร่วม — เข้าซ้ำไม่สร้างแถวซ้ำ
-- ---------------------------------------------------------------------------

create or replace function public.join_group(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user  uuid := auth.uid();
  v_group public.groups%rowtype;
  v_added boolean;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_group from public.groups where public_code = upper(btrim(p_code));
  if v_group.id is null then
    return jsonb_build_object('ok', false, 'reason', 'group_not_found');
  end if;
  if v_group.archived_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'group_archived');
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_group.id, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  v_added := found;

  if v_added then
    perform public.app_log(v_user, 'group', v_group.id, null, 'group.joined', null, 'member',
      '{}'::jsonb);
  end if;

  return jsonb_build_object('ok', true, 'groupId', v_group.id, 'joined', v_added);
end;
$$;

-- ---------------------------------------------------------------------------
-- ออกจากก๊วน — เจ้าของออกไม่ได้
--
-- ถ้าเจ้าของออกได้ ก๊วนจะเหลือแต่สมาชิกที่ไม่มีใครลบหรือ archive ได้เลย
-- ซึ่งเป็นสถานะที่ซ่อมไม่ได้จากในแอป
-- ---------------------------------------------------------------------------

create or replace function public.leave_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_role text;
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select role into v_role from public.group_members
  where group_id = p_group_id and user_id = v_user;

  if v_role is null then
    return jsonb_build_object('ok', false, 'reason', 'not_a_member');
  end if;
  if v_role = 'owner' then
    return jsonb_build_object('ok', false, 'reason', 'owner_cannot_leave');
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = v_user;

  perform public.app_log(v_user, 'group', p_group_id, null, 'group.left', 'member', null,
    '{}'::jsonb);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- Archive — ไม่ลบจริง
-- ---------------------------------------------------------------------------

create or replace function public.archive_group(p_group_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;
  if not public.is_group_owner(p_group_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_owner');
  end if;

  update public.groups set archived_at = now(), updated_at = now()
  where id = p_group_id and archived_at is null;

  if not found then
    return jsonb_build_object('ok', true, 'replayed', true);
  end if;

  perform public.app_log(v_user, 'group', p_group_id, null, 'group.archived', 'active',
    'archived', '{}'::jsonb);

  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- แจ้งเตือนสมาชิกเมื่อมีนัดใหม่ของก๊วน
--
-- หนึ่งแถวต่อคน และไม่รวมผู้ตั้งเอง — ไม่ต้อง group by เพราะ PK ของ
-- group_members คือ (group_id, user_id) อยู่แล้ว ซ้ำเกิดไม่ได้โดยโครงสร้าง
-- ---------------------------------------------------------------------------

create or replace function public.notify_group_new_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
  v_row     record;
  v_people  integer := 0;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.group_id is null then
    return jsonb_build_object('ok', true, 'notified', 0);
  end if;
  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  for v_row in
    select m.user_id from public.group_members m
    where m.group_id = v_session.group_id
      and m.user_id <> v_session.organizer_id
  loop
    perform public.notify_user(v_row.user_id, p_session_id, 'group_new_session',
      'ก๊วนมีนัดใหม่',
      v_session.title || ' — กดดูรายละเอียดและเข้าร่วมได้เลย',
      '/s/' || v_session.public_code);
    v_people := v_people + 1;
  end loop;

  perform public.app_log(auth.uid(), 'session', p_session_id, p_session_id,
    'session.group_notified', null, null,
    jsonb_build_object('groupId', v_session.group_id, 'notified', v_people));

  return jsonb_build_object('ok', true, 'notified', v_people);
end;
$$;

-- ---------------------------------------------------------------------------
-- สิทธิ์เรียกฟังก์ชัน
--
-- group_invite_public ต้อง grant ให้ anon ตรงนี้ **ไม่ใช่ไปเพิ่มชื่อใน array
-- v_public ของ 20260901000300_rls.sql** เพราะ array นั้นอยู่ใน do block ที่
-- ทำงานครั้งเดียวตอน apply การเพิ่มชื่อทีหลังจึงเป็น no-op — กับดักเดียวกับ
-- ที่ LSN-0023 เจอ
-- ---------------------------------------------------------------------------

revoke execute on function public.create_group(text, uuid, text) from public;
revoke execute on function public.join_group(text)               from public;
revoke execute on function public.leave_group(uuid)              from public;
revoke execute on function public.archive_group(uuid)            from public;
revoke execute on function public.notify_group_new_session(uuid) from public;
revoke execute on function public.group_invite_public(text)      from public;

grant execute on function public.create_group(text, uuid, text) to authenticated, service_role;
grant execute on function public.join_group(text)               to authenticated, service_role;
grant execute on function public.leave_group(uuid)              to authenticated, service_role;
grant execute on function public.archive_group(uuid)            to authenticated, service_role;
grant execute on function public.notify_group_new_session(uuid) to authenticated, service_role;
grant execute on function public.group_invite_public(text)      to anon, authenticated, service_role;
grant execute on function public.is_group_member(uuid)          to anon, authenticated, service_role;
grant execute on function public.is_group_owner(uuid)           to anon, authenticated, service_role;

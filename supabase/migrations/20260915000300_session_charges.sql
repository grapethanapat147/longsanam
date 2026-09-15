-- รายการเก็บเงินเพิ่มหลังจบก๊วน (LSN-0024)
--
-- LSN-0021 หารค่าใช้จ่ายตามคนที่มาจริงได้แล้ว แต่เก็บค่าลูกไว้ในช่องเดียวชื่อ
-- sessions.shuttle_cost_thb ซึ่งตั้งชื่อไม่ได้ แยกประเภทไม่ได้ และหารเท่ากันทุกคนเสมอ
-- ทั้งที่ค่าไม้ควรลงเฉพาะคนที่ยืม
--
-- ตารางนี้ **ไม่แตะ** shuttle_cost_thb และ **ไม่แตะ** ยอดที่แต่ละคนตกลงจ่ายไปแล้ว
-- กติกาของ LSN-0021 ห้ามเขียนทับยอดที่ตกลงไปแล้ว ไม่ได้ห้ามขอเงินเพิ่ม
-- รายการเพิ่มเติมจึงสร้าง payments แถวใหม่ของตัวเอง

create type public.charge_split_mode as enum ('all', 'named');

create table public.session_charges (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references public.sessions(id) on delete cascade,
  label       text not null check (length(btrim(label)) between 1 and 80),
  -- เพดานตัวแรกของสคีมา และตั้งใจให้ต่างจากคอลัมน์เงินอื่นทุกคอลัมน์
  -- ที่อื่นผู้เล่นเห็นตัวเลขแล้วกดยอมรับก่อน ที่นี่ผู้จัดพิมพ์เลขเองแล้วมัน
  -- กลายเป็นหนี้ของคนอื่นทันที
  --
  -- > 0 ไม่ใช่ >= 0 เพราะรายการ ฿0 จะสร้าง payment ฿0 กับแจ้งเตือนคนที่ไม่ได้ติดเงิน
  -- <= 100000 เป็นเพดานกันพิมพ์ผิด ไม่ใช่เพดานเชิงธุรกิจ มันจับ "เผลอใส่ศูนย์เกิน"
  -- โดยไม่เคยขวางยอดจริงของก๊วนสมัครเล่น
  amount_thb  integer not null check (amount_thb > 0 and amount_thb <= 100000),
  split_mode  public.charge_split_mode not null,
  created_by  uuid not null references public.profiles(id),
  created_at  timestamptz not null default now(),
  -- null = ฉบับร่าง ยังไม่มีหนี้ ยังไม่แจ้งใคร
  notified_at timestamptz,
  -- ลบแล้วไม่หายไปจากประวัติ หนี้ที่เคยมีอยู่จริงต้องอธิบายได้ทีหลัง
  voided_at   timestamptz
);

create table public.session_charge_shares (
  id             uuid primary key default gen_random_uuid(),
  charge_id      uuid not null references public.session_charges(id) on delete cascade,
  participant_id uuid not null references public.session_participants(id) on delete cascade,
  amount_thb     integer not null check (amount_thb > 0),
  unique (charge_id, participant_id)
);

-- ---------------------------------------------------------------------------
-- ต่อหนี้ของรายการเพิ่มเติมเข้ากับ payments
--
-- payments_one_live_per_participant เดิมบังคับว่า "หนึ่งที่นั่ง หนึ่ง payment
-- ที่ยังมีชีวิต" ซึ่งเป็น invariant ที่ pay-later พึ่งอยู่จริง — comment ใน
-- 20260905000100 เตือนไว้ว่าถ้าเผลอสร้างแถวที่สอง ที่นั่งจะโดน
-- expire_overdue_payments() กวาดทิ้งเงียบ ๆ
--
-- แต่ทุกคนที่จ่ายค่าหัวไปแล้วมี payment สถานะ paid ค้างอยู่ การเรียกเก็บเพิ่ม
-- จึงชน index นั้นทันที spec เขียนว่า "รายการเพิ่มเติมสร้าง payments แถวใหม่"
-- ซึ่งสคีมาเดิมห้ามไว้
--
-- ทางออกคือ **จำกัดขอบเขต invariant เดิม ไม่ใช่ทำให้มันอ่อนลง**: หนึ่งที่นั่ง
-- ยังมี payment ของค่าหัวที่ยังมีชีวิตได้แค่แถวเดียวเหมือนเดิม ส่วนหนี้ของ
-- รายการเพิ่มเติมมี invariant ของตัวเองคือหนึ่งส่วนแบ่ง หนึ่ง payment
-- ---------------------------------------------------------------------------

alter table public.payments
  add column if not exists charge_share_id uuid
    references public.session_charge_shares(id) on delete set null;

comment on column public.payments.charge_share_id is
  'มีค่าเมื่อแถวนี้เป็นหนี้ของรายการเก็บเงินเพิ่ม (LSN-0024) · null สำหรับค่าหัวปกติ';

drop index if exists public.payments_one_live_per_participant;
create unique index payments_one_live_per_participant
  on public.payments (participant_id)
  where status in ('pending', 'paid') and charge_share_id is null;

create unique index payments_one_live_per_charge_share
  on public.payments (charge_share_id)
  where status in ('pending', 'paid');

create index session_charges_session_live_idx
  on public.session_charges (session_id) where voided_at is null;
create index session_charge_shares_participant_idx
  on public.session_charge_shares (participant_id);

comment on column public.session_charges.notified_at is
  'null แปลว่ายังเป็นฉบับร่าง — ยังไม่มีหนี้และยังไม่แจ้งใคร payments สร้างตอนกดส่งเท่านั้น';
comment on table public.session_charge_shares is
  'ส่วนแบ่งคำนวณตอนสร้างและเก็บเป็นแถว ไม่คำนวณสด เพราะยอดที่คนหนึ่งถูกเรียกเก็บต้องไม่เปลี่ยนเมื่อสมาชิกก๊วนเปลี่ยน';

-- ---------------------------------------------------------------------------
-- RLS — อ่านได้เฉพาะคนในก๊วน เขียนผ่าน RPC เท่านั้น
-- ---------------------------------------------------------------------------

alter table public.session_charges       enable row level security;
alter table public.session_charge_shares enable row level security;

create policy charges_read on public.session_charges
  for select to authenticated
  using (
    public.is_session_organizer(session_id)
    or public.is_session_participant(session_id)
    or public.is_platform_admin()
  );

create policy charge_shares_read on public.session_charge_shares
  for select to authenticated
  using (exists (
    select 1 from public.session_charges c
    where c.id = charge_id
      and (public.is_session_organizer(c.session_id)
           or public.is_session_participant(c.session_id)
           or public.is_platform_admin())
  ));

-- anon ไม่ได้อะไรเลยทั้งสองตาราง — label เป็นข้อความที่ผู้จัดพิมพ์เอง
-- และพิมพ์ชื่อคนลงไปได้ ถ้าหลุดถึงคนนอกจะเป็นทางอ้อมเข้าสู่สิ่งที่ LSN-0023 อุดไว้
grant select on public.session_charges, public.session_charge_shares to authenticated;
revoke insert, update, delete on public.session_charges       from anon, authenticated;
revoke insert, update, delete on public.session_charge_shares from anon, authenticated;

-- ---------------------------------------------------------------------------
-- สร้างรายการ — ฉบับร่าง ยังไม่มีหนี้ ยังไม่แจ้งใคร
-- ---------------------------------------------------------------------------

create or replace function public.create_session_charge(
  p_session_id      uuid,
  p_label           text,
  p_amount_thb      integer,
  p_split_mode      public.charge_split_mode,
  p_participant_ids uuid[] default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
  v_charge  uuid;
  v_ids     uuid[];
  v_n       integer;
  v_share   integer;
begin
  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  -- allowlist ไม่ใช่ denylist ด้วยเหตุผลเดียวกับบั๊กที่เคยเจอใน LSN-0020
  -- denylist ปล่อยให้ draft / open / ready_to_book หลุดเข้ามา ซึ่งเป็นก๊วนที่
  -- ยังไม่ได้สนามด้วยซ้ำ แต่กลับเรียกเก็บค่าลูกได้
  if v_session.status not in ('booked', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_played');
  end if;

  if p_split_mode = 'all' then
    select array_agg(d.id) into v_ids from public.session_denominator(p_session_id) d;
  else
    select array_agg(sp.id) into v_ids
    from public.session_participants sp
    where sp.session_id = p_session_id
      and sp.id = any(coalesce(p_participant_ids, '{}'::uuid[]));
  end if;

  v_n := coalesce(array_length(v_ids, 1), 0);
  if v_n = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_participants');
  end if;

  -- ปัดขึ้น ผู้จัดรับส่วนต่าง — กติกาเดียวกับ LSN-0021
  v_share := ceil(p_amount_thb::numeric / v_n);

  insert into public.session_charges (session_id, label, amount_thb, split_mode, created_by)
  values (p_session_id, btrim(p_label), p_amount_thb, p_split_mode, auth.uid())
  returning id into v_charge;

  insert into public.session_charge_shares (charge_id, participant_id, amount_thb)
  select v_charge, unnest(v_ids), v_share;

  perform public.app_log(auth.uid(), 'session_charge', v_charge, p_session_id,
    'charge.created', null, p_amount_thb::text,
    jsonb_build_object('label', btrim(p_label), 'splitMode', p_split_mode,
                       'people', v_n, 'perHeadThb', v_share));

  -- ไม่มี payments และไม่มี notify_user ในฟังก์ชันนี้เลย — นั่นคือทั้งหมดของ
  -- ข้อตัดสินที่ 3: หนี้ไม่ควรโผล่ในหน้าจอผู้เล่นก่อนที่ผู้จัดจะตั้งใจเรียกเก็บ
  return jsonb_build_object('ok', true, 'chargeId', v_charge,
    'people', v_n, 'perHeadThb', v_share);
end;
$$;

revoke execute on function public.create_session_charge(uuid, text, integer, public.charge_split_mode, uuid[]) from public;
grant execute on function public.create_session_charge(uuid, text, integer, public.charge_split_mode, uuid[])
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ส่งเรียกเก็บ — หนี้เกิดตรงนี้ ไม่ใช่ตอนสร้างรายการ
-- ---------------------------------------------------------------------------

create or replace function public.send_session_charges(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_charges integer := 0;
  v_people  integer := 0;
  v_code    text;
begin
  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  select public_code into v_code from public.sessions where id = p_session_id;
  if v_code is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  for v_row in
    select s.id as share_id, s.amount_thb, sp.id as participant_id, sp.user_id
    from public.session_charge_shares s
    join public.session_charges c on c.id = s.charge_id
    join public.session_participants sp on sp.id = s.participant_id
    where c.session_id = p_session_id
      and c.notified_at is null and c.voided_at is null
      and not exists (
        select 1 from public.payments p
        where p.charge_share_id = s.id and p.status in ('pending', 'paid'))
      -- ผู้เล่นรับเชิญมีส่วนแบ่งให้เห็นบนหน้าจอ แต่ไม่มีบัญชีจึงไม่มีที่ให้แจ้ง
      -- และเงินสดของเขาไม่เคยผ่านระบบ — ตรงกับที่ LSN-0022 วางไว้
      and sp.user_id is not null
  loop
    -- ไม่ตั้ง expires_at โดยตั้งใจ: expire_overdue_payments() กวาดเฉพาะแถวที่มี
    -- expires_at หนี้ของรายการเพิ่มเติมจึงไม่ถูกกวาดทิ้งเอง ผู้จัดเป็นคนลบ
    insert into public.payments (session_id, participant_id, user_id, amount_thb,
                                 status, provider, idempotency_key, charge_share_id)
    values (p_session_id, v_row.participant_id, v_row.user_id, v_row.amount_thb,
            'pending', 'mock', 'charge:' || v_row.share_id::text, v_row.share_id);
  end loop;

  -- แจ้ง "หนึ่งครั้งต่อคน" ไม่ใช่ต่อบรรทัด
  -- นี่เป็น call site แรกของระบบที่รวมแจ้งเตือน — notify_user อีก 9 ที่ยิงทีละแถว
  for v_row in
    select sp.user_id, sum(s.amount_thb)::integer as total_thb, count(*)::integer as lines
    from public.session_charge_shares s
    join public.session_charges c on c.id = s.charge_id
    join public.session_participants sp on sp.id = s.participant_id
    where c.session_id = p_session_id
      and c.notified_at is null and c.voided_at is null
      and sp.user_id is not null
    group by sp.user_id
  loop
    perform public.notify_user(v_row.user_id, p_session_id, 'extra_charge',
      'มีรายการเก็บเงินเพิ่ม',
      'ก๊วนนี้มีรายการเพิ่มเติม ' || v_row.lines || ' รายการ รวม ฿' || v_row.total_thb,
      '/s/' || v_code || '/receipt');
    v_people := v_people + 1;
  end loop;

  update public.session_charges
  set notified_at = now()
  where session_id = p_session_id and notified_at is null and voided_at is null;
  get diagnostics v_charges = row_count;

  perform public.app_log(auth.uid(), 'session', p_session_id, p_session_id,
    'charge.sent', null, v_charges::text,
    jsonb_build_object('charges', v_charges, 'peopleNotified', v_people));

  return jsonb_build_object('ok', true, 'charges', v_charges, 'peopleNotified', v_people);
end;
$$;

revoke execute on function public.send_session_charges(uuid) from public;
grant execute on function public.send_session_charges(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- ลบรายการ — payment ที่ยัง pending กลายเป็น expired ไม่ใช่ลบทิ้ง
-- ---------------------------------------------------------------------------

create or replace function public.void_session_charge(p_charge_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_charge public.session_charges%rowtype;
  v_voided integer;
begin
  select * into v_charge from public.session_charges where id = p_charge_id;
  if v_charge.id is null then
    return jsonb_build_object('ok', false, 'reason', 'charge_not_found');
  end if;
  if not public.is_session_organizer(v_charge.session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;
  if v_charge.voided_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_voided');
  end if;

  -- expired ไม่ใช่ delete: หนี้ที่เคยมีอยู่จริงต้องอธิบายได้ทีหลัง
  update public.payments p set status = 'expired', updated_at = now()
  from public.session_charge_shares s
  where s.charge_id = p_charge_id and p.charge_share_id = s.id and p.status = 'pending';
  get diagnostics v_voided = row_count;

  update public.session_charges set voided_at = now() where id = p_charge_id;

  perform public.app_log(auth.uid(), 'session_charge', p_charge_id, v_charge.session_id,
    'charge.voided', v_charge.amount_thb::text, null,
    jsonb_build_object('paymentsExpired', v_voided,
                       'wasDraft', v_charge.notified_at is null));

  return jsonb_build_object('ok', true, 'paymentsExpired', v_voided);
end;
$$;

revoke execute on function public.void_session_charge(uuid) from public;
grant execute on function public.void_session_charge(uuid) to authenticated, service_role;

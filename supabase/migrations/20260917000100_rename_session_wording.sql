-- LSN-0027: เปลี่ยนคำในข้อความที่ผู้ใช้เห็นฝั่ง SQL จาก "ก๊วน" เป็น "นัด"
--
-- แก้แค่ src/ ไม่พอ ข้อความแจ้งเตือนสี่ข้อความอยู่ในตัวฟังก์ชัน ถ้าไม่แก้ที่นี่
-- ผู้ใช้จะเห็นสองคำในแอปเดียวต่อไป
--
-- และการแก้ข้อความใน migration เก่าที่ apply ไปแล้วก็ไม่ช่วย เพราะมันไม่เปลี่ยน
-- ฟังก์ชันที่ทำงานอยู่จริง เครื่องที่ db:reset จะเห็นคำใหม่ แต่ฐานข้อมูลบนคลาวด์
-- ยังใช้คำเก่า แล้วสองฝั่งจะต่างกันโดยไม่มีใครรู้
--
-- ⚠️ void_pay_later_on_session_end ถูก create or replace สามครั้งในสาม migration
-- (20260905000100 → 20260910000100 → 20260911000100) ตัวที่มีผลจริงคือตัวสุดท้าย
-- ซึ่งมี guard `if v_row.user_id is null then continue` ที่แก้ blocker ของ LSN-0022
-- ไว้ — ถ้าคัดลอกจากไฟล์ที่เก่ากว่ามา guard จะหายไปเงียบ ๆ แล้วนัดที่มีผู้เล่น
-- รับเชิญค้างจ่ายจะยกเลิกไม่ได้อีก เพราะ notify_user(null, …) ชน NOT NULL
--
-- ไฟล์นี้ generate โดยไล่ทุก migration ตามลำดับ timestamp แล้วหยิบนิยามท้ายสุด
-- ของแต่ละฟังก์ชัน จึงไม่ต้องเดาว่าอยู่ไฟล์ไหน และมี assert ยืนยัน guard
--
-- สองฟังก์ชันท้าย (confirm_court_manually, create_session_charge) มีคำเก่าใน
-- **คอมเมนต์** ไม่ใช่ข้อความที่ผู้ใช้เห็น สร้างใหม่เพื่อไม่ให้เหลือคำปนกันในโค้ด
--
-- ตอน generate มี assert ว่าเนื้อของทุกฟังก์ชันที่หยิบมาตรงกับ prosrc ที่ทำงาน
-- อยู่จริงในฐานข้อมูล (เทียบแบบ normalise คำ) ไม่ใช่แค่หยิบจากไฟล์ที่เดาว่าใหม่สุด
-- ด่านนี้คือสิ่งที่ทำให้กับดักของ void_pay_later_on_session_end เป็นไปไม่ได้
--
-- เปลี่ยนเฉพาะ **ข้อความ** ไม่มีบรรทัดตรรกะไหนถูกแตะเลย

create or replace function public.promote_waitlist(
  p_session_id     uuid,
  p_window_minutes integer default 60,
  p_actor          uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session   public.sessions%rowtype;
  v_entry     public.waitlist_entries%rowtype;
  v_taken     integer;
  v_expires   timestamptz;
  v_id        uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_session_id::text, 0));

  select * into v_session from public.sessions where id = p_session_id;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if v_session.status in ('cancelled', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  select count(*) into v_taken
  from public.session_participants
  where session_id = p_session_id
    and status in ('joined_pending_payment', 'paid_confirmed');

  if v_taken >= v_session.target_players then
    return jsonb_build_object('ok', false, 'reason', 'no_free_slot');
  end if;

  select * into v_entry
  from public.waitlist_entries
  where session_id = p_session_id and status = 'waiting'
  order by position asc
  limit 1
  for update skip locked;

  if v_entry.id is null then
    return jsonb_build_object('ok', false, 'reason', 'waitlist_empty');
  end if;

  v_expires := least(
    now() + make_interval(mins => greatest(p_window_minutes, 5)),
    v_session.starts_at
  );

  update public.waitlist_entries
  set status = 'promoted', promoted_at = now(), promotion_expires_at = v_expires
  where id = v_entry.id;

  insert into public.session_participants
    (session_id, user_id, status, amount_due_thb, payment_due_at)
  values
    (p_session_id, v_entry.user_id, 'joined_pending_payment',
     v_session.budget_per_person_thb, v_expires)
  on conflict (session_id, user_id) do update
    set status         = 'joined_pending_payment',
        amount_due_thb = excluded.amount_due_thb,
        payment_due_at = excluded.payment_due_at,
        cancelled_at   = null,
        confirmed_at   = null
  returning id into v_id;

  perform public.app_log(p_actor, 'waitlist_entry', v_entry.id, p_session_id,
    'waitlist.promoted', 'waiting', 'promoted',
    jsonb_build_object('position', v_entry.position, 'expiresAt', v_expires));

  perform public.notify_user(v_entry.user_id, p_session_id, 'waitlist_promoted',
    'คุณได้สิทธิ์เข้าร่วมแล้ว',
    'มีที่ว่างในนัดที่คุณรออยู่ กรุณาชำระเงินภายในเวลาที่กำหนด มิฉะนั้นสิทธิ์จะถูกส่งต่อ',
    '/s/' || v_session.public_code);

  return jsonb_build_object('ok', true, 'waitlistId', v_entry.id,
    'participantId', v_id, 'userId', v_entry.user_id,
    'position', v_entry.position, 'expiresAt', v_expires);
end;
$$;

create or replace function public.mark_no_shows()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row   record;
  v_count integer := 0;
  v_new   integer;
begin
  for v_row in
    select sp.id, sp.user_id, sp.session_id, sp.status
    from public.session_participants sp
    join public.sessions s on s.id = sp.session_id
    where sp.status in ('joined_pay_later', 'payment_overdue')
      and sp.checked_in_at is null
      and sp.no_show_marked_at is null
      and sp.user_id is not null
      -- An allowlist, not a denylist. A no-show only means something for a
      -- session that actually happened; `booked` and `completed` are the only
      -- two statuses that say it did. Filtering out cancelled and
      -- booking_failed instead would let `open`, `ready_to_book`,
      -- `holding_court` and `draft` through — every one of them a session that
      -- never secured a court — and charge its players for not attending it.
      -- The stranded-session loop normally cancels those first, but it
      -- `continue`s when cancel_session fails, and a guard that depends on
      -- another step having run is the shape of bug this ticket already has
      -- two other defences against.
      and s.status in ('booked', 'completed')
      and s.ends_at + interval '2 hours' <= now()
    for update of sp skip locked
  loop
    update public.session_participants
    set no_show_marked_at = now()
    where id = v_row.id;

    insert into public.player_credit (user_id, score) values (v_row.user_id, 100)
    on conflict (user_id) do nothing;

    update public.player_credit
    set score = greatest(0, least(100, score - 10))
    where user_id = v_row.user_id
    returning score into v_new;

    insert into public.credit_events (user_id, session_id, delta, reason)
    values (v_row.user_id, v_row.session_id, -10, 'no_show_unpaid');

    perform public.app_log(null, 'player_credit', v_row.user_id, v_row.session_id,
      'credit.no_show', null, v_new::text, jsonb_build_object('delta', -10));

    perform public.notify_user(v_row.user_id, v_row.session_id, 'no_show',
      'ไม่ได้เช็คอินและยังค้างชำระ',
      'นัดจบแล้วแต่ไม่มีการเช็คอินและยังไม่ได้ชำระ เครดิตของคุณลดลง 10 คะแนน', null);

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('noShows', v_count);
end;
$$;

create or replace function public.void_pay_later_on_session_end()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row     record;
  v_charged integer;
begin
  if new.status not in ('cancelled', 'booking_failed') then return new; end if;

  update public.sessions
  set settled_per_person_thb = null, settled_at = null
  where id = new.id and settled_per_person_thb is not null;

  for v_row in
    select sp.id, sp.user_id, sp.amount_due_thb
    from public.session_participants sp
    where sp.session_id = new.id
      and sp.status in ('joined_pay_later', 'payment_overdue')
  loop
    update public.payments
    set status = 'expired'
    where participant_id = v_row.id and status = 'pending';

    update public.session_participants
    set status = 'cancelled', cancelled_at = now(), last_chased_at = null
    where id = v_row.id;

    -- A guest's seat and payment are voided exactly like anyone else's — the
    -- debt is just as cancelled. What is skipped is everything that needs an
    -- account: there is no credit to restore and nobody to notify.
    if v_row.user_id is null then
      perform public.app_log(null, 'session_participant', v_row.id, new.id,
        'participant.pay_later_voided', 'joined_pay_later', 'cancelled',
        jsonb_build_object('amountThb', v_row.amount_due_thb, 'guest', true));
      continue;
    end if;

    select coalesce(sum(delta), 0) into v_charged
    from public.credit_events
    where user_id = v_row.user_id and session_id = new.id and delta < 0;

    if v_charged < 0 then
      update public.player_credit
      set score = greatest(0, least(100, score - v_charged))
      where user_id = v_row.user_id;

      insert into public.credit_events (user_id, session_id, delta, reason)
      values (v_row.user_id, new.id, -v_charged, 'session_cancelled_refund');
    end if;

    perform public.notify_user(v_row.user_id, new.id, 'debt_cancelled',
      'ยกเลิกยอดค้างชำระแล้ว',
      'นัดถูกยกเลิกและระบบไม่ได้จองสนามให้ ยอดค้าง ฿' || v_row.amount_due_thb ||
      ' จึงถูกยกเลิก และเครดิตที่ถูกหักไปได้คืนแล้ว', null);

    perform public.app_log(null, 'session_participant', v_row.id, new.id,
      'participant.pay_later_voided', 'payment_overdue', 'cancelled',
      jsonb_build_object('amountThb', v_row.amount_due_thb, 'creditRestored', -v_charged));
  end loop;

  return new;
end;
$$;

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
      'นัดนี้มีรายการเพิ่มเติม ' || v_row.lines || ' รายการ รวม ฿' || v_row.total_thb,
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

create or replace function public.confirm_court_manually(
  p_session_id  uuid,
  p_venue_name  text,
  p_price_thb   integer
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.sessions%rowtype;
  v_from    text;
  v_id      uuid;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;
  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  -- allowlist ไม่ใช่ denylist ด้วยเหตุผลเดียวกับบั๊กที่เคยเจอใน LSN-0020
  --
  -- แถวที่สำคัญที่สุดของด่านนี้คือแถวที่ปฏิเสธ open: ตอนนั้นเงินยังไม่ครบ
  -- การยอมให้ยืนยันคอร์ตตรงนั้นคือการทำลายคำสัญญาหลักของโปรดักต์ด้วยปุ่มเดียว
  -- ส่วน holding_court ถูกปฏิเสธเพราะมีคอร์ตที่กันไว้ค้างอยู่ ต้องปล่อยก่อน
  -- ไม่งั้นนัดเดียวจะมีสองการจอง
  if v_session.status not in ('ready_to_book', 'booking_failed') then
    return jsonb_build_object('ok', false, 'reason', 'court_confirm_not_allowed');
  end if;

  if p_price_thb is null or p_price_thb <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;
  if p_venue_name is null or length(btrim(p_venue_name)) = 0 then
    return jsonb_build_object('ok', false, 'reason', 'venue_name_required');
  end if;

  v_from := v_session.status::text;

  -- idempotency_key เป็น UNIQUE อยู่แล้ว การกดซ้ำจึงชนกันเองโดยไม่ต้องเขียน guard
  insert into public.bookings
    (session_id, manual_venue_name, starts_at, ends_at, status,
     price_thb, attempt_no, idempotency_key, confirmed_at, decided_by)
  values
    (p_session_id, btrim(p_venue_name), v_session.starts_at, v_session.ends_at,
     'confirmed', p_price_thb, 1, 'manual:' || p_session_id::text, now(), auth.uid())
  returning id into v_id;

  update public.sessions
  set status = 'booked', booking_id = v_id, failure_reason = null
  where id = p_session_id;

  perform public.app_log(auth.uid(), 'booking', v_id, p_session_id,
    'booking.confirmed', null, 'confirmed',
    jsonb_build_object('manualVenueName', btrim(p_venue_name),
                       'priceThb', p_price_thb, 'manual', true));

  -- from-state เป็นสถานะจริง ไม่ใช่ 'holding_court' ที่ hardcode ไว้ในทางเดิม
  -- เพราะทางนี้มาจาก ready_to_book หรือ booking_failed
  perform public.app_log(auth.uid(), 'session', p_session_id, p_session_id,
    'session.booked', v_from, 'booked',
    jsonb_build_object('bookingId', v_id, 'manual', true));

  return jsonb_build_object('ok', true, 'bookingId', v_id, 'priceThb', p_price_thb);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'reason', 'already_confirmed');
end;
$$;

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
  -- denylist ปล่อยให้ draft / open / ready_to_book หลุดเข้ามา ซึ่งเป็นนัดที่
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

-- comment เก็บอยู่ใน catalog ของฐานข้อมูล การแก้ไฟล์ migration เก่าจึงไม่เปลี่ยน
-- ของจริงเหมือนกับฟังก์ชัน ต้องสั่งใหม่ที่นี่
comment on table public.session_charge_shares is
  'ส่วนแบ่งคำนวณตอนสร้างและเก็บเป็นแถว ไม่คำนวณสด เพราะยอดที่คนหนึ่งถูกเรียกเก็บต้องไม่เปลี่ยนเมื่อผู้เล่นในนัดเปลี่ยน';

comment on function public.session_denominator(uuid) is
  'ใครนับว่าได้เล่นในนัดนี้ · ถ้ามีใครเช็คอินเลยนับเฉพาะคนที่เช็คอิน ไม่งั้นนับทุกคนที่ถือที่นั่ง · ต้นฉบับเดียวของกติกานี้';

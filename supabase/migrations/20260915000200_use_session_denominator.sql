-- ให้ผู้เรียกเดิมใช้ตัวหารต้นฉบับเดียวกัน (LSN-0024)
--
-- ไม่เปลี่ยนพฤติกรรมแม้แต่นิดเดียว ตัววัดคือ pgTAP ของ LSN-0021 (8 ข้อ) และ
-- ของ LSN-0023 (9 ข้อ) ต้องเขียวโดย **ไม่ต้องแก้ไฟล์เทสเลย** ถ้าต้องแก้เทส
-- แปลว่า refactor เปลี่ยนพฤติกรรม ให้ย้อนกลับไปหาว่าต่างตรงไหน

create or replace function public.settle_session_costs(
  p_session_id       uuid,
  p_shuttle_cost_thb integer,
  p_split_mode       public.split_mode
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session     public.sessions%rowtype;
  v_court       integer;
  v_total       integer;
  v_players     integer;
  v_per_person  integer;
  v_row         record;
  v_games       numeric;
  v_avg         numeric;
  v_total_g     numeric;
  v_amount      integer;
  v_updated     integer := 0;
begin
  select * into v_session from public.sessions where id = p_session_id for update;
  if v_session.id is null then
    return jsonb_build_object('ok', false, 'reason', 'session_not_found');
  end if;

  if not public.is_session_organizer(p_session_id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  if v_session.status in ('cancelled', 'booking_failed') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  if p_shuttle_cost_thb < 0 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_amount');
  end if;

  -- The confirmed booking is the truth when there is one. When the venue
  -- confirmed by phone and nothing was booked in-app, fall back to the price of
  -- the cheapest approved court for the slot — the same figure the session page
  -- already shows as "ค่าสนามโดยประมาณ", so the organizer is settling against a
  -- number they have already seen.
  select coalesce(
    (select b.price_thb from public.bookings b
      where b.session_id = p_session_id and b.status = 'confirmed'
      order by b.attempt_no limit 1),
    (select min(public.court_price_for(pref.court_id, v_session.starts_at, v_session.ends_at))
      from public.session_venue_preferences pref
      where pref.session_id = p_session_id and pref.approved),
    0) into v_court;

  v_total := v_court + p_shuttle_cost_thb;

  -- ใครนับว่าได้เล่น: กติกาย้ายไปอยู่ที่ session_denominator() แล้ว (LSN-0024)
  -- เดิมเป็น predicate ที่คัดลอกซ้ำ 4 จุดในฟังก์ชันนี้ บวกอีก 2 ที่นอกไฟล์
  -- สำเนาที่หลุดจากกันคือบั๊กที่ review ของ LSN-0023 เจอ

  select count(*) into v_players from public.session_denominator(p_session_id) sp;

  if v_players = 0 then
    return jsonb_build_object('ok', false, 'reason', 'no_players');
  end if;

  v_per_person := ceil(v_total::numeric / v_players);

  -- A blank games count is not a zero; it is the average of the counts we have.
  select avg(sp.games_played) into v_avg
  from public.session_denominator(p_session_id) sp
  where sp.games_played is not null;

  select sum(coalesce(sp.games_played, v_avg)) into v_total_g
  from public.session_denominator(p_session_id) sp;

  for v_row in
    select sp.id, sp.status, sp.games_played
    from public.session_denominator(p_session_id) sp
  loop
    if p_split_mode = 'by_games' and v_avg is not null and v_total_g > 0 then
      v_games  := coalesce(v_row.games_played, v_avg);
      v_amount := ceil(v_total::numeric * v_games / v_total_g);
    else
      v_amount := v_per_person;
    end if;

    -- Never a participant who has already paid.
    if v_row.status in ('joined_pay_later', 'payment_overdue') then
      update public.session_participants set amount_due_thb = v_amount where id = v_row.id;
      update public.payments set amount_thb = v_amount
      where participant_id = v_row.id and status = 'pending';
      v_updated := v_updated + 1;
    end if;
  end loop;

  update public.sessions
  set shuttle_cost_thb = p_shuttle_cost_thb,
      split_mode = p_split_mode,
      settled_per_person_thb = v_per_person,
      settled_at = now()
  where id = p_session_id;

  perform public.app_log(auth.uid(), 'session', p_session_id, p_session_id,
    'session.settled', v_session.settled_per_person_thb::text, v_per_person::text,
    jsonb_build_object('courtThb', v_court, 'shuttleThb', p_shuttle_cost_thb,
      'players', v_players, 'unpaidUpdated', v_updated));

  return jsonb_build_object('ok', true, 'totalThb', v_total,
    'perPersonThb', v_per_person, 'players', v_players, 'unpaidUpdated', v_updated);
end;
$$;

create or replace function public.session_receipt_public(p_session_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_session     public.sessions%rowtype;
  v_players     integer;
  v_paid        integer;
  v_owing       integer;
  v_total       integer;
begin
  select * into v_session from public.sessions where id = p_session_id;

  -- An allowlist, not a denylist, for the same reason mark_no_shows() needs one:
  -- a denylist lets draft / open / ready_to_book / holding_court through, which
  -- are sessions that have not happened, and `booked` is one that has not been
  -- played yet — its per-head is still an estimate and nobody has checked in.
  if v_session.id is null or v_session.status <> 'completed' then
    return null;
  end if;

  select count(*),
         count(*) filter (where sp.status = 'paid_confirmed'),
         count(*) filter (where sp.status in ('joined_pay_later', 'payment_overdue')),
         coalesce(sum(sp.amount_due_thb), 0)
    into v_players, v_paid, v_owing, v_total
  from public.session_denominator(p_session_id) sp;

  return jsonb_build_object(
    'players',    v_players,
    'paid',       v_paid,
    'owing',      v_owing,
    'perHeadThb', coalesce(v_session.settled_per_person_thb, v_session.budget_per_person_thb),
    'totalThb',   v_total,
    'title',      v_session.title,
    'startsAt',   v_session.starts_at
  );
end;
$$;

-- ===========================================================================
-- Longsanam — demo seed
--
-- Every timestamp is derived from current_date so the demo always shows
-- upcoming sessions. Wall-clock times are written in Asia/Bangkok.
-- Password for every demo account: password123
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Demo accounts
-- ---------------------------------------------------------------------------

do $$
declare
  v_user   record;
  v_users  constant jsonb := '[
    {"id": "11111111-1111-4111-8111-000000000001", "email": "organizer@longsanam.test", "name": "ก้อง ผู้จัด",   "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000002", "email": "player1@longsanam.test",   "name": "แนน",             "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000003", "email": "player2@longsanam.test",   "name": "บอส",             "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000004", "email": "player3@longsanam.test",   "name": "มีน",             "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000005", "email": "player4@longsanam.test",   "name": "ปอนด์",           "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000006", "email": "player5@longsanam.test",   "name": "จูน",             "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000007", "email": "player6@longsanam.test",   "name": "ไอซ์",            "role": "player"},
    {"id": "11111111-1111-4111-8111-000000000008", "email": "player7@longsanam.test",   "name": "ต้น",             "role": "player"},
    {"id": "22222222-2222-4222-8222-000000000001", "email": "venue@longsanam.test",     "name": "ฝ่ายจัดการสนาม",  "role": "venue_admin"},
    {"id": "22222222-2222-4222-8222-000000000002", "email": "venue2@longsanam.test",    "name": "ผู้ดูแลอารีน่า",   "role": "venue_admin"},
    {"id": "33333333-3333-4333-8333-000000000001", "email": "admin@longsanam.test",     "name": "แอดมินระบบ",      "role": "platform_admin"}
  ]'::jsonb;
begin
  for v_user in select * from jsonb_to_recordset(v_users) as x(id uuid, email text, name text, role text)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user.id, 'authenticated', 'authenticated', v_user.email,
      crypt('password123', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('display_name', v_user.name, 'role', v_user.role),
      now(), now(), '', '', '', ''
    ) on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user.id,
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
      'email', v_user.id::text, now(), now(), now()
    ) on conflict (provider, provider_id) do nothing;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sports live in migration 20260901000700_reference_data.sql, because the app
-- cannot function without them on a freshly deployed database.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Venues
-- ---------------------------------------------------------------------------

insert into public.venues
  (id, slug, name, description, address, district, province, latitude, longitude,
   phone, is_active, auto_confirm_bookings, booking_lead_minutes, created_by)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'ladprao-badminton-center',
   'ลาดพร้าว แบดมินตัน เซ็นเตอร์',
   'สนามแบดมินตันในร่ม 6 คอร์ต พื้นยางสังเคราะห์ มีที่จอดรถ',
   '1699 ถนนลาดพร้าว แขวงวังทองหลาง', 'วังทองหลาง', 'กรุงเทพมหานคร',
   13.786500, 100.601200, '02-111-2233', true, true, 60,
   '22222222-2222-4222-8222-000000000001'),

  ('bbbbbbbb-0000-4000-8000-000000000002', 'thonglor-football-arena',
   'ทองหล่อ ฟุตบอล อารีน่า',
   'สนามฟุตบอลหญ้าเทียม 7 คน 2 สนาม พร้อมไฟส่องสว่าง',
   '55 ซอยสุขุมวิท 55 แขวงคลองตันเหนือ', 'วัฒนา', 'กรุงเทพมหานคร',
   13.731800, 100.583400, '02-222-3344', true, false, 120,
   '22222222-2222-4222-8222-000000000002'),

  ('bbbbbbbb-0000-4000-8000-000000000003', 'rama9-pickleball-club',
   'พระราม 9 พิคเคิลบอล คลับ',
   'คอร์ตพิคเคิลบอลมาตรฐาน 4 คอร์ต ในร่ม พร้อมอุปกรณ์ให้ยืม',
   '9 ถนนพระราม 9 แขวงห้วยขวาง', 'ห้วยขวาง', 'กรุงเทพมหานคร',
   13.756900, 100.565700, '02-333-4455', true, true, 60,
   '22222222-2222-4222-8222-000000000001')
on conflict (id) do nothing;

insert into public.venue_members (venue_id, user_id, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', '22222222-2222-4222-8222-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000003', '22222222-2222-4222-8222-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000002', '22222222-2222-4222-8222-000000000002', 'owner')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Courts
-- ---------------------------------------------------------------------------

insert into public.courts
  (id, venue_id, name, capacity, base_price_thb, min_booking_minutes, is_active, notes)
values
  ('cccccccc-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'คอร์ต 1', 8, 220, 60, true, 'ใกล้ทางเข้า'),
  ('cccccccc-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'คอร์ต 2', 8, 220, 60, true, null),
  ('cccccccc-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000001', 'คอร์ต 3', 8, 200, 60, true, 'เพดานต่ำกว่าคอร์ตอื่น'),
  ('cccccccc-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'สนาม A (7 คน)', 14, 1400, 60, true, 'หญ้าเทียมใหม่'),
  ('cccccccc-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000002', 'สนาม B (7 คน)', 14, 1200, 60, true, null),
  ('cccccccc-0000-4000-8000-000000000006', 'bbbbbbbb-0000-4000-8000-000000000003', 'คอร์ต P1', 4, 300, 60, true, null),
  ('cccccccc-0000-4000-8000-000000000007', 'bbbbbbbb-0000-4000-8000-000000000003', 'คอร์ต P2', 4, 300, 60, true, null)
on conflict (id) do nothing;

insert into public.court_sports (court_id, sport_id) values
  ('cccccccc-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000001'),
  ('cccccccc-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002'),
  ('cccccccc-0000-4000-8000-000000000005', 'aaaaaaaa-0000-4000-8000-000000000002'),
  ('cccccccc-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000005'),
  ('cccccccc-0000-4000-8000-000000000007', 'aaaaaaaa-0000-4000-8000-000000000005'),
  ('cccccccc-0000-4000-8000-000000000006', 'aaaaaaaa-0000-4000-8000-000000000003')
on conflict do nothing;

-- Opening hours: every day 06:00–23:00 Asia/Bangkok.
insert into public.court_availability (court_id, kind, weekday, opens_at, closes_at)
select c.id, 'opening_hours', d, time '06:00', time '23:00'
from public.courts c cross join generate_series(0, 6) as d
on conflict do nothing;

-- One venue closes for maintenance, so the demo has a real blackout to trip over.
insert into public.court_availability (court_id, kind, starts_at, ends_at, reason)
values (
  'cccccccc-0000-4000-8000-000000000003', 'blackout',
  ((current_date + 5) + time '00:00') at time zone 'Asia/Bangkok',
  ((current_date + 6) + time '00:00') at time zone 'Asia/Bangkok',
  'ปิดปรับปรุงพื้นคอร์ต'
);

-- Evening peak pricing.
insert into public.court_price_rules (court_id, name, weekdays, starts_time, ends_time, price_thb, priority)
select c.id, 'ราคาช่วงเย็น (จันทร์-ศุกร์)', '{1,2,3,4,5}', time '17:00', time '23:00',
       (c.base_price_thb * 1.4)::integer, 10
from public.courts c;

insert into public.court_price_rules (court_id, name, weekdays, starts_time, ends_time, price_thb, priority)
select c.id, 'ราคาสุดสัปดาห์', '{0,6}', time '06:00', time '23:00',
       (c.base_price_thb * 1.25)::integer, 20
from public.courts c;

-- ---------------------------------------------------------------------------
-- Sessions
-- ---------------------------------------------------------------------------

insert into public.sessions
  (id, public_code, organizer_id, sport_id, title, description, area_text, district,
   starts_at, ends_at, budget_per_person_thb, target_players, min_players,
   payment_deadline, status, cancellation_policy)
values
  -- Draft: not published, organizer only.
  ('dddddddd-0000-4000-8000-000000000001', 'DRAFT01',
   '11111111-1111-4111-8111-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'แบดเช้าวันเสาร์ (ร่าง)', 'ยังไม่เผยแพร่ กำลังหาสนามอยู่',
   'ลาดพร้าว', 'วังทองหลาง',
   ((current_date + 9) + time '09:00') at time zone 'Asia/Bangkok',
   ((current_date + 9) + time '11:00') at time zone 'Asia/Bangkok',
   90, 8, 6,
   ((current_date + 8) + time '20:00') at time zone 'Asia/Bangkok',
   'draft', default),

  -- Open: taking players, not yet at minimum.
  ('dddddddd-0000-4000-8000-000000000002', 'OPEN001',
   '11111111-1111-4111-8111-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'แบดเย็นวันพุธ', 'เล่นสนุก ๆ ไม่ซีเรียส มือใหม่ยินดีต้อนรับ',
   'ลาดพร้าว', 'วังทองหลาง',
   ((current_date + 4) + time '19:00') at time zone 'Asia/Bangkok',
   ((current_date + 4) + time '21:00') at time zone 'Asia/Bangkok',
   100, 8, 6,
   ((current_date + 3) + time '20:00') at time zone 'Asia/Bangkok',
   'open', default),

  -- ReadyToBook: minimum paid reached, orchestrator has not run yet.
  ('dddddddd-0000-4000-8000-000000000003', 'READY01',
   '11111111-1111-4111-8111-000000000001', 'aaaaaaaa-0000-4000-8000-000000000005',
   'พิคเคิลบอลมือใหม่ พระราม 9', 'สอนพื้นฐานให้ก่อนเริ่ม มีอุปกรณ์ให้ยืม',
   'พระราม 9', 'ห้วยขวาง',
   ((current_date + 3) + time '18:00') at time zone 'Asia/Bangkok',
   ((current_date + 3) + time '20:00') at time zone 'Asia/Bangkok',
   220, 4, 4,
   ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok',
   'ready_to_book', default),

  -- Booked: court confirmed.
  ('dddddddd-0000-4000-8000-000000000004', 'BOOKED1',
   '11111111-1111-4111-8111-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002',
   'ฟุตบอล 7 คน ทองหล่อ', 'ทีมประจำ ขาดคนอีก 2-3 คน',
   'ทองหล่อ', 'วัฒนา',
   ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok',
   ((current_date + 2) + time '22:00') at time zone 'Asia/Bangkok',
   150, 14, 10,
   ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok',
   'booked', default),

  -- Cancelled: refunds already issued.
  ('dddddddd-0000-4000-8000-000000000005', 'CANCEL1',
   '11111111-1111-4111-8111-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'แบดวันอาทิตย์ (ยกเลิก)', 'ยกเลิกเพราะคนไม่ครบ',
   'ลาดพร้าว', 'วังทองหลาง',
   ((current_date + 6) + time '10:00') at time zone 'Asia/Bangkok',
   ((current_date + 6) + time '12:00') at time zone 'Asia/Bangkok',
   120, 8, 6,
   ((current_date + 5) + time '20:00') at time zone 'Asia/Bangkok',
   'cancelled', default),

  -- Completed: played and settled. The only session in the seed that has
  -- actually happened, which is what the receipt (LSN-0023) and extra charges
  -- (LSN-0024) both need to be lookable-at without editing the database by hand.
  --
  -- Deliberately has a partial check-in: บอส paid and holds a seat but never
  -- turned up. A seed where everyone checked in, or nobody did, hides the bug
  -- LSN-0023's review found — the header counting one set of people and the
  -- list below it showing another.
  ('dddddddd-0000-4000-8000-000000000006', 'DONE001',
   '11111111-1111-4111-8111-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'แบดเย็นวันจันทร์ (จบแล้ว)', 'นัดประจำ เล่นกันทุกวันจันทร์',
   'ลาดพร้าว', 'วังทองหลาง',
   ((current_date - 2) + time '19:00') at time zone 'Asia/Bangkok',
   ((current_date - 2) + time '21:00') at time zone 'Asia/Bangkok',
   120, 6, 4,
   ((current_date - 3) + time '20:00') at time zone 'Asia/Bangkok',
   'completed', default)
on conflict (id) do nothing;

update public.sessions
set cancelled_at = now() - interval '2 hours',
    cancelled_reason = 'ผู้เล่นไม่ครบตามจำนวนขั้นต่ำ'
where id = 'dddddddd-0000-4000-8000-000000000005';

-- Ranked, organizer-approved venue preferences.
insert into public.session_venue_preferences (session_id, venue_id, court_id, priority, approved) values
  -- Draft session: one preference so far.
  ('dddddddd-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 1, true),

  -- Open session: three ranked fallbacks.
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000001', 1, true),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 2, true),
  ('dddddddd-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000003', 3, false),

  -- Ready session: two approved options at the pickleball club.
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000006', 1, true),
  ('dddddddd-0000-4000-8000-000000000003', 'bbbbbbbb-0000-4000-8000-000000000003', 'cccccccc-0000-4000-8000-000000000007', 2, true),

  -- Booked session.
  ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000004', 1, true),
  ('dddddddd-0000-4000-8000-000000000004', 'bbbbbbbb-0000-4000-8000-000000000002', 'cccccccc-0000-4000-8000-000000000005', 2, true),

  -- Cancelled session.
  ('dddddddd-0000-4000-8000-000000000005', 'bbbbbbbb-0000-4000-8000-000000000001', 'cccccccc-0000-4000-8000-000000000002', 1, true);

-- ---------------------------------------------------------------------------
-- Participants, payments, waitlist
-- ---------------------------------------------------------------------------

-- Open session: 3 paid, 1 awaiting payment (target 8, so still open).
insert into public.session_participants
  (id, session_id, user_id, status, amount_due_thb, payment_due_at, confirmed_at)
values
  ('eeeeeeee-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000001', 'paid_confirmed', 100, ((current_date + 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '2 days'),
  ('eeeeeeee-0000-4000-8000-000000000002', 'dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000002', 'paid_confirmed', 100, ((current_date + 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '2 days'),
  ('eeeeeeee-0000-4000-8000-000000000003', 'dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000003', 'paid_confirmed', 100, ((current_date + 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '1 day'),
  ('eeeeeeee-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000004', 'joined_pending_payment', 100, ((current_date + 3) + time '20:00') at time zone 'Asia/Bangkok', null),

  -- Ready session: 4 of 4 paid.
  ('eeeeeeee-0000-4000-8000-000000000011', 'dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000001', 'paid_confirmed', 220, ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '3 hours'),
  ('eeeeeeee-0000-4000-8000-000000000012', 'dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000005', 'paid_confirmed', 220, ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '3 hours'),
  ('eeeeeeee-0000-4000-8000-000000000013', 'dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000006', 'paid_confirmed', 220, ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '2 hours'),
  ('eeeeeeee-0000-4000-8000-000000000014', 'dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000007', 'paid_confirmed', 220, ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '1 hour'),

  -- Completed session: 3 คนมาจริง · บอสจ่ายแล้วแต่ไม่มา · หนึ่งในนั้นเป็นผู้เล่นรับเชิญ
  ('eeeeeeee-0000-4000-8000-000000000041', 'dddddddd-0000-4000-8000-000000000006', '11111111-1111-4111-8111-000000000001', 'paid_confirmed', 120, ((current_date - 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '5 days'),
  ('eeeeeeee-0000-4000-8000-000000000042', 'dddddddd-0000-4000-8000-000000000006', '11111111-1111-4111-8111-000000000002', 'paid_confirmed', 120, ((current_date - 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '5 days'),
  ('eeeeeeee-0000-4000-8000-000000000043', 'dddddddd-0000-4000-8000-000000000006', '11111111-1111-4111-8111-000000000003', 'paid_confirmed', 120, ((current_date - 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '4 days'),

  -- Booked session: 11 paid would need 11 accounts; use the 8 we have plus one cancelled.
  ('eeeeeeee-0000-4000-8000-000000000021', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000001', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '4 days'),
  ('eeeeeeee-0000-4000-8000-000000000022', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000002', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '4 days'),
  ('eeeeeeee-0000-4000-8000-000000000023', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000003', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '3 days'),
  ('eeeeeeee-0000-4000-8000-000000000024', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000004', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '3 days'),
  ('eeeeeeee-0000-4000-8000-000000000025', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000005', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '2 days'),
  ('eeeeeeee-0000-4000-8000-000000000026', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000006', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '2 days'),
  ('eeeeeeee-0000-4000-8000-000000000027', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000007', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '1 day'),
  ('eeeeeeee-0000-4000-8000-000000000028', 'dddddddd-0000-4000-8000-000000000004', '11111111-1111-4111-8111-000000000008', 'paid_confirmed', 150, ((current_date + 1) + time '18:00') at time zone 'Asia/Bangkok', now() - interval '1 day'),

  -- Cancelled session: two players who were paid and then refunded.
  ('eeeeeeee-0000-4000-8000-000000000031', 'dddddddd-0000-4000-8000-000000000005', '11111111-1111-4111-8111-000000000002', 'refunded', 120, ((current_date + 5) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '5 days'),
  ('eeeeeeee-0000-4000-8000-000000000032', 'dddddddd-0000-4000-8000-000000000005', '11111111-1111-4111-8111-000000000003', 'refunded', 120, ((current_date + 5) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '5 days')
on conflict (id) do nothing;

-- ผู้เล่นรับเชิญของนัดที่จบแล้ว จ่ายเงินสดกับผู้จัดโดยตรง (LSN-0022)
insert into public.session_participants
  (id, session_id, user_id, guest_name, status, amount_due_thb, payment_due_at, confirmed_at)
values
  ('eeeeeeee-0000-4000-8000-000000000044', 'dddddddd-0000-4000-8000-000000000006',
   null, 'พี่เอก (เพื่อนก้อง)', 'paid_confirmed', 120,
   ((current_date - 3) + time '20:00') at time zone 'Asia/Bangkok', now() - interval '4 days')
on conflict (id) do nothing;

-- เช็คอินเฉพาะคนที่มาจริง: ก้อง · แนน · พี่เอก — บอสจ่ายแล้วแต่ไม่มา
update public.session_participants
set checked_in_at = ((current_date - 2) + time '19:05') at time zone 'Asia/Bangkok'
where id in ('eeeeeeee-0000-4000-8000-000000000041',
             'eeeeeeee-0000-4000-8000-000000000042',
             'eeeeeeee-0000-4000-8000-000000000044');

-- settle ไปแล้ว: ค่าสนาม ฿600 + ค่าลูก ฿120 = ฿720 หาร 3 คนที่มา = คนละ ฿240
update public.sessions
set shuttle_cost_thb = 120, settled_per_person_thb = 240, settled_at = now() - interval '2 days'
where id = 'dddddddd-0000-4000-8000-000000000006';

update public.session_participants
set cancelled_at = now() - interval '2 hours'
where session_id = 'dddddddd-0000-4000-8000-000000000005';

-- Payments mirroring the participants above.
insert into public.payments
  (session_id, participant_id, user_id, amount_thb, status, provider, provider_ref,
   idempotency_key, paid_at, expires_at)
select
  sp.session_id, sp.id, sp.user_id, sp.amount_due_thb,
  case sp.status
    when 'paid_confirmed' then 'paid'::public.payment_status
    when 'refunded'       then 'refunded'::public.payment_status
    else 'pending'::public.payment_status
  end,
  'mock',
  case when sp.status in ('paid_confirmed', 'refunded')
       then 'mock_' || replace(sp.id::text, '-', '') else null end,
  'seed_pay_' || sp.id::text,
  sp.confirmed_at,
  sp.payment_due_at
from public.session_participants sp
where sp.session_id in (
  'dddddddd-0000-4000-8000-000000000002',
  'dddddddd-0000-4000-8000-000000000003',
  'dddddddd-0000-4000-8000-000000000004',
  'dddddddd-0000-4000-8000-000000000005'
)
on conflict (idempotency_key) do nothing;

-- Waitlist on the fully-subscribed pickleball session.
insert into public.waitlist_entries (session_id, user_id, position, status) values
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000002', 1, 'waiting'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000003', 2, 'waiting'),
  ('dddddddd-0000-4000-8000-000000000003', '11111111-1111-4111-8111-000000000004', 3, 'waiting')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Hold and booking for the booked session
-- ---------------------------------------------------------------------------

insert into public.court_holds
  (id, session_id, court_id, starts_at, ends_at, status, expires_at, idempotency_key)
values (
  'ffffffff-0000-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000004',
  'cccccccc-0000-4000-8000-000000000004',
  ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok',
  ((current_date + 2) + time '22:00') at time zone 'Asia/Bangkok',
  'converted',
  now() - interval '1 day',
  'seed_hold_booked_session'
) on conflict (id) do nothing;

insert into public.bookings
  (id, session_id, venue_id, court_id, hold_id, starts_at, ends_at, status,
   price_thb, attempt_no, idempotency_key, requested_at, confirmed_at, decided_by)
values (
  'ffffffff-1111-4000-8000-000000000001',
  'dddddddd-0000-4000-8000-000000000004',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000004',
  'ffffffff-0000-4000-8000-000000000001',
  ((current_date + 2) + time '20:00') at time zone 'Asia/Bangkok',
  ((current_date + 2) + time '22:00') at time zone 'Asia/Bangkok',
  'confirmed', 3920, 1, 'seed_booking_booked_session',
  now() - interval '1 day', now() - interval '22 hours',
  '22222222-2222-4222-8222-000000000002'
) on conflict (id) do nothing;

update public.sessions
set booking_id = 'ffffffff-1111-4000-8000-000000000001'
where id = 'dddddddd-0000-4000-8000-000000000004';

-- A pending booking request waiting in the partner inbox, so the venue admin
-- has something real to approve or reject.
insert into public.court_holds
  (id, session_id, court_id, starts_at, ends_at, status, expires_at, idempotency_key)
values (
  'ffffffff-0000-4000-8000-000000000002',
  'dddddddd-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000005',
  ((current_date + 4) + time '19:00') at time zone 'Asia/Bangkok',
  ((current_date + 4) + time '21:00') at time zone 'Asia/Bangkok',
  'converted',
  now() + interval '20 minutes',
  'seed_hold_pending_request'
) on conflict (id) do nothing;

insert into public.bookings
  (id, session_id, venue_id, court_id, hold_id, starts_at, ends_at, status,
   price_thb, attempt_no, expires_at, idempotency_key, requested_at)
values (
  'ffffffff-1111-4000-8000-000000000002',
  'dddddddd-0000-4000-8000-000000000002',
  'bbbbbbbb-0000-4000-8000-000000000002',
  'cccccccc-0000-4000-8000-000000000005',
  'ffffffff-0000-4000-8000-000000000002',
  ((current_date + 4) + time '19:00') at time zone 'Asia/Bangkok',
  ((current_date + 4) + time '21:00') at time zone 'Asia/Bangkok',
  'requested', 3360, 1,
  now() + interval '22 hours', 'seed_booking_pending_request',
  now() - interval '10 minutes'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Refunds for the cancelled session
-- ---------------------------------------------------------------------------

insert into public.refunds
  (payment_id, session_id, user_id, amount_thb, status, reason, provider_ref,
   idempotency_key, processed_at, policy_snapshot)
select
  p.id, p.session_id, p.user_id, p.amount_thb, 'completed',
  'ผู้จัดยกเลิกนัด คืนเงินเต็มจำนวน',
  'mock_refund_' || replace(p.id::text, '-', ''),
  'seed_refund_' || p.id::text,
  now() - interval '1 hour',
  jsonb_build_object('rule', 'organizer_cancelled', 'percent', 100)
from public.payments p
where p.session_id = 'dddddddd-0000-4000-8000-000000000005'
on conflict (idempotency_key) do nothing;

-- ---------------------------------------------------------------------------
-- Audit trail so the organizer timeline is not empty on first run
-- ---------------------------------------------------------------------------

insert into public.audit_logs
  (actor_id, entity_type, entity_id, session_id, action, from_state, to_state, metadata, created_at)
values
  ('11111111-1111-4111-8111-000000000001', 'session', 'dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'session.published', 'draft', 'open', '{}', now() - interval '6 days'),
  ('11111111-1111-4111-8111-000000000001', 'session', 'dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'session.ready_to_book', 'open', 'ready_to_book', '{"paidParticipants": 10}', now() - interval '2 days'),
  (null, 'court_hold', 'ffffffff-0000-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004', 'hold.created', null, 'active', '{"courtId": "cccccccc-0000-4000-8000-000000000004"}', now() - interval '1 day'),
  (null, 'booking', 'ffffffff-1111-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004', 'booking.requested', null, 'requested', '{"priceThb": 3920, "attemptNo": 1}', now() - interval '1 day'),
  ('22222222-2222-4222-8222-000000000002', 'booking', 'ffffffff-1111-4000-8000-000000000001', 'dddddddd-0000-4000-8000-000000000004', 'booking.confirmed', 'requested', 'confirmed', '{}', now() - interval '22 hours'),
  ('22222222-2222-4222-8222-000000000002', 'session', 'dddddddd-0000-4000-8000-000000000004', 'dddddddd-0000-4000-8000-000000000004', 'session.booked', 'holding_court', 'booked', '{}', now() - interval '22 hours'),
  ('11111111-1111-4111-8111-000000000001', 'session', 'dddddddd-0000-4000-8000-000000000005', 'dddddddd-0000-4000-8000-000000000005', 'session.cancelled', 'open', 'cancelled', '{"reason": "ผู้เล่นไม่ครบตามจำนวนขั้นต่ำ"}', now() - interval '2 hours');

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

insert into public.notifications (user_id, session_id, kind, title, body, action_url, sent_at)
values
  ('11111111-1111-4111-8111-000000000001', 'dddddddd-0000-4000-8000-000000000004', 'session_booked',
   'จองสนามสำเร็จแล้ว', 'นัดฟุตบอล 7 คน ทองหล่อ ได้สนาม A เรียบร้อยแล้ว',
   '/organizer/sessions/dddddddd-0000-4000-8000-000000000004', now() - interval '22 hours'),
  ('11111111-1111-4111-8111-000000000002', 'dddddddd-0000-4000-8000-000000000005', 'refund_completed',
   'คืนเงินเรียบร้อยแล้ว', 'เราคืนเงินจำนวน 120 บาท ให้คุณแล้ว',
   '/app/payments', now() - interval '1 hour');

-- ---------------------------------------------------------------------------
-- ก๊วน (LSN-0026)
--
-- ก๊วนหนึ่งก๊วนที่มีเจ้าของ สมาชิก และนัดผูกอยู่จริง เพื่อให้เห็นความสัมพันธ์
-- บนหน้าจอโดยไม่ต้องกดสร้างเองทุกครั้งที่ db:reset
-- โค้ดเชิญกำหนดตายตัวเพื่อให้ลิงก์ /g/GROUP01 ใช้ทดสอบซ้ำได้
-- ---------------------------------------------------------------------------

insert into public.groups (id, public_code, name, sport_id, home_district, created_by)
select 'eeeeeeee-0000-4000-8000-000000000001', 'GROUP01', 'แบดเย็นลาดพร้าว',
       id, 'ลาดพร้าว', '11111111-1111-4111-8111-000000000001'
from public.sports where slug = 'badminton';

insert into public.group_members (group_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000001', 'owner'),
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000002', 'member'),
  ('eeeeeeee-0000-4000-8000-000000000001', '11111111-1111-4111-8111-000000000003', 'member');

-- นัดที่จองสนามแล้วผูกกับก๊วนนี้ เพื่อให้หน้าก๊วนมีประวัติให้ดู
update public.sessions set group_id = 'eeeeeeee-0000-4000-8000-000000000001'
where public_code in ('OPEN001', 'DONE001');

-- ---------------------------------------------------------------------------
-- ทัวร์นาเมนต์ (LSN-0029)
--
-- งานหนึ่งงานที่เปิดรับอยู่ มีเจ้าภาพจ่ายแล้วและอีกหนึ่งทีมสมัครแล้วแต่ยังไม่จ่าย
-- เพื่อให้เห็นประตูที่ยังไม่ครบบนหน้าจอโดยไม่ต้องกดเอง
-- ---------------------------------------------------------------------------

insert into public.groups (id, public_code, name, sport_id, home_district, created_by)
select 'eeeeeeee-0000-4000-8000-000000000002', 'GROUP02', 'แบดเช้าพระราม 9',
       id, 'พระราม 9', '11111111-1111-4111-8111-000000000002'
from public.sports where slug = 'badminton';

insert into public.group_members (group_id, user_id, role) values
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000002', 'owner'),
  ('eeeeeeee-0000-4000-8000-000000000002', '11111111-1111-4111-8111-000000000004', 'member');

insert into public.tournaments
  (id, public_code, host_group_id, title, starts_at, ends_at, registration_deadline,
   min_teams, max_teams, entry_fee_thb, tier, status, created_by)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'TOURN01', 'eeeeeeee-0000-4000-8000-000000000001',
   'ศึกแบดลาดพร้าว ครั้งที่ 1',
   now() + interval '21 days', now() + interval '21 days 6 hours',
   now() + interval '14 days', 4, 8, 800, 'P', 'open',
   '11111111-1111-4111-8111-000000000001');

insert into public.tournament_teams (tournament_id, group_id, is_host) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002', false);

-- เจ้าภาพจ่ายแล้ว ทีมที่สองยังไม่จ่าย — ประตู "เงินครบ" จึงยังไม่เปิด
insert into public.tournament_team_payments
  (tournament_id, group_id, paid_by, amount_thb, idempotency_key, status, paid_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001',
   '11111111-1111-4111-8111-000000000001', 800, 'seed:tourn01:host', 'paid', now());

-- ---------------------------------------------------------------------------
-- ทัวร์นาเมนต์ที่ยังเปิดรับสมัคร (LSN-0036)
--
-- TOURN01 ถูกดันเป็น ready ไปแล้วเพื่อให้มีแมตช์ให้ดู จึงไม่เหลืองานที่ "เปิดรับ
-- สมัครอยู่" ให้หน้าค้นหาสาธารณะแสดงเลย ใส่อีกงานหนึ่งที่ยังเปิดรับ
-- ---------------------------------------------------------------------------

insert into public.tournaments
  (id, public_code, host_group_id, title, starts_at, ends_at, registration_deadline,
   min_teams, max_teams, entry_fee_thb, tier, status, created_by)
values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'TOURN02', 'eeeeeeee-0000-4000-8000-000000000002',
   'พระราม 9 โอเพ่น รุ่น C',
   now() + interval '35 days', now() + interval '35 days 7 hours',
   now() + interval '21 days', 4, 12, 600, 'C', 'open',
   '11111111-1111-4111-8111-000000000002');

insert into public.tournament_teams (tournament_id, group_id, is_host) values
  ('aaaaaaaa-0000-4000-8000-000000000002', 'eeeeeeee-0000-4000-8000-000000000002', true);

-- ---------------------------------------------------------------------------
-- แมตช์ (LSN-0030)
--
-- สองแถว หนึ่งรอยืนยัน หนึ่งยืนยันแล้ว เพื่อให้เห็นทั้งสองสถานะบนหน้าจอ
-- ทัวร์นาเมนต์ต้องอยู่ในสถานะที่แข่งได้ก่อน จึงดัน TOURN01 เป็น ready
-- ---------------------------------------------------------------------------

update public.tournaments set status = 'ready', court_confirmed_at = now(),
       venue_note = 'ลาดพร้าว แบดมินตัน เซ็นเตอร์ 6 คอร์ต'
where public_code = 'TOURN01';

insert into public.tournament_team_payments
  (tournament_id, group_id, paid_by, amount_thb, idempotency_key, status, paid_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
   '11111111-1111-4111-8111-000000000002', 800, 'seed:tourn01:team2', 'paid', now());

insert into public.matches
  (id, tournament_id, side_a_group_id, side_b_group_id, side_a_players, side_b_players,
   score_a, score_b, court_label, status, recorded_by, confirmed_by, confirmed_at)
values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
   array['11111111-1111-4111-8111-000000000001']::uuid[],
   array['11111111-1111-4111-8111-000000000004']::uuid[],
   21, 17, 'คอร์ต 1', 'confirmed',
   '11111111-1111-4111-8111-000000000001', '11111111-1111-4111-8111-000000000004', now()),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001',
   'eeeeeeee-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000002',
   array['11111111-1111-4111-8111-000000000003']::uuid[],
   array['11111111-1111-4111-8111-000000000004']::uuid[],
   19, 21, 'คอร์ต 2', 'recorded',
   '11111111-1111-4111-8111-000000000001', null, null);

-- ---------------------------------------------------------------------------
-- คะแนนฝีมือ (LSN-0031)
--
-- seed ใส่แมตช์ตรงเข้าตาราง ไม่ได้ผ่าน confirm_match จึงไม่มีอะไรไปสั่งคิดคะแนน
-- สั่งคิดทีเดียวตอนท้าย เพื่อให้ข้อมูลตัวอย่างมีคะแนนให้เห็นบนหน้าจอ
-- ---------------------------------------------------------------------------

select public.recompute_player_skill();

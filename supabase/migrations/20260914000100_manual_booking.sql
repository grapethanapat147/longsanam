-- ผู้จัดยืนยันคอร์ตเอง (LSN-0025)
--
-- ก่อนตั๋วนี้ มีเพียงสองทางที่ทำให้ก๊วนกลายเป็น booked ได้: request_booking()
-- เมื่อสนามเปิด auto_confirm_bookings และ venue_decide_booking() ซึ่งกั้นด้วย
-- is_venue_member() ทั้งสองทางต้องมีคนฝั่งสนาม ผู้จัดที่โทรจองคอร์ตประจำของตัวเอง
-- จึงไม่มีทางบอกระบบได้เลย
--
-- ครึ่งหลังมีอยู่แล้ว: settle_session_costs() คิดเงินจากราคาของ booking ที่
-- confirmed อยู่แล้ว ตั๋วนี้จึงเติมเฉพาะครึ่งแรก
--
-- คอร์ตที่ผู้จัดโทรจองเองไม่มีอยู่ในตาราง venues/courts ของเรา สองคอลัมน์นี้
-- จึงต้องว่างได้ วัดผลกระทบไว้ในตั๋วแล้ว: มีผู้อ่านสองคอลัมน์นี้ 4 แห่ง
-- สามแห่งแรกรับ null ได้โดยพฤติกรรมยังถูก เหลือหน้ารวมรายได้ฝั่งแอดมินที่ต้องแก้

alter table public.bookings
  alter column venue_id drop not null,
  alter column court_id drop not null,
  add column if not exists manual_venue_name text;

-- nullable สองคอลัมน์พร้อมกันเปิดรูปแถวขึ้นมาสี่แบบ ซึ่งสองแบบไม่มีความหมาย
-- ถ้าไม่กั้นตรงนี้ จะมีแถวที่มี venue_id แต่ไม่มี court_id โผล่มาทีหลัง
-- โดยไม่มีใครตั้งใจ แล้วไม่มีใครรู้ว่าควรอ่านยังไง
alter table public.bookings
  add constraint bookings_venue_shape check (
    (venue_id is not null and court_id is not null and manual_venue_name is null)
    or
    (venue_id is null and court_id is null
       and manual_venue_name is not null
       and length(btrim(manual_venue_name)) between 1 and 120)
  );

-- bookings_price_thb_check เดิมคือ price_thb >= 0 ซึ่งยอมให้เป็น 0
-- การจองที่ผู้จัดกรอกเองเป็นฐานคิดเงินของทั้งก๊วน ฿0 จึงไม่มีความหมาย
alter table public.bookings
  add constraint bookings_manual_price_positive check (
    manual_venue_name is null or price_thb > 0
  );

comment on column public.bookings.manual_venue_name is
  'ชื่อสนามที่ผู้จัดพิมพ์เอง มีค่าเมื่อคอร์ตไม่ได้อยู่ในระบบ · null สำหรับการจองผ่านสนามพันธมิตร';

-- ---------------------------------------------------------------------------
-- ยืนยันคอร์ตที่ผู้จัดหามาเอง
-- ---------------------------------------------------------------------------

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
  -- ไม่งั้นก๊วนเดียวจะมีสองการจอง
  if v_session.status not in ('ready_to_book', 'booking_failed') then
    return jsonb_build_object('ok', false, 'reason', 'session_not_ready');
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

revoke execute on function public.confirm_court_manually(uuid, text, integer) from public;
grant execute on function public.confirm_court_manually(uuid, text, integer)
  to authenticated, service_role;

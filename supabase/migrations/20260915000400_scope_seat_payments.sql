-- LSN-0024 review: กันแถวของรายการเก็บเพิ่มออกจากการค้นหา "แถวจ่ายของที่นั่ง"
--
-- 20260915000300 ทำให้ผู้เล่นหนึ่งคนมีแถว payments ที่ยังไม่ปิดได้หลายแถว
-- คือแถวของที่นั่งหนึ่งแถว (charge_share_id is null) กับแถวของรายการเก็บเพิ่ม
-- อีกกี่แถวก็ได้ ตอนนั้นแก้ unique index ให้รองรับแล้ว แต่ **ลืมแก้คำค้นหา**
-- ที่เขียนไว้สมัยที่ข้อสมมติ "หนึ่งคนมีแถวเดียว" ยังจริงอยู่
--
-- ผลที่ตามมา เรียงจากหนักไปเบา
--
-- 1. cancel_participation() หาเพดานคืนเงินด้วย
--       status = 'paid' order by paid_at desc limit 1
--    ผู้เล่นที่จ่ายค่าที่นั่ง ฿150 แล้วจ่ายค่าลูกแบด ฿34 ทีหลัง จะได้แถว ฿34
--    เป็นเพดาน เพราะจ่ายทีหลัง → **ยกเลิกก๊วนแล้วได้คืน ฿34 แทน ฿150**
--    นี่คือการกินเงินผู้ใช้ ไม่ใช่ข้อผิดพลาดเชิงการแสดงผล
-- 2. open_pay_later_payment() และ start_payment() คืน 'replayed' พร้อมยอด
--    ของแถวที่ limit 1 หยิบมาได้ ซึ่งไม่มี order by จึงไม่แน่นอน ผู้เล่นที่
--    กดจ่ายหนี้ค่าที่นั่งอาจได้ยอดค่าลูกแบดมาแทน
-- 3. grant_pay_later() เคลียร์ expires_at ผิดแถว แถวที่นั่งจึงยังมีกำหนดหมดอายุ
--    แล้วโดน expire_overdue_payments() กวาดทิ้งเงียบ ๆ ซึ่งเป็นอาการที่
--    คอมเมนต์ในฟังก์ชันนั้นเตือนไว้เองว่า "not cosmetic"
--
-- แก้โดยเติม `and charge_share_id is null` ให้ทุกคำค้นหาที่หมายถึงแถวของที่นั่ง
-- เนื้อฟังก์ชันที่เหลือคัดลอกมาจากนิยามล่าสุดโดยไม่แก้อย่างอื่นเลย

create or replace function public.start_payment(
  p_participant_id  uuid,
  p_idempotency_key text,
  p_provider        text default 'mock',
  p_actor           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant public.session_participants%rowtype;
  v_payment     public.payments%rowtype;
  v_id          uuid;
begin
  select * into v_payment from public.payments where idempotency_key = p_idempotency_key;
  if v_payment.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'paymentId', v_payment.id, 'status', v_payment.status,
      'amountThb', v_payment.amount_thb);
  end if;

  select * into v_participant from public.session_participants where id = p_participant_id;
  if v_participant.id is null then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_found');
  end if;
  if v_participant.status <> 'joined_pending_payment' then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_awaiting_payment',
      'status', v_participant.status);
  end if;
  if v_participant.payment_due_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'payment_window_closed');
  end if;

  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status in ('pending', 'paid')
    and charge_share_id is null
  limit 1;

  if v_payment.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'paymentId', v_payment.id, 'status', v_payment.status,
      'amountThb', v_payment.amount_thb);
  end if;

  insert into public.payments
    (session_id, participant_id, user_id, amount_thb, status, provider,
     idempotency_key, expires_at)
  values
    (v_participant.session_id, v_participant.id, v_participant.user_id,
     v_participant.amount_due_thb, 'pending', p_provider,
     p_idempotency_key, v_participant.payment_due_at)
  returning id into v_id;

  perform public.app_log(coalesce(p_actor, v_participant.user_id), 'payment', v_id,
    v_participant.session_id, 'payment.created', null, 'pending',
    jsonb_build_object('amountThb', v_participant.amount_due_thb, 'provider', p_provider));

  return jsonb_build_object('ok', true, 'replayed', false, 'paymentId', v_id,
    'status', 'pending', 'amountThb', v_participant.amount_due_thb);
end;
$$;

create or replace function public.cancel_participation(
  p_participant_id  uuid,
  p_refund_thb      integer,
  p_reason          text,
  p_policy_snapshot jsonb,
  p_idempotency_key text,
  p_actor           uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant public.session_participants%rowtype;
  v_payment     public.payments%rowtype;
  v_refund      public.refunds%rowtype;
  v_amount      integer := greatest(coalesce(p_refund_thb, 0), 0);
  v_refund_id   uuid;
  v_from        text;
begin
  select * into v_refund from public.refunds where idempotency_key = p_idempotency_key;
  if v_refund.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true,
      'refundId', v_refund.id, 'refundThb', v_refund.amount_thb);
  end if;

  select * into v_participant
  from public.session_participants where id = p_participant_id for update;

  if v_participant.id is null then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_found');
  end if;
  if v_participant.status in ('cancelled', 'refunded') then
    return jsonb_build_object('ok', true, 'replayed', true, 'status', v_participant.status);
  end if;

  v_from := v_participant.status::text;

  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status = 'paid'
    and charge_share_id is null
  order by paid_at desc nulls last
  limit 1;

  -- The database, not the caller, decides the ceiling on a refund.
  if v_payment.id is null then
    v_amount := 0;
  else
    v_amount := least(v_amount, v_payment.amount_thb);
  end if;

  update public.session_participants
  set status = case when v_amount > 0 then 'refunded'::public.participant_status
                    else 'cancelled'::public.participant_status end,
      cancelled_at = now()
  where id = p_participant_id;

  if v_payment.id is not null and v_amount > 0 then
    insert into public.refunds
      (payment_id, session_id, user_id, amount_thb, status, reason,
       policy_snapshot, idempotency_key)
    values
      (v_payment.id, v_participant.session_id, v_participant.user_id, v_amount,
       'pending', p_reason, p_policy_snapshot, p_idempotency_key)
    returning id into v_refund_id;

    perform public.app_log(p_actor, 'refund', v_refund_id, v_participant.session_id,
      'refund.created', null, 'pending',
      jsonb_build_object('amountThb', v_amount, 'paymentId', v_payment.id,
        'policy', p_policy_snapshot));
  end if;

  -- Cancel any payment that never completed.
  update public.payments
  set status = 'failed', failure_reason = 'participant_cancelled'
  where participant_id = p_participant_id and status = 'pending';

  perform public.app_log(p_actor, 'session_participant', p_participant_id,
    v_participant.session_id, 'participant.cancelled', v_from,
    case when v_amount > 0 then 'refunded' else 'cancelled' end,
    jsonb_build_object('reason', p_reason, 'refundThb', v_amount));

  return jsonb_build_object('ok', true, 'refundId', v_refund_id,
    'refundThb', v_amount, 'sessionId', v_participant.session_id);
end;
$$;

create or replace function public.open_pay_later_payment(
  p_participant_id  uuid,
  p_idempotency_key text,
  p_provider        text default 'mock'
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.session_participants%rowtype;
  v_payment public.payments%rowtype;
  v_id      uuid;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'participant_not_found');
  end if;

  if v_p.status not in ('joined_pay_later', 'payment_overdue') then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  -- A live row already exists (the usual case): settle against that one.
  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status in ('pending', 'paid')
    and charge_share_id is null
  limit 1;

  if v_payment.id is not null then
    return jsonb_build_object('ok', true, 'replayed', true, 'paymentId', v_payment.id,
      'status', v_payment.status, 'amountThb', v_payment.amount_thb);
  end if;

  -- expires_at stays null, as it must for every pay-later row.
  insert into public.payments
    (session_id, participant_id, user_id, amount_thb, status, provider,
     idempotency_key, expires_at)
  values
    (v_p.session_id, v_p.id, v_p.user_id, v_p.amount_due_thb, 'pending', p_provider,
     p_idempotency_key, null)
  returning id into v_id;

  perform public.app_log(coalesce(auth.uid(), v_p.user_id), 'payment', v_id, v_p.session_id,
    'payment.created', null, 'pending',
    jsonb_build_object('amountThb', v_p.amount_due_thb, 'provider', p_provider,
      'payLaterRetry', true));

  return jsonb_build_object('ok', true, 'replayed', false, 'paymentId', v_id,
    'status', 'pending', 'amountThb', v_p.amount_due_thb);
end;
$$;

create or replace function public.grant_pay_later(p_participant_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_p       public.session_participants%rowtype;
  v_session public.sessions%rowtype;
  v_payment public.payments%rowtype;
  v_score   integer;
begin
  select * into v_p from public.session_participants where id = p_participant_id for update;
  if v_p.id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- A guest has no credit to stake, so there is nothing for pay-later to gate.
  -- The organizer already chose how a guest's seat is paid when they added it.
  if v_p.user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'guest_has_no_account');
  end if;

  select * into v_session from public.sessions where id = v_p.session_id;

  if not public.is_session_organizer(v_session.id) then
    return jsonb_build_object('ok', false, 'reason', 'not_organizer');
  end if;

  if v_session.status in ('completed', 'cancelled') then
    return jsonb_build_object('ok', false, 'reason', 'session_closed');
  end if;

  if v_p.status <> 'joined_pending_payment' then
    return jsonb_build_object('ok', false, 'reason', 'wrong_state');
  end if;

  select score into v_score from public.player_credit where user_id = v_p.user_id;
  -- A player with no row has never been scored, which is not the same as
  -- scoring zero. Treat them as new.
  if coalesce(v_score, 100) < 70 then
    return jsonb_build_object('ok', false, 'reason', 'credit_too_low',
      'score', coalesce(v_score, 100));
  end if;

  update public.session_participants
  set status = 'joined_pay_later',
      pay_later_granted_at = now(),
      pay_later_granted_by = auth.uid()
  where id = p_participant_id;

  -- The debt is real from this moment, and `expires_at` must end up null so
  -- expire_overdue_payments() leaves it alone.
  --
  -- A player who joined normally already has a live pending payment carrying
  -- the original deadline, and `payments_one_live_per_participant` allows only
  -- one. So the existing row is adopted — clearing its deadline — rather than a
  -- second one inserted. Getting this wrong is not cosmetic: a granted seat
  -- whose payment row kept its expires_at would be swept away as an expired
  -- payment, silently, some minutes later.
  select * into v_payment
  from public.payments
  where participant_id = p_participant_id and status in ('pending', 'paid')
    and charge_share_id is null
  limit 1;

  if v_payment.id is null then
    insert into public.payments
      (session_id, participant_id, user_id, amount_thb, status, idempotency_key, expires_at)
    values
      (v_p.session_id, p_participant_id, v_p.user_id, v_p.amount_due_thb, 'pending',
       'paylater:' || p_participant_id::text, null);
  elsif v_payment.status = 'pending' then
    update public.payments set expires_at = null where id = v_payment.id;
  end if;

  perform public.app_log(auth.uid(), 'session_participant', p_participant_id, v_p.session_id,
    'participant.pay_later_granted', 'joined_pending_payment', 'joined_pay_later',
    jsonb_build_object('amountThb', v_p.amount_due_thb));

  return jsonb_build_object('ok', true);
end;
$$;

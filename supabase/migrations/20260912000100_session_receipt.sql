-- ใบสรุปก๊วน (LSN-0023) — ยอดรวมสำหรับคนที่ไม่ได้อยู่ในก๊วน
--
-- RLS ทำงานระดับแถว ไม่ใช่ระดับคอลัมน์ มันคืน "เห็นแถว" หรือ "ไม่เห็นแถว"
-- ไม่ใช่ "เห็นแถวแต่ชื่อถูกปิด" การปิดชื่อจึงทำด้วยการ *ไม่คืนชื่อออกมาเลย*
-- สิ่งที่ไม่ได้คืน คือสิ่งที่หลุดไม่ได้
--
-- ตัวหารใช้กติกาเดียวกับ settle_session_costs() ของ LSN-0021 เป๊ะ ๆ:
-- ถ้ามีใครเช็คอินเลย นับเฉพาะคนที่เช็คอิน ถ้าไม่มีใครเช็คอินเลยนับทุกคนที่ถือที่นั่ง
-- ถ้าสองที่นี้ไม่ตรงกัน ใบสรุปจะบอกยอดคนละอย่างกับที่ระบบเรียกเก็บจริง

create or replace function public.session_receipt_public(p_session_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_session     public.sessions%rowtype;
  v_any_checkin boolean;
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

  select exists (
    select 1 from public.session_participants x
    where x.session_id = p_session_id and x.checked_in_at is not null
  ) into v_any_checkin;

  select count(*),
         count(*) filter (where sp.status = 'paid_confirmed'),
         count(*) filter (where sp.status in ('joined_pay_later', 'payment_overdue')),
         coalesce(sum(sp.amount_due_thb), 0)
    into v_players, v_paid, v_owing, v_total
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.status in ('paid_confirmed', 'joined_pay_later', 'payment_overdue')
    and (not v_any_checkin or sp.checked_in_at is not null);

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

-- Postgres grants EXECUTE to PUBLIC on a new function by default, so the revoke
-- is not optional even though anon ends up able to call this one. Adding the
-- name to v_public in 20260901000300_rls.sql would do nothing: that block is a
-- one-shot `do $$ … $$` which already ran before this function existed.
revoke execute on function public.session_receipt_public(uuid) from public;
grant execute on function public.session_receipt_public(uuid)
  to anon, authenticated, service_role;

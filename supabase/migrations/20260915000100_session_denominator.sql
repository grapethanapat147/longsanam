-- ตัวหาร "ใครนับว่าได้เล่น" (LSN-0024)
--
-- กติกานี้ถูกคัดลอกไว้ 6 ที่ก่อนหน้านี้: 4 ที่ใน settle_session_costs()
-- 1 ที่ใน session_receipt_public() และ 1 ที่เป็น TypeScript ใน
-- src/lib/domain/receipt-roster.ts สำเนาที่ 6 คือตัวที่พังใน review ของ
-- LSN-0023 เพราะไม่มีใครคัดลอกกติกาเช็คอินไปให้ — หัวตารางบอกว่ามีผู้เล่น 1 คน
-- ขณะที่รายชื่อข้างล่างขึ้น 4 แถว
--
-- split แบบ `all` ของตั๋วนี้ต้องการสำเนาที่ 7 จึงหยุดคัดลอกแล้วทำให้เหลือ
-- ต้นฉบับเดียวแทน
--
-- INVOKER โดยตั้งใจ: ผู้เรียกทุกตัวเป็น SECURITY DEFINER อยู่แล้ว การเรียก
-- ข้างในจึงทำงานด้วยสิทธิ์ของเจ้าของฟังก์ชัน ไม่ต้อง grant ให้ใคร

create or replace function public.session_denominator(p_session_id uuid)
returns setof public.session_participants
language sql
stable
set search_path = public, pg_temp
as $$
  select sp.*
  from public.session_participants sp
  where sp.session_id = p_session_id
    and sp.status in ('paid_confirmed', 'joined_pay_later', 'payment_overdue')
    and (
      not exists (
        select 1 from public.session_participants x
        where x.session_id = p_session_id and x.checked_in_at is not null
      )
      or sp.checked_in_at is not null
    );
$$;

revoke execute on function public.session_denominator(uuid) from public;

comment on function public.session_denominator(uuid) is
  'ใครนับว่าได้เล่นในก๊วนนี้ · ถ้ามีใครเช็คอินเลยนับเฉพาะคนที่เช็คอิน ไม่งั้นนับทุกคนที่ถือที่นั่ง · ต้นฉบับเดียวของกติกานี้';

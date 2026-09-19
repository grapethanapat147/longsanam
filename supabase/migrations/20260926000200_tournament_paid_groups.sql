-- ทีมอื่นเห็นว่าใครจ่ายแล้วบ้าง (LSN-0045)
--
-- ประตู "ทุกทีมจ่ายแล้ว" บอกทุกก๊วนว่างานนี้จะได้แข่งจริงไหม แต่ policy ของ
-- `tournament_team_payments` เปิดให้อ่านเฉพาะ
--
--   is_tournament_host(tournament_id) OR is_group_member(group_id) OR is_platform_admin()
--
-- ก๊วนที่ไม่ใช่เจ้าภาพจึงเห็นแค่แถวของตัวเอง หน้ารายละเอียดที่นับจากชุดนั้นเลย
-- ขึ้น "1/2 ยังไม่ครบ" และติดป้าย "ยังไม่จ่าย" ให้ก๊วนที่จ่ายไปแล้ว
--
-- **ตัวเลขเดียวกันตอบไม่เหมือนกันตามคนดู** ซึ่งแย่กว่าตอบผิดเฉย ๆ เพราะเจ้าภาพ
-- เห็น 2/2 แล้วบอกว่าพร้อม ส่วนอีกก๊วนเห็น 1/2 แล้วคิดว่ายังไม่พร้อม
--
-- ### ทำไมไม่ขยาย policy ของตารางแทน
--
-- RLS เป็น row-level ไม่ใช่ column-level การเปิดแถวให้อ่านคือการเปิด
-- `amount_thb` · `paid_by` · `provider_ref` · `idempotency_key` ไปด้วยทั้งชุด
-- ซึ่งไม่เกี่ยวกับสิ่งที่หน้าจอต้องรู้เลย — บทเรียนเดียวกับ LSN-0023 และ LSN-0036
-- คือ "ปิดข้อมูล" ต้องแปลว่า **ไม่คืนฟิลด์นั้น** ไม่ใช่คืนแล้วไม่แสดง
--
-- ฟังก์ชันนี้จึงคืนแค่ `group_id` ของทีมที่จ่ายแล้ว ไม่มีจำนวนเงิน ไม่มีคนจ่าย

create or replace function public.tournament_paid_groups(p_tournament_id uuid)
returns table (group_id uuid)
language sql stable security definer
set search_path = public, pg_temp as $$
  select tp.group_id
  from public.tournament_team_payments tp
  where tp.tournament_id = p_tournament_id
    and tp.status = 'paid'
    -- คนนอกงานไม่ได้อะไรกลับไปเลย ไม่ใช่ได้ชุดว่างเพราะบังเอิญ
    and (public.is_tournament_host(p_tournament_id)
         or public.is_tournament_team_member(p_tournament_id)
         or public.is_platform_admin());
$$;

revoke execute on function public.tournament_paid_groups(uuid) from public;
grant execute on function public.tournament_paid_groups(uuid) to authenticated, service_role;

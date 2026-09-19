-- ทัวร์นาเมนต์ที่แข่งจบแล้วต้องมีสถานะว่าจบ (LSN-0046)
--
-- `tournament_status` มีค่า `completed` อยู่ในตารางตั้งแต่ LSN-0029 แต่**ไม่มีโค้ด
-- ตรงไหนตั้งค่านี้เลย** งานที่แข่งจบไปแล้วจึงค้างที่ `ready` ตลอดไป ผลคือ
--
--   * หน้าจอยังโชว์ "ประตูสามบาน" ของงานที่จบไปเมื่อเดือนที่แล้ว
--   * ไม่มีจุดไหนบอกว่าใครชนะ ผู้จัดจึงไม่เห็นว่าจัดงานแล้วได้อะไร
--   * `close_unfilled_tournaments` กับรายงานต่าง ๆ แยกงานที่จบแล้วออกไม่ได้
--
-- ฝั่งก๊วนมี `complete_finished_sessions()` ทำงานนี้อยู่แล้วตั้งแต่ LSN-0001
-- ฝั่งทัวร์นาเมนต์แค่ไม่เคยมีคู่ของมัน

create or replace function public.complete_finished_tournaments()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer := 0;
  v_row   record;
begin
  for v_row in
    select id, status from public.tournaments
    -- allowlist ไม่ใช่ denylist — บทเรียนจาก LSN-0020 · LSN-0029 · LSN-0030
    --
    -- `ready` คือสถานะที่ประตูครบสามบานแล้ว ส่วน `booked` อยู่ใน enum และแปลว่า
    -- ได้คอร์ตแล้วเหมือนกัน ตอนนี้ยังไม่มีโค้ดไหนตั้งค่านั้น แต่ถ้าวันหนึ่งมี
    -- งานพวกนั้นต้องจบได้ด้วย ไม่ใช่ค้างเงียบ ๆ แบบที่ตั๋วนี้กำลังแก้อยู่
    --
    -- `draft` กับ `open` ไม่รวม เพราะงานที่ไม่เคยพร้อมแข่งไม่ได้ "จบ" มันไม่เคยเกิด
    -- ส่วนงานที่เลยกำหนดปิดรับสมัครโดยทีมไม่ครบเป็นหน้าที่ของ
    -- `close_unfilled_tournaments()` ซึ่งยกเลิกและคืนเงินให้
    where status in ('ready', 'booked')
      and ends_at <= now()
    for update skip locked
  loop
    update public.tournaments
    set status = 'completed', updated_at = now()
    where id = v_row.id;

    perform public.app_log(null, 'tournament', v_row.id, null,
      'tournament.completed', v_row.status::text, 'completed', '{}'::jsonb);

    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('completedTournaments', v_count);
end;
$$;

-- ของเครื่อง ไม่ใช่ของผู้ใช้ — เรียกจาก runLifecycleSweeps() เท่านั้น
-- มี tests/machine-rpc-has-caller.test.ts เฝ้าอยู่ว่าต้องมีคนเรียกจริง
revoke execute on function public.complete_finished_tournaments() from public;
grant execute on function public.complete_finished_tournaments() to service_role;

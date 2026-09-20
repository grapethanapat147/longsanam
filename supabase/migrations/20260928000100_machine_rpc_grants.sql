-- ปิดประตู RPC ของเครื่องบน production (LSN-0049)
--
-- `20260901000300_rls.sql` ตั้งใจให้ทุกอย่าง "ปิดก่อน แล้วค่อยเปิดเฉพาะที่ต้องเปิด"
-- ด้วยลูปที่ revoke ทุกฟังก์ชันใน `public` แล้ว grant คืนเฉพาะรายชื่อใน `v_public`
--
-- ลูปนั้นทำงานกับฟังก์ชันที่มีอยู่ **ณ วันนั้น** เท่านั้น ฟังก์ชันที่สร้างหลังจากนั้น
-- ไม่เคยผ่านประตูบานนี้ และบน Supabase cloud ฟังก์ชันใหม่ยังได้ EXECUTE แจก
-- ให้ `anon`/`authenticated` จาก default privileges อีกชั้น
--
-- **สิทธิ์ในเครื่องกับบน production จึงเบี่ยงจากกันเงียบ ๆ** ตรวจด้วย
-- `npm run check:grants` เมื่อ 20 ก.ย. 2569 พบแปดฟังก์ชันที่ปิดอยู่ในเครื่อง
-- แต่ production เปิดให้ `anon` (และบางตัวให้ `authenticated` ด้วย):
--
--   * close_unfilled_tournaments()
--   * complete_finished_tournaments()
--   * list_chaseable_participants()
--   * mark_no_shows()
--   * recompute_player_skill()
--   * record_chase()
--   * session_denominator()
--   * tournament_groups_of()
--
-- ### เรื่องที่หนักที่สุด
--
-- `list_chaseable_participants()` คืน `line_user_id` · `amount_due_thb` · `user_id`
-- ของคนที่ค้างจ่าย ใครก็ได้ที่มี anon key อ่านได้หมด — ข้อมูลส่วนบุคคลรั่ว ไม่ใช่
-- แค่สิทธิ์เกิน
--
-- `mark_no_shows()` ตัดเครดิตคนไม่มาตามนัด · `close_unfilled_tournaments()`
-- ยกเลิกงานพร้อมคืนเงิน · `record_chase()` บันทึกการทวง ทั้งสามมีเงื่อนไขเวลาคุมอยู่
-- และ cron ก็ยิงทุกห้านาที จึงเร่งได้แค่ไม่กี่นาที ไม่ใช่ทำสิ่งที่ทำไม่ได้อยู่แล้ว
-- ที่เหลือเปลี่ยนสถานะหรือคำนวณใหม่
--
-- ### ขอบเขตที่จงใจไม่แตะ
--
-- **ไม่ยุ่งกับ `service_role`** ถอดผิดตัวเดียวคือ cron ล่มทั้งระบบ และส่วนที่เป็น
-- ความปลอดภัยจริงคือ `anon` กับ `authenticated`
--
-- **ไม่แตะฟังก์ชันที่เปิดอยู่ในเครื่องด้วย** — เป้าหมายคือทำให้ production ตรงกับ
-- ในเครื่อง ไม่ใช่ออกแบบสิทธิ์ใหม่ทั้งระบบ ถ้าจะรื้อว่าอะไรควรเปิดควรปิด
-- ต้องเป็นตั๋วของตัวเองที่มีคนไล่ดูทีละตัว
--
-- ⚠️ `from public` สำคัญ ไม่ใช่แค่ `from anon, authenticated` — ฟังก์ชันที่ยังไม่มี
-- ACL ถือว่า PUBLIC เรียกได้ ถ้า revoke แค่สองบทบาทนั้น ACL จะถูกสร้างขึ้นพร้อม
-- สิทธิ์ของ PUBLIC ที่ค้างอยู่ แล้ว `has_function_privilege('anon', …)` ก็ยังตอบว่า
-- เรียกได้ (เจอจริงตอนเขียนตั๋วนี้ รอบแรกเทสแดงสามข้อด้วยเหตุนี้)

revoke execute on function public.close_unfilled_tournaments() from public, anon, authenticated;
revoke execute on function public.complete_finished_tournaments() from public, anon, authenticated;
revoke execute on function public.list_chaseable_participants() from public, anon, authenticated;
revoke execute on function public.mark_no_shows() from public, anon, authenticated;
revoke execute on function public.recompute_player_skill() from public, anon, authenticated;
revoke execute on function public.record_chase(uuid,integer,text,text,text) from public, anon, authenticated;
revoke execute on function public.session_denominator(uuid) from public, anon, authenticated;
revoke execute on function public.tournament_groups_of(uuid,uuid) from public, anon, authenticated;

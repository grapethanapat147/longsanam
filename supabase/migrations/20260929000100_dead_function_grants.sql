-- ถอนสิทธิ์ที่เรียกแล้วพังอยู่แล้ว (LSN-0050)
--
-- ตามมาจาก LSN-0049 ที่ทำให้สิทธิ์สองฝั่งตรงกัน ตั๋วนี้ไล่ดูฟังก์ชัน 66 ตัวที่
-- **เปิดทั้งสองฝั่ง** ว่าควรเปิดจริงไหม ด้วยการเรียกจริงในฐานะ `anon` และในฐานะ
-- ผู้ใช้ที่ไม่เกี่ยวข้องกับข้อมูลนั้น
--
-- ผลคือเกือบทั้งหมดปลอดภัยและตั้งใจให้เปิด เหลือสามตัวที่ควรปิด **ไม่ใช่เพราะ
-- อันตราย แต่เพราะเรียกไปก็พังอยู่แล้ว** — สิทธิ์ที่ให้ไว้แล้วใช้ไม่ได้คือกับดัก
-- ที่ทำให้คนอ่านเข้าใจผิดว่ามันเป็นทางเข้าที่ถูกต้อง
--
--   generate_group_code()       เรียกในฐานะ anon → permission denied for table groups
--   generate_tournament_code()  เหมือนกัน
--   session_progress(uuid)      เรียกในฐานะ anon → permission denied for table session_participants
--
-- ### ทำไมปิดแล้วไม่พัง
--
-- `generate_group_code()` ถูกเรียกจาก `groups_assign_code` เท่านั้น และ `groups`
-- **ไม่มี INSERT ให้ `authenticated`** ก๊วนจึงถูกสร้างผ่าน `create_group()` ซึ่งเป็น
-- `security definer` ทริกเกอร์จึงทำงานในสิทธิ์เจ้าของเสมอ — `tournaments` เหมือนกัน
--
-- ⚠️ `sessions` ต่างออกไป: มี INSERT ให้ `authenticated` ทริกเกอร์จึงทำงานในสิทธิ์
-- ผู้ใช้ นั่นคือเหตุผลที่ `generate_session_code()` ต้องเป็น `security definer`
-- (LSN-0043) **ห้ามเอาบทเรียนนี้ไปใช้กับ sessions โดยไม่ดูทางเข้าก่อน**
--
-- `session_progress(uuid)` ถูกเรียกจาก `src/lib/queries.ts` และ
-- `src/lib/orchestration/book-session.ts` ด้วย **admin client** เท่านั้น
-- และไม่มี policy ไหนเรียกมัน สิทธิ์ของ anon/authenticated จึงเป็นของตาย
--
-- ### ที่ไม่แตะและเหตุผล
--
-- `storage_owner_id()` เรียกจาก policy ของ `storage.objects` ซึ่งประเมินในสิทธิ์
-- ของผู้เรียก ถ้าถอด EXECUTE การอ่านจะกลายเป็น error แทนที่จะได้ผลลัพธ์ว่าง

revoke execute on function public.generate_group_code() from public, anon, authenticated;
revoke execute on function public.generate_tournament_code() from public, anon, authenticated;
revoke execute on function public.session_progress(uuid) from public, anon, authenticated;

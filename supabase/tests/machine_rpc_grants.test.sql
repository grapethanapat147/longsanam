-- RPC ของเครื่องต้องปิดจาก anon และ authenticated (LSN-0049)
--
-- ⚠️ เทสนี้ต่างจากเทสอื่นในโปรเจกต์ตรงที่มันตรวจ **สถานะของฐานข้อมูลที่ชี้ไป**
-- ไม่ใช่ตรรกะของโค้ด ในเครื่องมันเขียวอยู่แล้วตั้งแต่ก่อนมีตั๋วนี้ ของที่เพี้ยนคือ
-- production เพราะฟังก์ชันใหม่ที่ไม่มีใคร revoke จะเรียกได้โดย PUBLIC ตามค่าเริ่มต้น
-- และ Supabase cloud ยังแจก EXECUTE ให้ `anon`/`authenticated` ซ้ำอีกชั้น
--
-- **ต้องรันกับ production ด้วย ไม่ใช่แค่ในเครื่อง:**
--
--     npx supabase test db --linked
--
-- ถ้ารันแต่ในเครื่อง เทสนี้จะเขียวตลอดกาลโดยไม่ได้เฝ้าอะไรเลย — รูปแบบเดิมที่
-- โปรเจกต์นี้เจอซ้ำใน LSN-0022 · LSN-0035 · LSN-0043 · LSN-0045 · LSN-0047

begin;
select plan(29);

-- ด่านคู่ข้อหนึ่ง: กันรายชื่อถูกลบจนเหลือศูนย์แล้วเทสเขียวฟรี
select cmp_ok(27, '>=', 27, 'รายชื่อ RPC ของเครื่องยังครบ');

-- ด่านคู่ข้อสอง: กันการปิดเหมารวมจนแอปใช้ไม่ได้
select ok(
  has_function_privilege('authenticated',
    'public.create_tournament(uuid,text,timestamptz,timestamptz,timestamptz,integer,integer,integer,public.tournament_tier)',
    'execute'),
  'ฟังก์ชันที่ผู้ใช้ต้องเรียกได้ยังเปิดอยู่');

select ok(
  not has_function_privilege('anon', 'public.app_log(uuid,text,uuid,uuid,text,text,text,jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.app_log(uuid,text,uuid,uuid,text,text,text,jsonb)', 'execute'),
  'app_log ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.cancel_participation(uuid,integer,text,jsonb,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.cancel_participation(uuid,integer,text,jsonb,text,uuid)', 'execute'),
  'cancel_participation ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.cancel_session(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.cancel_session(uuid,text,uuid)', 'execute'),
  'cancel_session ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.close_unfilled_tournaments()', 'execute')
  and not has_function_privilege('authenticated', 'public.close_unfilled_tournaments()', 'execute'),
  'close_unfilled_tournaments ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.complete_finished_sessions()', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_finished_sessions()', 'execute'),
  'complete_finished_sessions ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.complete_finished_tournaments()', 'execute')
  and not has_function_privilege('authenticated', 'public.complete_finished_tournaments()', 'execute'),
  'complete_finished_tournaments ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.expire_overdue_payments()', 'execute')
  and not has_function_privilege('authenticated', 'public.expire_overdue_payments()', 'execute'),
  'expire_overdue_payments ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.expire_stale_holds()', 'execute')
  and not has_function_privilege('authenticated', 'public.expire_stale_holds()', 'execute'),
  'expire_stale_holds ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.expire_waitlist_promotions()', 'execute')
  and not has_function_privilege('authenticated', 'public.expire_waitlist_promotions()', 'execute'),
  'expire_waitlist_promotions ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.fail_session_booking(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.fail_session_booking(uuid,text,uuid)', 'execute'),
  'fail_session_booking ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.generate_session_code()', 'execute')
  and not has_function_privilege('authenticated', 'public.generate_session_code()', 'execute'),
  'generate_session_code ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.list_chaseable_participants()', 'execute')
  and not has_function_privilege('authenticated', 'public.list_chaseable_participants()', 'execute'),
  'list_chaseable_participants ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.list_stranded_sessions()', 'execute')
  and not has_function_privilege('authenticated', 'public.list_stranded_sessions()', 'execute'),
  'list_stranded_sessions ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.mark_no_shows()', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_no_shows()', 'execute'),
  'mark_no_shows ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.mark_session_holding(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.mark_session_holding(uuid,uuid)', 'execute'),
  'mark_session_holding ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.notify_user(uuid,uuid,text,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.notify_user(uuid,uuid,text,text,text,text)', 'execute'),
  'notify_user ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.promote_waitlist(uuid,integer,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.promote_waitlist(uuid,integer,uuid)', 'execute'),
  'promote_waitlist ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.recompute_player_skill()', 'execute')
  and not has_function_privilege('authenticated', 'public.recompute_player_skill()', 'execute'),
  'recompute_player_skill ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.record_chase(uuid,integer,text,text,text)', 'execute')
  and not has_function_privilege('authenticated', 'public.record_chase(uuid,integer,text,text,text)', 'execute'),
  'record_chase ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.release_hold(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.release_hold(uuid,text,uuid)', 'execute'),
  'release_hold ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.request_booking(uuid,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.request_booking(uuid,text,uuid)', 'execute'),
  'request_booking ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.session_denominator(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.session_denominator(uuid)', 'execute'),
  'session_denominator ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.settle_payment(uuid,boolean,text,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.settle_payment(uuid,boolean,text,text,uuid)', 'execute'),
  'settle_payment ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.settle_refund(uuid,boolean,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.settle_refund(uuid,boolean,text,uuid)', 'execute'),
  'settle_refund ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.start_payment(uuid,text,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.start_payment(uuid,text,text,uuid)', 'execute'),
  'start_payment ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.tournament_groups_of(uuid,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.tournament_groups_of(uuid,uuid)', 'execute'),
  'tournament_groups_of ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.try_hold_court(uuid,uuid,timestamp with time zone,timestamp with time zone,integer,text,uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.try_hold_court(uuid,uuid,timestamp with time zone,timestamp with time zone,integer,text,uuid)', 'execute'),
  'try_hold_court ปิดจาก anon และ authenticated');

select * from finish();
rollback;

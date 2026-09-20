-- ฟังก์ชันที่ต้องปิดจาก anon และ authenticated (LSN-0049 · LSN-0050)
--
-- ⚠️ เทสนี้ตรวจ **สถานะของฐานข้อมูลที่ชี้ไป** ไม่ใช่ตรรกะของโค้ด ในเครื่องมันเขียว
-- อยู่แล้ว ของที่เคยเพี้ยนคือ production เพราะฟังก์ชันใหม่ที่ไม่มีใคร revoke
-- จะเรียกได้โดย PUBLIC ตามค่าเริ่มต้น และ Supabase cloud ยังแจก EXECUTE ให้
-- `anon`/`authenticated` ซ้ำอีกชั้น
--
-- pgTAP รันกับ production ไม่ได้ (ไม่ได้ติดตั้งส่วนขยาย `pgtap` บนนั้น)
-- ตัวจับการเบี่ยงข้ามสภาพแวดล้อมจึงเป็น **`npm run check:grants`** ไม่ใช่ไฟล์นี้
-- ไฟล์นี้มีหน้าที่กันไม่ให้ migration ในอนาคต grant คืนให้โดยไม่ตั้งใจ

begin;
select plan(32);

select cmp_ok(30, '>=', 30, 'รายชื่อยังครบ ไม่ได้ถูกลบจนว่าง');

select ok(
  has_function_privilege('authenticated',
    'public.create_tournament(uuid,text,timestamptz,timestamptz,timestamptz,integer,integer,integer,public.tournament_tier)',
    'execute'),
  'ฟังก์ชันที่ผู้ใช้ต้องเรียกได้ยังเปิดอยู่ — ไม่ได้ปิดเหมารวม');

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
  not has_function_privilege('anon', 'public.generate_group_code()', 'execute')
  and not has_function_privilege('authenticated', 'public.generate_group_code()', 'execute'),
  'generate_group_code ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.generate_session_code()', 'execute')
  and not has_function_privilege('authenticated', 'public.generate_session_code()', 'execute'),
  'generate_session_code ปิดจาก anon และ authenticated');

select ok(
  not has_function_privilege('anon', 'public.generate_tournament_code()', 'execute')
  and not has_function_privilege('authenticated', 'public.generate_tournament_code()', 'execute'),
  'generate_tournament_code ปิดจาก anon และ authenticated');

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
  not has_function_privilege('anon', 'public.session_progress(uuid)', 'execute')
  and not has_function_privilege('authenticated', 'public.session_progress(uuid)', 'execute'),
  'session_progress ปิดจาก anon และ authenticated');

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

-- หาทัวร์นาเมนต์ที่เปิดรับสมัครได้ โดยไม่ต้องมีลิงก์ (LSN-0036)
--
-- policy `tournaments_read` ปิดสนิทสำหรับคนนอก: anon ไม่มีสิทธิ์อะไรเลย และ
-- authenticated ที่ไม่ได้อยู่ในงานก็อ่านไม่ได้ ซึ่งถูกต้องแล้วสำหรับหน้ารายละเอียด
--
-- แต่การจะให้คนหางานเจอ ต้องมีทางอ่านสาธารณะ และการผ่อน policy ให้คนนอกอ่าน
-- ตารางตรง ๆ จะเปิด **ทุกคอลัมน์** เพราะ RLS เป็น row-level ไม่ใช่ column-level
-- (บทเรียน LSN-0023) การปกปิดฟิลด์จึงต้องแปลว่า "ไม่คืนฟิลด์นั้น" เท่านั้น
--
-- ใช้แพตเทิร์นเดียวกับ tournament_invite_public() ที่มีอยู่แล้ว คือ security definer
-- ที่ประกอบ JSON ขึ้นมาเองทีละฟิลด์ สิ่งที่ไม่ได้เขียนไว้ตรงนี้คือสิ่งที่หลุดออกไปไม่ได้

create or replace function public.public_open_tournaments()
returns jsonb language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x."startsAt"), '[]'::jsonb)
  from (
    select
      t.public_code                    as "publicCode",
      t.title                          as "title",
      t.tier::text                     as "tier",
      t.starts_at                      as "startsAt",
      t.registration_deadline          as "registrationDeadline",
      t.entry_fee_thb                  as "entryFeeThb",
      t.min_teams                      as "minTeams",
      t.max_teams                      as "maxTeams",
      g.name                           as "hostGroupName",
      (select count(*) from public.tournament_teams tt
        where tt.tournament_id = t.id) as "teamCount"
    from public.tournaments t
    join public.groups g on g.id = t.host_group_id
    -- allowlist ไม่ใช่ denylist — บทเรียน LSN-0020 และ LSN-0029
    -- ถ้าเขียนเป็น `status <> 'draft'` สถานะใหม่ที่เพิ่มวันหลังจะหลุดออกสาธารณะเอง
    where t.status = 'open'
      -- กรองที่นี่ ไม่ใช่บนหน้าจอ: งานที่เลยกำหนดแล้วแต่ยังไม่ถูกกวาดโดย
      -- close_unfilled_tournaments() จะยังเป็น open อยู่ชั่วคราว ถ้าปล่อยให้โผล่
      -- คนจะกดเข้าไปเจอทางตันที่สมัครไม่ได้
      and t.registration_deadline > now()
    order by t.starts_at
    limit 50
  ) x;
$$;

comment on function public.public_open_tournaments() is
  'รายการทัวร์นาเมนต์ที่เปิดรับสมัครสำหรับหน้าค้นหาสาธารณะ · คืนเฉพาะฟิลด์ที่ตั้งใจเปิด ไม่มีสถานะการจ่ายเงินหรือ id ภายใน (LSN-0036)';

revoke execute on function public.public_open_tournaments() from public;
grant execute on function public.public_open_tournaments() to anon, authenticated, service_role;

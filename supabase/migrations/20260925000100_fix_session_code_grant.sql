-- ผู้ใช้ตั้งนัดไม่ได้เลย เพราะ trigger สร้างรหัสนัดไม่มีสิทธิ์ (LSN-0043)
--
-- อาการ: กดเผยแพร่นัดแล้วได้ 42501 permission denied for function
-- generate_session_code ทุกครั้ง นัดไม่ถูกสร้างเลยสักอัน
--
-- ต้นตอ: trigger sessions_assign_code เรียก generate_session_code() ตอน insert
-- ทั้งคู่เป็น INVOKER จึงทำงานในสิทธิ์ของคนที่ insert ซึ่งคือ authenticated
-- เพราะ **นัดถูก insert ตรงจากไคลเอนต์ผ่าน PostgREST ไม่ได้ผ่าน RPC**
--
-- ก๊วนกับทัวร์นาเมนต์ไม่เจอปัญหานี้เพราะถูกสร้างผ่าน create_group() และ
-- create_tournament() ซึ่งเป็น security definer อยู่แล้ว ความต่างอยู่ที่ทางเข้า
-- ไม่ใช่ที่ตัวฟังก์ชัน
--
-- แก้ด้วย security definer ไม่ใช่ grant execute เพราะการวนหารหัสที่ยังไม่ซ้ำ
-- อ่าน public.sessions ผ่าน RLS ของผู้เรียก ผู้ใช้ทั่วไปมองไม่เห็นนัดของคนอื่น
-- ทั้งหมด จึงอาจได้รหัสที่ซ้ำกับนัดที่ตัวเองมองไม่เห็น แล้วไปตายที่ unique
-- constraint แทน — definer แก้ทั้งสิทธิ์และความถูกต้องของการตรวจซ้ำในคราวเดียว

create or replace function public.generate_session_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i integer;
begin
  loop
    v_code := '';
    for v_i in 1..7 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.sessions where public_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public.sessions_assign_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.public_code is null or new.public_code = '' then
    new.public_code := public.generate_session_code();
  end if;
  return new;
end;
$$;

-- ไม่ต้อง grant ให้ใครเพิ่ม trigger ทำงานในสิทธิ์เจ้าของแล้ว
revoke execute on function public.generate_session_code() from public;

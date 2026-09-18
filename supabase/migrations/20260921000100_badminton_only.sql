-- แสดงเฉพาะแบดมินตัน (LSN-0033)
--
-- docs/product-concept.md ตัดสินไปแล้วว่าโปรดักต์นี้เป็นของแบดมินตันอย่างเดียว
-- ด้วยเหตุผลว่า "ทุกกีฬา แปลว่าไม่ได้ออกแบบให้ใครโดยเฉพาะ" แต่ตารางอ้างอิงยังมี
-- อีกห้ากีฬาค้างอยู่ตั้งแต่ตอนที่ยังตั้งใจรองรับทุกกีฬา
--
-- ปิดสวิตช์ที่มีอยู่แล้ว **ไม่ลบข้อมูล** เพราะนัดและก๊วนที่เป็นกีฬาอื่นอ้างถึงแถวเหล่านี้
-- อยู่ผ่าน foreign key และการลบจะทำให้ประวัติเสียหายโดยไม่ได้อะไรกลับมา
--
-- ---------------------------------------------------------------------------
-- เปิดกลับทั้งหมด:
--     update public.sports set is_active = true;
--
-- เปิดกลับทีละกีฬา:
--     update public.sports set is_active = true where slug = 'pickleball';
-- ---------------------------------------------------------------------------

update public.sports set is_active = true  where slug =  'badminton';
update public.sports set is_active = false where slug <> 'badminton';

-- ด่านกันพลาด: ถ้าวันหนึ่งมีคนเปลี่ยน slug ของแบดมินตัน คำสั่งข้างบนจะปิดทุกกีฬา
-- แล้วฟอร์มทุกหน้าจะไม่มีอะไรให้เลือกเลย — ซึ่งเป็นอาการที่ไม่มีอะไรฟ้องจนกว่าจะมี
-- คนเปิดหน้าตั้งนัดแล้วเจอรายการว่าง จึงให้ migration ล้มตรงนี้แทน
do $$
declare
  v_active integer;
begin
  select count(*) into v_active from public.sports where is_active;
  if v_active = 0 then
    raise exception 'ไม่เหลือกีฬาที่เปิดใช้เลยสักตัว — ตรวจ slug ของแบดมินตันใน public.sports';
  end if;
end $$;

comment on column public.sports.is_active is
  'false = ซ่อนจากทุกฟอร์มที่ให้เลือกกีฬา · ต้องอ่านผ่าน loadSports() เท่านั้น ห้ามยิง query ตารางนี้ตรง ๆ (LSN-0033)';

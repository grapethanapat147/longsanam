# ฟอนต์สำหรับ og:image

`Anuphan-Regular.ttf` กับ `Anuphan-Bold.ttf` อยู่ที่นี่เพราะ `ImageResponse`
(Satori) ต้องการ **ไฟล์ฟอนต์** ไม่ใช่ CSS variable — มันไม่ได้รันในเบราว์เซอร์
จึงไม่เห็นฟอนต์ที่ `next/font/google` โหลดให้หน้าเว็บปกติ และมันไม่มีฟอนต์ไทย
ติดมาเลย ถ้าไม่มีสองไฟล์นี้ ข้อความไทยบนภาพ preview จะกลายเป็นกล่องเปล่า

หน้าเว็บปกติ **ไม่ได้** ใช้ไฟล์พวกนี้ — ยังโหลดผ่าน `next/font/google` เหมือนเดิม
ไฟล์พวกนี้จึงไม่ได้เพิ่มน้ำหนักให้ bundle ฝั่งผู้ใช้ อ่านเฉพาะตอน render ภาพ

## ห้ามใช้ไฟล์ variable

ต้นทางที่ Google Fonts แจกคือ `Anuphan[wght].ttf` ซึ่งเป็น **variable font**
(มีตาราง `fvar`/`gvar`) **Satori อ่านไม่ได้** — โยน

```
TypeError: Cannot read properties of undefined (reading '256')
```

แล้ว response พังทั้งก้อน (`failed to pipe response`) ต้องตัดเป็น static instance
ก่อนเสมอ และเพราะ Satori ไม่สังเคราะห์ตัวหนาให้ น้ำหนัก 700 จึงต้องเป็นอีกไฟล์

## สร้างใหม่ยังไง

```sh
curl -L -o /tmp/Anuphan-variable.ttf \
  'https://raw.githubusercontent.com/google/fonts/main/ofl/anuphan/Anuphan%5Bwght%5D.ttf'

python3 - <<'PY'
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src = '/tmp/Anuphan-variable.ttf'
for wght, out in ((400, 'src/assets/fonts/Anuphan-Regular.ttf'),
                  (700, 'src/assets/fonts/Anuphan-Bold.ttf')):
    f = TTFont(src)
    instancer.instantiateVariableFont(f, {'wght': wght}, inplace=True, updateFontNames=True)
    f.save(out)
PY
```

## สัญญาอนุญาต

SIL Open Font License 1.1 ดู `Anuphan-OFL.txt` ต้นทางเป็นงานของ Cadson Demak
เผยแพร่ผ่าน Google Fonts ต้นฉบับ **ไม่ได้ประกาศ Reserved Font Name** ไว้
instance ที่ตัดออกมาจึงยังใช้ชื่อ Anuphan ได้ และสำเนาสัญญาต้องไปกับไฟล์เสมอ

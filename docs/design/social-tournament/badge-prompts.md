# Badge artwork — prompts

Achievement badges ที่ผู้เล่นได้หลังจบทัวร์นาเมนต์ แนวเดียวกับ Strava
แต่ต้องอยู่ในภาษาภาพของ Design System 05 ไม่ใช่เหรียญทั่วไป

> เอกสารนี้เป็น **prompt สำหรับสร้างภาพ** ไม่ใช่สเปกฟีเจอร์
> กติกาว่าใครได้ badge เมื่อไร ยังไม่ตัดสิน ดู "ข้อควรระวัง" ท้ายไฟล์

---

## สิ่งที่ตัดสินไปแล้ว และ prompt ต้องเคารพ

| ข้อ | ค่า | เหตุผล |
|---|---|---|
| รูปทรง | **มุมโค้งสลับมุมตัด** `24 6 24 6` ไม่ใช่วงกลม | วงกลมคือ Strava · มุมสลับคือลายเซ็นของ direction 04 ที่ใช้ทั้งแอปอยู่แล้ว |
| ไลม์ `#bfec33` | เป็นพื้นและกราฟิกเท่านั้น **ห้ามเป็นตัวอักษร** | 1.38:1 บนขาว ตกทุกเกณฑ์ |
| เงา / gradient / 3D | **ห้ามทั้งหมด** | ระบบเป็น flat ล้วน ทั้งโลโก้และมาสคอต |
| สีผิว | ไม่มี | มาสคอตชุดนี้เป็น stroke ไม่ใช่คน |
| ตัวอักษรในภาพ | **ไม่มีเลย** | ดูหัวข้อ "ทำไมภาพต้องไม่มีตัวอักษร" |

สีที่ใช้ได้เท่านั้น — brand-500 `#12a563` · brand-600 `#0a7a4f` ·
brand-700 `#076140` · brand-900 `#06301f` · accent-500 `#bfec33` ·
accent-400 `#d6f56e` · ink-900 `#0d1f18` · section `#f1f9f4` · ขาว `#ffffff`

เรขาคณิตที่ต้องยืมมา — ตรา Flow Runner: viewBox 120, stroke 18, ปลายตัด,
หัวเป็นวงกลมแยก r 11 · มาสคอต: viewBox 240, ลำตัว stroke 24, หัว r 15,
ไม้ stroke 4, grip 7 · ลูกขนไก่: ellipse rx 14 ry 21 พื้นไลม์ ขอบ brand-700

---

## ระบบ: ความหายากอยู่ที่ **พื้น** ไม่ใช่ที่สี

ปัญหาของ badge ส่วนใหญ่คือเพิ่มสีใหม่ทุกครั้งที่อยากได้ระดับใหม่
ซึ่งพังพาเลตต์ภายในสามใบ ระบบนี้ใช้สีเดิมทั้งหมด แล้วไล่ระดับด้วย
**การกลับพื้น–ลาย** แทน

| ระดับ | พื้น | ลาย | ใช้กับ |
|---|---|---|---|
| **ธรรมดา** | ขาว ขอบ brand-600 หนา 6 | เส้น brand-600 | สิ่งที่เกิดได้ทุกงาน |
| **หายาก** | brand-500 เต็มใบ | ลาย ink-900 + ไลม์หนึ่งจุด | สิ่งที่ต้องจบงานถึงได้ |
| **หายากมาก** | ink-900 เต็มใบ | ลายไลม์ล้วน | สิ่งที่ต้องสะสมข้ามงาน |

วางเรียงในตารางเดียวกันแล้วยังอ่านเป็นชุดเดียว เพราะรูปทรงและน้ำหนักเส้นเท่ากันหมด

## หกใบแรก

| # | ใบ | ระดับ | ภาพกลาง |
|---|---|---|---|
| 1 | จบทัวร์นาเมนต์ครั้งแรก | หายาก | มาสคอตท่า cheer สองแขนชูขึ้น ลูกขนไก่ลอยเหนือหัว |
| 2 | เจอก๊วนใหม่ | ธรรมดา | ตรา Flow Runner สองตัวหันเข้าหากัน ลูกขนไก่โค้งข้ามระหว่างกลาง |
| 3 | ครบสี่สัปดาห์ | หายาก | เส้นสนามสี่เส้นไล่ความสูงขึ้น ลูกขนไก่เกาะเส้นที่สี่ |
| 4 | ขึ้นรุ่น | หายากมาก | ลูกศรหักสามชั้นซ้อนชี้ขึ้น เงาไม้แบดพาดเฉียง |
| 5 | น้ำใจนักกีฬา | ธรรมดา | ไม้แบดสองอันไขว้ต่ำ มือเปิดหนึ่งข้างเหนือจุดไขว้ |
| 6 | เจ้าภาพ | หายาก | ตรา Flow Runner หนึ่งตัว ล้อมด้วยจุดเล็กสามจุด |

ใบที่ 5 ต้องดู **ไม่เหมือนใบฝีมือ** โดยสิ้นเชิง เพราะระบบแยกน้ำใจออกจากฝีมือ
ตั้งแต่ต้น ถ้าสองอย่างนี้ดูคล้ายกัน คนจะอ่านว่าน้ำใจคือฝีมืออ่อน ๆ

---

## Prompt A — contact sheet (ใบแรกที่ต้องรัน)

```text
Create a premium achievement badge sheet for ลงสนาม (Longsanam), a Thai
badminton social tournament app. These are collectible badges awarded after a
player completes a tournament, in the spirit of Strava challenge badges but in
a distinct house visual language, NOT circular medals and NOT generic esports
emblems.

BADGE SHAPE — this is the single most important rule. Every badge is the SAME
rounded-square plaque with ASYMMETRIC corners: top-left and bottom-right are
generously rounded, top-right and bottom-left are sharp 90-degree cuts. Ratio
roughly 24 units of radius to 6. This alternating corner treatment is the
brand's signature; do not use circles, shields, hexagons, laurel wreaths,
ribbons, banners or star bursts.

STYLE — flat editorial vector illustration, thick confident strokes with BUTT
caps (flat ends, never rounded caps), solid fills only. Absolutely no
gradients, no drop shadows, no bevels, no gloss, no 3D, no metallic texture,
no embossing, no sparkle, no glow, no paper texture. The craft level is a
commissioned European brand identity system, geometric and calm, not a mobile
game reward popup.

COLOR — use ONLY these hex values: deep pitch green #0a7a4f, bright pitch green
#12a563, dark green #076140, very dark green #06301f, near-black ink #0d1f18,
electric lime #bfec33, pale lime #d6f56e, pale mint #f1f9f4, pure white
#ffffff. No gold, no silver, no bronze, no red, no blue, no purple, no orange.

RARITY IS EXPRESSED BY GROUND, NOT BY HUE:
- Common badge: white ground, 6-unit #0a7a4f border, artwork drawn as #0a7a4f
  strokes.
- Rare badge: solid #12a563 ground filling the whole plaque, artwork in
  near-black #0d1f18, with exactly ONE lime #bfec33 element as the focal point.
- Elite badge: solid #0d1f18 ground filling the whole plaque, artwork entirely
  in lime #bfec33.

RECURRING MOTIFS, drawn consistently across every badge:
- A shuttlecock: a vertical ellipse skirt roughly 14 wide by 21 tall with a
  small solid cork at the base. On rare and elite badges the skirt is lime.
- A stylised runner mark: three thick sweeping stroke paths suggesting a figure
  in motion plus a SEPARATE solid circle for the head, floating detached above
  the shoulder line. The head never touches the body strokes.
- Court lines: straight thick strokes, always parallel or perpendicular, never
  curved.
- A badminton racket reduced to a thin oval frame on a straight handle, frame
  stroke much thinner than the body strokes.

COMPOSITION — landscape contact sheet on a pure white background. EXACTLY SIX
equally sized badge plaques in a spacious 3-column by 2-row grid. Every plaque
identical in size and shape, generously separated, none cropped or touching,
wide white margins all around.

Top row, left to right:
1. RARE, green ground. A celebrating figure, both arms thrown upward in a wide
   V, near-black strokes, with a single lime shuttlecock floating above the
   detached circular head.
2. COMMON, white ground. Two runner marks mirrored, facing each other across
   the plaque, with a lime-skirted shuttlecock arcing between them along a thin
   dotted flight path.
3. RARE, green ground. Four vertical court-line bars of ascending height, the
   tallest on the right, with a lime shuttlecock resting on top of the fourth.

Bottom row, left to right:
4. ELITE, near-black ground. Three stacked chevrons pointing upward in lime,
   increasing in width, with a thin lime racket frame laid diagonally behind
   them.
5. COMMON, white ground. Two rackets crossed low and wide near the bottom of
   the plaque, with a single open hand shape drawn in thick strokes above the
   crossing point. This badge must read as generosity and fair play, clearly
   NOT as skill or ranking.
6. RARE, green ground. One runner mark centred, surrounded by exactly three
   small solid dots arranged around it, one of them lime.

ABSOLUTELY NO TEXT ANYWHERE. No letters, no Thai script, no Latin script, no
numbers, no roman numerals, no dates, no ribbon labels, no watermark, no
signature, no headings above the grid. The badges are purely pictorial; labels
are composited by the application afterwards.

Each badge must be readable as a silhouette at 48 pixels. Keep the central
motif large and centred with generous internal padding; avoid thin decorative
filigree, avoid dense detail near the plaque edges, avoid outer rings of small
repeated ornaments.
```

## Prompt B — simplification pass (รันต่อจาก A เสมอ)

```text
Edit this badge sheet into the final artwork. Preserve the EXACT six concepts,
the 3x2 grid, the asymmetric rounded-square plaque shape with two rounded and
two cut corners, the plaque sizes, the white background and the generous
separation. Preserve which badges are white-ground, green-ground and
black-ground.

Art direction change: SIMPLIFY hard. Reduce every motif to the smallest number
of shapes that still reads. Remove every ornamental element that is not one of:
the figure strokes, the detached circular head, the shuttlecock, the court
lines, the racket frame, the chevrons, the hand, the three dots. Delete any
inner rings, dotted borders, tick marks, corner flourishes, small repeated
shapes around the rim, and any hint of a laurel or wreath.

Every stroke must be uniform weight within its own role: figure strokes
heaviest, court lines equal to figure strokes, racket frame roughly one quarter
of that. All stroke ends flat, never rounded. All corners of the artwork
geometric, no wobble, no hand-drawn feel.

Flatten all colour to the exact palette with no tints or blends: #0a7a4f,
#12a563, #076140, #06301f, #0d1f18, #bfec33, #d6f56e, #f1f9f4, #ffffff. Each
badge uses at most three of them plus its ground. Remove every gradient,
shadow, highlight, texture and anti-aliased soft edge.

Confirm there is still NO text of any kind anywhere in the image, and that each
badge remains legible when shrunk to 48 pixels. The result should look like one
coherent icon system designed by a single hand, not six separate illustrations.
```

## Prompt C — สั่งใหม่เฉพาะใบเดียว

ใช้เมื่อห้าใบใช้ได้แล้วเหลือใบเดียวที่ไม่เข้าพวก แก้ตรง `[...]` สามจุด

```text
Create a single achievement badge for a Thai badminton app, on a pure white
background with generous margins, one plaque only, centred.

Plaque: rounded-square with asymmetric corners — top-left and bottom-right
generously rounded, top-right and bottom-left sharp 90-degree cuts.

Ground and palette: [white ground with a 6-unit #0a7a4f border and #0a7a4f
artwork | solid #12a563 ground with #0d1f18 artwork and exactly one #bfec33
focal element | solid #0d1f18 ground with artwork entirely in #bfec33].

Artwork: [อธิบายภาพกลางเป็นรูปทรงพื้นฐาน ไม่เกินสามประโยค].

Flat editorial vector style, thick strokes with flat butt ends, solid fills.
No gradients, no shadows, no 3D, no metallic finish, no gloss, no sparkle, no
laurel, no ribbon, no rim ornaments. No text, letters, numbers or script of any
kind. Must read clearly as a silhouette at 48 pixels.
```

---

## ทำไมภาพต้องไม่มีตัวอักษร

ตัวสร้างภาพเขียนอักษรไทยไม่ได้ สระลอย วรรณยุกต์หลุด และคำจะเพี้ยนแบบที่
มองเผิน ๆ ไม่เห็น ถ้าฝังคำว่า "จบทัวร์นาเมนต์ครั้งแรก" ลงในภาพ เราจะได้ badge
ที่สะกดผิดถาวรและแก้ไม่ได้โดยไม่สร้างใหม่ทั้งใบ

ทางที่ถูกคือ **ภาพเป็นภาพ คำเป็นคำ** — แอปวางชื่อ badge ด้วย Bai Jamjuree 700
หรือ Anuphan 600 ทับ/ใต้ภาพตอน render ซึ่งได้ของแถมสามอย่าง: แก้คำได้โดยไม่แตะภาพ,
ทำหลายภาษาได้จากภาพชุดเดียว, และ screen reader อ่านได้

## จาก raster ไป SVG

Prompt ข้างบนคืนภาพ PNG ซึ่งใช้เป็น **ต้นแบบ** ไม่ใช่ของที่ ship
ระบบนี้เป็นเวกเตอร์ล้วนทั้งชุด badge จึงควรถูก trace เป็น SVG ต่อ
โดยล็อกค่าให้ตรงของเดิม — plaque 240×240, ลำตัว stroke 24, หัว r 15,
ไม้ stroke 4, ลูกขนไก่ rx 14 ry 21 — แล้วจะได้ badge ที่คมทุกขนาด
และเปลี่ยนสีตาม token ได้ทีหลัง

## ข้อควรระวังเรื่องกติกา ไม่ใช่เรื่องภาพ

`.codex/specs/tournaments.md` ตัดสินไว้ว่า **คะแนนที่กำหนดรุ่นต้องมาจากผลการแข่ง**
ไม่ใช่การประเมินกันเอง เพราะอะไรที่มีมูลค่าจะถูกปั่น

badge ก็มีมูลค่า ถ้าใบไหนได้มาจากการที่เพื่อนกดให้ มันจะกลายเป็นช่องเดียวกัน
ทันที ใบ "น้ำใจนักกีฬา" จึงเป็นใบที่ต้องออกแบบกติกาให้ระวังที่สุด
และควรมีเกณฑ์ขั้นต่ำ (เช่น ต้องมีผู้ประเมินจากหลายก๊วน) ก่อนปล่อยจริง

**ข้อนี้ยังไม่ตัดสิน** และไม่ควรตัดสินพร้อมกับการเลือกภาพ

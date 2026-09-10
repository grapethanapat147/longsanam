# -*- coding: utf-8 -*-
"""ลงสนาม — ตราคนวิ่งที่อ่านเป็น ล ได้"""
import os

C = dict(
    paper='#ffffff', mint='#f1f9f4',
    p400='#2ec27b', p500='#12a563', p600='#0a7a4f', p700='#076140', p800='#084d34', p900='#06301f',
    p50='#ecfbf2', p100='#cff5e0', p200='#9fe9c2', p300='#63d79e',
    l400='#d6f56e', l500='#bfec33', l600='#9ac41c',
    ink900='#0d1f18', ink700='#35473f', ink500='#64766c', ink300='#b9c7bf',
    ink200='#dfe8e2', ink100='#eff5f1',
)

def lum(h):
    r, g, b = [int(h[i:i+2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return .2126*f(r) + .7152*f(g) + .0722*f(b)

def cr(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + .05) / (min(la, lb) + .05)

def ratio(a, b):
    return f'{cr(a,b):.2f}:1'

assert cr(C['l500'], C['p700']) >= 3.0, 'ไลม์บนเขียวเข้ม'
assert cr(C['p600'], C['paper']) >= 4.5, 'เขียวบนขาว'
assert cr(C['ink900'], C['paper']) >= 4.5, 'หมึกบนขาว'
assert cr(C['ink900'], C['l500']) >= 4.5, 'หมึกบนไลม์'

# ---------------------------------------------------------------------------
# ตรา — เส้นหนาปลายมน สามชิ้น อ่านได้สองทาง
#
#   ท่าคนวิ่ง          ตัวอักษร ล
#   หลังโค้งไปข้างหน้า   ส่วนโค้งด้านบน
#   ขาหลังถีบ           เส้นตั้งซ้าย
#   ขาหน้าก้าว          เส้นลงขวา
#   วงกลมที่เท้าหลัง     หัวของ ล
#   วงกลมหัวคน          จุดบนตัวอักษร
#
# ความหนาเส้นเท่ากันหมด ปลายมนหมด ไม่มีเส้นขอบ ไม่มีไล่เฉด
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# วัดจากภาพอ้างอิง (ผืน 1200×1500) แล้วหารสิบ — ไม่ได้วาดจากความจำ
#
#   เส้นบน (แขน)  เริ่ม (335,515) ขึ้นถึงยอด (490,435) แล้วไหลลงขวายาว ๆ
#                 ผ่าน (780,690) ไปจบที่ (1075,690) ปลายงอนขึ้นเล็กน้อย
#   เส้นล่าง (ขา) เริ่ม (130,810) ลงไปท้อง (380,890) ขึ้นถึงเข่า (640,680)
#                 แล้วพุ่งลงขวาชัน ๆ ถึง (940,1050) ปลายงอนขึ้น (1010,990)
#   หัว           วงกลม (785,525) รัศมี 45
#   ความหนาเส้น    ราว 75
#
# การอ่านเป็น ล อยู่ที่เส้นล่างเส้นเดียว: หัวล่างซ้าย → ขึ้นเป็นส่วนโค้ง → ลงขวา
# จึงเติมห่วงที่ปลายซ้ายของเส้นล่างให้เป็นหัวของ ล ส่วนที่เหลือเป็นของเดิม
# ---------------------------------------------------------------------------
SW   = 9.2
VB   = "0 32 120 86"
ARMS = "M33.5 51.5 C37 45 43.5 42.5 49 43.5 C60 46 72 63 86 69.5 C94 73 101.5 72.5 107.5 68"
LEGS = "M22 82 C27 77 31 79 34 83 C39.5 89 45 89.5 50.5 85 C57 79.5 61 73 64 68 L93.5 105 C96.5 108.5 100.5 107 102 101"
LOOP = (16.5, 85, 5.6)     # หัวของ ล ที่ปลายขาหลัง
HEAD = (79, 52, 5.6)

def _strokes(colour):
    return f'''<g fill="none" stroke="{colour}" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round">
    <path d="{ARMS}"/>
    <path d="{LEGS}"/>
    <circle cx="{LOOP[0]}" cy="{LOOP[1]}" r="{LOOP[2]}"/>
  </g>'''

def runner(colour, uid='a', show_head=True):
    head = f'<circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]}" fill="{colour}"/>' if show_head else ''
    return f'''<svg viewBox="{VB}" role="img" aria-label="ตราสัญลักษณ์ ลงสนาม คนวิ่งที่อ่านเป็น ล ได้">
  {_strokes(colour)}
  {head}
</svg>'''

def runner_disc(ground, colour, uid='d', ring=False):
    ringel = f'<circle cx="64" cy="64" r="60" fill="none" stroke="{C["paper"]}" stroke-width="4"/>' if ring else ''
    return f'''<svg viewBox="0 0 128 128" role="img" aria-label="ตราสัญลักษณ์ ลงสนาม ในวงกลม">
  <circle cx="64" cy="64" r="64" fill="{ground}"/>
  <g transform="translate(8,-6) scale(0.93)">
    {_strokes(colour)}
    <circle cx="{HEAD[0]}" cy="{HEAD[1]}" r="{HEAD[2]}" fill="{colour}"/>
  </g>
  {ringel}
</svg>'''

def swatch(label, hexv, note=''):
    return (f'<div class="chipc"><div class="sw" style="background:{hexv}"></div>'
            f'<div class="lb"><b>{label}</b><span>{hexv}</span>{f"<em>{note}</em>" if note else ""}</div></div>')

MARK      = runner(C['l500'])
MARK_INK  = runner(C['ink900'])
MARK_GRN  = runner(C['p600'])
DISC      = runner_disc(C['p700'], C['l500'])
DISC_RING = runner_disc(C['p700'], C['l500'], ring=True)
DISC_LIME = runner_disc(C['l500'], C['p800'])

html = f'''<title>ตราคนวิ่ง ล</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600&family=Bai+Jamjuree:wght@600;700&display=swap">

<style>
:root {{
  --paper: {C['paper']}; --mint: {C['mint']};
  --p50: {C['p50']}; --p100: {C['p100']}; --p200: {C['p200']}; --p300: {C['p300']}; --p400: {C['p400']};
  --p500: {C['p500']}; --p600: {C['p600']}; --p700: {C['p700']}; --p800: {C['p800']}; --p900: {C['p900']};
  --l400: {C['l400']}; --l500: {C['l500']}; --l600: {C['l600']};
  --ink900: {C['ink900']}; --ink700: {C['ink700']}; --ink500: {C['ink500']};
  --ink300: {C['ink300']}; --ink200: {C['ink200']}; --ink100: {C['ink100']};
  --hairline: rgb(13 31 24 / .09);
  --font-body: 'Anuphan', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Bai Jamjuree', 'Anuphan', ui-sans-serif, sans-serif;
  --measure: 58ch;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0; background: var(--paper); color: var(--ink900);
  font-family: var(--font-body); font-size: 16px; line-height: 1.75;
  -webkit-font-smoothing: antialiased;
}}
h1, h2 {{ font-family: var(--font-display); font-weight: 600; line-height: 1.28; margin: 0; text-wrap: balance; }}
p {{ margin: 0; }}
code {{ font-family: ui-monospace, Menlo, monospace; font-size: .85em; color: var(--p700); }}
:lang(th) {{ letter-spacing: 0; }}
.wrap {{ width: min(100% - 3rem, 62rem); margin-inline: auto; }}
.eyebrow {{ font-family: var(--font-display); font-size: .6875rem; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--p600); }}
section {{ padding-block: 5rem; border-top: 1px solid var(--hairline); }}
.sec-head {{ max-width: var(--measure); margin-bottom: 2.5rem; }}
.sec-head h2 {{ font-size: clamp(1.5rem, 3.4vw, 1.9rem); margin-top: .5rem; }}
.sec-head p {{ margin-top: .75rem; color: var(--ink700); }}

.hero {{ padding-block: 5rem 4rem; text-align: center; }}
.hero-ref {{ background: var(--p700); display: grid; place-items: center; padding: 5rem 1.5rem; }}
.hero-ref .big {{ width: min(30rem, 80vw); }}
.hero .big {{ width: min(26rem, 74vw); margin-inline: auto; }}
.hero h1 {{ font-size: clamp(2.4rem, 7vw, 4rem); font-weight: 700; letter-spacing: -.02em; margin-top: 1.5rem; }}
.hero p {{ max-width: 36rem; margin: 1rem auto 0; color: var(--ink700); }}

.wm {{ font-family: var(--font-display); font-weight: 700; letter-spacing: -.012em; white-space: nowrap; }}
.lockup {{ display: inline-flex; align-items: center; gap: .38em; }}
.lockup svg {{ width: 1.9em; height: 1.75em; flex: none; display: block; }}
.stacked {{ display: inline-flex; flex-direction: column; align-items: center; gap: .35em; }}
.stacked svg {{ width: 3em; height: 2.8em; display: block; }}

.stage {{ display: grid; place-items: center; padding: 3rem 1.5rem; border-radius: 1rem; background: var(--mint); }}
.stage.green {{ background: var(--p700); }}
.stage.dark {{ background: var(--ink900); }}
.stage.lime {{ background: var(--l500); }}
.stage.white {{ background: var(--paper); box-shadow: inset 0 0 0 1px var(--hairline); }}
.stage .cap {{ margin-top: 1.35rem; font-size: .75rem; color: var(--ink500); }}
.stage.green .cap, .stage.dark .cap {{ color: var(--p200); }}
.stage.lime .cap {{ color: var(--p800); }}

.grid {{ display: grid; gap: 1rem; }}
.g2 {{ grid-template-columns: repeat(auto-fit, minmax(19rem, 1fr)); }}
.g3 {{ grid-template-columns: repeat(auto-fit, minmax(12.5rem, 1fr)); }}

/* อ่านสองทาง */
.dual {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr)); gap: 1.25rem; align-items: end; }}
.dual .cell {{ background: var(--mint); border-radius: 1rem; padding: 2rem 1.25rem 1.5rem; text-align: center; }}
.dual .cell.letter {{ background: var(--p50); }}
.dual svg {{ width: 100%; max-width: 11rem; margin-inline: auto; display: block; }}
.dual .glyph {{ font-family: var(--font-display); font-weight: 700; font-size: 8.5rem; line-height: .95; color: var(--p600); }}
.dual b {{ display: block; font-family: var(--font-display); font-size: .9375rem; margin-top: 1rem; }}
.dual p {{ font-size: .8125rem; color: var(--ink500); margin-top: .2rem; }}

.overlay {{ position: relative; display: grid; place-items: center; background: var(--paper); border: 1px solid var(--hairline); border-radius: 1rem; padding: 2rem; }}
.overlay .glyph {{ font-family: var(--font-display); font-weight: 700; font-size: 13rem; line-height: 1; color: var(--ink200); }}
.overlay svg {{ position: absolute; width: 15rem; }}

.parts {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: .75rem; margin-top: 1.25rem; }}
.parts div {{ background: var(--paper); border: 1px solid var(--hairline); border-radius: .625rem; padding: .8rem .9rem; }}
.parts b {{ display: block; font-family: var(--font-display); font-size: .875rem; }}
.parts span {{ font-size: .75rem; color: var(--ink500); }}

.sizes {{ display: flex; flex-wrap: wrap; align-items: flex-end; gap: 2.5rem; }}
.sizes figure {{ margin: 0; text-align: center; }}
.sizes svg {{ display: block; margin-inline: auto; }}
.sizes figcaption {{ font-size: .75rem; color: var(--ink500); margin-top: .7rem; }}

.icons {{ display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: flex-end; }}
.icons figure {{ margin: 0; }}
.icons .sq {{ width: 5rem; height: 5rem; overflow: hidden; box-shadow: 0 1px 2px rgb(13 31 24/.08), 0 10px 24px -14px rgb(13 31 24/.35); }}
.icons .sq svg {{ width: 100%; height: 100%; display: block; }}
.icons figcaption {{ font-size: .75rem; color: var(--ink500); margin-top: .6rem; text-align: center; }}

.dontgrid {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1.25rem; }}
.dont {{ text-align: center; }}
.dont .box {{ display: grid; place-items: center; height: 6.5rem; border: 1px solid var(--hairline); border-radius: .625rem; overflow: hidden; }}
.dont b {{ display: block; font-family: var(--font-display); font-size: .875rem; color: #c1362c; margin-top: .7rem; }}
.dont p {{ font-size: .75rem; color: var(--ink500); margin-top: .15rem; }}

.ramp {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: .75rem; }}
.chipc {{ border-radius: .625rem; overflow: hidden; border: 1px solid var(--hairline); }}
.chipc .sw {{ height: 4rem; }}
.chipc .lb {{ padding: .55rem .7rem .7rem; }}
.chipc .lb b {{ display: block; font-size: .8125rem; font-weight: 600; }}
.chipc .lb span {{ display: block; font-size: .6875rem; color: var(--ink500); font-family: ui-monospace, Menlo, monospace; }}
.chipc .lb em {{ display: block; font-style: normal; font-size: .6875rem; color: var(--p700); margin-top: .2rem; }}

.note {{ border-left: 2px solid var(--l500); padding-left: 1rem; color: var(--ink700); font-size: .9375rem; max-width: var(--measure); }}
.note b {{ color: var(--ink900); }}
.warn {{ border-left-color: #d98324; }}

.codewrap {{ overflow-x: auto; border-radius: .75rem; background: var(--ink900); }}
pre {{ margin: 0; padding: 1.25rem 1.4rem; }}
pre code {{ font-size: .8125rem; line-height: 1.8; color: #cfe0d7; background: none; padding: 0; white-space: pre; }}
.cm {{ color: #6d8b7d; }}
footer {{ padding-block: 3rem 4.5rem; color: var(--ink500); font-size: .875rem; border-top: 1px solid var(--hairline); }}
@media (prefers-reduced-motion: reduce) {{ * {{ animation: none !important; transition: none !important; }} }}
</style>

<div class="hero-ref">
  <div class="big">{MARK}</div>
</div>
<div class="wrap hero" style="padding-top:2.5rem">
  <h1>ลงสนาม</h1>
  <p>เส้นหนาปลายมนสองเส้นกับวงกลมสองวง วัดสัดส่วนจากภาพอ้างอิงตรง ๆ อ่านเป็นคนวิ่งโน้มไปข้างหน้า และอ่านเป็นตัว <b>ล</b> ได้ในภาพเดียวกัน
     — <b>ลง</b> แปลว่าพุ่งลงไป ท่าของตราจึงเป็นความหมายของชื่อ ไม่ใช่ภาพประกอบที่แปะทับ</p>
</div>

<section>
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">01 · Dual reading</p>
      <h2>ภาพเดียว สองความหมาย</h2>
      <p>ด้านซ้ายคือตรา ด้านขวาคือตัว ล จริงจากฟอนต์ Bai Jamjuree ที่โปรเจกต์ใช้อยู่ — วางไว้เทียบให้เห็นกันตรง ๆ</p>
    </div>
    <div class="dual">
      <div class="cell">{MARK_GRN}<b>อ่านเป็นคนวิ่ง</b><p>หลังโค้ง ขาหน้าก้าว ขาหลังถีบ</p></div>
      <div class="cell letter"><div class="glyph">ล</div><b>ตัว ล จริง</b><p>Bai Jamjuree 700</p></div>
    </div>

    <div class="overlay" style="margin-top:1.25rem">
      <div class="glyph">ล</div>
      {MARK}
    </div>
    <p class="cap" style="font-size:.75rem;color:var(--ink500);margin-top:.6rem;text-align:center">ตราทับบนตัวอักษร — ดูว่าโครงตรงกันแค่ไหน</p>

    <div class="parts">
      <div><b>เส้นบน</b><span>ไหล่กับแขนที่เหวี่ยง · ส่วนโค้งบนของ ล</span></div>
      <div><b>เส้นล่าง</b><span>สะโพกแล้วพุ่งเป็นขาที่ก้าว · เส้นลงขวาของ ล</span></div>
      <div><b>วงล่างซ้าย</b><span>ปลายเท้าหลัง · หัวของ ล</span></div>
      <div><b>วงบนขวา</b><span>หัวคน · จุดเหนือตัวอักษร</span></div>
    </div>

    <p class="note warn" style="margin-top:2rem">
      <b>ข้อที่ต้องให้คนอ่านไทยตัดสิน</b> — ผมวาดโครง ล จากรูปทรงหลักของมัน คือหัวล่างซ้าย
      เส้นตั้ง ส่วนโค้งบน และเส้นลงขวา แต่ผมไม่ใช่นักออกแบบตัวอักษรไทย
      ภาพซ้อนด้านบนมีไว้ให้ตัดสินด้วยตาว่ามันอ่านเป็น ล จริงไหม ถ้ายังไม่ใช่ บอกได้ว่าส่วนไหนเพี้ยน
      แล้วผมขยับให้ตรงขึ้น
    </p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">02 · Lockups</p>
      <h2>ใช้ที่ไหนบ้าง</h2>
    </div>
    <div class="grid g2">
      <div class="stage white"><span class="lockup" style="font-size:2.2rem">{MARK_GRN}<span class="wm" style="color:var(--ink900)">ลงสนาม</span></span><p class="cap">แนวนอน · พื้นขาว</p></div>
      <div class="stage green"><span class="lockup" style="font-size:2.2rem">{MARK}<span class="wm" style="color:var(--paper)">ลงสนาม</span></span><p class="cap">กลับสี · พื้นเขียวเข้ม</p></div>
      <div class="stage lime"><span class="lockup" style="font-size:2.2rem">{MARK_INK}<span class="wm" style="color:var(--ink900)">ลงสนาม</span></span><p class="cap">พื้นไลม์ · ใช้ตอนอยากให้ดัง</p></div>
      <div class="stage"><span class="stacked" style="font-size:2rem">{MARK_GRN}<span class="wm" style="color:var(--ink900)">ลงสนาม</span></span><p class="cap">แนวตั้ง · พื้นที่แคบ</p></div>
    </div>

    <h2 style="font-size:1.125rem;margin-top:3rem">ในวงกลม</h2>
    <p class="cap" style="font-size:.8125rem;color:var(--ink500);margin-top:.3rem">สำหรับอวตาร ไอคอนแอป และริชเมนู LINE ที่ต้องเป็นทรงสี่เหลี่ยมจัตุรัส</p>
    <div class="grid g3" style="margin-top:1.25rem">
      <div class="stage white"><div style="width:6rem">{DISC}</div><p class="cap">ไลม์บนเขียวเข้ม</p></div>
      <div class="stage green"><div style="width:6rem">{DISC_RING}</div><p class="cap">มีวงขาว · บนพื้นเขียว</p></div>
      <div class="stage white"><div style="width:6rem">{DISC_LIME}</div><p class="cap">กลับสี · พื้นไลม์</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">03 · Sizes</p>
      <h2>เส้นหนาเท่ากันทุกขนาด</h2>
      <p>ทั้งตราใช้ความหนาเส้นค่าเดียว ({SW} หน่วยใน viewBox กว้าง 120) ปลายมนทุกปลาย ย่อแล้วไม่มีส่วนไหนบางกว่าส่วนอื่น</p>
    </div>
    <div class="sizes">
      <figure><div style="width:8rem">{MARK_GRN}</div><figcaption>128 px</figcaption></figure>
      <figure><div style="width:4rem">{MARK_GRN}</div><figcaption>64 px</figcaption></figure>
      <figure><div style="width:2.5rem">{MARK_GRN}</div><figcaption>40 px</figcaption></figure>
      <figure><div style="width:1.75rem">{MARK_GRN}</div><figcaption>28 px</figcaption></figure>
      <figure><div style="width:1.25rem">{MARK_GRN}</div><figcaption>20 px</figcaption></figure>
    </div>
    <div class="icons" style="margin-top:2.5rem">
      <figure><div class="sq" style="border-radius:1.25rem">{DISC}</div><figcaption>iOS</figcaption></figure>
      <figure><div class="sq" style="border-radius:50%">{DISC}</div><figcaption>Android</figcaption></figure>
      <figure><div class="sq" style="border-radius:.5rem">{DISC}</div><figcaption>ริชเมนู LINE</figcaption></figure>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">04 · Usage</p>
      <h2>ข้อห้าม</h2>
    </div>
    <div class="dontgrid">
      <div class="dont"><div class="box"><div style="width:4rem;transform:rotate(-16deg)">{MARK_GRN}</div></div><b>ห้ามหมุน</b><p>หมุนแล้วเลิกเป็น ล</p></div>
      <div class="dont"><div class="box"><div style="width:5.5rem;height:3rem;overflow:hidden"><div style="width:100%;transform:scaleY(.6);transform-origin:top">{MARK_GRN}</div></div></div><b>ห้ามบีบ</b><p>เส้นหนาไม่เท่ากันทันที</p></div>
      <div class="dont"><div class="box" style="background:var(--p500)"><div style="width:4rem">{MARK}</div></div><b>ห้ามไลม์บนเขียวสว่าง</b><p>{ratio(C['l500'], C['p500'])} อ่านไม่ออก</p></div>
      <div class="dont"><div class="box"><div style="width:4rem">{runner(C['l500'], show_head=False)}</div></div><b>ห้ามตัดหัวออก</b><p>เหลือแต่ ล ไม่เหลือคน</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">05 · Colour</p>
      <h2>คู่สีที่ใช้ได้</h2>
      <p>ตราเป็นสีเดียวเสมอ ไม่มีตราสองสี คู่ไหนไม่ผ่าน 3:1 สคริปต์จะไม่ยอมสร้างหน้าให้</p>
    </div>
    <div class="ramp">
      {swatch('ไลม์ บนเขียว 700', C['l500'], f"{ratio(C['l500'], C['p700'])}")}
      {swatch('เขียว 600 บนขาว', C['p600'], f"{ratio(C['p600'], C['paper'])}")}
      {swatch('หมึก บนไลม์', C['ink900'], f"{ratio(C['ink900'], C['l500'])}")}
      {swatch('เขียว 800 บนไลม์', C['p800'], f"{ratio(C['p800'], C['l500'])}")}
    </div>
    <p class="note" style="margin-top:1.75rem">
      <b>ไลม์ห้ามอยู่บนเขียว 500</b> — วัดได้ {ratio(C['l500'], C['p500'])} ซึ่งต่ำกว่าเกณฑ์ภาพกราฟิกมาก
      ถ้าจะวางตราบนพื้นเขียว ต้องเป็น 700 ขึ้นไป
    </p>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="sec-head">
      <p class="eyebrow">06 · In the code</p>
      <h2>สองเส้นกับสองวงกลม</h2>
    </div>
    <div class="codewrap"><pre><code><span class="cm">// src/components/brand-mark.tsx</span>
export function BrandMark({{ size = 32, colour = 'var(--color-brand-600)' }}) {{
  return (
    &lt;svg viewBox="0 32 120 86" width={{size * 120 / 86}} height={{size}} aria-hidden&gt;
      &lt;g fill="none" stroke={{colour}} strokeWidth={{9.2}}
         strokeLinecap="round" strokeLinejoin="round"&gt;
        &lt;path d="M33.5 51.5 C37 45 43.5 42.5 49 43.5 C60 46 72 63 86 69.5 C94 73 101.5 72.5 107.5 68" /&gt;
        &lt;path d="M22 82 C27 77 31 79 34 83 C39.5 89 45 89.5 50.5 85 C57 79.5 61 73 64 68 L93.5 105 C96.5 108.5 100.5 107 102 101" /&gt;
        &lt;circle cx="16.5" cy="85" r="5.6" /&gt;
      &lt;/g&gt;
      &lt;circle cx="79" cy="52" r="5.6" fill={{colour}} /&gt;
    &lt;/svg&gt;
  );
}}</code></pre></div>
    <p class="note" style="margin-top:1.75rem">
      ตราไม่ได้เป็นจัตุรัส — viewBox กว้าง 120 สูง 86 คอมโพเนนต์จึงคูณอัตราส่วนให้เอง
      คนเรียกส่ง <code>size</code> เป็นความสูงอย่างเดียว ไม่ต้องจำสัดส่วน
    </p>
    <p class="note" style="margin-top:1rem">
      <b>ยังไม่ได้ลงในแอป</b> — ตอนนี้ยังเป็นกล่องตัวอักษร <code>ลส</code> อยู่สี่ที่
      (<code>shell.tsx</code>, <code>auth/sign-in</code>, <code>auth/sign-up</code>) รอไฟเขียวก่อนแทนที่
    </p>
  </div>
</section>

<footer class="wrap">
  <p>ตราลงสนาม · สีมาจากระบบ <b>เส้นสนาม</b> · ตัวอักษรเทียบเป็น Bai Jamjuree 700 ตัวเดียวกับที่แอปใช้</p>
</footer>
'''

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'logo.html')
open(OUT, 'w').write(html)
print('wrote', OUT, len(html), 'bytes')
print('ไลม์ บนเขียว 700 :', ratio(C['l500'], C['p700']))
print('ไลม์ บนเขียว 500 :', ratio(C['l500'], C['p500']), '← ห้ามใช้')
print('เขียว 600 บนขาว  :', ratio(C['p600'], C['paper']))

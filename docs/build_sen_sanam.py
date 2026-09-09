# -*- coding: utf-8 -*-
"""
เส้นสนาม — สร้างหน้า design system และมาสคอต "น้องสนาม" ทั้งหกท่า
จากหุ่นข้อต่อตัวเดียว (forward kinematics) แทนการวาดมือทีละท่า
"""
import math

OUT = '/private/tmp/claude-501/-Users-grapetnp-Herd-infinitecyberwhite-website/a06ab489-f44d-4432-84ac-581aeacfbca5/scratchpad/sen-sanam.html'

# ---------------------------------------------------------------- palette --
C = dict(
    paper='#ffffff', mint='#f1f9f4', mint_deep='#e4f2ea',
    p50='#ecfbf2', p100='#cff5e0', p200='#9fe9c2', p300='#63d79e', p400='#2ec27b',
    p500='#12a563', p600='#0a7a4f', p700='#076140', p800='#084d34', p900='#06301f',
    l300='#e9fbaa', l400='#d6f56e', l500='#bfec33', l600='#9ac41c',
    clay50='#fdf4ee', clay100='#fae3d3', clay500='#c2643b', clay700='#8f4526',
    rose50='#fdeeec', rose500='#c93a30', rose700='#93261e',
    ink900='#0d1f18', ink800='#1c302a', ink700='#35473f', ink500='#64766c',
    ink400='#7f8f86', ink300='#b9c7bf', ink200='#dfe8e2', ink100='#eff5f1',
    skin='#f1b48a', skin_deep='#d9946a', hair='#2b1a10',
)

def lum(h):
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def cr(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)

# กติกาที่หน้านี้อ้าง ต้องเป็นจริงก่อนสร้างหน้า
assert cr(C['ink900'], C['p500']) >= 4.5, 'ป้ายหมึกบนเขียว 500 ต้องผ่าน AA'
assert cr(C['paper'], C['p600']) >= 4.5, 'ป้ายขาวบนเขียว 600 ต้องผ่าน AA'
assert cr(C['p600'], C['paper']) >= 4.5, 'ตัวอักษรเขียว 600 บนขาวต้องผ่าน AA'
assert cr(C['ink400'], C['paper']) >= 3.0, 'ink-400 แบกไอคอน ต้องผ่าน 3:1'
assert cr(C['ink500'], C['paper']) >= 4.5, 'ink-500 เป็นคำบรรยาย ต้องผ่าน AA'

def ratio(a, b):
    return f'{cr(a, b):.2f}:1'

# ---------------------------------------------------------------- mascot ---
# หุ่นข้อต่อ: ทุกความยาวเป็นค่าคงที่ ทุกท่าคือชุดมุมหมุน
UPPER_ARM, FORE_ARM, THIGH, SHIN = 34, 30, 38, 34
SHOULDER_X, SHOULDER_Y = 26, 6      # จากฐานคอ
HIP_Y, HIP_X = 50, 10               # จากฐานคอ / จากกลางสะโพก
HEAD_Y = -30                        # จุดกลางหัวจากฐานคอ

def rot(x, y, deg):
    r = math.radians(deg)
    c, s = math.cos(r), math.sin(r)
    return (x * c - y * s, x * s + y * c)

def fk(origin, angle, length):
    dx, dy = rot(0, length, angle)
    return (origin[0] + dx, origin[1] + dy)

def head_svg(tilt):
    return f'''
    <g transform="translate(0,{HEAD_Y}) rotate({tilt})">
      <circle cx="-26" cy="4" r="5.5" fill="{C['skin']}"/>
      <circle cx="26" cy="4" r="5.5" fill="{C['skin']}"/>
      <circle cx="0" cy="0" r="26" fill="{C['skin']}"/>
      <path d="M-27 -6 A27 27 0 0 1 27 -6 Z" fill="{C['hair']}"/>
      <path d="M-3 -33 Q3 -47 15 -41 Q7 -41 4 -32 Z" fill="{C['hair']}"/>
      <path d="M-27.5 -9 Q0 -15 27.5 -9 L27.5 -1.5 Q0 -7.5 -27.5 -1.5 Z" fill="{C['l500']}"/>
      <ellipse cx="-15" cy="12" rx="4.2" ry="2.6" fill="{C['clay500']}" opacity="0.32"/>
      <ellipse cx="15" cy="12" rx="4.2" ry="2.6" fill="{C['clay500']}" opacity="0.32"/>
      <ellipse cx="-9" cy="6" rx="2.6" ry="3.3" fill="{C['ink900']}"/>
      <ellipse cx="9" cy="6" rx="2.6" ry="3.3" fill="{C['ink900']}"/>
      <path d="M-7 14 Q0 20.5 7 14" stroke="{C['ink900']}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    </g>'''

def torso_svg():
    # เสื้อจริง: ไหล่ คอเสื้อ ชายเสื้อ แผงเข้มด้านไกลแสง และแถบไลม์ตรงรอยต่อ
    return f'''
    <rect x="-7" y="-13" width="14" height="16" rx="4" fill="{C['skin_deep']}"/>
    <path d="M-28 10 Q-30 0 -20 -1 L-9 -1 Q0 8 9 -1 L20 -1 Q30 0 28 10 L24 58 Q0 62 -24 58 Z" fill="{C['p500']}"/>
    <path d="M9 -1 L20 -1 Q30 0 28 10 L24 58 Q17 60 10 60 Z" fill="{C['p600']}"/>
    <path d="M10 -1 L10.5 60" stroke="{C['l500']}" stroke-width="3.5"/>'''

def shorts_svg():
    return f'''
    <path d="M-23 -10 L23 -10 L26 18 L4 18 L0 8 L-4 18 L-26 18 Z" fill="{C['ink900']}"/>
    <path d="M-25 15 L-6 15 M6 15 L25 15" stroke="{C['l500']}" stroke-width="3" stroke-linecap="round"/>'''

def upper_arm_svg():
    return f'''
    <line x1="0" y1="0" x2="0" y2="{UPPER_ARM}" stroke="{C['skin']}" stroke-width="14" stroke-linecap="round"/>
    <line x1="0" y1="-1" x2="0" y2="12" stroke="{C['p500']}" stroke-width="17.5" stroke-linecap="round"/>
    <line x1="0" y1="11" x2="0" y2="12.5" stroke="{C['l500']}" stroke-width="17.5"/>'''

def fore_arm_svg(gear=''):
    return f'''
    <line x1="0" y1="0" x2="0" y2="{FORE_ARM}" stroke="{C['skin']}" stroke-width="12" stroke-linecap="round"/>
    <g transform="translate(0,{FORE_ARM + 2})">{gear}</g>
    <circle cx="0" cy="{FORE_ARM + 2}" r="7.5" fill="{C['skin']}"/>'''

def thigh_svg():
    return f'<line x1="0" y1="0" x2="0" y2="{THIGH}" stroke="{C["skin"]}" stroke-width="16" stroke-linecap="round"/>'

def shin_svg():
    return f'''
    <line x1="0" y1="0" x2="0" y2="{SHIN}" stroke="{C['skin']}" stroke-width="14" stroke-linecap="round"/>
    <line x1="0" y1="20" x2="0" y2="{SHIN}" stroke="{C['l300']}" stroke-width="14"/>
    <line x1="0" y1="20" x2="0" y2="23" stroke="{C['l500']}" stroke-width="14"/>'''

def shoe_svg():
    # รองเท้าชี้ไป +x ที่มุม 0 ในกรอบของหน้าแข้ง
    return f'''
    <path d="M-9 -7 L6 -7 Q19 -7 23 3 L23 8 L-9 8 Z" fill="{C['ink900']}"/>
    <path d="M-9 8 L23 8 L23 11 Q23 14 20 14 L-6 14 Q-9 14 -9 11 Z" fill="{C['paper']}" stroke="{C['ink900']}" stroke-width="1.6"/>
    <path d="M-5 0 Q6 -4 15 3" stroke="{C['l500']}" stroke-width="3.2" stroke-linecap="round" fill="none"/>'''

# --- อุปกรณ์ ในกรอบของมือ (+y = ห่างจากตัวไปตามปลายแขน)
def racket(rx=13, ry=21, tilt=0):
    return f'''
    <g transform="rotate({tilt})">
      <line x1="0" y1="-8" x2="0" y2="22" stroke="{C['ink900']}" stroke-width="6" stroke-linecap="round"/>
      <path d="M-3 0 h6 M-3 6 h6 M-3 12 h6" stroke="{C['l500']}" stroke-width="2"/>
      <line x1="0" y1="22" x2="0" y2="{22 + ry * 0.55:.0f}" stroke="{C['ink900']}" stroke-width="3.5"/>
      <ellipse cx="0" cy="{22 + ry * 0.55 + ry:.0f}" rx="{rx}" ry="{ry}" fill="{C['paper']}" stroke="{C['ink900']}" stroke-width="3"/>
      <g stroke="{C['ink900']}" stroke-width="1" opacity="0.45" transform="translate(0,{22 + ry * 0.55 + ry:.0f})">
        <path d="M-8 {-ry*0.75:.0f} V{ry*0.75:.0f} M-4 {-ry*0.92:.0f} V{ry*0.92:.0f} M0 {-ry:.0f} V{ry:.0f} M4 {-ry*0.92:.0f} V{ry*0.92:.0f} M8 {-ry*0.75:.0f} V{ry*0.75:.0f}"/>
        <path d="M{-rx*0.9:.0f} -8 H{rx*0.9:.0f} M{-rx:.0f} 0 H{rx:.0f} M{-rx*0.9:.0f} 8 H{rx*0.9:.0f}"/>
      </g>
    </g>'''

def paddle(tilt=0):
    return f'''
    <g transform="rotate({tilt})">
      <line x1="0" y1="-8" x2="0" y2="18" stroke="{C['ink900']}" stroke-width="6" stroke-linecap="round"/>
      <path d="M-3 0 h6 M-3 6 h6" stroke="{C['l500']}" stroke-width="2"/>
      <rect x="-16" y="16" width="32" height="38" rx="12" fill="{C['l500']}" stroke="{C['ink900']}" stroke-width="3"/>
      <path d="M-8 26 L8 46" stroke="{C['ink900']}" stroke-width="2" opacity="0.35"/>
    </g>'''

def zip_marks(pts):
    d = ' '.join(f'M{x1:.0f} {y1:.0f} L{x2:.0f} {y2:.0f}' for x1, y1, x2, y2 in pts)
    return f'<path d="{d}" stroke="{C["l600"]}" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="0.95"/>'

def football(x, y, r=13):
    return f'''
    <g transform="translate({x:.0f},{y:.0f})">
      <circle r="{r}" fill="{C['paper']}" stroke="{C['ink900']}" stroke-width="3"/>
      <path d="M0 -5.5 L5.2 -1.7 L3.2 4.5 L-3.2 4.5 L-5.2 -1.7 Z" fill="{C['ink900']}"/>
      <path d="M0 -5.5 V-12 M5.2 -1.7 L11 -4 M3.2 4.5 L7 10 M-3.2 4.5 L-7 10 M-5.2 -1.7 L-11 -4" stroke="{C['ink900']}" stroke-width="2.2" stroke-linecap="round"/>
    </g>'''

def basketball(x, y, r=15):
    return f'''
    <g transform="translate({x:.0f},{y:.0f})">
      <circle r="{r}" fill="{C['clay500']}"/>
      <path d="M{-r} 0 H{r} M0 {-r} V{r} M{-r*0.72:.1f} {-r*0.72:.1f} Q0 0 {-r*0.72:.1f} {r*0.72:.1f} M{r*0.72:.1f} {-r*0.72:.1f} Q0 0 {r*0.72:.1f} {r*0.72:.1f}" stroke="{C['ink900']}" stroke-width="2.2" fill="none"/>
    </g>'''

def tennis_ball(x, y):
    return f'''
    <g transform="translate({x:.0f},{y:.0f})">
      <circle r="8.5" fill="{C['l500']}" stroke="{C['ink900']}" stroke-width="2.4"/>
      <path d="M-6.5 -4 Q0 0 -6.5 4 M6.5 -4 Q0 0 6.5 4" stroke="{C['ink900']}" stroke-width="1.8" fill="none"/>
    </g>'''

def shuttle(x, y, ang):
    return f'''
    <g transform="translate({x:.0f},{y:.0f}) rotate({ang})">
      <path d="M-4 0 L-11 -18 L11 -18 L4 0 Z" fill="{C['paper']}" stroke="{C['ink900']}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-4 -8 L4 -8 M-7 -14 L7 -14" stroke="{C['ink900']}" stroke-width="1.4" opacity="0.5"/>
      <circle cy="2" r="4.5" fill="{C['l500']}" stroke="{C['ink900']}" stroke-width="2.2"/>
    </g>'''

def whiffle(x, y):
    dots = ''.join(f'<circle cx="{dx}" cy="{dy}" r="1.4" fill="{C["ink900"]}"/>' for dx, dy in [(-4,-3),(3,-4),(-1,2),(5,3),(-5,4)])
    return f'''
    <g transform="translate({x:.0f},{y:.0f})">
      <circle r="9.5" fill="{C['paper']}" stroke="{C['ink900']}" stroke-width="2.4"/>{dots}
    </g>'''

def limb_chain_world(neck, lean, base_off, a1, len1, a2, len2):
    """คืนพิกัดโลกของข้อกลางและข้อปลาย"""
    bx, by = rot(base_off[0], base_off[1], lean)
    base = (neck[0] + bx, neck[1] + by)
    mid = fk(base, lean + a1, len1)
    end = fk(mid, lean + a1 + a2, len2)
    return base, mid, end

W, H, GROUND = 260, 280, 252

def pose(*, cx=120, lean=0, head=0,
         larm=0, lfore=0, rarm=0, rfore=0,
         lleg=0, lshin=0, rleg=0, rshin=0,
         lfoot=None, rfoot=None,       # มุมเท้าในโลก (None = ราบกับพื้น)
         rgear='', lgear='',
         jump=0, shadow_rx=34, mirror=False, rtilt=0, rtool_len=0,
         props_behind=lambda P: '', props_front=lambda P: '', label=''):
    # ตำแหน่งข้อในโลก โดยยังไม่รู้ y ของคอ — คำนวณจาก neck=(cx,0) แล้วเลื่อนทั้งตัวให้เท้าแตะพื้น
    neck0 = (cx, 0.0)
    _, lknee, lank = limb_chain_world(neck0, lean, (-HIP_X, HIP_Y), lleg, THIGH, lshin, SHIN)
    _, rknee, rank = limb_chain_world(neck0, lean, (HIP_X, HIP_Y), rleg, THIGH, rshin, SHIN)
    lowest = max(lank[1], rank[1]) + 14          # พื้นรองเท้าอยู่ต่ำกว่าข้อเท้า 14
    ny = GROUND - jump - lowest
    neck = (cx, ny)
    P = {}
    P['lsho'], P['lelb'], P['lhand'] = limb_chain_world(neck, lean, (-SHOULDER_X, SHOULDER_Y), larm, UPPER_ARM, lfore, FORE_ARM + 2)
    P['rsho'], P['relb'], P['rhand'] = limb_chain_world(neck, lean, (SHOULDER_X, SHOULDER_Y), rarm, UPPER_ARM, rfore, FORE_ARM + 2)
    P['lhip'], P['lknee'], P['lank'] = limb_chain_world(neck, lean, (-HIP_X, HIP_Y), lleg, THIGH, lshin, SHIN)
    P['rhip'], P['rknee'], P['rank'] = limb_chain_world(neck, lean, (HIP_X, HIP_Y), rleg, THIGH, rshin, SHIN)
    P['rdir'] = rot(0, 1, lean + rarm + rfore)
    P['ldir'] = rot(0, 1, lean + larm + lfore)
    hx, hy = rot(0, HEAD_Y, lean)
    P['head'] = (neck[0] + hx, neck[1] + hy)
    P['neck'] = neck
    tx, ty = rot(0, rtool_len, lean + rarm + rfore + rtilt)
    P['rtool'] = (P['rhand'][0] + tx, P['rhand'][1] + ty)

    lfoot_local = (-(lean + lleg + lshin) + (0 if lfoot is None else lfoot))
    rfoot_local = (-(lean + rleg + rshin) + (0 if rfoot is None else rfoot))

    fig = f'''
  <ellipse cx="{cx + (8 if lean else 0)}" cy="{GROUND + 6}" rx="{shadow_rx}" ry="5" fill="{C['ink900']}" opacity="0.09"/>
  {props_behind(P)}
  <g transform="translate({cx},{ny:.1f}) rotate({lean})">
    <g transform="translate({-SHOULDER_X},{SHOULDER_Y}) rotate({larm})">{upper_arm_svg()}
      <g transform="translate(0,{UPPER_ARM}) rotate({lfore})">{fore_arm_svg(lgear)}</g>
    </g>
    <g transform="translate(0,{HIP_Y})">
      <g transform="translate({-HIP_X},0) rotate({lleg})">{thigh_svg()}
        <g transform="translate(0,{THIGH}) rotate({lshin})">{shin_svg()}
          <g transform="translate(0,{SHIN}) rotate({lfoot_local:.1f})">{shoe_svg()}</g>
        </g>
      </g>
      <g transform="translate({HIP_X},0) rotate({rleg})">{thigh_svg()}
        <g transform="translate(0,{THIGH}) rotate({rshin})">{shin_svg()}
          <g transform="translate(0,{SHIN}) rotate({rfoot_local:.1f})">{shoe_svg()}</g>
        </g>
      </g>
      {shorts_svg()}
    </g>
    {torso_svg()}
    {head_svg(head)}
    <g transform="translate({SHOULDER_X},{SHOULDER_Y}) rotate({rarm})">{upper_arm_svg()}
      <g transform="translate(0,{UPPER_ARM}) rotate({rfore})">{fore_arm_svg(rgear)}</g>
    </g>
  </g>
  {props_front(P)}'''
    if mirror:
        fig = f'<g transform="translate({W},0) scale(-1,1)">{fig}</g>'
    svg = f'<svg viewBox="0 0 {W} {H}" role="img" aria-label="{label}">{fig}\n</svg>'
    # รายงานพิกัดสำคัญ เพื่อตรวจว่าไม่มีอะไรหลุดกรอบ
    xs = [p[0] for k, p in P.items() if isinstance(p, tuple) and k not in ('rdir', 'ldir')]
    ys = [p[1] for k, p in P.items() if isinstance(p, tuple) and k not in ('rdir', 'ldir')]
    bb = (min(xs), min(ys), max(xs), max(ys))
    margin = 24  # รัศมีหัวไม้/ลูกบอลโดยประมาณ
    if bb[0] < margin or bb[2] > W - margin or bb[1] < margin:
        print('  !! หลุดกรอบ:', label, [round(v) for v in bb])
    return svg, P, bb

# ---------------------------------------------------------------- poses ----
poses = []

# 1 แบดมินตัน — ตบลูก
def bad_front(P):
    tx, ty = P['rtool']
    sx, sy = tx + 30, ty - 2
    return shuttle(sx, sy, 28) + zip_marks([(sx + 18, sy + 14, sx + 30, sy + 24), (sx + 24, sy + 2, sx + 36, sy + 8)])
svg, P, bb = pose(cx=106, lean=-8, head=-10, larm=38, lfore=-34, rarm=-150, rfore=16,
                  lleg=30, lshin=-8, rleg=-42, rshin=32, rgear=racket(13, 21, 26), rtilt=26, rtool_len=55,
                  shadow_rx=40, props_front=bad_front, label='น้องสนามท่าตบลูกแบดมินตัน')
poses.append(('แบดมินตัน', 'badminton · 8 คน', svg)); print('badminton', [round(v) for v in bb], 'rtool', [round(v) for v in P['rtool']])

# 2 ฟุตบอล — เตะ
def foot_front(P):
    ax, ay = P['rank']
    bx, by = ax + 30, ay - 2
    return football(bx, by) + zip_marks([(bx - 22, by + 16, bx - 12, by + 12), (bx - 26, by + 26, bx - 16, by + 24)])
svg, P, bb = pose(cx=110, lean=-5, head=-4, larm=-62, lfore=-22, rarm=44, rfore=-18,
                  lleg=8, lshin=-5, rleg=-72, rshin=-6, rfoot=-40,
                  shadow_rx=30, props_front=foot_front, label='น้องสนามท่าเตะฟุตบอล')
poses.append(('ฟุตบอล', 'football · 14 คน', svg)); print('football', [round(v) for v in bb])

# 3 เทนนิส — โฟร์แฮนด์
def ten_front(P):
    tx, ty = P['rtool']
    bx, by = tx + 4, ty - 40
    return tennis_ball(bx, by) + zip_marks([(bx - 18, by + 4, bx - 30, by + 6), (bx - 16, by + 13, bx - 27, by + 19)])
svg, P, bb = pose(cx=92, lean=-5, head=-4, larm=-44, lfore=-34, rarm=-70, rfore=-42,
                  lleg=22, lshin=-5, rleg=-22, rshin=5, rgear=racket(15, 22, 58), rtilt=58, rtool_len=56,
                  shadow_rx=42, props_front=ten_front, label='น้องสนามท่าตีโฟร์แฮนด์เทนนิส')
poses.append(('เทนนิส', 'tennis · 4 คน', svg)); print('tennis', [round(v) for v in bb], 'rtool', [round(v) for v in P['rtool']])

# 4 บาสเกตบอล — กระโดดยิง
def bask_front(P):
    (lx, ly), (rx, ry) = P['lhand'], P['rhand']
    mx, my = (lx + rx) / 2, (ly + ry) / 2 - 12
    return basketball(mx, my) + zip_marks([(lx - 30, ly + 30, lx - 40, ly + 40), (rx + 28, ry + 34, rx + 36, ry + 44)])
svg, P, bb = pose(cx=130, lean=0, head=-8, larm=-166, lfore=-6, rarm=-150, rfore=-40,
                  lleg=24, lshin=-64, rleg=-8, rshin=-58, lfoot=48, rfoot=42,
                  jump=22, shadow_rx=20, props_front=bask_front, label='น้องสนามท่ากระโดดยิงบาสเกตบอล')
poses.append(('บาสเกตบอล', 'basketball · 10 คน', svg)); print('basketball', [round(v) for v in bb], 'hands', [round(v) for v in P['lhand']], [round(v) for v in P['rhand']])

# 5 พิคเคิลบอล — ดิงก์ (หันซ้าย)
def pick_front(P):
    tx, ty = P['rtool']
    bx, by = tx + 22, ty - 24
    return whiffle(bx, by) + zip_marks([(bx - 16, by + 8, bx - 26, by + 12), (bx - 12, by + 17, bx - 22, by + 24)])
svg, P, bb = pose(cx=106, lean=-14, head=6, larm=24, lfore=-70, rarm=-14, rfore=-58,
                  lleg=36, lshin=-32, rleg=-34, rshin=30, rgear=paddle(-28), rtilt=-28, rtool_len=35,
                  shadow_rx=44, mirror=True, props_front=pick_front, label='น้องสนามท่าดิงก์พิคเคิลบอล')
poses.append(('พิคเคิลบอล', 'pickleball · 4 คน', svg)); print('pickleball', [round(v) for v in bb])

# 6 กีฬาอื่น ๆ — ยืนโบกมือ (ท่าตั้งต้น)
def base_front(P):
    hx, hy = P['rhand']
    return zip_marks([(hx + 16, hy - 12, hx + 26, hy - 20), (hx + 20, hy + 2, hx + 32, hy + 2), (hx + 12, hy - 24, hx + 16, hy - 36)])
svg, P, bb = pose(cx=126, lean=0, head=0, larm=14, lfore=-12, rarm=-156, rfore=28,
                  lleg=6, lshin=-3, rleg=-6, rshin=3, shadow_rx=30,
                  props_front=base_front, label='น้องสนามท่ายืนโบกมือ ท่าตั้งต้น')
BASE_SVG = svg
poses.append(('กีฬาอื่น ๆ', 'custom · ท่าตั้งต้น', svg)); print('base', [round(v) for v in bb])

# โลโก้/อวตาร: หัวกับผ้าคาด บนวงเขียว มีเส้นไลม์พาดหลัง
MARK_SVG = f'''<svg viewBox="0 0 64 64" role="img" aria-label="น้องสนาม อวตาร">
  <circle cx="32" cy="32" r="31" fill="{C['p500']}"/>
  <path d="M4 42 H60" stroke="{C['l500']}" stroke-width="5" stroke-linecap="round"/>
  <g transform="translate(32,30) scale(0.62)">
    <circle cx="-26" cy="4" r="5.5" fill="{C['skin']}"/><circle cx="26" cy="4" r="5.5" fill="{C['skin']}"/>
    <circle r="26" fill="{C['skin']}"/>
    <path d="M-27 -6 A27 27 0 0 1 27 -6 Z" fill="{C['hair']}"/>
    <path d="M-3 -33 Q3 -47 15 -41 Q7 -41 4 -32 Z" fill="{C['hair']}"/>
    <path d="M-27.5 -9 Q0 -15 27.5 -9 L27.5 -1.5 Q0 -7.5 -27.5 -1.5 Z" fill="{C['l500']}"/>
    <ellipse cx="-15" cy="12" rx="4.2" ry="2.6" fill="{C['clay500']}" opacity="0.32"/><ellipse cx="15" cy="12" rx="4.2" ry="2.6" fill="{C['clay500']}" opacity="0.32"/>
    <ellipse cx="-9" cy="6" rx="2.6" ry="3.3" fill="{C['ink900']}"/><ellipse cx="9" cy="6" rx="2.6" ry="3.3" fill="{C['ink900']}"/>
    <path d="M-7 14 Q0 20.5 7 14" stroke="{C['ink900']}" stroke-width="2.4" stroke-linecap="round" fill="none"/>
  </g>
</svg>'''

lineup_html = '\n'.join(f'''
        <figure class="masc">
          <span class="stage">{s}</span>
          <figcaption class="name">{n}</figcaption>
          <span class="slug">{sl}</span>
        </figure>''' for n, sl, s in poses)

def swatch(label, hexv, note=''):
    return f'<div class="chipc"><div class="sw" style="background:{hexv}"></div><div class="lb"><b>{label}</b><span>{hexv}</span>{f"<em>{note}</em>" if note else ""}</div></div>'

def aa(h, on='#ffffff'):
    r = cr(h, on)
    tag = 'AAA' if r >= 7 else 'AA' if r >= 4.5 else 'ใหญ่' if r >= 3 else '✕'
    return f'{r:.1f}:1 {tag}'

pitch_ramp = ''.join([
    swatch('50', C['p50']), swatch('100', C['p100']), swatch('200', C['p200']), swatch('300', C['p300']),
    swatch('400', C['p400'], aa(C['p400'])), swatch('500 · พื้นปุ่ม', C['p500'], aa(C['p500'])),
    swatch('600 · ตัวอักษร', C['p600'], aa(C['p600'])), swatch('700', C['p700'], aa(C['p700'])),
    swatch('800', C['p800'], aa(C['p800'])), swatch('900', C['p900'], aa(C['p900'])),
])
line_ramp = ''.join([swatch('300', C['l300']), swatch('400', C['l400']), swatch('500 · หลัก', C['l500'], aa(C['l500'])), swatch('600 · ขอบ', C['l600'], aa(C['l600']))])
sig_ramp = ''.join([
    swatch('clay 500', C['clay500'], aa(C['clay500'])), swatch('clay 700', C['clay700'], aa(C['clay700'])),
    swatch('rose 500', C['rose500'], aa(C['rose500'])), swatch('rose 700', C['rose700'], aa(C['rose700'])),
    swatch('ink 900', C['ink900'], aa(C['ink900'])), swatch('ink 700', C['ink700'], aa(C['ink700'])),
    swatch('ink 500', C['ink500'], aa(C['ink500'])), swatch('ink 400 · ไอคอน', C['ink400'], aa(C['ink400'])),
    swatch('ink 200', C['ink200']), swatch('mint', C['mint']), swatch('paper', C['paper']),
])

# ---------------------------------------------------------------- page -----
html = f'''<title>เส้นสนาม</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anuphan:wght@300;400;500;600;700&family=Bai+Jamjuree:wght@500;600;700&display=swap">

<style>
/* เส้นสนาม — Design System ของ ลงสนาม (รุ่น 2)
   ต่อยอดจาก src/app/globals.css เดิม: ฟอนต์คู่เดิม ชื่อ token เดิม
   เปลี่ยนพื้นเป็นขาว เขียวสว่างขึ้นหนึ่งสเต็ป ไลม์เลื่อนขั้น
   และทุกตัวเลขคอนทราสต์ในหน้านี้ถูกคำนวณตอนสร้างหน้า ไม่ได้พิมพ์มือ */

:root {{
  --paper: {C['paper']}; --mint: {C['mint']}; --mint-deep: {C['mint_deep']};
  --pitch-50: {C['p50']}; --pitch-100: {C['p100']}; --pitch-200: {C['p200']}; --pitch-300: {C['p300']}; --pitch-400: {C['p400']};
  --pitch-500: {C['p500']}; --pitch-600: {C['p600']}; --pitch-700: {C['p700']}; --pitch-800: {C['p800']}; --pitch-900: {C['p900']};
  --line-300: {C['l300']}; --line-400: {C['l400']}; --line-500: {C['l500']}; --line-600: {C['l600']};
  --clay-50: {C['clay50']}; --clay-100: {C['clay100']}; --clay-500: {C['clay500']}; --clay-700: {C['clay700']};
  --rose-50: {C['rose50']}; --rose-500: {C['rose500']}; --rose-700: {C['rose700']};
  --ink-900: {C['ink900']}; --ink-800: {C['ink800']}; --ink-700: {C['ink700']}; --ink-500: {C['ink500']};
  --ink-400: {C['ink400']}; --ink-300: {C['ink300']}; --ink-200: {C['ink200']}; --ink-100: {C['ink100']};
  --on-pitch: var(--ink-900);       /* ตัวอักษรบนเขียว 500 */
  --hairline: rgb(13 31 24 / 0.10);
  --radius: 0.875rem; --radius-sm: 0.5rem; --radius-pill: 999px;
  --shadow-line: 0 1px 2px 0 rgb(13 31 24 / 0.05);
  --shadow-lift: 0 1px 2px 0 rgb(13 31 24 / 0.06), 0 8px 24px -12px rgb(13 31 24 / 0.18);
  --font-body: 'Anuphan', ui-sans-serif, system-ui, sans-serif;
  --font-display: 'Bai Jamjuree', 'Anuphan', ui-sans-serif, sans-serif;
  --measure: 62ch;
  --s1: .25rem; --s2: .5rem; --s3: .75rem; --s4: 1rem; --s5: 1.5rem; --s6: 2rem; --s7: 3rem;
}}

/* ธีมเดียว โดยตั้งใจ — แอปถูกเปิดจากแชท LINE กลางแดดบ่อยกว่าถูกอ่านตอนดึกมาก
   ทุกสีทาไว้ตรง ๆ หน้านี้จึงอ่านได้เท่ากันไม่ว่าเครื่องผู้อ่านตั้งโหมดไหน */
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  background-color: var(--paper);
  background-image:
    radial-gradient(52rem 26rem at 50% -12rem, rgb(18 165 99 / 0.10), transparent 70%),
    radial-gradient(40rem 20rem at 105% 8%, rgb(191 236 51 / 0.16), transparent 70%);
  background-repeat: no-repeat;
  color: var(--ink-900);
  font-family: var(--font-body);
  font-size: 16px; line-height: 1.72;
  -webkit-font-smoothing: antialiased;
}}
h1, h2, h3, h4 {{ font-family: var(--font-display); font-weight: 600; line-height: 1.3; margin: 0; text-wrap: balance; }}
p, figure {{ margin: 0; }}
a {{ color: var(--pitch-600); }}
code {{ font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace; font-size: .85em; }}
p code, li code, span code, .note code {{ color: var(--pitch-700); background: var(--pitch-50); padding: 0 .3rem; border-radius: 4px; }}
.num {{ font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1; }}
.eyebrow {{ font-family: var(--font-display); font-size: .6875rem; font-weight: 600; letter-spacing: .13em; text-transform: uppercase; color: var(--pitch-600); }}
:lang(th) {{ letter-spacing: 0; }}
.wrap {{ width: min(100% - 2.5rem, 68rem); margin-inline: auto; }}

/* แถบนำทาง */
.topbar {{ position: sticky; top: 0; z-index: 20; background: rgb(255 255 255 / .9); backdrop-filter: blur(10px); border-bottom: 1px solid var(--hairline); }}
.topbar-in {{ display: flex; align-items: center; gap: var(--s5); padding-block: .55rem; }}
.brandmark {{ display: flex; align-items: center; gap: .5rem; flex: none; }}
.brandmark svg {{ width: 32px; height: 32px; }}
.brandmark b {{ font-family: var(--font-display); font-size: 1rem; font-weight: 700; }}
.navlinks {{ display: flex; gap: var(--s1); overflow-x: auto; scrollbar-width: none; margin-inline-start: auto; }}
.navlinks::-webkit-scrollbar {{ display: none; }}
.navlinks a {{ flex: none; padding: .3rem .7rem; border-radius: var(--radius-pill); font-size: .875rem; font-weight: 500; color: var(--ink-700); text-decoration: none; }}
.navlinks a:hover {{ background: var(--mint); color: var(--pitch-700); }}

/* หัวเรื่อง */
.hero {{ padding-block: 3.5rem 1.5rem; }}
.hero h1 {{ font-size: clamp(2.5rem, 7vw, 4.25rem); font-weight: 700; letter-spacing: -.015em; }}
.hero .lede {{ max-width: var(--measure); margin-top: var(--s4); font-size: 1.0625rem; color: var(--ink-700); }}
.hero-meta {{ display: flex; flex-wrap: wrap; gap: var(--s2); margin-top: var(--s5); }}

/* ขบวนมาสคอต: เส้นไลม์เส้นเดียวร้อยทั้งหกท่า ผูกกับกล่องรูป ไม่ใช่คอลัมน์ */
.lineup {{ margin-top: var(--s6); padding-block: var(--s4) var(--s3); }}
.lineup-track {{ display: grid; grid-template-columns: repeat(6, minmax(9.5rem, 1fr)); gap: var(--s3); overflow-x: auto; padding-bottom: var(--s2); scrollbar-width: thin; }}
.masc {{ display: flex; flex-direction: column; align-items: center; gap: .15rem; padding: var(--s2) var(--s1) var(--s3); transition: transform .22s cubic-bezier(.22,1,.36,1); }}
.masc:hover {{ transform: translateY(-6px) rotate(-1.5deg); }}
.masc .stage {{ position: relative; display: block; width: 100%; max-width: 11rem; }}
.masc .stage::before {{ content: ''; position: absolute; left: -2rem; right: -2rem; top: 91.5%; height: 9px; background: var(--line-500); border-radius: var(--radius-pill); }}
.masc svg {{ position: relative; width: 100%; height: auto; display: block; }}
.masc .name {{ font-family: var(--font-display); font-weight: 600; font-size: .9375rem; margin-top: var(--s2); }}
.masc .slug {{ font-size: .75rem; color: var(--ink-400); white-space: nowrap; }}

/* โครงหน้า */
section {{ padding-block: 3.25rem; }}
.band {{ background: var(--mint); border-block: 1px solid var(--hairline); }}
.sec-head {{ max-width: var(--measure); margin-bottom: var(--s5); }}
.sec-head h2 {{ font-size: clamp(1.5rem, 3.6vw, 2rem); margin-top: .4rem; }}
.sec-head p {{ margin-top: .6rem; color: var(--ink-700); }}
.grid {{ display: grid; gap: var(--s4); }}
.g2 {{ grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr)); }}
.g3 {{ grid-template-columns: repeat(auto-fit, minmax(13.5rem, 1fr)); }}
.d3 {{ font-family: var(--font-display); font-size: 1.125rem; font-weight: 600; line-height: 1.45; }}

/* สี */
.ramp {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr)); gap: var(--s2); margin-top: var(--s3); }}
.chipc {{ border-radius: var(--radius-sm); overflow: hidden; border: 1px solid var(--hairline); background: var(--paper); }}
.chipc .sw {{ height: 3.5rem; }}
.chipc .lb {{ padding: .4rem .55rem .55rem; }}
.chipc .lb b {{ display: block; font-size: .75rem; font-weight: 600; }}
.chipc .lb span {{ display: block; font-size: .6875rem; color: var(--ink-500); font-family: ui-monospace, Menlo, monospace; }}
.chipc .lb em {{ display: block; font-style: normal; font-size: .6875rem; color: var(--pitch-700); margin-top: .1rem; }}
.note {{ border-left: 3px solid var(--line-500); padding: .15rem 0 .15rem .9rem; color: var(--ink-700); font-size: .9375rem; max-width: var(--measure); }}
.note b {{ color: var(--ink-900); }}
.pair {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); gap: var(--s2); margin-top: var(--s3); }}
.pair > div {{ padding: .9rem 1rem; border-radius: var(--radius-sm); font-weight: 600; display: flex; justify-content: space-between; align-items: baseline; gap: .5rem; }}
.pair small {{ font-weight: 500; font-size: .75rem; opacity: .85; font-family: ui-monospace, Menlo, monospace; }}

/* ตัวอักษร */
.type-row {{ display: grid; grid-template-columns: 9.5rem 1fr; gap: var(--s4); padding-block: .9rem; border-top: 1px solid var(--hairline); align-items: baseline; }}
.type-row:first-of-type {{ border-top: 0; }}
.type-row .k {{ font-size: .75rem; color: var(--ink-500); line-height: 1.5; }}
.type-row .k b {{ display: block; color: var(--ink-900); font-size: .8125rem; }}
.d1 {{ font-family: var(--font-display); font-size: 2.5rem; font-weight: 700; letter-spacing: -.015em; line-height: 1.22; }}
.d2 {{ font-family: var(--font-display); font-size: 1.625rem; font-weight: 600; line-height: 1.3; }}
.b1 {{ font-size: 1rem; line-height: 1.72; }}
.b2 {{ font-size: .875rem; line-height: 1.65; color: var(--ink-700); }}
.cap {{ font-size: .75rem; color: var(--ink-500); }}
.money {{ font-family: var(--font-display); font-size: 1.75rem; font-weight: 700; letter-spacing: -.02em; }}

/* คอมโพเนนต์ */
.panel {{ background: var(--paper); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 1.15rem 1.25rem 1.35rem; box-shadow: var(--shadow-line); }}
.panel > h3 {{ font-size: 1rem; }}
.panel > .cap {{ margin-top: .15rem; }}
.row {{ display: flex; flex-wrap: wrap; gap: var(--s2); align-items: center; margin-top: var(--s4); }}

.btn {{ font-family: var(--font-body); font-size: .9375rem; font-weight: 600; padding: .55rem 1.1rem; border-radius: var(--radius-pill); border: 1px solid transparent; cursor: pointer; transition: transform .18s cubic-bezier(.22,1,.36,1), background-color .18s, box-shadow .18s; }}
.btn:hover {{ transform: translateY(-1px); }}
.btn:active {{ transform: translateY(0); }}
.btn:focus-visible {{ outline: 2px solid var(--pitch-600); outline-offset: 2px; }}
.btn-primary {{ background: var(--pitch-500); color: var(--on-pitch); box-shadow: var(--shadow-line); }}
.btn-primary:hover {{ background: var(--pitch-400); }}
.btn-deep {{ background: var(--pitch-600); color: #fff; }}
.btn-deep:hover {{ background: var(--pitch-700); }}
.btn-secondary {{ background: var(--paper); color: var(--pitch-700); border-color: var(--pitch-200); }}
.btn-secondary:hover {{ background: var(--pitch-50); }}
.btn-ghost {{ background: transparent; color: var(--ink-700); }}
.btn-ghost:hover {{ background: var(--ink-100); }}
.btn-danger {{ background: var(--rose-50); color: var(--rose-700); border-color: rgb(201 58 48 / .25); }}
.btn:disabled {{ opacity: .45; cursor: not-allowed; transform: none; }}
.btn-sm {{ font-size: .8125rem; padding: .35rem .8rem; }}

.chip {{ display: inline-flex; align-items: center; gap: .375rem; font-size: .8125rem; font-weight: 500; padding: .2rem .65rem .25rem; border-radius: var(--radius-pill); border: 1px solid transparent; white-space: nowrap; }}
.chip .dot {{ width: .4rem; height: .4rem; border-radius: 50%; background: currentColor; flex: none; }}
.c-draft   {{ background: var(--ink-100); color: var(--ink-700); border-color: var(--ink-200); }}
.c-open    {{ background: var(--pitch-50); color: var(--pitch-700); border-color: var(--pitch-200); }}
.c-ready   {{ background: #f7fde8; color: var(--pitch-800); border-color: var(--line-400); }}
.c-holding {{ background: var(--clay-50); color: var(--clay-700); border-color: var(--clay-100); }}
.c-booked  {{ background: var(--pitch-500); color: var(--on-pitch); font-weight: 600; }}
.c-done    {{ background: var(--paper); color: var(--ink-500); border-color: var(--ink-200); }}
.c-cancel  {{ background: var(--rose-50); color: var(--rose-700); border-color: rgb(201 58 48 / .2); }}
.c-guest   {{ background: #fff; color: var(--pitch-700); border-color: var(--pitch-300); border-style: dashed; }}

.meter {{ height: .625rem; border-radius: var(--radius-pill); background: var(--ink-100); overflow: hidden; margin-top: .6rem; }}
.meter > i {{ display: block; height: 100%; border-radius: var(--radius-pill); background: linear-gradient(90deg, var(--pitch-500), var(--line-500)); transform-origin: left center; }}
.meter-legend {{ display: flex; justify-content: space-between; font-size: .8125rem; color: var(--ink-500); margin-top: .4rem; }}

.field {{ display: grid; gap: .35rem; margin-top: var(--s4); }}
.field label {{ font-size: .8125rem; font-weight: 600; color: var(--ink-700); }}
.field input {{ font: inherit; padding: .6rem .8rem; border-radius: var(--radius-sm); border: 1px solid var(--ink-300); background: var(--paper); color: var(--ink-900); }}
.field input::placeholder {{ color: var(--ink-400); }}
.field input:focus {{ outline: 2px solid var(--pitch-500); outline-offset: 1px; border-color: var(--pitch-500); }}
.field .hint {{ font-size: .75rem; color: var(--ink-500); }}
.seg {{ display: inline-grid; grid-auto-flow: column; background: var(--ink-100); padding: .2rem; border-radius: var(--radius-pill); margin-top: var(--s4); }}
.seg button {{ font: inherit; font-size: .875rem; font-weight: 600; padding: .4rem .9rem; border: 0; border-radius: var(--radius-pill); background: transparent; color: var(--ink-700); cursor: pointer; }}
.seg button[aria-pressed="true"] {{ background: var(--paper); color: var(--pitch-700); box-shadow: var(--shadow-line); }}
.seg button:focus-visible {{ outline: 2px solid var(--pitch-600); outline-offset: 1px; }}

.toast {{ display: flex; gap: .75rem; align-items: flex-start; padding: .8rem .95rem; border-radius: var(--radius-sm); background: var(--ink-900); color: #fff; margin-top: var(--s4); box-shadow: var(--shadow-lift); max-width: 26rem; }}
.toast i {{ flex: none; width: 1.25rem; height: 1.25rem; border-radius: 50%; background: var(--line-500); display: grid; place-items: center; color: var(--ink-900); font-style: normal; font-weight: 700; font-size: .75rem; margin-top: .1rem; }}
.toast b {{ display: block; font-family: var(--font-display); font-weight: 600; }}
.toast span {{ font-size: .875rem; opacity: .85; }}

.empty {{ display: grid; grid-template-columns: 7rem 1fr; gap: var(--s4); align-items: center; padding: 1.25rem; border: 1px dashed var(--pitch-300); border-radius: var(--radius); background: var(--pitch-50); margin-top: var(--s4); }}
.empty svg {{ width: 100%; height: auto; }}
.empty h4 {{ font-size: 1.0625rem; }}
.empty p {{ font-size: .875rem; color: var(--ink-700); margin-top: .2rem; }}

.scard {{ background: var(--paper); border: 1px solid var(--hairline); border-radius: var(--radius); padding: 1rem 1.1rem 1.15rem; box-shadow: var(--shadow-lift); position: relative; max-width: 24rem; }}
.scard::before, .scard::after {{ content: ''; position: absolute; width: .875rem; height: .875rem; border-color: var(--pitch-400); opacity: .55; pointer-events: none; }}
.scard::before {{ top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; border-top-left-radius: var(--radius); }}
.scard::after {{ right: -1px; bottom: -1px; border-bottom: 2px solid; border-right: 2px solid; border-bottom-right-radius: var(--radius); }}
.scard h4 {{ font-size: 1.125rem; margin-top: .5rem; }}
.scard .where {{ font-size: .875rem; color: var(--ink-500); margin-top: .1rem; }}
.scard .when {{ font-size: .9375rem; color: var(--ink-700); margin-top: .6rem; }}
.scard .foot {{ display: flex; align-items: flex-end; justify-content: space-between; gap: var(--s4); margin-top: .9rem; }}

.rules {{ display: grid; gap: .5rem; margin-top: var(--s4); }}
.rule {{ display: grid; grid-template-columns: 1.5rem 1fr; gap: .6rem; align-items: start; font-size: .9375rem; }}
.rule .mk {{ font-family: var(--font-display); font-weight: 700; line-height: 1.7; }}
.rule.do .mk {{ color: var(--pitch-600); }}
.rule.no .mk {{ color: var(--rose-500); }}

.spec {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: var(--s2); margin-top: var(--s3); }}
.spec > div {{ padding: .7rem .85rem; border-radius: var(--radius-sm); background: var(--paper); border: 1px solid var(--hairline); }}
.spec b {{ display: block; font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; }}
.spec span {{ font-size: .75rem; color: var(--ink-500); }}

/* โมชัน — transform กับ opacity เท่านั้น */
@keyframes rise {{ from {{ opacity: 0; transform: translateY(10px); }} to {{ opacity: 1; transform: none; }} }}
@keyframes growx {{ from {{ transform: scaleX(0); }} to {{ transform: scaleX(1); }} }}
@keyframes shim {{ from {{ transform: translateX(-100%); }} to {{ transform: translateX(100%); }} }}
@keyframes bob {{ from {{ transform: translateY(0); }} to {{ transform: translateY(-7px); }} }}
.demo-stage {{ display: flex; gap: var(--s2); margin-top: .9rem; }}
.demo-stage > i {{ flex: 1; height: 3rem; border-radius: var(--radius-sm); background: var(--pitch-100); display: block; }}
.playing > i {{ animation: rise .36s cubic-bezier(.22,1,.36,1) both; }}
.playing > i:nth-child(2) {{ animation-delay: 40ms; }}
.playing > i:nth-child(3) {{ animation-delay: 80ms; }}
.playing > i:nth-child(4) {{ animation-delay: 120ms; }}
.skel {{ position: relative; overflow: hidden; height: 3rem; border-radius: var(--radius-sm); background: var(--ink-100); margin-top: .9rem; }}
.skel::after {{ content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, rgb(255 255 255 / .75) 50%, transparent 100%); animation: shim 1.4s ease-in-out infinite; }}
.bobber {{ animation: bob 2.4s ease-in-out infinite alternate; }}

.codewrap {{ overflow-x: auto; border-radius: var(--radius); border: 1px solid var(--hairline); background: var(--ink-900); margin-top: var(--s4); }}
pre {{ margin: 0; padding: 1.1rem 1.25rem; }}
pre code {{ font-size: .8125rem; line-height: 1.75; color: #d8e6de; white-space: pre; }}
.tk {{ color: var(--line-400); }}
.cm {{ color: #6f8a7d; }}
footer {{ padding-block: 2.5rem 3.5rem; color: var(--ink-500); font-size: .875rem; }}

@media (max-width: 640px) {{
  .type-row {{ grid-template-columns: 1fr; gap: .25rem; }}
  .d1 {{ font-size: 2rem; }}
  .empty {{ grid-template-columns: 5rem 1fr; }}
}}
@media (prefers-reduced-motion: reduce) {{
  *, *::before, *::after {{ animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }}
}}
</style>

<header class="topbar">
  <div class="wrap topbar-in">
    <span class="brandmark">{MARK_SVG}<b>เส้นสนาม</b></span>
    <nav class="navlinks">
      <a href="#หลักการ">หลักการ</a><a href="#สี">สี</a><a href="#ตัวอักษร">ตัวอักษร</a><a href="#มาสคอต">มาสคอต</a><a href="#คอมโพเนนต์">คอมโพเนนต์</a><a href="#โมชัน">โมชัน</a><a href="#โทเคน">โทเคน</a>
    </nav>
  </div>
</header>

<main>
  <div class="wrap hero">
    <p class="eyebrow">Design System · ลงสนาม · รุ่น 2</p>
    <h1>เส้นสนาม</h1>
    <p class="lede">
      ระบบสีเขียว–ขาวสำหรับแอปรวมก๊วนกีฬา ที่คนกดเข้ามาจากแชท LINE กลางแดดบ่ายสาม
      พื้นเป็นขาวจริง เขียวสว่างขึ้นหนึ่งสเต็ป ไลม์เป็นสีตีเส้นที่ร้อยทุกอย่างเข้าด้วยกัน
      และมาสคอต <b>น้องสนาม</b> ที่ทุกท่าเกิดจากหุ่นข้อต่อตัวเดียว ครบทั้งห้ากีฬาในตาราง <code>public.sports</code>
    </p>
    <div class="hero-meta">
      <span class="chip c-open"><span class="dot"></span>ต่อยอดจาก globals.css เดิม</span>
      <span class="chip c-ready">ธีมเดียว โดยตั้งใจ</span>
      <span class="chip c-guest">คอนทราสต์คำนวณจริงทุกค่า</span>
    </div>

    <div class="lineup">
      <div class="lineup-track">{lineup_html}
      </div>
    </div>
  </div>

  <section id="หลักการ" class="band">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">01 · Principles</p>
        <h2>สามข้อที่ยึดทั้งระบบไว้ด้วยกัน</h2>
        <p>ข้อ 1 และ 3 ยกมาจาก <code>globals.css</code> เดิมทั้งดุ้น เพราะยังจริงอยู่ ข้อ 2 คือส่วนที่เปลี่ยนในรอบนี้ และเปลี่ยนตามตัวเลข ไม่ใช่ตามรสนิยม</p>
      </div>
      <div class="grid g3">
        <div class="panel">
          <h3>ธีมเดียว ทำให้ดี</h3>
          <p class="b2" style="margin-top:.5rem">ทำโหมดเดียวให้ดีชนะทำสองโหมดให้พอใช้ ลิงก์ก๊วนถูกกดจากแชท LINE กลางแดดบ่อยกว่าถูกนั่งไล่อ่านตอนดึกมาก ทุกสีจึงถูกทาไว้ตรง ๆ</p>
        </div>
        <div class="panel">
          <h3>500 ทา · 600 เขียน · หมึกบน 500</h3>
          <p class="b2" style="margin-top:.5rem">เขียว 500 สว่างพอจะทำให้แอปดูสดใส แต่ตัวหนังสือขาวบนมันได้แค่ <b class="num">{ratio(C['paper'], C['p500'])}</b> ไม่ผ่าน AA ป้ายบนปุ่มเขียวสว่างจึงเป็นหมึกเข้ม (<b class="num">{ratio(C['ink900'], C['p500'])}</b>) และตัวอักษรเขียวบนขาวใช้ 600 (<b class="num">{ratio(C['p600'], C['paper'])}</b>)</p>
        </div>
        <div class="panel">
          <h3>ตัวเลขคือเนื้อหา</h3>
          <p class="b2" style="margin-top:.5rem">เงินกับหัวคนคือสิ่งที่คนเปิดหน้ามาดู ทั้งคู่ใช้ตัวเลขความกว้างเท่ากัน เลขที่เปลี่ยนค่าจึงไม่ดันเลย์เอาต์รอบตัว</p>
          <p class="money num" style="margin-top:.75rem;color:var(--pitch-700)">฿1,180 · 6/8 คน</p>
        </div>
      </div>
    </div>
  </section>

  <section id="สี">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">02 · Colour</p>
        <h2>เขียวสนาม ขาวจริง และสีตีเส้น</h2>
        <p>ตัวเลขใต้แต่ละสีคือคอนทราสต์บนพื้นขาวตามสูตร WCAG คำนวณตอนสร้างหน้านี้ — AA คือ 4.5:1 สำหรับตัวหนังสือปกติ, "ใหญ่" คือผ่านเฉพาะตัวหนังสือใหญ่และไอคอน (3:1)</p>
      </div>

      <h3 class="d3">เขียวสนาม — pitch</h3>
      <div class="ramp">{pitch_ramp}</div>

      <h3 class="d3" style="margin-top:2rem">คู่ที่ใช้จริงบนปุ่มและชิป</h3>
      <div class="pair">
        <div style="background:var(--pitch-500);color:var(--ink-900)">หมึกบนเขียว 500 <small>{ratio(C['ink900'], C['p500'])}</small></div>
        <div style="background:var(--pitch-600);color:#fff">ขาวบนเขียว 600 <small>{ratio(C['paper'], C['p600'])}</small></div>
        <div style="background:var(--line-500);color:var(--ink-900)">หมึกบนไลม์ 500 <small>{ratio(C['ink900'], C['l500'])}</small></div>
        <div style="background:var(--pitch-50);color:var(--pitch-700)">เขียว 700 บน 50 <small>{ratio(C['p700'], C['p50'])}</small></div>
        <div style="background:var(--clay-50);color:var(--clay-700)">ดินเผา 700 บน 50 <small>{ratio(C['clay700'], C['clay50'])}</small></div>
        <div style="background:var(--rose-50);color:var(--rose-700)">แดง 700 บน 50 <small>{ratio(C['rose700'], C['rose50'])}</small></div>
      </div>
      <p class="note" style="margin-top:1rem"><b>ขาวบนเขียว 500 ไม่มีในรายการนี้</b> — เพราะได้ {ratio(C['paper'], C['p500'])} ซึ่งไม่ผ่าน ถ้าอยากได้ปุ่มเขียวป้ายขาว ให้ใช้เขียว 600 เป็นพื้น</p>

      <h3 class="d3" style="margin-top:2rem">สีตีเส้น — line</h3>
      <div class="ramp">{line_ramp}</div>
      <p class="note" style="margin-top:1rem"><b>ไลม์เป็นพื้นเสมอ ไม่เคยเป็นตัวอักษร</b> — ตัวเลขข้างบนคือเหตุผล 500 ได้ {ratio(C['l500'], C['paper'])} บนขาว แต่พอเป็นพื้นให้หมึกเข้มกลับได้ {ratio(C['ink900'], C['l500'])} ซึ่งดีกว่าเขียวเสียอีก ไลม์จึงเป็นพื้นของสิ่งที่ต้องเด่นที่สุดในหน้า</p>

      <h3 class="d3" style="margin-top:2rem">สัญญาณ หมึก และพื้น</h3>
      <div class="ramp">{sig_ramp}</div>
      <p class="note" style="margin-top:1rem">ดินเผาเป็นทั้งโทนเตือนและสีลูกบาสของมาสคอต ระบบนี้จึงมีสามเสียงจริง ๆ คือเขียว ไลม์ ดินเผา ไม่ได้แอบเพิ่มสีที่สี่เข้ามาเพื่อความสนุก ส่วน ink 400 ถูกขยับเข้มขึ้นจากร่างแรกเพราะวัดได้ 2.95:1 ไม่พอสำหรับไอคอน</p>
    </div>
  </section>

  <section id="ตัวอักษร" class="band">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">03 · Type</p>
        <h2>Bai Jamjuree คู่กับ Anuphan</h2>
        <p>คู่ฟอนต์เดิมของโปรเจกต์ ทั้งคู่เป็นงานของ Cadson Demak ไทยกับลาตินจึงใช้โครงเดียวกันจริง ๆ ไม่ใช่ฟอนต์ไทยชนกับ system font ของลาติน</p>
      </div>
      <div class="panel">
        <div class="type-row"><div class="k"><b>Display / 40</b>Bai Jamjuree 700 · 1.22<br>tracking −0.015em (ลาตินเท่านั้น)</div><div class="d1">ก๊วนแบดเย็นวันพุธ</div></div>
        <div class="type-row"><div class="k"><b>Display / 26</b>Bai Jamjuree 600 · 1.30</div><div class="d2">ยังขาดอีก 2 คนถึงจะจองสนามได้</div></div>
        <div class="type-row"><div class="k"><b>Display / 18</b>Bai Jamjuree 600 · 1.45</div><div class="d3">ลาดพร้าว แบดมินตัน เซ็นเตอร์</div></div>
        <div class="type-row"><div class="k"><b>Body / 16</b>Anuphan 400 · 1.72</div><div class="b1">เล่นสนุก ๆ ไม่ซีเรียส มือใหม่ยินดีต้อนรับ ใครมาไม่ทันทักในกลุ่มได้เลย เดี๋ยวเปิดคอร์ตรอไว้ให้</div></div>
        <div class="type-row"><div class="k"><b>Body / 14</b>Anuphan 400 · ink 700</div><div class="b2">ค่าสนามหารตามจำนวนคนที่มาจริง ถ้ามาไม่ครบตามที่จอง ส่วนต่างผู้จัดรับไป</div></div>
        <div class="type-row"><div class="k"><b>Caption / 12</b>Anuphan 400 · ink 500</div><div class="cap">ปิดรับชำระ 20:00 น. ของวันอังคาร · Wed 19:00–21:00</div></div>
        <div class="type-row"><div class="k"><b>Money / 28</b>Bai Jamjuree 700 · tabular-nums</div><div class="money num">฿1,180 <span style="font-size:1rem;font-weight:500;color:var(--ink-500)">= ฿616 สนาม + ฿564 ลูก</span></div></div>
      </div>
      <p class="note" style="margin-top:1.25rem"><b>ไทยต้องหายใจมากกว่าลาติน</b> — line-height 1.72 กันวรรณยุกต์ชนบรรทัดบน และ <code>letter-spacing</code> ถูกปิดสำหรับ <code>:lang(th)</code> เพราะมันดันสระกับวรรณยุกต์ออกจากตำแหน่ง</p>
    </div>
  </section>

  <section id="มาสคอต">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">04 · Mascot</p>
        <h2>น้องสนาม</h2>
        <p>ตัวละครหนึ่งตัว หกท่า ทุกท่าเกิดจากการหมุนข้อของหุ่นตัวเดียวกัน — ไหล่ ศอก สะโพก เข่า ข้อเท้า — ไม่ได้วาดใหม่ทีละท่า ความยาวแขนขาจึงเท่ากันทุกรูปโดยไม่ต้องคอยเทียบ และท่าใหม่ในอนาคตคือชุดตัวเลขสิบตัว ไม่ใช่งานวาด</p>
      </div>

      <div class="spec">
        <div><b>34 · 30</b><span>แขนบน · ปลายแขน</span></div>
        <div><b>38 · 34</b><span>ต้นขา · หน้าแข้ง</span></div>
        <div><b>r 26</b><span>รัศมีหัว</span></div>
        <div><b>±26</b><span>ไหล่จากแกนกลาง</span></div>
        <div><b>±10</b><span>สะโพกจากแกนกลาง</span></div>
        <div><b>0°</b><span>เท้าราบเสมอเมื่อเหยียบพื้น</span></div>
      </div>

      <div class="grid g2" style="margin-top:1rem">
        <div class="panel">
          <h3>โครงสร้าง</h3>
          <p class="cap">คำศัพท์ชุดเดียวกันทุกท่า</p>
          <div class="rules">
            <div class="rule do"><span class="mk">1</span><span><b>เสื้อเป็นรูปทรงจริง</b> มีไหล่ คอเสื้อ ชายเสื้อ และแผงเข้มด้านไกลแสงหนึ่งสเต็ป (เขียว 600) ไม่ไล่เฉด แถบไลม์วิ่งตามรอยต่อของแผง</span></div>
            <div class="rule do"><span class="mk">2</span><span><b>แขนขาเป็นแท่งปลายมน</b> ต่อกันที่ข้อ ข้อพับงอทางเดียวเหมือนคนจริง ศอกไม่พับกลับ เข่าไม่พับหน้า</span></div>
            <div class="rule do"><span class="mk">3</span><span><b>เท้าราบกับพื้นเสมอ</b> ระบบหมุนรองเท้าสวนกับขาให้อัตโนมัติ ยกเว้นเตะและกระโดด ที่ปลายเท้าชี้ตามแรง</span></div>
            <div class="rule do"><span class="mk">4</span><span><b>ไลม์อยู่ที่ของเล็ก ๆ ทั่วตัว</b> ผ้าคาดหัว ขอบกางเกง ถุงเท้า แถบรองเท้า ด้ามจับ — ไม่เคยเป็นพื้นที่ใหญ่บนตัว</span></div>
            <div class="rule do"><span class="mk">5</span><span><b>หน้ามีแค่ตาสองเม็ด ยิ้มหนึ่งเส้น แก้มแดงจาง</b> ไม่มีคิ้ว ไม่มีจมูก ย่อเหลือ 40px ยังอ่านออก</span></div>
            <div class="rule do"><span class="mk">6</span><span><b>ขีดไลม์สองสามเส้น</b> บอกทิศทางแรง และ<b>เงาใต้เท้าเสมอ</b> หดลงเมื่อลอย</span></div>
          </div>
        </div>
        <div class="panel">
          <h3>ข้อห้าม</h3>
          <p class="cap">สิ่งที่จะทำให้ตัวละครกลายเป็นคนละคน</p>
          <div class="rules">
            <div class="rule no"><span class="mk">✕</span><span>ไม่เติมสีที่สี่ อุปกรณ์กีฬาใช้ขาว ไลม์ หรือดินเผา เท่านั้น</span></div>
            <div class="rule no"><span class="mk">✕</span><span>ไม่ใส่ไล่เฉด เงาตกกระทบ หรือเส้นขอบรอบตัว — เส้นขอบมีเฉพาะอุปกรณ์ เพื่อให้ของถือแยกจากมือ</span></div>
            <div class="rule no"><span class="mk">✕</span><span>ไม่เปลี่ยนสัดส่วน หัวใหญ่กว่านี้จะเป็นเด็ก เล็กกว่านี้จะเป็นนักกีฬาอาชีพ น้องสนามคือคนธรรมดาที่ชอบเล่น</span></div>
            <div class="rule no"><span class="mk">✕</span><span>ไม่ใช้ประกอบข่าวร้าย ยกเลิกก๊วน จ่ายไม่ผ่าน ไม่มีมาสคอต</span></div>
            <div class="rule no"><span class="mk">✕</span><span>ไม่วางบนพื้นเขียวเข้ม เสื้อจะกลืนกับพื้น วางบนขาว mint หรือไลม์ 300</span></div>
          </div>
        </div>
      </div>

      <div class="panel" style="margin-top:1rem">
        <h3>ขนาดที่ใช้จริง</h3>
        <p class="cap">ท่าตั้งต้น สามขนาด — ตัวใหญ่สำหรับหน้าว่าง ตัวกลางสำหรับหัวการ์ด อวตารสำหรับแถบบนและโลโก้</p>
        <div class="row" style="align-items:flex-end;gap:2rem;margin-top:1.25rem">
          <div style="text-align:center;width:9rem"><div class="bobber">{BASE_SVG}</div><p class="cap">144px · หน้าว่าง</p></div>
          <div style="text-align:center;width:5rem">{BASE_SVG}<p class="cap">80px · หัวการ์ด</p></div>
          <div style="text-align:center;width:2.75rem">{MARK_SVG}<p class="cap">44px · อวตาร</p></div>
        </div>
        <p class="note" style="margin-top:1.25rem">ที่ 44px ตัวเต็มอ่านไม่ออก จึงเหลือหัวกับผ้าคาดไลม์บนวงเขียว มีเส้นไลม์พาดหลัง — นี่คือโลโก้ของแอปด้วย ไม่ได้แยกทำอีกชุด และผ้าคาดหัวคือสิ่งที่ทำให้จำได้แม้ไม่เห็นตัว</p>
      </div>
    </div>
  </section>

  <section id="คอมโพเนนต์" class="band">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">05 · Components</p>
        <h2>ชิ้นส่วนที่หน้าจอจริงประกอบขึ้นมา</h2>
        <p>ข้อความและตัวเลขทุกตัวมาจาก <code>supabase/seed.sql</code> และ enum จริงในสคีมา — รวมของที่เพิ่งเพิ่มใน LSN-0021 (วิธีหารค่าใช้จ่าย) และ LSN-0022 (ผู้เล่นรับเชิญ)</p>
      </div>
      <div class="grid g2">
        <div class="panel">
          <h3>ปุ่ม</h3>
          <p class="cap">ปุ่มหลักหนึ่งปุ่มต่อหนึ่งหน้าจอ ป้ายบนเขียวสว่างเป็นหมึกเข้ม</p>
          <div class="row">
            <button class="btn btn-primary" type="button">เข้าร่วมก๊วน</button>
            <button class="btn btn-deep" type="button">ยืนยันจองสนาม</button>
            <button class="btn btn-secondary" type="button">คัดลอกลิงก์</button>
            <button class="btn btn-ghost" type="button">ดูรายละเอียด</button>
            <button class="btn btn-danger" type="button">ยกเลิกก๊วน</button>
            <button class="btn btn-primary" type="button" disabled>ก๊วนเต็มแล้ว</button>
          </div>
          <p class="note" style="margin-top:1rem">ปุ่มเขียวเข้มป้ายขาวมีไว้สำหรับการกระทำที่ย้อนไม่ได้ อย่างยืนยันจอง — เข้มกว่า หนักกว่า ให้คนหยุดคิดครึ่งวินาที</p>
        </div>
        <div class="panel">
          <h3>สถานะก๊วน</h3>
          <p class="cap">ตรงกับ <code>public.session_status</code> ทั้งแปดค่า</p>
          <div class="row">
            <span class="chip c-draft"><span class="dot"></span>ร่าง</span>
            <span class="chip c-open"><span class="dot"></span>เปิดรับ</span>
            <span class="chip c-ready"><span class="dot"></span>ครบขั้นต่ำ</span>
            <span class="chip c-holding"><span class="dot"></span>กำลังจองสนาม</span>
            <span class="chip c-booked"><span class="dot"></span>ได้สนามแล้ว</span>
            <span class="chip c-done">จบแล้ว</span>
            <span class="chip c-cancel">ยกเลิก</span>
            <span class="chip c-cancel">จองไม่สำเร็จ</span>
          </div>
          <p class="note" style="margin-top:1rem"><b>ได้สนามแล้ว</b> เป็นชิปเดียวที่ถมสีทึบ เพราะเป็นสถานะเดียวที่แปลว่าเรื่องจบแล้วจริง ๆ ที่เหลือยังต้องรออะไรอยู่</p>
        </div>
        <div class="panel">
          <h3>สถานะผู้เล่น และแบบฟอร์มเพิ่มผู้เล่นรับเชิญ</h3>
          <p class="cap">LSN-0022 — ผู้จัดใส่ชื่อเพื่อนที่ไม่มีบัญชี</p>
          <div class="row">
            <span class="chip c-draft">รอชำระ</span>
            <span class="chip c-open"><span class="dot"></span>จ่ายแล้ว</span>
            <span class="chip c-holding"><span class="dot"></span>จ่ายทีหลัง</span>
            <span class="chip c-cancel">เลยกำหนด</span>
            <span class="chip c-guest">ผู้เล่นรับเชิญ</span>
          </div>
          <div class="field">
            <label for="gname">ชื่อผู้เล่นรับเชิญ</label>
            <input id="gname" type="text" placeholder="เช่น พี่ต้น" value="พี่ต้น">
            <span class="hint">คนนี้จะไม่ได้รับแจ้งเตือน และเงินสดที่รับไว้คืนผ่านระบบไม่ได้</span>
          </div>
          <div class="seg" role="group" aria-label="การชำระ">
            <button type="button" aria-pressed="true">จ่ายเงินสดแล้ว</button>
            <button type="button" aria-pressed="false">ยังไม่จ่าย</button>
          </div>
        </div>
        <div class="panel">
          <h3>วิธีหารค่าใช้จ่าย และแถบจำนวนคน</h3>
          <p class="cap">LSN-0021 — <code>split_mode</code> สองค่า</p>
          <div class="seg" role="group" aria-label="วิธีหาร">
            <button type="button" aria-pressed="true">หารเท่ากัน</button>
            <button type="button" aria-pressed="false">ตามเกมที่เล่น</button>
          </div>
          <div class="meter" style="margin-top:1.25rem"><i style="width:75%"></i></div>
          <div class="meter-legend"><span>6 จาก 8 คน</span><span class="num">ขาดอีก 2</span></div>
          <div class="meter" style="margin-top:1rem"><i style="width:100%"></i></div>
          <div class="meter-legend"><span>ครบขั้นต่ำแล้ว</span><span class="num">8 จาก 8 คน</span></div>
        </div>
        <div class="panel">
          <h3>แจ้งเตือน</h3>
          <p class="cap">ข้อความจาก <code>notifications</code> ใน seed</p>
          <div class="toast"><i>✓</i><div><b>จองสนามสำเร็จแล้ว</b><span>ก๊วนฟุตบอล 7 คน ทองหล่อ ได้สนาม A เรียบร้อยแล้ว</span></div></div>
          <p class="note" style="margin-top:1rem">พื้นหมึกเข้ม จุดไลม์หนึ่งจุด — ป้ายแจ้งเตือนคือที่เดียวที่ระบบพูดเสียงต่ำบนพื้นขาว</p>
        </div>
        <div class="panel">
          <h3>หน้าว่าง</h3>
          <p class="cap">งานหลักของมาสคอต: ทำให้หน้าที่ยังไม่มีอะไรไม่น่ากลัว</p>
          <div class="empty">
            {BASE_SVG}
            <div>
              <h4>ยังไม่มีก๊วนแถวลาดพร้าว</h4>
              <p>ตั้งก๊วนแรกแล้วส่งลิงก์เข้ากลุ่ม LINE เดี๋ยวคนมาเอง</p>
              <button class="btn btn-primary btn-sm" type="button" style="margin-top:.7rem">ตั้งก๊วนใหม่</button>
            </div>
          </div>
        </div>
      </div>

      <h3 class="d3" style="margin-top:2rem">การ์ดก๊วน</h3>
      <p class="cap" style="margin-bottom:1rem">ชิ้นที่ถูกเห็นบ่อยที่สุดในแอป และเป็นชิ้นเดียวที่ได้มุมตีเส้น</p>
      <div class="scard">
        <span class="chip c-open"><span class="dot"></span>เปิดรับ</span>
        <h4>ก๊วนแบดเย็นวันพุธ</h4>
        <p class="where">ลาดพร้าว · วังทองหลาง</p>
        <p class="when">พุธ 19:00 – 21:00 น.</p>
        <div class="meter"><i style="width:75%"></i></div>
        <div class="meter-legend"><span>6 จาก 8 คน</span><span>ปิดรับ อ. 20:00 น.</span></div>
        <div class="foot">
          <div><p class="cap">ค่าสนามโดยประมาณ</p><p class="money num">฿100<span style="font-size:.9375rem;font-weight:500;color:var(--ink-500)"> / คน</span></p></div>
          <button class="btn btn-primary" type="button">เข้าร่วม</button>
        </div>
      </div>
    </div>
  </section>

  <section id="โมชัน">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">06 · Motion</p>
        <h2>ขยับแค่ transform กับ opacity</h2>
        <p>ไม่มีอะไรที่แอนิเมต layout สี หรือเงา เพราะสามอย่างนั้นคือสิ่งที่ทำให้หน้าเว็บเคยหนืด หนึ่งจอมีการเข้าฉากครั้งเดียว หลังจากนั้นหน้าจออยู่นิ่ง</p>
      </div>
      <div class="grid g3">
        <div class="panel">
          <h3>rise</h3>
          <p class="cap">รายการไล่กันขึ้นทีละ 40ms หยุดหน่วงที่ตัวที่ 7</p>
          <div class="demo-stage playing" id="demo-rise"><i></i><i></i><i></i><i></i></div>
          <button class="btn btn-secondary btn-sm" type="button" style="margin-top:.9rem" data-replay="demo-rise">เล่นอีกครั้ง</button>
        </div>
        <div class="panel">
          <h3>grow-x</h3>
          <p class="cap">แถบจำนวนคนถูกทาจากซ้าย เหมือนคนกำลังตีเส้น</p>
          <div class="meter" style="margin-top:.9rem" id="demo-grow"><i style="width:75%;animation:growx .7s cubic-bezier(.22,1,.36,1) both"></i></div>
          <button class="btn btn-secondary btn-sm" type="button" style="margin-top:.9rem" data-replay="demo-grow">เล่นอีกครั้ง</button>
        </div>
        <div class="panel">
          <h3>shimmer</h3>
          <p class="cap">โครงร่างระหว่างโหลด แสงวิ่งบน pseudo-element ตัวบล็อกไม่ถูกวาดใหม่</p>
          <div class="skel"></div>
          <p class="cap" style="margin-top:.9rem">ใช้กับ skeleton ของหน้าก๊วน ไม่ใช้กับปุ่ม</p>
        </div>
      </div>
      <p class="note" style="margin-top:1.25rem"><b>ทุกอย่างเคารพ <code>prefers-reduced-motion</code></b> — ไม่ใช่ลดความเร็ว แต่ตัดทิ้ง คนที่ตั้งค่านั้นมักตั้งเพราะเวียนหัว</p>
    </div>
  </section>

  <section id="โทเคน" class="band">
    <div class="wrap">
      <div class="sec-head">
        <p class="eyebrow">07 · Tokens</p>
        <h2>วางกลับเข้า globals.css ได้ตรง ๆ</h2>
        <p>ชื่อ token ตรงกับของเดิม (<code>--color-brand-*</code>, <code>--color-accent-*</code>, <code>--color-ink-*</code>) บล็อกนี้แทนที่ <code>@theme</code> เดิมได้โดยไม่ต้องแก้คลาส Tailwind ที่เขียนไว้แล้ว มีของใหม่หนึ่งตัวคือ <code>--color-on-brand</code></p>
      </div>
      <div class="spec">
        <div><b>4 · 8 · 12</b><span>ระยะเล็ก px</span></div>
        <div><b>16 · 24 · 32 · 48</b><span>ระยะใหญ่ px</span></div>
        <div><b>8 · 14 · 999</b><span>มุมโค้ง px: เล็ก · การ์ด · ยา</span></div>
        <div><b>line · lift</b><span>เงาสองระดับ ไม่มีระดับสาม</span></div>
      </div>
      <div class="codewrap"><pre><code><span class="cm">/* เส้นสนาม รุ่น 2 — พื้นขาว เขียวสว่างขึ้นหนึ่งสเต็ป ไลม์เลื่อนขั้น */</span>
@theme {{
  <span class="cm">/* เขียวสนาม: 500 ทา, 600 เขียน */</span>
  <span class="tk">--color-brand-50</span>:  {C['p50']};
  <span class="tk">--color-brand-100</span>: {C['p100']};
  <span class="tk">--color-brand-200</span>: {C['p200']};
  <span class="tk">--color-brand-300</span>: {C['p300']};
  <span class="tk">--color-brand-400</span>: {C['p400']};
  <span class="tk">--color-brand-500</span>: {C['p500']};
  <span class="tk">--color-brand-600</span>: {C['p600']};
  <span class="tk">--color-brand-700</span>: {C['p700']};
  <span class="tk">--color-brand-800</span>: {C['p800']};
  <span class="tk">--color-brand-900</span>: {C['p900']};
  <span class="cm">/* ตัวอักษรบนเขียว 500 — ขาวได้ {ratio(C['paper'], C['p500'])} ไม่ผ่าน หมึกได้ {ratio(C['ink900'], C['p500'])} */</span>
  <span class="tk">--color-on-brand</span>:  {C['ink900']};

  <span class="cm">/* สีตีเส้น: พื้นและแถบเท่านั้น ห้ามเป็นตัวอักษร */</span>
  <span class="tk">--color-accent-300</span>: {C['l300']};
  <span class="tk">--color-accent-400</span>: {C['l400']};
  <span class="tk">--color-accent-500</span>: {C['l500']};
  <span class="tk">--color-accent-600</span>: {C['l600']};

  <span class="cm">/* ดินเผา: โทนเตือน และสีลูกบาสของมาสคอต */</span>
  <span class="tk">--color-clay-50</span>:  {C['clay50']};
  <span class="tk">--color-clay-100</span>: {C['clay100']};
  <span class="tk">--color-clay-500</span>: {C['clay500']};
  <span class="tk">--color-clay-700</span>: {C['clay700']};

  <span class="cm">/* แดง: ยกเลิก ลบ ล้มเหลว */</span>
  <span class="tk">--color-rose-50</span>:  {C['rose50']};
  <span class="tk">--color-rose-500</span>: {C['rose500']};
  <span class="tk">--color-rose-700</span>: {C['rose700']};

  <span class="cm">/* หมึกอมเขียว — 400 ต้องผ่าน 3:1 เพราะแบกไอคอน ({ratio(C['ink400'], C['paper'])}) */</span>
  <span class="tk">--color-ink-100</span>: {C['ink100']};
  <span class="tk">--color-ink-200</span>: {C['ink200']};
  <span class="tk">--color-ink-300</span>: {C['ink300']};
  <span class="tk">--color-ink-400</span>: {C['ink400']};
  <span class="tk">--color-ink-500</span>: {C['ink500']};
  <span class="tk">--color-ink-700</span>: {C['ink700']};
  <span class="tk">--color-ink-800</span>: {C['ink800']};
  <span class="tk">--color-ink-900</span>: {C['ink900']};

  <span class="tk">--font-sans</span>:    var(--font-anuphan), ui-sans-serif, system-ui, sans-serif;
  <span class="tk">--font-display</span>: var(--font-jamjuree), var(--font-anuphan), ui-sans-serif, sans-serif;
  <span class="tk">--radius-card</span>: 0.875rem;
  <span class="tk">--shadow-line</span>: 0 1px 2px 0 rgb(13 31 24 / 0.05);
  <span class="tk">--shadow-lift</span>: 0 1px 2px 0 rgb(13 31 24 / 0.06), 0 8px 24px -12px rgb(13 31 24 / 0.18);
}}

:root {{
  color-scheme: light;
  <span class="tk">--surface</span>:        {C['paper']};
  <span class="tk">--surface-tint</span>:   {C['mint']};
  <span class="tk">--surface-raised</span>: {C['paper']};
  <span class="tk">--foreground</span>:     var(--color-ink-900);
  <span class="tk">--hairline</span>:       rgb(13 31 24 / 0.10);
}}</code></pre></div>
      <p class="note" style="margin-top:1.25rem"><b>สิ่งที่ต้องแก้ตามหลังเปลี่ยนพื้น</b> — พอพื้นกับการ์ดเป็นขาวทั้งคู่ การ์ดจะหายไปกับพื้น หน้านี้แก้ด้วยการให้การ์ดมีเส้นขอบ hairline เสมอ และใช้แถบ <code>--surface-tint</code> คั่นบทแทนการพึ่งเงา และทุกที่ที่เคยเขียน <code>text-white</code> บน <code>bg-brand-500</code> ต้องเปลี่ยนเป็น <code>text-on-brand</code></p>
    </div>
  </section>

  <footer class="wrap">
    <p>เส้นสนาม รุ่น 2 · Design System ของ <b>ลงสนาม</b> — ต่อยอดจาก <code>src/app/globals.css</code> · กีฬาทั้งห้าอ้างอิง <code>supabase/migrations/20260901000700_reference_data.sql</code> · ตัวอย่างข้อความจาก <code>supabase/seed.sql</code> · มาสคอตสร้างจากหุ่นข้อต่อใน <code>build_sen_sanam.py</code></p>
  </footer>
</main>

<script>
  document.querySelectorAll('[data-replay]').forEach(function (btn) {{
    btn.addEventListener('click', function () {{
      var stage = document.getElementById(btn.dataset.replay);
      if (!stage) return;
      var bar = stage.querySelector('i');
      if (stage.classList.contains('demo-stage')) {{
        stage.classList.remove('playing'); void stage.offsetWidth; stage.classList.add('playing');
      }} else if (bar) {{
        bar.style.animation = 'none'; void bar.offsetWidth;
        bar.style.animation = 'growx .7s cubic-bezier(.22,1,.36,1) both';
      }}
    }});
  }});
  document.querySelectorAll('.seg').forEach(function (seg) {{
    seg.querySelectorAll('button').forEach(function (b) {{
      b.addEventListener('click', function () {{
        seg.querySelectorAll('button').forEach(function (o) {{ o.setAttribute('aria-pressed', o === b ? 'true' : 'false'); }});
      }});
    }});
  }});
</script>
'''
open(OUT, 'w').write(html)
print('wrote', OUT, len(html), 'bytes')

from pathlib import Path
import base64,json,shutil,xml.etree.ElementTree as ET
R=Path(__file__).resolve().parent.parent
F=Path('/Users/grapetnp/Documents/Codex/2026-09-10/LongSaNam/outputs/longsanam-social-tournament/fonts')
for d in ['icons','labeled','fonts']: (R/d).mkdir(exist_ok=True)
for name in ['BaiJamjuree-Bold.ttf','Anuphan.ttf','BaiJamjuree-OFL.txt','Anuphan-OFL.txt']:
 if not (R/'fonts'/name).exists():shutil.copy2(F/name,R/'fonts'/name)
G='#0a7a4f';B='#12a563';I='#0d1f18';L='#bfec33';W='#ffffff'
fontcss=''
for name,family,weight in [('BaiJamjuree-Bold.ttf','Bai','700'),('Anuphan.ttf','Anuphan','100 700')]:
 fontcss+=f'@font-face{{font-family:{family};src:url(data:font/ttf;base64,{base64.b64encode((R/"fonts"/name).read_bytes()).decode()});font-weight:{weight}}}'
style='<style>'+fontcss+'</style>'
def shell(content,vb,title,fonts=False):return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" role="img" aria-label="{title}"><title>{title}</title>'+ (style if fonts else '')+content+'</svg>'
def plaque(kind):
 if kind=='common':return f'<path d="M48 3H237V192A45 45 0 0 1 192 237H3V48A45 45 0 0 1 48 3Z" fill="{W}" stroke="{G}" stroke-width="6" stroke-linejoin="miter"/>'
 return f'<path d="M48 0H240V192A48 48 0 0 1 192 240H0V48A48 48 0 0 1 48 0Z" fill="{I if kind=="elite" else B}"/>'
def lines(paths,color=I,width=24):return f'<g fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="butt" stroke-linejoin="miter">'+''.join(f'<path d="{p}"/>' for p in paths)+'</g>'
def head(x,y,r=14,c=I):return f'<circle cx="{x}" cy="{y}" r="{r}" fill="{c}"/>'
def shuttle(x,y,cork=I):return f'<g transform="translate({x} {y})"><ellipse cy="-2" rx="7" ry="10.5" fill="{L}"/><path d="M-5 10H5V13Q5 18 0 18Q-5 18 -5 13Z" fill="{cork}"/></g>'
def racket(x,y,angle,c=G,length=90,rx=18,ry=28):
 return f'<g transform="translate({x} {y}) rotate({angle})" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="butt"><ellipse rx="{rx}" ry="{ry}"/><path d="M0 {ry}V{length}"/></g>'
meta=[
 ('01-first-tournament','rare','ทัวร์นาเมนต์แรก',['ลงแข่งจนจบทัวร์นาเมนต์แรกของคุณ'],'ให้เมื่อสถานะทัวร์นาเมนต์แรกเป็น completed และผู้เล่นอยู่ในรายชื่อที่เข้าร่วมจริง ไม่ได้ให้เมื่อสมัครอย่างเดียว'),
 ('02-new-opponents','common','คู่แข่งใหม่',['จบแมตช์กับก๊วน','ที่ไม่เคยแข่งด้วยกัน'],'ให้เมื่อจบแมตช์ที่ยืนยันผลแล้วกับก๊วนใหม่เป็นครั้งแรก'),
 ('03-five-tournaments','rare','ขยับอีกขั้น',['ลงแข่งครบ 5 ทัวร์นาเมนต์'],'นับรายการที่แข่งจบ 5 รายการที่ไม่ซ้ำกัน สื่อการมีส่วนร่วม ไม่ใช่การรับรองว่าฝีมือดีขึ้น'),
 ('04-champion','elite','แชมป์ประจำรายการ',['คว้าอันดับหนึ่งในทัวร์นาเมนต์'],'ให้หลังผู้จัดยืนยันอันดับสุดท้ายว่าเป็นแชมป์ หากแข่งแบบทีมให้เฉพาะผู้เล่นในรายชื่อที่มีสิทธิ์ของทีมชนะ'),
 ('05-fair-play','common','น้ำใจนักกีฬา',['ได้รับคำชื่นชมเรื่องน้ำใจนักกีฬา','หลังแข่ง'],'ให้เมื่อได้รับการชื่นชมจากคู่แข่งหลังแมตช์ที่ยืนยันผลแล้ว ข้อเสนอ MVP: อย่างน้อย 1 คนที่ไม่ได้อยู่ก๊วนเดียวกัน ไม่ประเมินตนเอง ไม่เกี่ยวกับคะแนนฝีมือ'),
 ('06-three-squads','rare','เพื่อนร่วมสนาม',['แข่งกับก๊วนต่างกันครบ 3 ก๊วน'],'นับก๊วนคู่แข่งที่ไม่ซ้ำกันสะสมครบ 3 ก๊วนจากแมตช์ที่ยืนยันผล ไม่เท่ากับการส่งหรือรับคำขอเป็นเพื่อน')]
motifs=[]
motifs.append(lines(['M36 78Q61 113 105 139','M204 78Q175 119 129 141','M129 148Q102 166 103 209'])+head(121,91,15)+shuttle(121,38))
left=lines(['M26 141Q46 122 85 120','M71 149Q88 169 74 197','M44 163Q40 176 28 183'],G)+head(61,91,13,G)
motifs.append(left+'<g transform="translate(240 0) scale(-1 1)">'+left+'</g>'+shuttle(120,46,G))
motifs.append(lines(['M47 207V153','M95 207V126','M143 207V99','M191 207V72'])+shuttle(191,50))
chevrons=['M88 113L120 89L152 113','M74 160L120 127L166 160','M59 209L120 165L181 209']
motifs.append(racket(180,61,41,L,220,17,32)+lines(chevrons,I,32)+lines(chevrons,L,20))
hand=f'<path d="M86 88H150L144 119Q140 136 120 136Q100 136 93 116Z" fill="{G}"/>'+lines(['M98 109L73 77','M103 110L96 44','M120 108V35','M136 110L143 45','M144 112L161 63'],G,14)
motifs.append(racket(65,164,-55,G,99)+racket(175,164,55,G,99)+hand)
motifs.append(lines(['M47 127Q78 96 108 111Q143 132 177 111','M107 148Q143 144 137 200','M99 157Q78 181 47 185'])+head(121,58,17)+head(43,79,9)+head(194,137,9)+head(188,64,9,L))
def caption(title,desc,x,y,scale=1):
 out=f'<text x="{x}" y="{y}" text-anchor="middle" fill="{I}" font-family="Bai" font-weight="700" font-size="{30*scale}">{title}</text>'
 for j,line in enumerate(desc):out+=f'<text x="{x}" y="{y+(42+j*34)*scale}" text-anchor="middle" fill="{G}" font-family="Anuphan" font-size="{21*scale}">{line}</text>'
 return out
sheet=f'<path fill="{W}" d="M0 0H1536V1260H0Z"/>'
pure=f'<path fill="{W}" d="M0 0H1536V1080H0Z"/>'
data=[]
for j,(key,rarity,title,desc,rule) in enumerate(meta):
 icon=plaque(rarity)+motifs[j]
 (R/'icons'/f'{key}.svg').write_text(shell(icon,'0 0 240 240',title))
 labeled=f'<path fill="{W}" d="M0 0H480V610H0Z"/><g transform="translate(30 24) scale(1.75)">{icon}</g>'+caption(title,desc,240,500)
 (R/'labeled'/f'{key}.svg').write_text(shell(labeled,'0 0 480 610',title,True))
 x=72+(j%3)*486;y=60+(j//3)*600
 sheet+=f'<g transform="translate({x} {y}) scale(1.75)">{icon}</g>'+caption(title,desc,x+210,y+470)
 pure+=f'<g transform="translate({x} {60+(j//3)*540}) scale(1.75)">{icon}</g>'
 data.append({'id':key,'rarity':rarity,'name_th':title,'description_th':''.join(desc),'proposed_award_rule':rule,'icon':f'icons/{key}.svg','labeled':f'labeled/{key}.svg'})
(R/'badge-sheet-th.svg').write_text(shell(sheet,'0 0 1536 1260','ลงสนาม — ความสำเร็จหลังการแข่งขัน',True))
(R/'badge-sheet-icons.svg').write_text(shell(pure,'0 0 1536 1080','ลงสนาม — Achievement icons'))
(R/'badge-definitions.json').write_text(json.dumps({'status':'Proposed names and award rules; not implemented application rules','badges':data},ensure_ascii=False,indent=2))
palette={G,B,I,L,W};report=[]
for p in R.rglob('*.svg'):
 tree=ET.parse(p)
 colors={v for e in tree.iter() for k,v in e.attrib.items() if k in ['fill','stroke'] and v!='none'}
 assert colors<=palette,(p,colors)
 assert not any(e.tag.split('}')[-1] in ['filter','image','linearGradient','radialGradient'] for e in tree.iter())
 if p.parent.name=='icons':assert not any(e.tag.endswith('text') for e in tree.iter())
 report.append({'file':str(p.relative_to(R)),'colors':sorted(colors),'native_vector':True})
(R/'svg-checks.json').write_text(json.dumps(report,indent=2))
print('14 SVG files built and validated')

# -*- coding: utf-8 -*-
"""주차 한눈에 보기 지도 만들기.
1) 사용자가 손으로 그린 원과, 원에 번진 지도 글자를 지운 바탕 지도(map-overview.jpg)
2) 그 위에 얹을 SVG 그래픽(구역, 번호, 차단기, 행사장, 이름표)을 index.html의 <!--OVMAP:START--> ~ <!--OVMAP:END--> 사이에 넣는다.
좌표는 모두 원본 지도(1676x1566) 픽셀 기준.
"""
import sys, re, pathlib
import cv2, numpy as np
from PIL import ImageFont

SRC = sys.argv[1]                      # 원본 위성사진 (손그림 원 포함)
ROOT = pathlib.Path(sys.argv[2])       # 저장소 폴더
W, H = 1676, 1566

# ── 1. 바탕 지도 정리 ─────────────────────────────
im = cv2.imread(SRC, cv2.IMREAD_COLOR)
hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
Hh, S, V = cv2.split(hsv)
def band(m, x0, y0, x1, y1):
    r = np.zeros_like(m); r[y0:y1, x0:x1] = m[y0:y1, x0:x1]; return r
blue = ((Hh >= 100) & (Hh <= 130) & (S > 150) & (V > 120)).astype(np.uint8) * 255
white = ((S < 40) & (V > 225)).astype(np.uint8) * 255
orange = ((Hh >= 8) & (Hh <= 30) & (S > 120) & (V > 110)).astype(np.uint8) * 255
yellow = ((Hh >= 22) & (Hh <= 38) & (S > 120) & (V > 170)).astype(np.uint8) * 255
mask = np.zeros((H, W), np.uint8)
mask |= band(blue, 1170, 95, 1320, 260) | band(blue, 795, 570, 1160, 790)
mask |= band(white, 805, 815, 950, 915)
mask |= band(orange, 1040, 75, 1215, 185) | band(orange, 485, 1025, 690, 1185) | band(orange, 110, 1070, 620, 1566)
mask |= band(yellow, 1400, 200, 1585, 340)
n, lab, stats, _ = cv2.connectedComponentsWithStats((mask > 0).astype(np.uint8), 8)
keep = np.zeros_like(mask)
for i in range(1, n):
    if stats[i, cv2.CC_STAT_AREA] >= 25: keep[lab == i] = 255
keep = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))
# 원에 번진 지도 글자는 통째로 지우고 그래픽 이름표로 대신한다
for (x0, y0, x1, y1) in [(956, 92, 1092, 130),      # 경상관 201동
                         (1234, 74, 1394, 140),     # 담결 / 한양대에리카점
                         (856, 554, 970, 612),      # 학술정보관 401동
                         (878, 750, 1016, 848)]:    # 한양대학교 ERICA캠퍼스 + 아이콘
    keep[y0:y1, x0:x1] = 255
clean = cv2.inpaint(im, keep, 7, cv2.INPAINT_TELEA)
cv2.imwrite(str(ROOT / "map-overview.jpg"), clean, [cv2.IMWRITE_JPEG_QUALITY, 82, cv2.IMWRITE_JPEG_PROGRESSIVE, 1])

# ── 2. SVG 그래픽 ─────────────────────────────
FONT = ImageFont.truetype("/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc", 30, index=1)
def tw(s): return FONT.getlength(s)

FREE, PAID, GATE, EV = "free", "paid", "gate", "ev"
zones = [
    (FREE, '<circle cx="365" cy="1325" r="238"/>'),
    (FREE, '<ellipse cx="1493" cy="266" rx="96" ry="48" transform="rotate(-20 1493 266)"/>'),
    (PAID, '<ellipse cx="978" cy="678" rx="180" ry="100" transform="rotate(-14 978 678)"/>'),
    (PAID, '<ellipse cx="1246" cy="180" rx="66" ry="84" transform="rotate(-12 1246 180)"/>'),
]
badges = [(FREE, 1, 365, 1300), (FREE, 2, 1493, 266), (PAID, 3, 978, 678), (PAID, 4, 1246, 180)]
gates = [(585, 1105), (1125, 115)]
event = (875, 862)

# 이름표: (종류, 글자, 기준점 x, y, 정렬 'm'가운데 'l'왼쪽기준 'r'오른쪽기준)
labels = [
    (EV,   "행사장 · 풋살장", 968, 862, "l"),
    (FREE, "① 무료 · 경기테크노파크 · 도보 11분", 365, 1060, "m"),
    (FREE, "② 무료 · 석호상가 쪽 · 도보 약 13분", 1662, 340, "r"),
    (PAID, "③ 교내 · 학술정보관 옆 (추천)", 990, 552, "m"),
    (PAID, "④ 교내 · 셔틀콕 정류장 옆", 1318, 190, "l"),
    (GATE, "차단기 · 여기서부터 유료", 600, 1192, "m"),
    (GATE, "차단기 · 여기서부터 유료", 1125, 46, "m"),
]

out = []
out.append(f'<svg class="ovmap-svg" viewBox="0 0 {W} {H}" aria-hidden="true" focusable="false">')
out.append(f'<rect width="{W}" height="{H}" class="ov-dim"/>')
for kind, shape in zones:
    out.append(f'<g class="ov-zone ov-{kind}">{shape}</g>')
ex, ey = event
out.append(f'<g class="ov-ev" transform="translate({ex} {ey})"><circle class="ov-ev-pulse" r="70"/><circle class="ov-ev-ring" r="62"/>'
           f'<circle class="ov-ev-dot" r="40"/><use href="#i-soccer-ball-fill" x="-25" y="-25" width="50" height="50"/></g>')
for gx, gy in gates:
    out.append(f'<g class="ov-gate" transform="translate({gx} {gy})"><circle r="36"/><use href="#i-barricade" x="-24" y="-24" width="48" height="48"/></g>')
for kind, num, bx, by in badges:
    out.append(f'<g class="ov-badge ov-{kind}" transform="translate({bx} {by})"><circle r="44"/><text y="17">{num}</text></g>')
PADX, HGT = 22, 52
for kind, text, x, y, al in labels:
    w = tw(text) + PADX * 2
    if al == "m": x0 = x - w / 2
    elif al == "l": x0 = x
    else: x0 = x - w
    x0 = max(8, min(W - 8 - w, x0))
    out.append(f'<g class="ov-lbl ov-{kind}"><rect x="{x0:.0f}" y="{y - HGT / 2:.0f}" width="{w:.0f}" height="{HGT}" rx="{HGT / 2:.0f}"/>'
               f'<text x="{x0 + w / 2:.0f}" y="{y + 11:.0f}">{text}</text></g>')
out.append("</svg>")
svg = "\n".join(out)

idx = ROOT / "index.html"
html = idx.read_text(encoding="utf-8")
html, k = re.subn(r"<!--OVMAP:START-->.*?<!--OVMAP:END-->", "<!--OVMAP:START-->\n" + svg + "\n<!--OVMAP:END-->", html, flags=re.S)
assert k == 1, "index.html에 OVMAP 표시가 없어요"
idx.write_text(html, encoding="utf-8")
print("map-overview.jpg + svg", len(svg), "bytes")

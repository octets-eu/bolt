"""The words of the edge seeker as a picture: lobe, edge, abeam, nose, carrier, leg, tack, spiral."""
import math, sys

W = H = 2400
GREEN, GREEN_FILL, GREY, BLUE, INK, PALE = '#2e7d32', '#c8e6c9', '#e0e0e0', '#1565c0', '#222', '#777'
o = []

def P(cx, cy, r, b):
    """Point at bearing b (degrees clockwise from the nose, which points up)."""
    a = math.radians(b)
    return cx + r * math.sin(a), cy - r * math.cos(a)

def sector(cx, cy, r, b1, b2, fill):
    x1, y1 = P(cx, cy, r, b1); x2, y2 = P(cx, cy, r, b2)
    large = 1 if (b2 - b1) % 360 > 180 else 0
    o.append(f'<path d="M{cx},{cy} L{x1:.1f},{y1:.1f} A{r},{r} 0 {large} 1 {x2:.1f},{y2:.1f} Z" fill="{fill}"/>')

def arc(cx, cy, r, b1, b2, stroke=INK, width=1.5, marker=False):
    x1, y1 = P(cx, cy, r, b1); x2, y2 = P(cx, cy, r, b2)
    sweep = 1 if b2 > b1 else 0
    large = 1 if abs(b2 - b1) > 180 else 0
    m = ' marker-end="url(#arrow)"' if marker else ''
    o.append(f'<path d="M{x1:.1f},{y1:.1f} A{r},{r} 0 {large} {sweep} {x2:.1f},{y2:.1f}" fill="none" stroke="{stroke}" stroke-width="{width}"{m}/>')

def line(x1, y1, x2, y2, stroke=INK, width=1.5, dash=None, marker=False):
    d = f' stroke-dasharray="{dash}"' if dash else ''
    m = ' marker-end="url(#arrow)"' if marker else ''
    o.append(f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{stroke}" stroke-width="{width}"{d}{m}/>')

def ray(cx, cy, r1, r2, b, **kw):
    x1, y1 = P(cx, cy, r1, b); x2, y2 = P(cx, cy, r2, b)
    line(x1, y1, x2, y2, **kw)

def text(x, y, s, size=20, anchor='middle', fill=INK, weight='normal'):
    o.append(f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" text-anchor="{anchor}" fill="{fill}" font-weight="{weight}">{s}</text>')

def ptext(cx, cy, r, b, s, **kw):
    x, y = P(cx, cy, r, b); text(x, y, s, **kw)

def lines(x, y, rows, size=19, gap=30, **kw):
    for i, s in enumerate(rows): text(x, y + i * gap, s, size=size, anchor='start', **kw)

def bolt(x, y, r, heading, fill, stroke):
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')
    ray(x, y, r * 0.5, r * 1.9, heading, stroke=stroke, width=3)

def title(x, y, s):
    text(x, y, s, size=26, anchor='start', weight='bold')

def frame(x, y, w, h):
    o.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="#bbb"/>')

o.append(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Helvetica, Arial, sans-serif">')
o.append('<defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto"><path d="M0,0 L10,5 L0,10 Z" fill="#222"/></marker></defs>')
o.append(f'<rect width="{W}" height="{H}" fill="white"/>')

# ---------- 1  the lobe, seen from the seeker ----------
frame(10, 10, 780, 780)
title(30, 45, '1  Seen from the seeker: the lobe of the carrier')
cx, cy, R = 400, 390, 230
o.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="{GREY}"/>')
sector(cx, cy, R, -60, 60, GREEN_FILL)
sector(cx, cy, R, 120, 240, GREEN_FILL)
for b in (60, -60, 120, 240): ray(cx, cy, 0, R, b, stroke=GREEN, width=2, dash='8 6')
ray(cx, cy, R, R + 30, 90, stroke=PALE); ray(cx, cy, R, R + 30, 270, stroke=PALE)
ray(cx, cy, -R - 30, R + 30, 0, stroke=PALE, dash='4 6')
bolt(cx, cy, 22, 0, GREEN_FILL, GREEN)
sx, sy = P(cx, cy, 185, 65)
o.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="12" fill="{BLUE}"/>')
line(cx, cy, sx, sy, stroke=BLUE, width=1.5, dash='3 4')
arc(cx, cy, 70, 0, 65, stroke=BLUE, width=2, marker=True)
ptext(cx, cy, 95, 30, '65°', size=20, fill=BLUE)
text(cx, cy - R - 42, 'nose: the heading', size=20)
text(cx, cy + R + 58, 'tail', size=20)
text(cx + R + 42, cy + 7, 'abeam', size=20, anchor='start')
text(cx - R - 42, cy + 7, 'abeam', size=20, anchor='end')
text(cx, cy - 130, 'lobe: heard', size=20, fill=GREEN, weight='bold')
text(cx, cy + 140, 'lobe: heard', size=20, fill=GREEN, weight='bold')
for s in (1, -1):
    text(cx + s * 135, cy + 2, 'quiet side', size=18, fill=PALE)
    text(cx + s * 135, cy + 24, 'silent', size=18, fill=PALE)
ptext(cx, cy, R + 36, 62, 'edge, about 60°', size=18, fill=GREEN, anchor='start')
ptext(cx, cy, R + 36, -62, 'edge', size=18, fill=GREEN, anchor='end')
text(sx + 22, sy - 2, 'sender, held', size=18, fill=BLUE, anchor='start')
text(sx + 22, sy + 20, '65° off the nose', size=18, fill=BLUE, anchor='start')
text(cx - R - 10, cy - R + 10, 'fore-aft axis', size=16, fill=PALE, anchor='start')
lines(30, 715, [
    'Bearing: where the sender is, in degrees off the nose; here 65° right.',
    'Heard: the sender has slid into the lobe, turn 10° away from it (left).',
    'Silent while a stronger level came: it slid out, turn 10° toward it (right).'], gap=28)

# ---------- 2  the ladder: which level has an edge ----------
frame(810, 10, 780, 780)
title(830, 45, '2  The ladder: whose edge, at about 1 m')
bx, by = 860, 100
for i, s in enumerate((2, 4, 8, 16)):
    x = bx + i * 170
    o.append(f'<rect x="{x}" y="{by - 24}" width="60" height="36" fill="white" stroke="{INK}"/>')
    text(x + 30, by + 3, str(s), size=20)
    if i < 3:
        line(x + 62, by - 6, x + 168, by - 6, marker=True)
        text(x + 115, by - 14, '200 ms', size=14, fill=PALE)
text(bx + 580, by + 3, 'a round', size=16, fill=PALE, anchor='start')
text(bx + 580, by + 23, '0.85 s', size=16, fill=PALE, anchor='start')
specs = [(2, None, 'not arriving', 'silent everywhere'),
         (4, 60, 'the carrier', 'weakest that arrives'),
         (8, 80, 'wider lobe', 'shallow quiet side'),
         (16, 180, 'heard all round', 'no edge, no direction')]
r = 80
for i, (s, half, l1, l2) in enumerate(specs):
    x = 915 + i * 190; y = 290
    o.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GREY}"/>')
    if half == 180:
        o.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{GREEN_FILL}"/>')
    elif half:
        sector(x, y, r, -half, half, GREEN_FILL)
        sector(x, y, r, 180 - half, 180 + half, GREEN_FILL)
        for b in (half, -half, 180 - half, 180 + half): ray(x, y, 0, r, b, stroke=GREEN, width=1.5, dash='5 4')
    bolt(x, y, 12, 0, GREEN_FILL, GREEN)
    text(x, y + r + 32, f'strength {s}', size=20, weight='bold')
    text(x, y + r + 56, l1, size=17)
    text(x, y + r + 78, l2, size=15, fill=PALE)
lines(830, 520, [
    'The sender sends the ladder, one frame per 200 ms, every level on all',
    'four emitters. Each level is heard inside the lobe and lost abeam; the',
    'stronger the level, the wider its lobe. Only the edge of a lobe tells',
    'where the sender is, so the rule listens to the weakest level that still',
    'arrives: the carrier. Closer in every lobe widens: under 60 cm strength 4',
    'has no quiet side (runs 5 and 7) and strength 2 is there to take over.'])

# ---------- 3  over the floor: legs and tacks ----------
frame(10, 810, 780, 780)
title(30, 845, '3  Over the floor: legs and tacks')
scale = 3.2
sxx, syy = 400, 900
o.append(f'<circle cx="{sxx}" cy="{syy}" r="12" fill="{BLUE}"/>')
text(sxx + 22, syy + 6, 'sender', size=18, fill=BLUE, anchor='start')
px, py = sxx, syy + 150 * scale
pts = [(px, py)]
side = 1
headings = []
while True:
    bearing = math.degrees(math.atan2(sxx - px, -(syy - py)))
    dist = math.hypot(sxx - px, syy - py) / scale
    if dist < 60 or len(pts) > 8: break
    heading = bearing - side * 65
    headings.append((px, py, heading, bearing))
    px, py = P(px, py, 40 * scale, heading)
    pts.append((px, py))
    side = -side
d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
o.append(f'<polyline points="{d}" fill="none" stroke="{GREEN}" stroke-width="3"/>')
for x, y in pts[1:-1]:
    o.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="white" stroke="{GREEN}" stroke-width="2"/>')
x0, y0, h0, b0 = headings[0]
bolt(x0, y0, 16, h0, GREEN_FILL, GREEN)
text(x0 + 30, y0 + 6, 'start, after the standing turn:', size=16, fill=PALE, anchor='start')
text(x0 + 30, y0 + 26, 'sender 65° right of the nose', size=16, fill=PALE, anchor='start')
x1, y1, h1, b1 = headings[1]
line(x1, y1, sxx, syy, stroke=BLUE, width=1.2, dash='3 4')
ray(x1, y1, 0, 90, h1, stroke=INK, width=1.5, marker=True)
arc(x1, y1, 50, h1, b1, stroke=BLUE, width=2)
mx, my = P(x1, y1, 68, (h1 + b1) / 2)
text(mx, my + 6, '65°', size=18, fill=BLUE)
text(pts[1][0] - 16, pts[1][1] + 24, 'leg 1, 40 cm,', size=16, anchor='end')
text(pts[1][0] - 16, pts[1][1] + 44, 'sender on the right edge', size=16, anchor='end')
text(pts[2][0] + 16, pts[2][1] + 6, 'leg 2, sender on the left edge', size=16, anchor='start')
text(pts[3][0] - 16, pts[3][1] - 14, 'tack: a 130° turn in place,', size=16, anchor='end')
text(pts[3][0] - 16, pts[3][1] + 6, 'the sender moves from', size=16, anchor='end')
text(pts[3][0] - 16, pts[3][1] + 26, 'one edge to the other', size=16, anchor='end')
lines(30, 1480, [
    'Of a 40 cm leg, 17 cm point at the sender (cos 65°), 36 cm go sideways (sin 65°).',
    'Full legs cannot close under 47 cm: from there only legs cut short by silence do.',
    'A leg is cut when the carrier falls silent two rounds in a row (slid out abeam).'])

# ---------- 4  one edge held: the spiral ----------
frame(810, 810, 780, 780)
title(830, 845, '4  One edge held: the spiral (runs 1 and 2)')
scale = 2.0
sxx, syy = 1270, 1150
o.append(f'<circle cx="{sxx}" cy="{syy}" r="12" fill="{BLUE}"/>')
text(sxx, syy + 36, 'sender', size=18, fill=BLUE)
px, py = sxx - 150 * scale, syy
pts = [(px, py)]
first = None
while math.hypot(sxx - px, syy - py) / scale > 8:
    bearing = math.degrees(math.atan2(sxx - px, -(syy - py)))
    heading = bearing - 65
    if first is None: first = heading
    px, py = P(px, py, 1.5 * scale, heading)
    pts.append((px, py))
d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
o.append(f'<polyline points="{d}" fill="none" stroke="{GREEN}" stroke-width="3"/>')
x0, y0 = pts[0]
bolt(x0, y0, 16, first, GREEN_FILL, GREEN)
text(x0, y0 + 42, 'start, 1.5 m', size=16, fill=PALE)
k = len(pts) // 4
qx, qy = pts[k]
qb = math.degrees(math.atan2(sxx - qx, -(syy - qy)))
line(qx, qy, sxx, syy, stroke=BLUE, width=1.2, dash='3 4')
ray(qx, qy, 0, 80, qb - 65, stroke=INK, width=1.5, marker=True)
arc(qx, qy, 45, qb - 65, qb, stroke=BLUE, width=2)
mx, my = P(qx, qy, 62, qb - 32)
text(mx, my + 6, '65°', size=18, fill=BLUE)
lines(830, 1480, [
    'The sender stays 65° off the nose on the same side, so the path curls',
    'around it: one turn closes 150 cm to 8 cm. Tacking (3) is the same rule',
    'with the side changed at every leg end.'])


# ---------- 5  the beat ----------
frame(10, 1610, 780, 780)
title(30, 1645, '5  The beat: when a frame comes')
ox, oy, px_ms = 60, 1900, 1.15   # time axis origin and scale
def tx(ms): return ox + ms * px_ms
line(ox, oy, ox + 620 * px_ms, oy, stroke=INK, width=1.5, marker=True)
for ms in range(0, 601, 100):
    line(tx(ms), oy - 4, tx(ms), oy + 4, stroke=INK)
    text(tx(ms), oy + 26, f'{ms} ms', size=14, fill=PALE)
PERIOD = 200.44
for k in range(3):
    t = 40 + k * PERIOD
    o.append(f'<rect x="{tx(t):.1f}" y="{oy - 90}" width="{7.5 * px_ms:.1f}" height="60" fill="{BLUE}"/>')
    # the notify about 45 ms later, scattered
    n = t + 45
    line(tx(n), oy - 20, tx(n), oy, stroke=GREEN, width=3)
    o.append(f'<rect x="{tx(n - 14):.1f}" y="{oy - 24}" width="{28 * px_ms:.1f}" height="6" fill="{GREEN_FILL}"/>')
    # the beat: the expected notify
    line(tx(n), oy - 140, tx(n), oy + 10, stroke=PALE, dash='4 5')
text(tx(40) + 6, oy - 100, 'frame, 7.5 ms', size=17, fill=BLUE, anchor='start')
text(tx(40 + PERIOD) + 6, oy - 100, 'next frame, 200.44 ms later', size=17, fill=BLUE, anchor='start')
text(tx(92), oy - 36, 'notify', size=16, fill=GREEN, anchor='start')
text(tx(92 + PERIOD), oy - 36, 'notify, scattered 14 ms', size=16, fill=GREEN, anchor='start')
text(tx(85), oy - 148, 'beat: when the notifies are expected', size=16, fill=PALE, anchor='start')
# a command
c = 130
line(tx(c), oy + 60, tx(c), oy + 4, stroke=INK, width=1.5, marker=True)
text(tx(c), oy + 82, 'a send command', size=16)
arc_x1, arc_x2 = tx(c), tx(40 + PERIOD)
o.append(f'<path d="M{arc_x1:.1f},{oy + 60} Q{(arc_x1 + arc_x2) / 2:.1f},{oy + 130} {arc_x2:.1f},{oy + 4}" fill="none" stroke="{PALE}" stroke-width="1.5" marker-end="url(#arrow)"/>')
text((arc_x1 + arc_x2) / 2, oy + 125, 'loads the next frame', size=15, fill=PALE)
lines(30, 2130, [
    'The sender runs on its own clock: one frame every 200.44 ms, 7.5 ms long,',
    'whatever the command timing. The notify "message heard" follows each frame',
    'that decodes, about 45 ms later, scattered 14 ms in the timing runs, 20 to 25',
    'in the sweeps. The beat is that period, learned from the first 10 notifies and',
    'corrected by a fifth of each later notify\'s error; a notify more than 25 ms off',
    'is ignored. It says when the next frame will be in the air, which is the only',
    'moment the receivers can be read.'], size=18, gap=28)

# ---------- 6  the volley ----------
frame(810, 1610, 780, 780)
title(830, 1645, '6  The volley: three reads timed into the frame')
ox, oy, px_ms = 850, 1880, 8.0   # 30 to 120 ms
t_from = 30
def tz(ms): return ox + (ms - t_from) * px_ms
line(ox, oy, tz(122), oy, stroke=INK, width=1.5, marker=True)
for ms in range(40, 121, 20):
    line(tz(ms), oy - 4, tz(ms), oy + 4, stroke=INK)
    text(tz(ms), oy + 24, f'{ms} ms', size=13, fill=PALE)
n = 100   # the expected notify
f0 = n - 45
o.append(f'<rect x="{tz(f0):.1f}" y="{oy - 70}" width="{7.5 * px_ms:.1f}" height="70" fill="{BLUE}" opacity="0.85"/>')
text(tz(f0 + 7.5) + 10, oy - 44, 'frame in the air,', size=15, fill=BLUE, anchor='start')
text(tz(f0 + 7.5) + 10, oy - 24, '7.5 ms', size=15, fill=BLUE, anchor='start')
line(tz(n), oy - 150, tz(n), oy + 6, stroke=PALE, dash='4 5')
text(tz(n), oy - 158, 'expected notify', size=15, fill=PALE)
for k, (ms, hit) in enumerate(((n - 51, False), (n - 45, True), (n - 39, False))):
    col = GREEN if hit else INK
    line(tz(ms), oy - 120, tz(ms), oy - 72 if hit else oy - 4, stroke=col, width=2.5, marker=True)
    text(tz(ms), oy - 128, str(k + 1), size=15, fill=col, weight='bold')
text(tz(n - 51) - 10, oy - 128, 'reads', size=15, anchor='end')
text(tz(n - 45), oy - 170, 'fired 6 ms apart, none waits for the other', size=15)
text(tz(f0 + 7.5) + 10, oy - 78, 'hit: read 2 landed in it', size=15, fill=GREEN, weight='bold', anchor='start')
# the replies about 40 ms later
for ms in (n - 11, n - 5, n + 1):
    line(tz(ms), oy + 4, tz(ms), oy + 50, stroke=PALE, width=1.5, marker=True)
text(tz(n - 5), oy + 72, 'replies, about 40 ms after each read', size=14, fill=PALE)
# the corners: a hit names the receivers, each covers a quadrant
cx, cy, r = 1230, 2170, 64
sector(cx, cy, r + 60, 0, 90, '#dbe7f7')
o.append(f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{GREEN_FILL}" stroke="{GREEN}" stroke-width="2"/>')
ray(cx, cy, r * 0.5, r * 1.35, 0, stroke=GREEN, width=3)
for bng, name in ((-45, 'FL'), (45, 'FR'), (135, 'BR'), (-135, 'BL')):
    x, y = P(cx, cy, r * 0.7, bng)
    o.append(f'<rect x="{x - 9:.1f}" y="{y - 9:.1f}" width="18" height="18" fill="{"#1565c0" if name == "FR" else "white"}" stroke="{INK}"/>')
    lx, ly = P(cx, cy, r + 22, bng)
    text(lx, ly + 6, name, size=15, fill=BLUE if name == 'FR' else INK, weight='bold' if name == 'FR' else 'normal')
sx, sy = P(cx, cy, r + 46, 40)
o.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="9" fill="{BLUE}"/>')
text(sx + 14, sy + 5, 'sender', size=14, fill=BLUE, anchor='start')
lines(1380, 2130, [
    'The receivers sit at the',
    'corners. A hit on FR puts',
    'the sender in its quadrant,',
    '0° to 90° right of the nose.',
    'FL+FR: dead ahead; BR+BL:',
    'behind; FL+BR: no side.'], size=15, gap=22)
lines(850, 2270, [
    'Commands land on a 15 ms grid and a frame lasts 7.5 ms, so half the frames hold no',
    'moment a read can hit: three reads caught 35 to 39 % at 80 cm, 10 to 20 % in the',
    'sweeps. Each hit votes for the end of the axis nearer its quadrant; more hits win.'], size=18, gap=28)

# ---------- the terms ----------
frame(1610, 10, 780, 2380)
title(1630, 45, 'The terms')
terms = [
    ('nose, heading', 'where the Bolt points; 0° of every bearing'),
    ('tail', 'the opposite end'),
    ('fore-aft axis', 'the line through nose and tail'),
    ('abeam', '90° off the nose, either side'),
    ('bearing', 'where the sender is, in degrees off the nose'),
    ('frame', 'one infrared message, 7.5 ms in the air'),
    ('level, strength', 'how hard the sender emits; 2, 4, 8, 16'),
    ('ladder', 'the levels sent in turn, one frame per 200 ms'),
    ('round', 'one pass through the ladder, 0.85 s'),
    ('notify', 'the Bolt\'s "message heard", one per decoded frame'),
    ('heard, silent', 'a level came in this round, or did not while a stronger one did'),
    ('lobe', 'the bearings a level is heard from, about ±60° off nose and tail'),
    ('quiet side', 'the bearings abeam where it is not'),
    ('edge', 'the bearing where a lobe ends, about 60°'),
    ('carrier', 'the weakest level still arriving: the one with an edge'),
    ('leg', 'a straight run with the sender held on one edge'),
    ('tack', 'the 130° turn in place that moves the sender to the other edge'),
    ('spiral', 'one edge held throughout'),
    ('dash', 'a straight run at the sender from close in'),
    ('beat', 'the period the notifies arrive on, 200.44 ms, learned and followed'),
    ('volley', 'reads of the four receivers fired 6 ms apart into the expected frame'),
    ('hit', 'a read that landed in the frame: it names the receivers that hear'),
    ('corners', 'FL, FR, BR, BL: the receivers, 45° off the nose in front, 135° behind'),
    ('sweep', 'a standing turn through 180° in 15° steps, one round at each heading'),
    ('axis', 'the line the sweep finds: the sender is at one end of it'),
    ('fit', 'the axis whose two lobes match the heard and silent headings best'),
    ('direction', 'the end of the axis the hits vote for'),
]
y = 100
for term, meaning in terms:
    text(1640, y, term, size=19, anchor='start', weight='bold')
    text(1640, y + 24, meaning, size=17, anchor='start', fill='#444')
    y += 62

o.append('</svg>')
open(sys.argv[1], 'w').write('\n'.join(o))

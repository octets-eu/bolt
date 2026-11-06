#!/usr/bin/env python3
"""Draw a connectome circuit file (the worm's format: neurons, edges) as an SVG.

  python3 agent/connectome_svg.py <circuit.json> <out.svg> [label]

The label, a date for the daily brain, leads the line under the title.
pull.sh draws agent/brains/<date>.svg with it after every pull, so the last
session of a day leaves that day's brain.

Egocentric and nose up: a neuron with an angle sits at that angle, 0 at the
top, clockwise. Receivers outside, the ring in the middle, the motor neurons
inside; neurons without an angle stand in a column or in the strip below.
An edge is blue when it excites and red when it inhibits, its width grows
with the weight. The ring's own edges are drawn once per pair and faint, a
neuron's edge onto itself is not drawn. Hover shows names and weights.
"""
import json, math, sys
from collections import Counter

src, out = sys.argv[1], sys.argv[2]
lead = sys.argv[3] + ": " if len(sys.argv) > 3 else ""
c = json.load(open(src))
N = {n["id"]: n for n in c["neurons"]}

W, H, CX, CY = 1200, 1130, 600, 572
R_OUT, R_RING, R_IN = 395, 262, 112
SURFACE, INK, INK2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
POS, NEG = "#2a78d6", "#e34948"          # excites, inhibits (validated pair)

def polar(r, deg):
    a = math.radians(deg)
    return CX + r * math.sin(a), CY - r * math.cos(a)

# --- where each neuron stands
ring = [n for n in c["neurons"] if n["role"] == "ring"]
xy, kind = {}, {}
for i, n in enumerate(ring):
    xy[n["id"]] = polar(R_RING, n.get("angle", i * 360 / len(ring))); kind[n["id"]] = "ring"
for n in c["neurons"]:
    i, role = n["id"], n["role"]
    if role in ("corner", "gradient"):
        xy[i] = polar(R_OUT, n["angle"]); kind[i] = "obs"
    elif role == "steer":
        xy[i] = polar(R_IN, n["angle"]); kind[i] = "motor"
column = {"axial": (92, "obs"), "axis": (W - 92, "motor")}
for role, (x, k) in column.items():
    ids = [n["id"] for n in c["neurons"] if n["role"] == role]
    for j, i in enumerate(ids):
        xy[i] = (x, CY + (j - (len(ids) - 1) / 2) * 130); kind[i] = k
for n in c["neurons"]:
    if n["role"] == "search":
        xy[n["id"]] = (CX, CY); kind[n["id"]] = "motor"
strip_y = H - 62
strip = {"presence": (CX - 250, "obs"), "roam": (CX - 80, "motor"), "near": (CX + 80, "obs"), "request": (CX + 250, "motor")}
for n in c["neurons"]:
    if n["role"] in strip:
        x, k = strip[n["role"]]
        xy[n["id"]] = (x, strip_y); kind[n["id"]] = k
missing = [i for i in N if i not in xy]
assert not missing, f"no place for {missing}"

# --- edges
def width(w): return 0.5 + 1.7 * math.sqrt(abs(w))
def sign(w): return ("+" if w > 0 else "−") + f"{abs(w):.2f}"
edges, seen, skipped = [], set(), Counter()
for a, b, w, *_ in c["edges"]:
    if w == 0: skipped["zero"] += 1; continue
    if a == b: skipped["self"] += 1; continue
    inner = kind[a] == "ring" and kind[b] == "ring"
    if inner:
        key = tuple(sorted((a, b)))
        if key in seen: skipped["pair drawn once"] += 1; continue
        seen.add(key)
    edges.append((abs(w), a, b, w, inner))
edges.sort(key=lambda e: (not e[4], e[0]))      # the ring's own first, strong ones on top

o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="-apple-system, Helvetica, Arial, sans-serif">')
o.append(f'<rect width="{W}" height="{H}" fill="{SURFACE}"/>')
o.append(f'''<style>
  .lab {{ font-size: 13px; fill: {INK}; paint-order: stroke; stroke: {SURFACE}; stroke-width: 4px; stroke-linejoin: round; }}
  .small {{ font-size: 12px; fill: {INK2}; }}
  .e {{ fill: none; stroke-linecap: round; }}
  .e:hover {{ stroke-opacity: 1; }}
</style>''')

# guides: the three circles and the nose
for r in (R_OUT, R_RING, R_IN):
    o.append(f'<circle cx="{CX}" cy="{CY}" r="{r}" fill="none" stroke="{MUTED}" stroke-opacity="0.25" stroke-dasharray="2 6"/>')

o.append('<g>')
for mag, a, b, w, inner in edges:
    (x1, y1), (x2, y2) = xy[a], xy[b]
    col = POS if w > 0 else NEG
    op = 0.16 if inner else 0.6
    name = f"{a} ↔ {b}" if inner else f"{a} → {b}"
    o.append(f'<line class="e" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{col}" stroke-width="{width(w):.2f}" stroke-opacity="{op}"><title>{name}: {sign(w)}</title></line>')
o.append('</g>')

# nodes
def node(i):
    x, y = xy[i]; k = kind[i]; n = N[i]
    tip = f'<title>{i}: {n["role"]}' + (f', {n["angle"]}°' if n.get("angle") is not None else "") + '</title>'
    if k == "obs":
        return f'<rect x="{x-13:.1f}" y="{y-13:.1f}" width="26" height="26" rx="6" fill="{SURFACE}" stroke="{INK}" stroke-width="2">{tip}</rect>'
    if k == "ring":
        return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="11" fill="{INK}" stroke="{SURFACE}" stroke-width="2">{tip}</circle>'
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="15" fill="{SURFACE}" stroke="{INK}" stroke-width="2">{tip}</circle>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="9" fill="{INK}"/>')
def label(i):
    x, y = xy[i]; k = kind[i]
    dx, dy = x - CX, y - CY
    d = math.hypot(dx, dy)
    if (x, y) == (CX, CY):                       # the centre
        return f'<text class="lab" x="{x}" y="{y+34}" text-anchor="middle">{i}</text>'
    if abs(y - strip_y) < 1:                     # the strip
        return f'<text class="lab" x="{x}" y="{y+36}" text-anchor="middle">{i}</text>'
    if x < 150 or x > W - 150:                   # the columns
        return f'<text class="lab" x="{x}" y="{y+36}" text-anchor="middle">{i}</text>'
    if k == "motor":                             # the steering neurons: under the node, clear of the centre
        return f'<text class="lab" x="{x:.1f}" y="{y+34:.1f}" text-anchor="middle">{i}</text>'
    off = {"obs": 32, "ring": 26}[k]
    lx, ly = x + dx / d * off, y + dy / d * off
    anchor = "middle" if abs(dx) < 40 else ("start" if (dx > 0) == (off > 0) else "end")
    return f'<text class="lab" x="{lx:.1f}" y="{ly+4.5:.1f}" text-anchor="{anchor}">{i}</text>'
o.append('<g>' + "".join(node(i) for i in N) + '</g>')
o.append('<g>' + "".join(label(i) for i in N) + '</g>')

# title, reading aid, legend
roles = Counter(kind.values())
o.append(f'<text x="40" y="52" font-size="26" font-weight="600" fill="{INK}">The seeker\'s connectome</text>')
o.append(f'<text x="40" y="78" font-size="14" fill="{INK2}">{lead}{len(N)} neurons, {len(c["edges"])} edges. Nose is up, angles run clockwise. Signals flow inward: receivers, ring, motor.</text>')
nx, ny = polar(R_OUT + 58, 0)
o.append(f'<text x="{nx}" y="{ny}" text-anchor="middle" font-size="12" fill="{MUTED}">nose, 0°</text>')
tx, ty = polar(R_OUT + 58, 180)
o.append(f'<text x="{tx}" y="{ty+8}" text-anchor="middle" font-size="12" fill="{MUTED}">tail, 180°</text>')
lx, ly = W - 262, 40
leg = [
    f'<rect x="{lx}" y="{ly}" width="13" height="13" rx="3" fill="{SURFACE}" stroke="{INK}" stroke-width="1.6"/><text class="small" x="{lx+24}" y="{ly+11}">hears: {roles["obs"]} observation neurons</text>',
    f'<circle cx="{lx+6.5}" cy="{ly+30}" r="6" fill="{INK}"/><text class="small" x="{lx+24}" y="{ly+34}">believes: {roles["ring"]} ring neurons</text>',
    f'<circle cx="{lx+6.5}" cy="{ly+53}" r="7" fill="{SURFACE}" stroke="{INK}" stroke-width="1.6"/><circle cx="{lx+6.5}" cy="{ly+53}" r="3.6" fill="{INK}"/><text class="small" x="{lx+24}" y="{ly+57}">acts: {roles["motor"]} motor neurons</text>',
    f'<line x1="{lx-4}" y1="{ly+78}" x2="{lx+17}" y2="{ly+78}" stroke="{POS}" stroke-width="3" stroke-linecap="round"/><text class="small" x="{lx+24}" y="{ly+82}">excites</text>',
    f'<line x1="{lx+86}" y1="{ly+78}" x2="{lx+107}" y2="{ly+78}" stroke="{NEG}" stroke-width="3" stroke-linecap="round"/><text class="small" x="{lx+114}" y="{ly+82}">inhibits</text>',
    f'<text class="small" x="{lx-4}" y="{ly+104}">A wider line is a stronger weight.</text>',
    f'<text class="small" x="{lx-4}" y="{ly+122}">Faint lines: the ring\'s own wiring.</text>',
]
o.append("".join(leg))
o.append('</svg>')
open(out, "w").write("\n".join(o))
drawn = Counter("ring to ring" if e[4] else f"{kind[e[1]]} to {kind[e[2]]}" for e in edges)
print(f"{len(N)} neurons, {len(c['edges'])} edges: drawn {len(edges)} {dict(drawn)}, not drawn {dict(skipped)}")

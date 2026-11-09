#!/usr/bin/env python3
"""Draw a connectome circuit file (the worm's format: neurons, edges) as an SVG.

  python3 agent/connectome_svg.py <circuit.json> <out.svg> [label]

The label, a date for the daily brain, leads the line under the title.
pull.sh draws agent/brains/<date>.svg with it after every pull, so the last
session of a day leaves that day's brain.

Egocentric and nose up: a neuron with an angle sits at that angle, 0 at the
top, clockwise. Signals read top to bottom: the receivers in two rows (a
frame heard, a slot gone silent) and the corners around the ring, the ring in
the middle with the motor neurons inside, the distance bands in a column at
the right, the presence and near neurons with roam and the ladder request in
a strip below. A receiver's weights onto the ring are drawn as a rose at the
receiver, nose up: blue where it excites a bearing, red where it inhibits,
the radius the weight; its weights onto the distance bands as bars, near to
far. The ring's weights onto the motor neurons are lines, blue excites, red
inhibits, wider is stronger. Dashed ochre marks the shifts the network
computes from the motion stream, not weights. Hover shows names and weights.
"""
import json, math, sys
from collections import Counter, defaultdict

src, out = sys.argv[1], sys.argv[2]
lead = sys.argv[3] + ": " if len(sys.argv) > 3 else ""
c = json.load(open(src))
N = {n["id"]: n for n in c["neurons"]}
W_IN = defaultdict(dict)        # post -> {pre: w}
W_OUT = defaultdict(dict)       # pre -> {post: w}
for a, b, w, *_ in c["edges"]:
    if w: W_IN[b][a] = w; W_OUT[a][b] = w

bands = sorted({tuple(n["band"]) for n in c["neurons"] if n["role"] == "gated"}, key=lambda b: b[0])
ROW_Y = {"frame": 200, **{("gated", b): 320 + 120 * j for j, b in enumerate(bands)}, "slot": 350 + 120 * len(bands)}   # the receiver rows
W, CX = 1200, 560
R_OUT, R_RING, R_IN = 300, 205, 90
CY = ROW_Y["slot"] + 100 + R_OUT
H = CY + R_OUT + 410
ROW_X0, ROW_DX = 130, 140
DIST_X = 1060
STRIP_Y = H - 355
SURFACE, INK, INK2, MUTED = "#fcfcfb", "#0b0b0b", "#52514e", "#898781"
POS, NEG, SHIFT = "#2a78d6", "#e34948", "#8a6d1f"          # excites, inhibits (validated pair), a computed shift
ROSE_R0, ROSE_S = 7, 12               # a rose's base radius and px per unit of weight
BAR_W, BAR_S = 6, 9                   # a bar's width and px per unit of weight

def polar(r, deg, cx=CX, cy=CY):
    a = math.radians(deg)
    return cx + r * math.sin(a), cy - r * math.cos(a)

# --- where each neuron stands
ring = sorted((n for n in c["neurons"] if n["role"] == "ring"), key=lambda n: n["angle"])
dist = sorted((n for n in c["neurons"] if n["role"] == "distance"), key=lambda n: n["cm"][0])
xy, kind = {}, {}
for n in ring: xy[n["id"]] = polar(R_RING, n["angle"]); kind[n["id"]] = "belief"
for j, n in enumerate(dist):
    xy[n["id"]] = (DIST_X, CY - R_RING + j * (2 * R_RING / max(1, len(dist) - 1))); kind[n["id"]] = "belief"
columns = sorted((n for n in c["neurons"] if n["role"] == "frame"), key=lambda n: (n.get("ladder") != "long", n.get("strength", 0)))
col = {n["channel"]: j for j, n in enumerate(columns)}      # a channel's column
for n in c["neurons"]:
    if n["role"] in ("frame", "slot"): xy[n["id"]] = (ROW_X0 + col[n["channel"]] * ROW_DX, ROW_Y[n["role"]]); kind[n["id"]] = "obs"
    elif n["role"] == "gated": xy[n["id"]] = (ROW_X0 + col[n["channel"]] * ROW_DX, ROW_Y[("gated", tuple(n["band"]))]); kind[n["id"]] = "obs"
for n in c["neurons"]:
    i, role = n["id"], n["role"]
    if role == "corner": xy[i] = polar(R_OUT, n["angle"]); kind[i] = "obs"
    elif role == "steer": xy[i] = polar(R_IN, n["angle"]); kind[i] = "motor"
    elif role == "search": xy[i] = (CX, CY - 24); kind[i] = "motor"
    elif role == "axis": xy[i] = (CX, CY + 24); kind[i] = "motor"
selfs = [n for n in c["neurons"] if n["role"] == "self"]
for j, n in enumerate(selfs): xy[n["id"]] = (90, CY - 60 + j * 60); kind[n["id"]] = "obs"
strip = {"presence": (CX - 250, "obs"), "roam": (CX - 90, "motor"), "near": (CX + 90, "obs"), "request": (CX + 250, "motor")}
for n in c["neurons"]:
    if n["role"] in strip:
        x, k = strip[n["role"]]; xy[n["id"]] = (x, STRIP_Y); kind[n["id"]] = k
missing = [i for i in N if i not in xy]
assert not missing, f"no place for {missing}"

def width(w): return 0.5 + 1.7 * math.sqrt(abs(w))
def sign(w): return ("+" if w > 0 else "−") + f"{abs(w):.2f}"
def level(n): return f'{n["ladder"]} {n["strength"]}' if "ladder" in n else n["id"].replace("IR_", "")

o = []
o.append(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" font-family="-apple-system, Helvetica, Arial, sans-serif">')
o.append(f'<rect width="{W}" height="{H}" fill="{SURFACE}"/>')
o.append(f'''<style>
  .lab {{ font-size: 13px; fill: {INK}; paint-order: stroke; stroke: {SURFACE}; stroke-width: 4px; stroke-linejoin: round; }}
  .small {{ font-size: 12px; fill: {INK2}; }}
  .e {{ fill: none; stroke-linecap: round; }}
  .e:hover {{ stroke-opacity: 1; }}
  .rose {{ fill-opacity: 0.35; stroke-width: 1.2; }}
</style>''')

# guides: the ring's circles, the nose and tail
for r in (R_OUT, R_RING, R_IN):
    o.append(f'<circle cx="{CX}" cy="{CY}" r="{r}" fill="none" stroke="{MUTED}" stroke-opacity="0.25" stroke-dasharray="2 6"/>')
nx, ny = polar(R_OUT + 24, 0); o.append(f'<text x="{nx}" y="{ny}" text-anchor="middle" font-size="12" fill="{MUTED}">nose, 0°</text>')
tx, ty = polar(R_OUT + 22, 180); o.append(f'<text x="{tx}" y="{ty}" text-anchor="middle" font-size="12" fill="{MUTED}">tail, 180°</text>')

# --- the receivers' weights: roses onto the ring, bars onto the distance
def rose(pre, cx, cy):
    ws = [W_OUT[pre].get(n["id"], 0) for n in ring]
    if not any(ws): return ""
    angs = [n["angle"] for n in ring]
    def path(sel):
        pts = [polar(ROSE_R0 + ROSE_S * max(0, sel(w)), a, cx, cy) for w, a in zip(ws, angs)]
        return "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in pts) + " Z"
    hi, lo = max(ws), min(ws)
    tip = f'<title>{pre} → ring: strongest {sign(hi)} at {angs[ws.index(hi)]}°, weakest {sign(lo)} at {angs[ws.index(lo)]}°</title>'
    return (f'<g>{tip}<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{ROSE_R0 + ROSE_S}" fill="none" stroke="{MUTED}" stroke-opacity="0.35" stroke-dasharray="1 3"/>'
            f'<path class="rose" d="{path(lambda w: -w)}" fill="{NEG}" stroke="{NEG}"/>'
            f'<path class="rose" d="{path(lambda w: w)}" fill="{POS}" stroke="{POS}"/></g>')
def bars(pre, cx, cy):
    ws = [W_OUT[pre].get(n["id"], 0) for n in dist]
    if not any(ws): return ""
    x0 = cx - len(ws) * (BAR_W + 1) / 2
    parts = [f'<line x1="{x0:.1f}" y1="{cy}" x2="{x0 + len(ws) * (BAR_W + 1):.1f}" y2="{cy}" stroke="{MUTED}" stroke-width="0.8"/>']
    for j, (w, n) in enumerate(zip(ws, dist)):
        h = BAR_S * w
        parts.append(f'<rect x="{x0 + j * (BAR_W + 1):.1f}" y="{min(cy, cy - h):.1f}" width="{BAR_W}" height="{abs(h):.1f}" fill="{POS if w > 0 else NEG}" fill-opacity="0.7">'
                     f'<title>{pre} → {n["id"]} ({n["cm"][0]}-{n["cm"][1]} cm): {sign(w)}</title></rect>')
    return "".join(parts)
for n in c["neurons"]:
    if kind[n["id"]] != "obs": continue
    x, y = xy[n["id"]]
    o.append(rose(n["id"], x, y))
    if n["role"] == "frame": o.append(bars(n["id"], x, y + 40))

# --- the lines: every edge not drawn as a rose or bar
o.append('<g>')
drawn = Counter()
for a, b, w, *_ in sorted(c["edges"], key=lambda e: abs(e[2])):
    if w == 0 or a == b or kind[a] == "obs" and kind[b] == "belief": continue
    (x1, y1), (x2, y2) = xy[a], xy[b]
    drawn[f"{N[a]['role']} to {N[b]['role']}"] += 1
    o.append(f'<line class="e" x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" stroke="{POS if w > 0 else NEG}" stroke-width="{width(w):.2f}" stroke-opacity="0.22"><title>{a} → {b}: {sign(w)}</title></line>')
o.append('</g>')

# --- the shifts the network computes, not weights
def arc(r, a0, a1, cx=CX, cy=CY):
    (x0, y0), (x1, y1) = polar(r, a0, cx, cy), polar(r, a1, cx, cy)
    return f'M{x0:.1f},{y0:.1f} A{r},{r} 0 0 1 {x1:.1f},{y1:.1f}'
o.append(f'<path class="e" d="{arc(R_RING + 26, 290, 335)}" stroke="{SHIFT}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#arrow)"/>')
lx, ly = polar(R_RING + 40, 312); o.append(f'<text class="lab" x="{lx - 8:.1f}" y="{ly - 10:.1f}" text-anchor="end">yaw: the ring turns against the Bolt\'s turn</text>')
by_axis = {n.get("axis"): xy[n["id"]] for n in selfs}
def dashed(x0, y0, x1, y1, bend=60):
    return f'<path class="e" d="M{x0:.1f},{y0:.1f} C{x0 + bend:.1f},{y0:.1f} {x1 - bend:.1f},{y1:.1f} {x1:.1f},{y1:.1f}" stroke="{SHIFT}" stroke-width="1.5" stroke-dasharray="6 5" stroke-opacity="0.7"/>'
if "turned" in by_axis:
    (x0, y0), (x1, y1) = by_axis["turned"], polar(R_RING + 26, 290); o.append(dashed(x0 + 10, y0, x1, y1))
o.append(f'<path class="e" d="{arc(R_RING + 26, 200, 250)}" stroke="{SHIFT}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#arrow)"/>')
for k, line in enumerate(["parallax: a locator step turns the ring", "by the believed distance"]):
    o.append(f'<text class="lab" x="20" y="{CY + 150 + 16 * k}">{line}</text>')
for axis in ("fwd", "right"):
    if axis in by_axis:
        (x0, y0), (x1, y1) = by_axis[axis], polar(R_RING + 26, 250); o.append(dashed(x0 + 10, y0, x1 - 6, y1 - 2))
o.append(f'<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="{SHIFT}"/></marker></defs>')
if dist:
    band = dist[0]["cm"][1] - dist[0]["cm"][0]
    tau = dist[0].get("tauCm")
    o.append(f'<text class="lab" x="{DIST_X}" y="{CY - R_RING - 36}" text-anchor="middle">distance, {len(dist)} bands of {band} cm</text>')
    o.append(f'<line class="e" x1="{DIST_X + 50}" y1="{CY - R_RING + 30}" x2="{DIST_X + 50}" y2="{CY + R_RING - 30}" stroke="{SHIFT}" stroke-width="2" stroke-dasharray="6 5" marker-end="url(#arrow)" marker-start="url(#arrow)"/>')
    for k, line in enumerate(["a locator step (SELF_FWD, SELF_RIGHT)", "slides the bands along the believed bearing"] + ([f"forgets with {tau} cm of travel"] if tau else [])):
        o.append(f'<text class="small" x="{DIST_X}" y="{CY + R_RING + 34 + 16 * k}" text-anchor="middle">{line}</text>')

# --- nodes and labels
def node(i):
    x, y = xy[i]; k = kind[i]; n = N[i]
    tip = f'<title>{i}: {n["role"]}' + (f', {n["angle"]}°' if n.get("angle") is not None else "") + (f', {n["cm"][0]}-{n["cm"][1]} cm' if "cm" in n else "") + '</title>'
    if k == "obs":
        return f'<rect x="{x-7:.1f}" y="{y-7:.1f}" width="14" height="14" rx="4" fill="{SURFACE}" stroke="{INK}" stroke-width="2">{tip}</rect>'
    if k == "belief":
        return f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="{INK}" stroke="{SURFACE}" stroke-width="2">{tip}</circle>'
    return (f'<circle cx="{x:.1f}" cy="{y:.1f}" r="12" fill="{SURFACE}" stroke="{INK}" stroke-width="2">{tip}</circle>'
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="7" fill="{INK}"/>')
def label(i):
    x, y = xy[i]; n = N[i]; role = n["role"]
    if role == "ring": return ""                                     # the angles are the guides' job
    if role == "distance": return f'<text class="small" x="{x + 16}" y="{y + 4}">{n["cm"][0]}-{n["cm"][1]} cm</text>'
    if role == "frame": return f'<text class="lab" x="{x:.1f}" y="{y - 16:.1f}" text-anchor="middle">{level(n)}</text>'
    if role == "slot": return f'<text class="lab" x="{x:.1f}" y="{y - 68:.1f}" text-anchor="middle">{level(n)}</text>'
    if role == "gated": return ""
    if role == "corner":
        dx, dy = x - CX, y - CY; d = math.hypot(dx, dy)
        lx, ly = x + dx / d * 52, y + dy / d * 52
        return f'<text class="lab" x="{lx:.1f}" y="{ly + 4.5:.1f}" text-anchor="{"start" if dx > 0 else "end"}">{i}</text>'
    if role == "search": return f'<text class="lab" x="{x + 18}" y="{y + 4.5}">{i}</text>'
    if role == "axis": return f'<text class="lab" x="{x}" y="{y + 27}" text-anchor="middle">{i}</text>'
    if role in strip: return f'<text class="lab" x="{x}" y="{y + 32}" text-anchor="middle">{i}</text>'
    if role == "self": return f'<text class="lab" x="{x}" y="{y + 26}" text-anchor="middle">{i}</text><text class="small" x="{x}" y="{y + 40}" text-anchor="middle">{n.get("unit", "")}</text>'
    return f'<text class="lab" x="{x:.1f}" y="{y + 30:.1f}" text-anchor="middle">{i}</text>'
o.append('<g>' + "".join(node(i) for i in N) + '</g>')
o.append('<g>' + "".join(label(i) for i in N) + '</g>')
o.append(f'<text class="small" x="{ROW_X0 - 60}" y="{ROW_Y["frame"] - 40}">a frame heard, by channel: onto the distance by its strength\'s range profile (bars, near to far), and onto the ring by the bearing profile of the believed distance band</text>')
o.append(f'<text class="small" x="{ROW_X0 - 60}" y="{ROW_Y["frame"] - 24}">(a product neuron per band, the receiver times the band\'s share of the distance belief; an empty place: too few frames recorded in that band to say anything):</text>')
for b in bands:
    y = ROW_Y[("gated", b)]
    o.append(f'<text class="lab" x="{ROW_X0 - 60}" y="{y + 4}" text-anchor="end">{"under " + str(b[1]) if b[0] == 0 else (str(b[0]) + " to " + str(b[1]) if b[1] is not None else "over " + str(b[0]))}</text><text class="small" x="{ROW_X0 - 60}" y="{y + 18}" text-anchor="end">cm</text>')
o.append(f'<text class="small" x="{ROW_X0 - 60}" y="{ROW_Y["slot"] - 100}">a slot of the sender\'s schedule gone silent, by channel: onto the ring</text>')
if selfs: o.append(f'<text class="small" x="90" y="{CY - 130}" text-anchor="middle">the Bolt\'s own motion</text><text class="small" x="90" y="{CY - 114}" text-anchor="middle">since the last tick</text>')

# --- title and legend
roles = Counter(kind.values())
o.append(f'<text x="40" y="52" font-size="26" font-weight="600" fill="{INK}">The seeker\'s connectome</text>')
o.append(f'<text x="40" y="78" font-size="14" fill="{INK2}">{lead}{len(N)} neurons, {len(c["edges"])} edges. Nose is up, angles run clockwise. Signals read top to bottom: receivers, belief, motor.</text>')
lx, ly = 40, H - 300
sx = lx + 90
leg = [
    f'<rect x="{lx}" y="{ly}" width="{W - 2 * lx - 380}" height="{272}" rx="8" fill="none" stroke="{MUTED}" stroke-opacity="0.4"/>',
    f'<rect x="{lx + 16}" y="{ly + 16}" width="13" height="13" rx="3" fill="{SURFACE}" stroke="{INK}" stroke-width="1.6"/><text class="small" x="{lx + 40}" y="{ly + 27}">hears: {roles["obs"]} observation neurons: the senses and the Bolt\'s own motion through sensory_map.jsonc, and the frames gated by the believed distance band</text>',
    f'<circle cx="{lx + 22.5}" cy="{ly + 48}" r="6" fill="{INK}"/><text class="small" x="{lx + 40}" y="{ly + 52}">believes: {roles["belief"]} evidence neurons, the ring and the distance; each sums what it is told and its rate is the softmax of its group</text>',
    f'<circle cx="{lx + 22.5}" cy="{ly + 72}" r="7" fill="{SURFACE}" stroke="{INK}" stroke-width="1.6"/><circle cx="{lx + 22.5}" cy="{ly + 72}" r="3.6" fill="{INK}"/><text class="small" x="{lx + 40}" y="{ly + 76}">acts: {roles["motor"]} motor neurons, max(0, bias + input), read by the motor layer</text>',
    f'<text class="small" x="{lx + 150}" y="{ly + 128}">a receiver\'s weights onto the ring, by bearing, nose up: blue excites, red inhibits, the radius the weight;</text>',
    f'<text class="small" x="{lx + 150}" y="{ly + 144}">the dotted circle is a weight of 1, the log of a rate over its mean (e times the mean). Hover for the extremes.</text>',
    f'<text class="small" x="{lx + 150}" y="{ly + 190}">its weights onto the distance bands, near to far, the same scale.</text>',
    f'<line x1="{lx + 16}" y1="{ly + 228}" x2="{lx + 46}" y2="{ly + 228}" stroke="{POS}" stroke-width="3" stroke-linecap="round"/><text class="small" x="{lx + 56}" y="{ly + 232}">excites</text>',
    f'<line x1="{lx + 120}" y1="{ly + 228}" x2="{lx + 150}" y2="{ly + 228}" stroke="{NEG}" stroke-width="3" stroke-linecap="round"/><text class="small" x="{lx + 160}" y="{ly + 232}">inhibits; a wider line is a stronger weight</text>',
    f'<line x1="{lx + 16}" y1="{ly + 254}" x2="{lx + 46}" y2="{ly + 254}" stroke="{SHIFT}" stroke-width="2" stroke-dasharray="6 5"/><text class="small" x="{lx + 56}" y="{ly + 258}">not a weight: a shift the network computes from the motion stream, yaw and locator</text>',
]
o.append("".join(leg))
# the legend's sample rose and bars: the first frame receiver's
sample = next((n for n in c["neurons"] if n["role"] == "frame"), None)
gated = next((n for n in c["neurons"] if n["role"] == "gated" and n.get("channel") == (sample or {}).get("channel")), None)
if sample:
    o.append(f'<text class="small" x="{sx}" y="{ly + 106}" text-anchor="middle">{level(sample)}</text>')
    o.append(rose((gated or sample)["id"], sx, ly + 138)); o.append(bars(sample["id"], sx, ly + 186))
o.append('</svg>')
open(out, "w").write("\n".join(o))
print(f"{len(N)} neurons, {len(c['edges'])} edges: roses and bars for {roles['obs']} receivers, lines {dict(drawn)}")

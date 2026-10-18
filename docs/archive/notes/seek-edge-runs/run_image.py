"""One image per seekEdge run: the floor plan with green's path, the tacks, dashes and blue.
usage: run_image.py <session.jsonl | zip member> <out.svg>; a zip member is given as zip:member."""
import json, math, re, sys, zipfile

def read(path):
    if path.startswith('zip:'):
        z = zipfile.ZipFile('sessions/sessions-2026-10.zip'); return z.read(path[4:]).decode()
    raw = open(path).read()
    return json.loads(raw) if raw.startswith('"') else raw

def run_of(text, seeker='SB-9129'):
    msgs = [json.loads(l) for l in text.splitlines() if l.strip()]
    header, msgs = msgs[0], msgs[1:]
    starts = [i for i, m in enumerate(msgs) if isinstance(m.get('data'), str) and m['data'].startswith('edge start') and m['bolt'] == seeker]
    si = starts[-1]
    end = next((j for j in range(si, len(msgs)) if isinstance(msgs[j].get('data'), str) and 'seekToCollision.out' in msgs[j]['data']), len(msgs) - 1)
    seg = msgs[si:end + 1]; t0 = msgs[si]['t']
    sheet = lambda x, y: (241 - y, 317.5 - x)   # green's locator -> sheet, start 241, 317.5 facing 270
    track = [(round((m['t'] - t0) / 1000, 1),) + sheet(m['data']['sensordata']['locator']['positionX'], m['data']['sensordata']['locator']['positionY'])
             for m in seg if m['bolt'] == seeker and m.get('name') == 'sensordata' and isinstance(m.get('data'), dict) and isinstance(m['data'].get('sensordata'), dict)]
    events = []
    for m in seg:
        if m['bolt'] == seeker and isinstance(m.get('data'), str) and m['data'].startswith('edge {'):
            r = json.loads(m['data'][5:])
            if r['rule'] not in ('heard', 'silent', 'none'):
                events.append({'s': round((m['t'] - t0) / 1000, 1), 'rule': r['rule'], 'xy': sheet(*r['at'])})
    out = next((m['data'] for m in seg if isinstance(m.get('data'), str) and 'seekToCollision.out' in m['data']), '')
    reason = out.split('"reason":"')[1].split('"')[0] if '"reason"' in out else '?'
    start = json.loads(msgs[si]['data'][len('edge start '):])
    # every infrared notify of the seeker, placed at the nearest locator sample
    frames = []
    import bisect
    times = [p[0] for p in track]
    for m in seg:
        if m['bolt'] == seeker and m.get('name') == 'infrared' and isinstance(m.get('data'), dict):
            payload = m['data'].get('msg', {}).get('payload', [])
            if not payload: continue
            level = payload[0]
            if level >= len(start['ladder']): continue
            s_ = (m['t'] - t0) / 1000
            k = min(len(track) - 1, max(0, bisect.bisect_left(times, s_)))
            frames.append({'s': round(s_, 1), 'level': level, 'k': k})
    # the run's start time of day from the session start plus the offset
    from datetime import datetime, timedelta, timezone
    at = datetime.fromisoformat(header['startedAt'].replace('Z', '+00:00')) + timedelta(milliseconds=t0)
    return {'header': header, 'started': at.astimezone().strftime('%Y-%m-%d %H:%M'), 'ladder': start['ladder'], 'seconds': round((seg[-1]['t'] - t0) / 1000), 'reason': reason, 'track': track, 'events': events, 'frames': frames}

def image(run, out):
    plan = open('apps/browser/public/floor-plan.svg').read()
    inner = plan[plan.index('>', plan.index('<svg')) + 1: plan.rindex('</svg>')]
    xs = [p[1] for p in run['track']] + [264]; ys = [p[2] for p in run['track']] + [317.5]
    m = 30
    x0, x1 = min(xs) - m, max(xs) + m; y0, y1 = min(ys) - m - 22, max(ys) + m   # room for the legend at the top
    # a square view, at least 220 cm, so the thumbnail cuts nothing
    w = h = max(220, x1 - x0, y1 - y0)
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    x0, y0 = max(0, min(500 - w, cx - w / 2)), max(0, min(700 - h, cy - h / 2))
    pts = ' '.join(f'{x:.1f},{y:.1f}' for _, x, y in run['track'])
    marks = []
    for e in run['events']:
        x, y = e['xy']
        if e['rule'].startswith('tack'):
            marks.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="1.6" fill="#fff" stroke="#060" stroke-width="0.6"/>')
        elif e['rule'] == 'edge':
            marks.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="2.2" fill="none" stroke="#060" stroke-width="0.8"/>')
        elif e['rule'] == 'dash':
            marks.append(f'<path d="M {x:.1f},{y - 2.6:.1f} L {x + 2.3:.1f},{y + 1.4:.1f} L {x - 2.3:.1f},{y + 1.4:.1f} Z" fill="#e60" stroke="none"/>')
        elif e['rule'] == 'dash end':
            marks.append(f'<rect x="{x - 1.6:.1f}" y="{y - 1.6:.1f}" width="3.2" height="3.2" fill="#e60"/>')
    # time ticks every 10 s along the track, none within 8 cm of the last one
    ticks = []
    nxt, last = 10, (-99, -99)
    for s, x, y in run['track']:
        if s >= nxt:
            if math.hypot(x - last[0], y - last[1]) >= 8:
                ticks.append(f'<text x="{x + 2:.1f}" y="{y - 1.5:.1f}" font-size="4" fill="#063">{int(nxt)}</text>')
                last = (x, y)
            nxt += 10
    # the frames heard: a tick per notify beside the path, offset by level, coloured by strength
    colour = {2: '#c0c', 4: '#e00', 8: '#f90', 16: '#999', 12: '#fc0', 6: '#f60', 32: '#666'}
    fmarks = []
    tr = run['track']
    for f in run['frames']:
        k = f['k']; x, y = tr[k][1], tr[k][2]
        a, b = tr[max(0, k - 3)], tr[min(len(tr) - 1, k + 3)]
        dx, dy = b[1] - a[1], b[2] - a[2]; n = math.hypot(dx, dy) or 1
        nx, ny = -dy / n, dx / n
        off = 2.2 + 1.4 * f['level']
        strength = run['ladder'][f['level']]
        fmarks.append(f'<circle cx="{x + nx * off:.1f}" cy="{y + ny * off:.1f}" r="0.55" fill="{colour.get(strength, "#000")}"/>')
    sx, sy = run['track'][0][1], run['track'][0][2]
    ex, ey = run['track'][-1][1], run['track'][-1][2]
    overlay = f'''
  <g font-family="Helvetica, Arial, sans-serif">
    <circle cx="264" cy="317.5" r="3.65" fill="#06f" fill-opacity="0.9"/>
    <polyline points="{pts}" fill="none" stroke="#0a0" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round" stroke-opacity="0.9"/>
    {''.join(fmarks)}
    {''.join(ticks)}
    {''.join(marks)}
    <circle cx="{sx:.1f}" cy="{sy:.1f}" r="3.65" fill="none" stroke="#0a0" stroke-width="0.8"/>
    <circle cx="{ex:.1f}" cy="{ey:.1f}" r="3.65" fill="#0a0" fill-opacity="0.9"/>
    <g font-size="4.5" fill="#222" transform="translate({x0 + 3:.1f},{y0 + 6:.1f})">
      <text>{run['started']}, {run['seconds']} s, {run['reason']}, ladder {' '.join(str(v) for v in run['ladder'])}</text>
      <text y="6">green: hollow start, filled end, o tack, triangle dash, square dash end, seconds along the path</text>
      <text y="12">frames heard beside the path: {', '.join(f'{v} <tspan fill="{colour.get(v, "#000")}">&#9679;</tspan>' for v in run['ladder'])}</text>
    </g>
  </g>'''
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.1f} {y0:.1f} {w:.1f} {h:.1f}" width="{int(w * 4)}" height="{int(h * 4)}">{inner}{overlay}</svg>'
    svg = svg.replace('<use href="#outer-wall"', '<use href="#outer-wall"')
    open(out, 'w').write(svg)

if __name__ == '__main__':
    src, out = sys.argv[1], sys.argv[2]
    run = run_of(read(src))
    image(run, out)
    print(json.dumps({'started': run['started'], 'seconds': run['seconds'], 'reason': run['reason'], 'samples': len(run['track']), 'events': len(run['events']), 'frames': len(run['frames'])}))

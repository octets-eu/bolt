import m from 'mithril';
import Factory from '../../components/factory';
import { camera } from '../../camera';
import { tracker } from '../../tracking/tracker';
import { TPoint } from '../../tracking/homography';
import { Logger } from '../../components/logger/logger';
import { Bolts } from '../../bolts';
import { Bolt } from '@bolt/core';
import { phone } from '../../phone';
import { MARKS, POSE, toFrame } from '../../tracking/floorcam';

let clicks: TPoint[] = [];

/** The phone picture's zoom about a clicked point (fractions of the frame), and its contrast and brightness. */
const look = { zoom: 1, cx: 0.5, cy: 0.5, contrast: 1, brightness: 1, marks: true };

const BORDER = 8;
window.addEventListener('resize', () => m.redraw());

/**
 * The frame's window around (cx, cy) at `zoom` onto the canvas, filtered. The
 * canvas keeps the frame's aspect and fills what the page leaves: the height
 * under the bars or the width, less a border, whichever binds.
 */
function drawPhone (cv: HTMLCanvasElement) {
  const img = phone.image;
  if (!img) return;
  const w = img.naturalWidth, h = img.naturalHeight;
  if (cv.width !== 1200 || cv.height !== Math.round(1200 * h / w)) { cv.width = 1200; cv.height = Math.round(1200 * h / w); }
  const top = cv.getBoundingClientRect().top;
  const availH = window.innerHeight - top - BORDER, availW = window.innerWidth - 2 * BORDER;
  const shownH = Math.max(100, Math.min(availH, availW * h / w));
  cv.style.height = `${Math.round(shownH)}px`;
  cv.style.width = `${Math.round(shownH * w / h)}px`;
  const sw = w / look.zoom, sh = h / look.zoom;
  const sx = Math.min(w - sw, Math.max(0, look.cx * w - sw / 2)), sy = Math.min(h - sh, Math.max(0, look.cy * h - sh / 2));
  const ctx = cv.getContext('2d')!;
  ctx.filter = `contrast(${look.contrast}) brightness(${look.brightness})`;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  ctx.filter = 'none';
  if (!look.marks) return;
  // the alignment marks (floorcam.ts): where the reference points and the partition's ends lie in the frame when the phone sits right
  const onCanvas = (x: number, y: number): [number, number] => { const f = toFrame(x, y); return [(f.u * w - sx) / sw * cv.width, (f.v * w - sy) / sh * cv.height]; };
  const r = 3.65 * POSE.scale * w / sw * cv.width;   // a Bolt's radius, 3.65 cm, on the canvas
  ctx.strokeStyle = ctx.fillStyle = 'yellow';
  ctx.lineWidth = 1.5;
  ctx.font = '14px monospace';
  for (const [name, p] of Object.entries(MARKS.points)) {
    const [x, y] = onCanvas(p.x, p.y);
    ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 3, y); ctx.lineTo(x + 3, y); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
    ctx.fillText(name, x + r + 4, y + 5);
  }
  for (const [a, b] of MARKS.ends) {
    ctx.beginPath(); ctx.moveTo(...onCanvas(a!.x, a!.y)); ctx.lineTo(...onCanvas(b!.x, b!.y)); ctx.stroke();
  }
}

/** The phone on the partition's ceiling: the forwarder's stream as polled JPEGs, zoomed and filtered to read a matrix. */
const PhoneView = {
  view () {
    const p = phone;
    const slider = (label: string, key: 'zoom' | 'contrast' | 'brightness', min: number, max: number, step: number) => m('label.mono.f6.cfff.ml2', [
      `${label} ${look[key].toFixed(1)} `,
      m('input', { type: 'range', min, max, step, value: look[key], style: { width: '6rem', verticalAlign: 'middle' }, oninput: (e: Event) => { look[key] = Number((e.target as HTMLInputElement).value); } }),
    ]);
    // a click names the frame point the window centres on: the shown window's own position and size in the frame
    const onclick = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement, r = el.getBoundingClientRect();
      const sw = 1 / look.zoom, sx = Math.min(1 - sw, Math.max(0, look.cx - sw / 2)), sy = Math.min(1 - sw, Math.max(0, look.cy - sw / 2));
      look.cx = sx + (e.clientX - r.left) / r.width * sw;
      look.cy = sy + (e.clientY - r.top) / r.height * sw;
    };
    return m('[', [
      m('div.camera.w-100.pa2.bg-777.flex.items-center.flex-wrap', [
        m('span.f3.mono.cfff.ma2', 'Phone'),
        m('button.cmd.br2.ml1', { title: 'Stream the ultrawide camera, id 2: the whole floor', onclick: () => p.on(2).catch(() => undefined) }, 'On wide'),
        m('button.cmd.br2.ml1', { title: 'Stream the main camera, id 0: half the floor at twice the detail', onclick: () => p.on(0).catch(() => undefined) }, 'On main'),
        m('button.cmd.br2.ml1', { onclick: () => p.off().catch(() => undefined) }, 'Off'),
        m('button.cmd.br2.ml1', { onclick: () => p.ask('status').catch(() => undefined) }, 'Status'),
        m('button.cmd.br2.ml1', { class: p.watching ? 'on' : '', title: 'Poll the latest frame twice a second', onclick: () => p.watching ? p.unwatch() : p.watch() }, 'Watch'),
        m('span.mono.f6.cfff.ml2', [p.status, p.watching ? ` · ${p.frames} frames · age ${p.age} ms` : '', p.width ? ` · ${p.width}×${p.height}` : ''].join('')),
        m('span.mono.f6.ml2', { style: { color: '#fc8' } }, p.error),
        slider('zoom', 'zoom', 1, 16, 0.5),
        slider('contrast', 'contrast', 0.5, 4, 0.1),
        slider('brightness', 'brightness', 0.2, 3, 0.1),
        m('button.cmd.br2.ml1', { title: 'Zoom 1, centre, no filter', onclick: () => Object.assign(look, { zoom: 1, cx: 0.5, cy: 0.5, contrast: 1, brightness: 1 }) }, 'Reset'),
        m('button.cmd.br2.ml1', { class: look.marks ? 'on' : '', title: 'Draw where the reference points and the partition\'s ends lie when the phone is aligned', onclick: () => { look.marks = !look.marks; } }, 'Marks'),
        m('span.mono.f6.cfff.ml2', 'click the picture to zoom there'),
      ]),
      p.image
        ? m('div.w-100.bg-eee', { style: { padding: `${BORDER}px` } }, m('canvas.phone', { style: { display: 'block', cursor: 'crosshair' }, onclick,
            oncreate: (v: m.VnodeDOM) => drawPhone(v.dom as HTMLCanvasElement), onupdate: (v: m.VnodeDOM) => drawPhone(v.dom as HTMLCanvasElement) }))
        : null,
    ]);
  },
};

/** Draw calibration and tracks over the video, in video pixels scaled to the element. */
function drawOverlay (cv: HTMLCanvasElement) {
  const video = cv.previousElementSibling as HTMLVideoElement;
  if (!video || !video.videoWidth) return;
  cv.width = video.clientWidth;
  cv.height = video.clientHeight;
  const sx = cv.width / video.videoWidth, sy = cv.height / video.videoHeight;
  const ctx = cv.getContext('2d')!;
  ctx.clearRect(0, 0, cv.width, cv.height);
  ctx.font = '12px monospace';
  const cal = tracker.calibration;
  if (cal) {
    ctx.strokeStyle = 'lime';
    ctx.lineWidth = 2;
    ctx.beginPath();
    cal.points.forEach((p, i) => i ? ctx.lineTo(p[0] * sx, p[1] * sy) : ctx.moveTo(p[0] * sx, p[1] * sy));
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = 'lime';
    cal.points.forEach((p, i) => {
      const tg = cal.targets[i];
      if (tg) ctx.fillText(`${tg[0]},${tg[1]}`, p[0] * sx + 4, p[1] * sy - 4);
    });
  }
  ctx.strokeStyle = 'cyan';
  ctx.fillStyle = 'cyan';
  ctx.lineWidth = 2;
  tracker.pads.forEach((pad, i) => {
    ctx.beginPath();
    pad.corners.forEach((p, k) => k ? ctx.lineTo(p[0] * sx, p[1] * sy) : ctx.moveTo(p[0] * sx, p[1] * sy));
    ctx.closePath();
    ctx.stroke();
    ctx.fillText(`P${i + 1}`, pad.cx * sx + 8, pad.cy * sy - 8);
  });
  ctx.fillStyle = 'yellow';
  clicks.forEach((p, i) => {
    ctx.beginPath();
    ctx.arc(p[0] * sx, p[1] * sy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`#${i + 1}`, p[0] * sx + 7, p[1] * sy + 4);
  });
  for (const b of tracker.blobs) {
    ctx.strokeStyle = b.cls;
    ctx.lineWidth = 1;
    ctx.strokeRect(b.cx * sx - 6, b.cy * sy - 6, 12, 12);
  }
  for (const b of tracker.balls) {
    ctx.strokeStyle = 'magenta';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(b.cx * sx, b.cy * sy, b.r * sx, b.r * sy, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (const t of Object.values(tracker.tracks)) {
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.px[0] * sx, t.px[1] * sy, 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.glow.cx * sx, t.glow.cy * sy);
    ctx.lineTo(t.px[0] * sx, t.px[1] * sy);
    ctx.stroke();
    ctx.fillStyle = 'white';
    const label = t.cm ? `${t.bolt} ${t.cm[0].toFixed(0)},${t.cm[1].toFixed(0)} cm${t.heading !== undefined ? ` ${Math.round(t.heading)}°` : ''}` : `${t.bolt} (no calibration)`;
    ctx.fillText(label, t.px[0] * sx + 18, t.px[1] * sy + 4);
  }
}

/** The camera tab: the phone first, then the retired WHEP stream with its calibration and tracking. */
const CameraView = Factory.create('Camera', {

  view () {
    const c = camera, tr = tracker;
    const onclick = (e: MouseEvent) => {
      const el = e.currentTarget as HTMLElement;
      const video = el.querySelector('video')!;
      const rect = video.getBoundingClientRect();
      const px: TPoint = [(e.clientX - rect.left) / rect.width * video.videoWidth, (e.clientY - rect.top) / rect.height * video.videoHeight];
      if (clicks.length >= 4) clicks = [];
      clicks.push([Math.round(px[0]), Math.round(px[1])]);
      const cm = tr.toCm(px);
      Logger.info({ name: '*' }, `camera click px ${Math.round(px[0])},${Math.round(px[1])}${cm ? ` = ${cm[0].toFixed(1)},${cm[1].toFixed(1)} cm` : ''}`);
    };
    return m('[', [
      m(PhoneView),
      // the retired WHEP stream and its tracker, hidden; the code stays for the experiments that use the tracker
      m('div.camera.w-100.pa2.bg-777.flex.items-center.flex-wrap', { style: { display: 'none' } }, [
        m('span.f3.mono.cfff.ma2', { title: 'The retired WHEP stream of the old overhead camera and its tracker' }, 'WHEP'),
        m('input.mono.f6.ml2.pa1', { style: { width: '22rem' }, value: c.url, onchange: (e: Event) => c.setUrl((e.target as HTMLInputElement).value) }),
        m('button.cmd.br2.ml2', { onclick: () => c.connect() }, c.state === 'connected' ? 'Reconnect' : 'Connect'),
        m('button.cmd.br2.ml1', { disabled: c.state === 'idle', onclick: () => {
          c.disconnect();
          m.redraw();
        } }, 'Disconnect'),
        m('span.mono.f6.cfff.ml2', c.state + (c.width ? ` · ${c.width}×${c.height}` : '') + (c.error ? ` · ${c.error}` : '')),
        m('span.mono.f6.cfff.ml4', 'Track'),
        m('button.cmd.br2.ml1', { disabled: tr.running, onclick: () => tr.start() }, 'Start'),
        m('button.cmd.br2.ml1', { disabled: !tr.running, onclick: () => tr.stop() }, 'Stop'),
        m('select.cmd.br2.ml1', { onchange: (e: Event) => { tr.fps = Number((e.target as HTMLSelectElement).value); } }, [2, 6, 10, 15].map(f => m('option', { value: f, selected: f === tr.fps }, `${f} fps`))),
        m('span.mono.f6.cfff.ml2', tr.running ? `${tr.frames} frames · ${tr.lastFrameMs} ms · ${tr.balls.length} balls · ${tr.blobs.length} blobs` : 'stopped'),
        m('button.cmd.br2.ml1', { disabled: !tr.running, title: 'With the ball out of view: keep the empty scene, a ball is then what differs from it', onclick: () => tr.reference() }, 'Reference'),
        m('button.cmd.br2.ml1', { disabled: !tr.running, title: 'Pads: find the six paper pads on the floor, keep them and calibrate from them (stored)', onclick: () => tr.findPads() }, 'Pads'),
        m('button.cmd.br2.ml1', { disabled: !tr.running, title: 'Ball on pads: start, place the ball on each pad centre for 2 s, then stop; corrects the ball position (stored)', onclick: () => {
          const b = Bolts.map((x: Bolt) => x).find((x: Bolt) => tr.tracks[x.name]);
          if (tr.ballWatching) tr.stopBallOnPads();
          else if (b) tr.watchBallOnPads(b.name);
        } }, tr.ballWatching ? `Ball: stop (${Object.keys(tr.ballOnPads).length} / 6)` : 'Ball on pads'),
        m('button.cmd.br2.ml1', { disabled: !tr.running, title: 'Marker: try every colour and level on each ready Bolt, keep the one the camera separates best (about 40 s per Bolt, stored)', onclick: async () => {
          for (const b of (Bolts.map((x: Bolt) => x) as Bolt[]).filter(x => x.connected && x.status.ready)) await tr.calibrateMarker(b);
        } }, 'Marker'),
        m('span.mono.f6.cfff.ml2', tr.homography ? 'calibrated by the pads' : 'not calibrated: press Pads'),
        m('span.mono.f6.ml2', { style: { color: '#fc8' } }, tr.error),
      ]),
      m('div.w-100.bg-eee.pa2', { style: { display: 'none' } }, [
        m('div.relative', { style: { maxWidth: '1280px' }, onclick }, [
          m('video.w-100', {
            style: { background: '#000', display: 'block' },
            autoplay: true, muted: true, playsinline: true,
            oncreate: (v: m.VnodeDOM) => c.attach(v.dom as HTMLVideoElement),
            onupdate: (v: m.VnodeDOM) => c.attach(v.dom as HTMLVideoElement),
          }),
          m('canvas.absolute', {
            style: { left: 0, top: 0, width: '100%', height: '100%', pointerEvents: 'none' },
            oncreate: (v: m.VnodeDOM) => drawOverlay(v.dom as HTMLCanvasElement),
            onupdate: (v: m.VnodeDOM) => drawOverlay(v.dom as HTMLCanvasElement),
          }),
        ]),
        m('pre.mono.f7.c333.pa2', JSON.stringify(Object.values(tr.tracks).map(t => ({ bolt: t.bolt, cm: t.cm && t.cm.map(v => Math.round(v * 10) / 10), heading: t.heading === undefined ? null : Math.round(t.heading), confidence: t.confidence, glowPixels: t.glow.n })), null, 1)),
      ]),
    ]);
  },

});

export { CameraView };

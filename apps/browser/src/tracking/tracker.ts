import m from 'mithril';
import { PROTOCOL_VERSION, IPositionMessage } from '@bolt/protocol';
import { session } from '../session';
import { Logger } from '../components/logger/logger';
import { camera } from '../camera';
import { Bolts } from '../bolts';
import { Bolt } from '@bolt/core';
import { computeHomography, applyHomography, THomography, TPoint } from './homography';
import { detectMatCorners } from './mat';
import { findColorBlobs, glowIn, classOf, IBlob, TColorClass, IRegion } from './blobs';
import { changes, hasReference, setReference } from './changes';

const KEY = 'bolt.camera.calibration';
/** analysis size for the mat detector; blobs are found at full resolution */
const W = 480, H = 270;
/**
 * Brightest matrix channel for the marker, of 255, until a sweep finds a
 * better one. Depends on the room light: in daylight 80 to 120 gives the most
 * classified pixels, 12 gives none and above 180 the glow clips to white.
 * Measured 2026-09-20.
 */
export const MARKER_LEVEL = 100;
/**
 * Levels a sweep tries when a Bolt's glow is missing. The right one follows
 * the camera's exposure, which follows the room: on 2026-09-23 it was 100 in
 * daylight, 12 at dusk and 200 under the lamp.
 */
const MARKER_LEVELS = [12, 20, 35, 60, 100, 150, 200, 240];
/** Glow missing this long before a sweep, at least this long between sweeps of one Bolt, and the wait per level for the camera. */
const LOST_MS = 2000, SWEEP_PAUSE_MS = 30000, LEVEL_WAIT_MS = 700;
/** The name the tracker holds the matrix under, see `Actuators.holdMatrix`. */
export const MATRIX_OWNER = 'tracker';
/** ball diameter in centimetres */
const BALL_CM = 7.3;
/**
 * The Bolt runs on the mat and left of it; right of the mat's right edge the
 * floor by the window has glints that pass as a glow (up to 366 px against a
 * ball's 45 to 150, 2026-09-23). Detections further right than this many
 * frame pixels are ignored, about a ball's radius so a glow at the edge stays.
 */
const RIGHT_MARGIN = 40;

/**
 * Signed distance of a frame point from the mat's right long edge in frame
 * pixels, positive away from the mat. The right edge is the pair of corners
 * with the largest target x, whatever order they were clicked in.
 */
function rightOfMat (p: TPoint, cal: ICalibration): number {
  const maxX = Math.max(...cal.targets.map(t => t[0]));
  const edge = cal.points.filter((_, i) => cal.targets[i]?.[0] === maxX);
  const [a, b] = edge;
  if (edge.length !== 2 || !a || !b) return 0;
  const cx = cal.points.reduce((s, q) => s + q[0], 0) / cal.points.length, cy = cal.points.reduce((s, q) => s + q[1], 0) / cal.points.length;
  const side = (q: TPoint): number => ((b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0])) / Math.hypot(b[0] - a[0], b[1] - a[1]);
  return side([cx, cy]) < 0 ? side(p) : -side(p);
}

/** Default targets: the mat's corners, origin near-left, x across (61 cm), y away from the camera (182 cm). */
export const MAT_CORNERS: TPoint[] = [[0, 0], [61, 0], [61, 182], [0, 182]];
/**
 * Where the mat's corners lie in the frame, in the order of MAT_CORNERS: near
 * left, near right, far right, far left. The default calibration when the
 * browser has none; the mat is arranged to these points, see research/rig.md.
 * Clicked 2026-09-23 with the camera back on its mount.
 */
export const MAT_POINTS: TPoint[] = [[387, 1002], [1652, 993], [1256, 68], [846, 68]];
/** Compass bearing of the mat's far end, +y, by hand compass; a property of the room, see research/rig.md. */
export const MAT_BEARING = 245;

export interface ICalibration {
  /** four points in frame pixels, in the order of `targets` */
  points: TPoint[];
  /** the same four points in floor centimetres */
  targets: TPoint[];
}

/** A changed region of a ball's size and shape, and the matrix colours seen in its upper half. */
export interface IBall {
  cx: number;
  cy: number;
  /** the radius a ball has at that point of the frame */
  r: number;
  glow: { [c in TColorClass]: number };
}

export interface ITrack {
  bolt: string;
  /** the lit matrix in frame pixels */
  glow: IBlob;
  /** where the ball touches the floor, in frame pixels: one radius below the glow */
  px: TPoint;
  cm?: TPoint | undefined;
  /** direction of travel over the last second, degrees clockwise from +y; only while moving */
  heading?: number | undefined;
  confidence: number;
  t: number;
}

/**
 * Finds Bolts in the camera frame and keeps their positions. With a reference
 * frame of the empty scene a ball is a changed region of a ball's size and
 * shape, and its matrix colour says whose it is; without one, a Bolt is the
 * blob of its lit matrix. Positions are kept
 * in floor centimetres in `tracks`; every fifth of a second a position goes to
 * the session file and the Logger. Runs on a hidden video element, so it keeps
 * going while another route is shown, and follows the camera: it starts when
 * the stream is connected and stops when it is not.
 */
class Tracker {

  public running = false;
  public fps = 6;
  public calibration: ICalibration | null = null;
  public homography: THomography | null = null;
  public tracks: { [bolt: string]: ITrack } = {};
  public blobs: IBlob[] = [];
  public balls: IBall[] = [];
  public lastFrameMs = 0;
  public frames = 0;
  public error = '';
  /** Bolt heading that drives +y; nothing measures it since 2026-09-22, when Debug.calibrateHeading retired. */
  public headingForY: number | undefined;

  private canvas = document.createElement('canvas');
  private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;
  private full = document.createElement('canvas');
  private fullCtx = this.full.getContext('2d', { willReadFrequently: true })!;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private lastPublish: { [bolt: string]: number } = {};
  private history: { [bolt: string]: { t: number, cm: TPoint }[] } = {};

  constructor () {
    this.canvas.width = W;
    this.canvas.height = H;
    try {
      const saved = localStorage.getItem(KEY);
      this.setCalibration(saved ? JSON.parse(saved) : { points: MAT_POINTS, targets: MAT_CORNERS });
    } catch { /* none */ }
    camera.onChange((c) => {
      if (c.state === 'connected') this.start();
      else this.stop();
    });
  }

  // ---- calibration ----

  setCalibration (cal: ICalibration | null) {
    this.calibration = cal;
    this.homography = null;
    if (cal && cal.points.length === 4) {
      try {
        this.homography = computeHomography(cal.points, cal.targets);
        this.error = '';
      }
      catch (error) { this.error = String(error); }
    }
    try { cal ? localStorage.setItem(KEY, JSON.stringify(cal)) : localStorage.removeItem(KEY); } catch { /* private window */ }
    m.redraw();
  }

  /** Calibrate from the mat's own corners, using the known 182 x 61 cm. */
  calibrateFromMat (): boolean {
    const frame = this.grab();
    if (!frame) return false;
    const corners = detectMatCorners(frame.data, W, H, frame.scale);
    if (!corners) {
      this.error = 'mat not found or only partly in the frame; previous calibration kept';
      m.redraw();
      return false;
    }
    this.setCalibration({ points: corners, targets: MAT_CORNERS });
    return true;
  }

  /** Keep the current frame as the empty scene, the ball out of view; from then on a ball is what differs from it. */
  reference (): boolean {
    const frame = this.grabFull();
    const ok = !!frame && setReference(frame.image);
    this.error = ok ? '' : 'no reference: no frame, or OpenCV still loading';
    if (ok) Logger.info({ name: 'Tracker' }, 'reference: empty scene kept');
    m.redraw();
    return ok;
  }

  toCm (px: TPoint): TPoint | undefined {
    return this.homography ? applyHomography(this.homography, px) : undefined;
  }

  // ---- frames ----

  private grab (): { data: Uint8ClampedArray, scale: number } | null {
    const video = camera.video;
    if (!video || !video.videoWidth) return null;
    this.ctx.drawImage(video, 0, 0, W, H);
    return { data: this.ctx.getImageData(0, 0, W, H).data, scale: video.videoWidth / W };
  }

  /** Full-resolution pixels of the part of the frame worth looking at: the calibrated area, or everything. */
  private grabFull (): { image: ImageData, data: Uint8ClampedArray, width: number, height: number, region: IRegion } | null {
    const video = camera.video;
    if (!video || !video.videoWidth) return null;
    const vw = video.videoWidth, vh = video.videoHeight;
    if (this.full.width !== vw || this.full.height !== vh) {
      this.full.width = vw;
      this.full.height = vh;
    }
    this.fullCtx.drawImage(video, 0, 0);
    let region: IRegion = { x0: 0, y0: 0, x1: vw, y1: vh };
    if (this.calibration) {
      const xs = this.calibration.points.map(p => p[0]), ys = this.calibration.points.map(p => p[1]);
      // generous margins: a ball just off the mat is still worth tracking, and the glow sits above the floor point
      region = { x0: Math.max(0, Math.floor(Math.min(...xs)) - 300), y0: Math.max(0, Math.floor(Math.min(...ys)) - 80), x1: Math.min(vw, Math.ceil(Math.max(...xs)) + 300), y1: Math.min(vh, Math.ceil(Math.max(...ys)) + 30) };
    }
    const image = this.fullCtx.getImageData(0, 0, vw, vh);
    return { image, data: image.data, width: vw, height: vh, region };
  }

  /** Pixels per centimetre across the floor at a frame point, from the homography. */
  private pxPerCm (px: TPoint): number {
    const a = this.toCm(px), b = this.toCm([px[0] + 10, px[1]]);
    if (!a || !b) return 0;
    const cm = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return cm > 0 ? 10 / cm : 0;
  }

  /** Bolts whose marker is being lit right now, so a slow ack is not chased by a second write. */
  private lighting = new Set<string>();
  /** Bolts seen ready since their marker was last lit; the reset after a wake clears the matrix, so each new reset lights it again. */
  private readySeen = new Set<string>();
  /** Marker level per Bolt, found by a sweep; MARKER_LEVEL until then. */
  public markerLevel: { [bolt: string]: number } = {};
  /** Session time of the last frame with a glow, and of the last sweep, per Bolt. */
  private seenAt: { [bolt: string]: number } = {};
  private sweptAt: { [bolt: string]: number } = {};
  private sweeping = new Set<string>();

  /**
   * The marker: while the tracker runs it owns every awake Bolt's matrix and
   * lights it whole in the Bolt's colour, scaled so the brightest channel is
   * its marker level, which the camera sees as colour instead of clipped white.
   * Any other matrix write is dropped by core until `stop` releases the hold.
   * A Bolt that is not ready is left alone: a marker written before the reset
   * that follows a wake is gone after it. Debug tooling for the camera; no
   * behavior uses it.
   */
  private async light (b: Bolt): Promise<void> {
    if (this.lighting.has(b.name)) return;
    this.lighting.add(b.name);
    try {
      b.actuators.matrix.hold(MATRIX_OWNER);
      await this.write(b, this.markerLevel[b.name] ?? MARKER_LEVEL);
    } catch (error) {
      // a dark matrix must not stay held: give it back so the next frame tries again
      b.actuators.matrix.release(MATRIX_OWNER);
      throw error;
    } finally { this.lighting.delete(b.name); }
  }

  /** The whole matrix in the Bolt's colour, scaled so the brightest channel is `level`. */
  private async write (b: Bolt, level: number): Promise<void> {
    const [r = 0, g = 0, bl = 0] = Bolts.configFor(b.name).colors.matrix;
    const k = level / Math.max(r, g, bl, 1);
    await b.actuators.matrix.color([Math.round(r * k), Math.round(g * k), Math.round(bl * k)], MATRIX_OWNER);
  }

  /**
   * Find the marker level the camera sees best: light each of MARKER_LEVELS,
   * give the camera a few frames, keep the level with the biggest glow of the
   * Bolt's colour in view. Keeps the old level when none shows.
   */
  private async sweep (b: Bolt): Promise<void> {
    if (this.sweeping.has(b.name)) return;
    this.sweeping.add(b.name);
    this.sweptAt[b.name] = session.now();
    try {
      const cls = classOf(Bolts.configFor(b.name).colors.matrix);
      const glow = (): number => Math.max(0, ...this.blobs.filter(x => x.cls === cls).map(x => x.n), ...this.balls.map(x => x.glow[cls]));
      let best = { level: this.markerLevel[b.name] ?? MARKER_LEVEL, n: 0 };
      for (const level of MARKER_LEVELS) {
        await this.write(b, level);
        await new Promise(r => setTimeout(r, LEVEL_WAIT_MS));
        const n = glow();
        if (n > best.n) best = { level, n };
      }
      this.markerLevel[b.name] = best.level;
      await this.write(b, best.level);
      Logger.info({ name: 'Tracker' }, `marker level ${best.level} for ${b.name}: glow ${best.n} px`);
    } finally { this.sweeping.delete(b.name); }
  }

  /** Give the matrix back and show the resting pattern. */
  private async release (b: Bolt): Promise<void> {
    if (b.status.matrix.owner !== MATRIX_OWNER) return;
    b.actuators.matrix.release(MATRIX_OWNER);
    if (b.connected) await b.communication.restingPattern();
  }

  start () {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      const t0 = performance.now();
      try {
        this.step();
        this.error = '';
      } catch (error) {
        this.error = String(error);
      }
      this.lastFrameMs = Math.round(performance.now() - t0);
      this.timer = setTimeout(loop, Math.max(20, 1000 / this.fps - this.lastFrameMs));
    };
    loop();
  }

  stop () {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.readySeen.clear();
    this.seenAt = {};
    this.sweptAt = {};
    this.tracks = {};
    this.blobs = [];
    this.history = {};
    for (const b of Bolts.map((x: Bolt) => x)) void this.release(b).catch((e: unknown) => {
      this.error = String(e);
    });
    m.redraw();
  }

  /** One frame: one glow per Bolt with a known matrix colour, floor point, position to the log, heading from motion. */
  private step () {
    // the hold heals itself: a reconnect after a page reload comes up with a free matrix and the resting pattern,
    // and a Bolt that just completed its reset gets its marker written again
    for (const b of Bolts.map((x: Bolt) => x)) {
      const ready = b.connected && b.status.ready;
      if (!ready) {
        this.readySeen.delete(b.name);
        continue;
      }
      if (!this.readySeen.has(b.name)) {
        this.readySeen.add(b.name);
        b.actuators.matrix.release(MATRIX_OWNER);
      }
      if (b.status.matrix.owner !== MATRIX_OWNER) void this.light(b).catch((e: unknown) => {
        this.error = String(e);
      });
    }
    const frame = this.grabFull();
    if (!frame) return;
    this.frames++;
    const bolts = Bolts.map((b: { name: string }) => b.name) as string[];
    const classes = Array.from(new Set<TColorClass>(bolts.map(n => classOf(Bolts.configFor(n).colors.matrix))));
    const found = hasReference() && this.homography ? changes(frame.image) : null;
    const { region } = frame;
    // a changed region counts as a ball where it has a ball's size and shape at that point of the frame
    const balls = found && found.flatMap((c): IBall[] => {
      if (c.cx < region.x0 || c.cx > region.x1 || c.cy < region.y0 || c.cy > region.y1) return [];
      if (this.calibration && rightOfMat([c.cx, c.cy], this.calibration) > RIGHT_MARGIN) return [];
      const r = this.pxPerCm([c.cx, c.cy]) * BALL_CM / 2, disc = Math.PI * r * r, aspect = c.w / c.h;
      if (aspect < 0.6 || aspect > 1.6 || c.area < 0.5 * disc || c.area > 1.5 * disc) return [];
      return [{ cx: c.cx, cy: c.cy, r, glow: glowIn(frame.data, frame.width, frame.height, c.cx, c.cy, r) }];
    });
    this.balls = balls ?? [];
    const cal = this.calibration;
    this.blobs = balls ? [] : findColorBlobs(frame.data, frame.width, frame.region, classes).filter(b => !cal || rightOfMat([b.cx, b.cy], cal) <= RIGHT_MARGIN);
    const t = session.now();
    for (const name of bolts) {
      const cls = classOf(Bolts.configFor(name).colors.matrix);
      // a ball's matrix colour says whose it is, and a lone Bolt takes any; as a glow it stands where the matrix
      // shows, 0.45 r above the centre (2026-09-23), so the floor point below comes out as before
      const lit = balls?.filter(b => b.glow[cls] > 0) ?? [];
      const candidates: IBlob[] = balls
        ? (lit.length || bolts.length > 1 ? lit : balls).map(b => ({ cls, cx: b.cx, cy: b.cy - 0.45 * b.r, n: b.glow[cls] })).sort((a, b) => b.n - a.n)
        : this.blobs.filter(b => b.cls === cls);
      // continuity first: the blob nearest the last glow within a ball's width; otherwise the biggest
      const last = this.tracks[name]?.glow;
      const near = last ? candidates.filter(b => Math.hypot(b.cx - last.cx, b.cy - last.cy) < 80).sort((a, b) => Math.hypot(a.cx - last.cx, a.cy - last.cy) - Math.hypot(b.cx - last.cx, b.cy - last.cy))[0] : undefined;
      const glow = near || candidates[0];
      // a glow missing for a while, from a Bolt whose marker the tracker holds, starts a sweep for the level
      this.seenAt[name] ??= t;
      if (glow) this.seenAt[name] = t;
      const bolt = Bolts.find((x: Bolt) => x.name === name);
      if (!glow && bolt?.connected && bolt.status.ready && bolt.status.matrix.owner === MATRIX_OWNER
        && t - (this.seenAt[name] ?? t) > LOST_MS && t - (this.sweptAt[name] ?? -Infinity) > SWEEP_PAUSE_MS) {
        void this.sweep(bolt).catch((e: unknown) => {
          this.error = String(e);
        });
      }
      if (!glow) {
        delete this.tracks[name];
        continue;
      }
      // the glow is the top of the ball; the floor contact is about one radius further down the frame
      const radiusPx = this.pxPerCm([glow.cx, glow.cy]) * BALL_CM / 2;
      const px: TPoint = [glow.cx, glow.cy + radiusPx * 0.9];
      const cm = this.toCm(px);
      let heading: number | undefined;
      if (cm) {
        const h = (this.history[name] ||= []);
        h.push({ t, cm });
        while (h.length && t - (h[0]?.t ?? t) > 1000) h.shift();
        const first = h[0];
        if (first) {
          const d = Math.hypot(cm[0] - first.cm[0], cm[1] - first.cm[1]);
          if (h.length > 2 && d > 4) heading = (Math.atan2(cm[0] - first.cm[0], cm[1] - first.cm[1]) * 180 / Math.PI + 360) % 360;
        }
      }
      const confidence = Math.min(1, glow.n / 40);
      this.tracks[name] = { bolt: name, glow, px, cm, heading, confidence, t };
      if (cm && t - (this.lastPublish[name] || 0) >= 200) {
        this.lastPublish[name] = t;
        const msg: IPositionMessage = { v: PROTOCOL_VERSION, t, bolt: name, kind: 'position', x: Math.round(cm[0] * 10) / 10, y: Math.round(cm[1] * 10) / 10, ...(heading === undefined ? {} : { heading: Math.round(heading) }), confidence: Math.round(confidence * 100) / 100, source: 'camera' };
        session.append(msg);
        Logger.position(msg);
      }
    }
    if (this.frames % 3 === 0) m.redraw();
  }

}

export const tracker = new Tracker();

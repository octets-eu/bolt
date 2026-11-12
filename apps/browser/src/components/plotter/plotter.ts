import m from "mithril";
import Factory   from '../factory';
import { Logger } from '../logger/logger';
import { Bolt, LogEntry } from '@bolt/core';
import { Bolts } from '../../bolts';
import { session } from '../../session';
import { circuit } from '../../matrix-brain/connectome';
import { SHEET, points, turn, mark } from './sheet';


// what the Bolts left on the sheet since the last Reset (sheet.ts): every locator sample, every frame of the
// ladder heard, where its Bolt stood then, and every corner read that hit, with the nose of that moment
let series = [] as { positionX: number, positionY: number, bolt: string, color: string }[];
let frames = [] as { x: number, y: number, bolt: string, color: string, short: boolean }[];
let reads  = [] as { x: number, y: number, bolt: string, color: string, heading: number, heard: boolean[] }[];
let bolts  = {} as any;
// the direction each sweep found, from where its Bolt stood, as a sheet heading; drawn as a ray
let rays   = [] as { x: number, y: number, heading: number, color: string, bolt: string }[];

// the canvas in CSS pixels, from its host's size; drawn in device pixels
let width  = 512;
let height = 512;
let dpr    = 1;

// The plotter owns one canvas for the life of the page. Views only host it,
// so the drawing survives route changes and no view ever holds a stale one.
const cvs = document.createElement('canvas');
cvs.className = 'plotter bg-white';
cvs.style.position = 'absolute';
const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;

// canvas pixels per cm and the sheet's corner on the canvas, set by every render
const meta = { scale: 1, transX: 0, transY: 0 };

// The floor plan, public/floor-plan.svg; the plot's coordinates are the sheet's (sheet.ts).
const plan  = new Image();
plan.src    = '/floor-plan.svg';
plan.onload = () => Plotter.render();

/**
 * The point each Bolt was last reset on, kept in the browser, since the page
 * reloads after every edit of the app; green on lf and blue on rg until then.
 * A Bolt without a point is not plotted and not sent anywhere.
 */
const PLACED_KEY = 'plotter.placed';
const placed: { [name: string]: string } = { 'SB-9129': 'lf', 'SB-11DF': 'rg' };
try { Object.assign(placed, JSON.parse(localStorage.getItem(PLACED_KEY) ?? '{}')); } catch { /* private window */ }
const startOf = (name: string) => points[placed[name] ?? ''];
/** Every placed Bolt's point with its pose, for the session. */
const starts = () => Object.fromEntries(Object.entries(placed).map(([name, point]) => [name, { point, ...points[point] }]));

/** How far a sweep's ray reaches on the sheet, cm. */
const RAY_CM = 200;

/** The ends of the partition's two parts on the sheet, in the middle of their faces: the view always holds both. */
const partitionEnds = [{ positionX: 181, positionY: 317.5 }, { positionX: 324, positionY: 317.5 }];
/** What the view always holds: both partition ends and every reference point. */
const frame = [...partitionEnds, ...Object.values(points).map((p) => ({ positionX: p.x, positionY: p.y }))];

const Plotter = Factory.create('Plotter', {

  name: 'Plotter',

  meta () { return meta },

  /** The canvas fills its host and follows every change of the host's size. The start poses go into the session file, as `starts`, here and at every reset on a point: a script needs them to put both Bolts in one frame. */
  oncreate ( vnode: any ) {
    session.note('*', 'info', `starts ${JSON.stringify(starts())}`);
    vnode.dom.appendChild(cvs);
    vnode.state.resize = new ResizeObserver(([entry]) => {
      if (!entry) return;
      width  = Math.floor(entry.contentRect.width);
      height = Math.floor(entry.contentRect.height);
      dpr    = window.devicePixelRatio || 1;
      cvs.width  = Math.round(width * dpr);
      cvs.height = Math.round(height * dpr);
      cvs.style.width  = `${width}px`;
      cvs.style.height = `${height}px`;
      Plotter.render();
    });
    vnode.state.resize.observe(vnode.dom);
  },

  onremove ( vnode: any ) {
    vnode.state.resize.disconnect();
  },

  view () {
    return m('div.plotter-host', { style: { position: 'relative', overflow: 'hidden' } });
  },

  /** The reference points by name, for the Bolts' reset buttons. */
  points,

  /** The Bolt is placed on `point`, facing its heading: a hard reset zeroes its frame there, and the plot counts from that point on; its track and rays, counted from where it stood before, go. */
  async resetOn (bolt: Bolt, point: string): Promise<void> {
    placed[bolt.name] = point;
    try { localStorage.setItem(PLACED_KEY, JSON.stringify(placed)); } catch { /* private window */ }
    session.note(bolt.name, 'info', `starts ${JSON.stringify(starts())}`);
    await bolt.lifecycle.reset(true, point);
    series = series.filter((p) => p.bolt !== bolt.name);
    frames = frames.filter((p) => p.bolt !== bolt.name);
    reads  = reads.filter((p) => p.bolt !== bolt.name);
    rays = rays.filter((r) => r.bolt !== bolt.name);
    Plotter.render();
  },

  /** A sheet point in the locator frame of the Bolt `name`, or null without a start for it. */
  toLocator (name: string, x: number, y: number): { x: number, y: number } | null {
    const start = startOf(name);
    return start ? turn(start.heading, x - start.x, y - start.y) : null;
  },

  /** Where the Bolt `name` stands at its reset, on the sheet. */
  startOf (name: string): { x: number, y: number } | null {
    const start = startOf(name);
    return start ? { x: start.x, y: start.y } : null;
  },

  /**
   * Every locator sample of an attached Bolt lands on the plan, counted from
   * the Bolt's start; the sample's yaw gives the nose. A reset of the Bolt
   * alone puts its dot on the start, as the Reset button does for all. A
   * sweep's end line with a heading adds a ray from where the Bolt stands.
   * A frame of the ladder heard and a corner read that hit leave their marks
   * where the Bolt stands.
   */
  attach (bolt: Bolt): () => void {
    return bolt.events.on('log', (entry: LogEntry) => {
      const start = startOf(bolt.name);
      if (!start) return;
      const color = Bolts.configFor(bolt.name).colors.plot;
      if (entry.type === 'info' && entry.subtype.startsWith('reset.out')) {
        Plotter.placeBolt(bolt.name, { positionX: start.x, positionY: start.y }, color, start.heading);
        Plotter.render();
        return;
      }
      if (entry.type === 'info' && /^sweep end \{/.test(entry.subtype)) {
        const { heading } = JSON.parse(entry.subtype.slice(entry.subtype.indexOf('{'))) as { heading: number | null };
        const at = bolts[bolt.name]?.locator;
        if (heading === null || !at) return;
        // a locator heading is -yaw; on the sheet the start's heading comes on top
        rays.push({ x: at.positionX, y: at.positionY, heading: start.heading + heading, color, bolt: bolt.name });
        Plotter.render();
        return;
      }
      if (entry.type !== 'event') return;
      const here = bolts[bolt.name], msg = (entry.data as any)?.msg;
      if (entry.subtype === 'infrared' && here) {
        const level = circuit.observation.channels[msg?.payload?.[0]];
        if (!level) return;
        frames.push({ x: here.locator.positionX, y: here.locator.positionY, bolt: bolt.name, color, short: level[0] === 'short' });
        Plotter.render();
        return;
      }
      if (entry.subtype === 'ack' && here && msg?.device === 24 && msg.command === 34 && msg.payload?.length === 4) {   // a corner read's reply
        const heard: boolean[] = msg.payload.map((c: number) => !!circuit.observation.channels[c]);
        if (!heard.some(Boolean)) return;
        reads.push({ x: here.locator.positionX, y: here.locator.positionY, bolt: bolt.name, color, heading: here.heading ?? 0, heard });
        Plotter.render();
        return;
      }
      if (entry.subtype !== 'sensordata') return;
      const locator = (entry.data as any)?.sensordata?.locator;
      const yaw: number | undefined = (entry.data as any)?.sensordata?.angles?.yaw;
      if (!locator) return;
      const p     = turn(start.heading, locator.positionX, locator.positionY);
      const location = { positionX: start.x + p.x, positionY: start.y + p.y, bolt: bolt.name };
      // the sheet's heading, clockwise from its top: the start's plus the measured one, which is -yaw
      Plotter.placeBolt(bolt.name, location, color, yaw === undefined ? null : start.heading - yaw);
      series.push({ ...location, color });
      Plotter.render();
    });
  },

  /** Tracks and markers go; every connected Bolt is drawn on its start point facing its start heading, where a reset puts it by definition. */
  reset () {

    Logger.info(this, 'Reset');
    series = [];
    frames = [];
    reads  = [];
    bolts  = {};
    rays   = [];
    Bolts.forEach((bolt: Bolt) => {
      const start = startOf(bolt.name);
      if (bolt.connected && start) Plotter.placeBolt(bolt.name, { positionX: start.x, positionY: start.y }, Bolts.configFor(bolt.name).colors.plot, start.heading);
    });
    Plotter.render();

  },

  /** The marks of sheet.ts: the samples, the frames heard over them, the reads that hit on top. */
  plotData (ctx: CanvasRenderingContext2D, meta: any) {
    const px = 1 / meta.scale;
    series.forEach((p) => mark.position(ctx, p.positionX, p.positionY, p.color, px));
    frames.forEach((f) => mark.frame(ctx, f.x, f.y, f.color, f.short, px));
    reads.forEach((r) => mark.read(ctx, r.x, r.y, r.heading, r.heard, r.color, px));
  },

  /** Every Bolt where it stands, with its nose. */
  plotBolts (ctx: CanvasRenderingContext2D, meta: any) {
    Object.values(bolts).forEach(({ locator, color, heading }: any) => mark.bolt(ctx, locator.positionX, locator.positionY, heading, color, 1 / meta.scale));
  },

  /** A thin line of `RAY_CM` from where a sweep stood, the way it decided. */
  plotRays (ctx: CanvasRenderingContext2D, meta: any) {
    rays.forEach(({ x, y, heading, color }) => {
      const a = heading * Math.PI / 180;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.sin(a) * RAY_CM, y - Math.cos(a) * RAY_CM);
      ctx.lineWidth = 1 / meta.scale;
      ctx.strokeStyle = color;
      ctx.stroke();
    });
  },

  placeBolt (name: string, locator: any, color: string, heading: number | null = null) {
    bolts[name] = { locator, color, heading };
  },


  render () {

    // every sample since the last Reset
    const data = series;

    // auto zoom: the samples, both partition ends and the reference points are on the canvas, a tenth of their extent free on every side (chosen)
    const xs = [...frame, ...data].map((p: any) => p.positionX);
    const ys = [...frame, ...data].map((p: any) => p.positionY);
    const minx = Math.min(...xs), maxx = Math.max(...xs), miny = Math.min(...ys), maxy = Math.max(...ys);
    meta.scale  = Math.min(width / (maxx - minx), height / (maxy - miny)) / 1.2;
    meta.transX = width  / 2 - (minx + maxx) / 2 * meta.scale;
    meta.transY = height / 2 - (miny + maxy) / 2 * meta.scale;

    const t0 = Date.now();

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, width, height);

    ctx.translate(meta.transX, meta.transY);
    ctx.scale(meta.scale, meta.scale);

    if (plan.complete && plan.naturalWidth) ctx.drawImage(plan, 0, 0, SHEET.width, SHEET.height);
    Plotter.plotData(ctx, meta);
    Plotter.plotRays(ctx, meta);
    Plotter.plotBolts(ctx, meta);

    Date.now() - t0 > 10 && console.log('Plotter.render', series.length, 'points', 'msecs', Date.now() - t0 );

  },

});


export { Plotter };

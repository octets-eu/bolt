import m from "mithril";
import Factory   from '../factory';
import { Logger } from '../logger/logger';
import { Bolt, LogEntry } from '@bolt/core';
import { Bolts } from '../../bolts';


let series = [] as any;
let marker = [] as any;
let bolts  = {} as any;
let rolling = false;

// the canvas in CSS pixels, from its host's size; drawn in device pixels
let width  = 512;
let height = 512;
let dpr    = 1;

// The plotter owns one canvas for the life of the page. Views only host it,
// so the drawing survives route changes and no view ever holds a stale one.
const cvs = document.createElement('canvas');
cvs.className = 'plotter bg-white';
cvs.style.position = 'absolute';
cvs.addEventListener('click', (e) => Plotter.onClick(e));
const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;

// canvas pixels per cm and the sheet's corner on the canvas, set by every render
const meta = { scale: 1, transX: 0, transY: 0 };

// The floor plan, public/floor-plan.svg: a sheet of 500 x 700 cm, origin upper
// left, y down. The plot's coordinates are the sheet's.
const SHEET = { width: 500, height: 700 };
const plan  = new Image();
plan.src    = '/floor-plan.svg';
plan.onload = () => Plotter.render();

/**
 * Where each Bolt stands at its reset, on the sheet in cm, and the heading it
 * faces there, clockwise from the sheet's top; see the plan's header. A Bolt
 * without a start is not plotted and not sent anywhere.
 */
const starts: { [name: string]: { x: number, y: number, heading: number } } = {
  'SB-9129': { x: 241, y: 317.5, heading: 270 },   // green, faces the left partition end
  'SB-11DF': { x: 264, y: 317.5, heading:  90 },   // blue, faces the right partition end
};

/** The ends of the partition's two parts on the sheet, in the middle of their faces: the view always holds both. */
const partitionEnds = [{ positionX: 181, positionY: 317.5 }, { positionX: 324, positionY: 317.5 }];

/**
 * A locator offset as a sheet offset, for a Bolt that faced `heading` at its
 * reset, and a sheet offset as a locator offset: the same turn both ways,
 * since it holds the mirror between the locator's y to the front and the
 * sheet's y down.
 */
function turn (heading: number, x: number, y: number) {
  const c = Math.cos(heading * Math.PI / 180), s = Math.sin(heading * Math.PI / 180);
  return { x: x * c + y * s, y: x * s - y * c };
}


const plot = {

  strokeRect (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    const s2 = size/2;
    ctx.strokeRect(cx - s2, cy -s2, size, size);
  },

  fillRect (ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number) {
    const s2 = size/2;
    ctx.fillRect(cx - s2, cy -s2, size, size);
  },

  circle(ctx: any, x: number, y: number, radius: number, fill: string, stroke?: string) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
    ctx.fillStyle = fill;
    ctx.lineWidth = 1;
    ctx.strokeStyle = stroke;
    fill && ctx.fill();
    stroke && ctx.stroke();
  },

}


const Plotter = Factory.create('Plotter', {

  name: 'Plotter',

  meta () { return meta },

  /** The canvas fills its host and follows every change of the host's size. */
  oncreate ( vnode: any ) {
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

  onClick (event: MouseEvent) {

    const rect = cvs.getBoundingClientRect();
    const x    = ( event.x - rect.left -  meta.transX ) / meta.scale ;
    const y    = ( event.y - rect.top  -  meta.transY ) / meta.scale ;

    Plotter.render({positionX: x, positionY: y, stroke: 'red', fill: 'red'});

    Logger.info(Plotter, `Click:  x: ${ x }, y: ${ y }`);

    // one roll at a time; SPACE ends it, then the next click counts
    if (rolling) return;
    const rolls = Bolts.map((bolt: Bolt) => {
      const start = starts[bolt.name];
      return bolt.connected && start && bolt.navigation.rollToPoint(turn(start.heading, x - start.x, y - start.y));
    });
    rolling = true;
    Promise.all(rolls).finally(() => { rolling = false; });

  },


  /** Every locator sample of an attached Bolt lands on the plan, counted from the Bolt's start. */
  attach (bolt: Bolt): () => void {
    return bolt.events.on('log', (entry: LogEntry) => {
      if (entry.type !== 'event' || entry.subtype !== 'sensordata') return;
      const locator = (entry.data as any)?.sensordata?.locator;
      const start   = starts[bolt.name];
      if (!locator || !start) return;
      const color = Bolts.configFor(bolt.name).colors.plot;
      const p     = turn(start.heading, locator.positionX, locator.positionY);
      const location = { positionX: start.x + p.x, positionY: start.y + p.y };
      Plotter.placeBolt(bolt.name, location, color);
      Plotter.render(location, color);
    });
  },

  reset () {

    Logger.info(this, 'Reset');
    series = [];
    marker = [];
    Plotter.render();

  },

  calculateStepSize(range: number, targetSteps: number){

    // calculate an initial guess at step size
      const tempStep = range/targetSteps;

      // get the magnitude of the step size
      const mag = Math.floor(Math.log10(tempStep));
      const magPow = Math.pow(10, mag);

      // calculate most significant digit of the new step size
      let magMsd = ~~(tempStep/magPow + 0.5);

      // promote the MSD to either 1, 2, or 5
      if (magMsd > 5.0)
          magMsd = 10.0;
      else if (magMsd > 2.0)
          magMsd = 5.0;
      else if (magMsd > 1.0)
          magMsd = 2.0;

      return magMsd * magPow;
  },

  plotData (ctx: CanvasRenderingContext2D, meta: any, data: any) {

    data.forEach( (point:any) => {

      ctx.strokeStyle = point.stroke;
      ctx.fillStyle   = point.fill;
      const x = point.positionX;
      const y = point.positionY;
      plot.fillRect(ctx, x, y, 2 / meta.scale);
      plot.strokeRect(ctx, x, y, 2 / meta.scale);

    });

  },

  plotBolts (ctx: CanvasRenderingContext2D, meta: any) {

    Object.keys(bolts).forEach( key => {
      const loc = bolts[key].locator;
      const col = bolts[key].color;
      plot.circle(ctx, loc.positionX, loc.positionY, 8 / meta.scale, col);
    })

  },

  plotMarker (ctx: CanvasRenderingContext2D, meta: any) {
    marker.forEach( ( point: any ) => {
      plot.circle(ctx, point.x, point.y, 3 / meta.scale, marker.fill || '#F00');
    })
  },

  placeBolt (name: string, locator: any, color: string) {
    bolts[name] = { locator, color };
  },


  render ( location: any, stroke: string, fill: string ) {

    if (location) {
      location.stroke = location.stroke || stroke || 'pink';
      location.fill   = location.fill   || fill   || 'white';
      series.push(location);
    }

    const data = series.slice(-1000);

    // auto zoom: the points and both partition ends are on the canvas, a tenth of their extent free on every side (chosen)
    const xs = [...partitionEnds, ...data].map((p: any) => p.positionX);
    const ys = [...partitionEnds, ...data].map((p: any) => p.positionY);
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
    Plotter.plotMarker(ctx, meta);
    Plotter.plotData(ctx, meta, data);
    Plotter.plotBolts(ctx, meta);

    Date.now() - t0 > 10 && console.log('Plotter.render', series.length, 'points', 'msecs', Date.now() - t0 );

  },

});


export { Plotter };

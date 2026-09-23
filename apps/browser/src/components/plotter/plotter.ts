import m from "mithril";
import Factory   from '../factory';
import { Logger } from '../logger/logger';
import { Bolt, LogEntry } from '@bolt/core';
import { Bolts } from '../../bolts';


let series = [] as any;
let marker = [] as any;
let bolts  = {} as any;
let rolling = false;

const size = 512;

// The plotter owns one canvas for the life of the page. Views only host it,
// so the drawing survives route changes and no view ever holds a stale one.
const cvs = document.createElement('canvas');
cvs.className = 'plotter bg-white';
cvs.width  = size;
cvs.height = size;
cvs.addEventListener('click', (e) => Plotter.onClick(e));
const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;

const meta = { } as any;

function initMeta () {
  Object.assign(meta, {
    length:   0,
    cx:       0,         cy:      0,
    max:      0,         min:    +Infinity,
    maxx:     0,         maxy:    0,
    miny:    +Infinity,  minx:   +Infinity,
    scale:    1,         transX:  size/2,          transY: size/2,
    axismax:  200,
  });
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

  strokeLine (ctx: any, x1: number, y1: number, x2: number, y2: number) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
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

  oncreate ( vnode: any ) {
    vnode.dom.appendChild(cvs);
  },

  view () {
    return m('div.plotter-host');
  },

  onClick (event: MouseEvent) {

    const rect = cvs.getBoundingClientRect();
    const x    = ( event.x - rect.left -  meta.transX ) / meta.scale ;
    const y    = ( event.y - rect.top  -  meta.transY ) / meta.scale ;

    Plotter.render({positionX: x, positionY: y, stroke: 'red', fill: 'red'});

    Logger.info(Plotter, `Click:  x: ${ x }, y: ${ y }`);

    // one roll at a time; SPACE ends it, then the next click counts
    if (rolling) return;
    const rolls = Bolts.map((bolt: Bolt) => bolt.connected && bolt.navigation.rollToPoint({ x, y }).catch((e) => bolt.log('warn', String(e))));
    rolling = true;
    Promise.all(rolls).finally(() => { rolling = false; });

  },


  /** Every locator sample of an attached Bolt lands on the plot. */
  attach (bolt: Bolt): () => void {
    return bolt.events.on('log', (entry: LogEntry) => {
      if (entry.type !== 'event' || entry.subtype !== 'sensordata') return;
      const locator = (entry.data as any)?.sensordata?.locator;
      if (!locator) return;
      const color = Bolts.configFor(bolt.name).colors.plot;
      Plotter.placeBolt(bolt.name, locator, color);
      Plotter.render({ positionX: locator.positionX, positionY: locator.positionY }, color);
    });
  },

  reset () {

    Logger.info(this, 'Reset');
    series = [];
    marker = [];
    initMeta();
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

  plotDecoration (ctx: CanvasRenderingContext2D, meta: any) {

    const scale    = meta.scale;
    // the context is scaled to cm, so the font is fractional cm; rounding it made it 0
    const fontSize = 12 / scale;
    ctx.font       = `normal ${fontSize}px monospace`;

    const offset = 1.05;
    const offmax = (n: number) => n > 0 ? n * offset : n / offset;
    const offmin = (n: number) => n > 0 ? n / offset : n * offset;

    // plot data enclosing

    ctx.lineWidth = 0.5 / scale;
    ctx.setLineDash([5 / scale, 5 / scale]);

    // as rect
    const rx0 = offmin(meta.minx), ry0 = offmin(meta.miny), rx1 = offmax(meta.maxx), ry1 = offmax(meta.maxy);
    ctx.strokeStyle = '#ddd'
    ctx.fillStyle = '#fff';
    ctx.fillRect(rx0, ry0, rx1 - rx0, ry1 - ry0);

    // its size in cm along two edges, and the corner coordinates
    ctx.setLineDash([]);
    ctx.fillStyle = '#999';
    ctx.textAlign = 'center';
    ctx.fillText(`${(meta.maxx - meta.minx).toFixed(0)} cm`, (rx0 + rx1) / 2, ry1 + fontSize * 1.2);
    ctx.save();
    ctx.translate(rx0 - fontSize * 0.4, (ry0 + ry1) / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(`${(meta.maxy - meta.miny).toFixed(0)} cm`, 0, 0);
    ctx.restore();
    ctx.textAlign = 'left';
    ctx.fillText(`${meta.minx.toFixed(0)},${meta.miny.toFixed(0)}`, rx0 + 3 / scale, ry0 - 3 / scale);
    ctx.textAlign = 'right';
    ctx.fillText(`${meta.maxx.toFixed(0)},${meta.maxy.toFixed(0)}`, rx1 - 3 / scale, ry1 + fontSize);
    ctx.setLineDash([5 / scale, 5 / scale]);


    // as circle from origin
    ctx.lineWidth = 0.2 / scale;
    ctx.beginPath();
    ctx.arc(0, 0, meta.axismax, 0, 2 * Math.PI, false);
    ctx.strokeStyle = '#800';
    ctx.stroke();

    // ctx.fillStyle = '#888';
    // ctx.textAlign = 'right';
    // ctx.fillText( `${imax},${imax}`, imax -4/scale, imax -4/scale );


    // plot data min/max point
    // ctx.strokeStyle = '#0FF';
    // ctx.fillStyle   = '#0FF';
    // plot.fillRect(ctx, meta.minx, meta.miny, 6 / meta.scale);
    // plot.fillRect(ctx, meta.maxx, meta.maxy, 6 / meta.scale);

    // plot data center
    // ctx.strokeStyle = '#00F'
    // ctx.fillStyle   = '#00F';
    // plot.fillRect(  ctx, meta.cx, meta.cy, 4 / meta.scale);
    // plot.strokeRect(ctx, meta.cx, meta.cy, 4 / meta.scale);


    ctx.setLineDash([]);

    // annotate origin
    ctx.fillStyle = '#888';
    ctx.textAlign = 'left';
    ctx.fillText('0,0', 8 / scale, -8 / scale );

    // plot axis
    ctx.strokeStyle = '#888'
    ctx.lineWidth = 0.8 / scale;
    plot.strokeLine(ctx, 0, 0,  meta.axismax, 0);
    plot.strokeLine(ctx, 0, 0, 0,  meta.axismax);
    plot.strokeLine(ctx, 0, 0, -meta.axismax, 0);
    plot.strokeLine(ctx, 0, 0, 0, -meta.axismax);

    // strike light square around origin
    ctx.strokeStyle = '#ddd'
    plot.strokeRect(ctx, 0, 0, 512);
    plot.strokeRect(ctx, 0, 0, 256);
    plot.strokeRect(ctx, 0, 0, 100);
    plot.strokeRect(ctx, 0, 0, 50);
    plot.strokeRect(ctx, 0, 0, 10);
    plot.strokeRect(ctx, 0, 0, 5);
    plot.strokeRect(ctx, 0, 0, 1);
    plot.strokeRect(ctx, 0, 0, 0.5);
    plot.strokeRect(ctx, 0, 0, 0.1);


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

  analyzeData (data: any) {

    meta.length = data.length;

    if (meta.length > 1) {

      meta.maxx  = Math.max.apply(Math, data.map( (loc: any) => loc.positionX ));
      meta.maxy  = Math.max.apply(Math, data.map( (loc: any) => loc.positionY ));
      meta.minx  = Math.min.apply(Math, data.map( (loc: any) => loc.positionX ));
      meta.miny  = Math.min.apply(Math, data.map( (loc: any) => loc.positionY ));

      meta.cx = (meta.maxx + meta.minx) / 2;
      meta.cy = (meta.maxy + meta.miny) / 2;

      meta.max   = Math.max(meta.maxx, meta.maxy, meta.miny, meta.miny);
      meta.min   = Math.min(meta.maxx, meta.maxy, meta.miny, meta.miny);

      meta.axismax = Math.max(Math.hypot(meta.minx, meta.miny), Math.hypot(meta.maxx, meta.maxy));

      meta.scale  = size / (meta.max - meta.min) / 1.05 / 2;
      meta.transX = (size/2 - meta.cx * meta.scale );
      meta.transY = (size/2 - meta.cy * meta.scale );

    }

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
    Plotter.analyzeData(data);

    const t0 = Date.now();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#ddd';
    ctx.fillRect(0, 0, size, size);

    ctx.translate(meta.transX, meta.transY);
    ctx.scale(meta.scale, meta.scale);

    Plotter.plotDecoration(ctx, meta);
    Plotter.plotMarker(ctx, meta);
    Plotter.plotData(ctx, meta, data);
    Plotter.plotBolts(ctx, meta);

    Date.now() - t0 > 10 && console.log('Plotter.render', series.length, 'points', 'msecs', Date.now() - t0 );

  },

});


export { Plotter };

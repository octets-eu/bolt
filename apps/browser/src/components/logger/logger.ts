import m from "mithril";

import './logger.scss';

import Factory from '../factory';
import { Bolt, LogEntry } from '@bolt/core';
import { IPositionMessage } from '@bolt/protocol';
import { session } from '../../session';

/** Lines on screen, newest first, at most `MAX`. */
const log = [] as ILogline[];
const MAX = 2000;
/** Lines not on screen yet, oldest first; `flush` moves them every 250 ms. */
const pending = [] as ILogline[];
let timer: ReturnType<typeof setTimeout> | null = null;
/** The table body while the Logger is mounted. Its rows are written here directly, mithril never diffs them. */
let body: HTMLTableSectionElement | null = null;

function time (t: number) {
  const s = t / 1000;
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`;
}

function reduceSensorData (data: any): string {
  if (typeof data === 'string') return data;
  const loc = data?.locator;
  if (!loc) return JSON.stringify(data).slice(0, 70);
  return `x:${loc.positionX.toPrecision(3)}, y:${loc.positionY.toPrecision(3)}, vx:${loc.velocityX.toPrecision(3)}, vy:${loc.velocityY.toPrecision(3)}`.slice(0, 70);
}

const cell = (cls: string, v: any) => m('td' + cls, v === undefined || v === null || v === '' ? ' ' : v);

/** All nine columns, or only T, Bolt, Type and Name; toggled by the Logger label, wide after every reload. */
let wide = true;
const NARROW = 4;

/** A cell over the remaining `span` columns, or one column when narrow. */
const rest = (cls: string, span: number, v: any) => m('td' + cls, { colspan: wide ? span : 1 }, v);

const formatter = {
  'action': ({ t, bolt, subtype, data }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Action'), cell('.subtype', subtype),
    cell('.id', data.id), cell('.device', data.device), cell('.command', data.command), cell('.target', data.target || ' '),
    cell('.payload', (data.payload || []).join(' ')),
  ],
  'event': ({ t, bolt, subtype, data }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Event'), cell('.subtype', subtype),
    cell('.id', data?.msg?.id), cell('.device', data?.msg?.device), cell('.command', data?.msg?.command), cell('.target', data?.msg?.target),
    cell('.payload', data?.msg?.payload ? data.msg.payload.join(' ') : (typeof data === 'string' ? data : JSON.stringify(data?.sensordata ?? data ?? ''))),
  ],
  'key': ({ t, bolt, subtype }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Key'), rest('.subtype', 6, subtype),
  ],
  'sensor': ({ t, bolt, subtype, data }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Sensor'), cell('.subtype', subtype),
    rest('.sensor', 5, reduceSensorData(data?.sensordata)),
  ],
  'info': ({ t, bolt, subtype }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Info'), rest('.subtype', 6, subtype),
  ],
  'warn': ({ t, bolt, subtype }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Warn'), rest('.subtype', 6, subtype),
  ],
  'fatal': ({ t, bolt, subtype }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Fatal'), rest('.subtype', 6, subtype),
  ],
  'camera': ({ t, bolt, subtype, data }: ILogline) => [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Camera'), cell('.subtype', subtype),
    rest('.sensor', 5, `x:${data.x.toFixed(1)}, y:${data.y.toFixed(1)}${data.heading !== undefined ? `, h:${Math.round(data.heading)}` : ''}`),
  ],
} as { [key: string]: (line: ILogline) => m.Vnode[] };

export interface ILogline {
  /** session-relative ms */
  t: number,
  bolt: string,
  type: string,
  subtype: string,
  data?: any,
}

/** Turn a Bolt's log entry into a log line. */
function lineFor (bolt: string, entry: LogEntry): ILogline {
  const base = { t: session.now(), bolt };
  const data: any = entry.data;
  switch (entry.type) {
    case 'info':   return { ...base, type: 'info',   subtype: entry.subtype };
    case 'warn':   return { ...base, type: 'warn',   subtype: entry.subtype };
    case 'fatal':  return { ...base, type: 'fatal',  subtype: entry.subtype };
    case 'action': return { ...base, type: 'action', subtype: data?.name, data };
  }
  if (entry.subtype.startsWith('key')) return { ...base, type: 'key', subtype: entry.subtype };
  if (data && data.sensordata !== undefined && !data.msg) return { ...base, type: 'sensor', subtype: entry.subtype, data };
  return { ...base, type: 'event', subtype: entry.subtype, data };
}

/** One table row as DOM, built once; the cells come from the formatters. */
function rowFor (line: ILogline): HTMLTableRowElement {
  const tr = document.createElement('tr');
  tr.className = [line.bolt, line.type, line.subtype].join(' ');
  const cells = (formatter[line.type] ?? formatter.event!)(line);
  m.render(tr, wide ? cells : cells.slice(0, NARROW));
  return tr;
}

/**
 * The pending lines onto the screen, in one step. Drawn through mithril the
 * unkeyed rows were all rewritten for every new line, on every sensor
 * sample: with 2000 rows the page stalled up to 3 s and a command took 130
 * instead of 30 ms (2026-10-03).
 */
function flush (): void {
  timer = null;
  const lines = pending.splice(0);
  for (const line of lines) log.unshift(line);
  log.length = Math.min(log.length, MAX);
  if (!body) return;
  const rows = document.createDocumentFragment();
  for (const line of lines.reverse()) rows.append(rowFor(line));
  body.prepend(rows);
  while (body.rows.length > MAX) body.deleteRow(-1);
}

/** Every line of `log` anew, e.g. after mounting or when the columns change. */
function fill (): void {
  body?.replaceChildren(...log.map(rowFor));
}

const Logger = Factory.create('Logger', {

  name: 'Logger',

  push (line: ILogline) {
    pending.push(line);
    timer ??= setTimeout(flush, 250);
  },

  /** A Bolt's log entries become lines. */
  attach (bolt: Bolt): () => void {
    return bolt.events.on('log', (entry: LogEntry) => {
      Logger.push(lineFor(bolt.name, entry));
    });
  },

  /** A note from a view or a script, e.g. the Plotter's click coordinates; also goes into the session file. */
  info (source: { name: string }, info: string) {
    const msg = session.note(source.name, 'info', info);
    Logger.push({ t: msg.t, bolt: msg.bolt, type: 'info', subtype: info } as ILogline);
    m.redraw();
  },

  /** The error that ends the session, see fatal.ts. */
  fatal (source: { name: string }, error: string) {
    const msg = session.note(source.name, 'fatal', error);
    Logger.push({ t: msg.t, bolt: msg.bolt, type: 'fatal', subtype: error } as ILogline);
    m.redraw();
  },

  /** A camera position, already in the session file. */
  position (msg: IPositionMessage) {
    Logger.push({ t: msg.t, bolt: msg.bolt, type: msg.source || 'camera', subtype: 'position', data: msg } as ILogline);
  },

  /** Empties the lines on screen; the session file keeps everything. */
  clear () {
    log.length = 0;
    pending.length = 0;
    body?.replaceChildren();
  },

  reset () {
    Logger.clear();
    Logger.info(this, 'Reset');
  },

  toggleWide () {
    wide = !wide;
    fill();
  },

  view () {
    const head = [
      m('td', 'T'), m('td', 'Bolt'), m('td', 'Type'), m('td', 'Name'),
      m('td.tr', 'ID'), m('td.tr', 'D'), m('td.tr', 'C'), m('td.tr', 'T'), m('td.tr', 'Payload'),
    ];
    return m('div.logger' + (wide ? '' : '.narrow'), { style: { overflowY: 'scroll' } },
      m('table', [
        m('thead', m('tr', wide ? head : head.slice(0, NARROW))),
        m('tbody', {
          oncreate: (vnode: m.VnodeDOM) => { body = vnode.dom as HTMLTableSectionElement; fill(); },
          onremove: () => { body = null; },
          onbeforeupdate: () => false,
        }),
      ])
    );
  },

});

export { Logger };

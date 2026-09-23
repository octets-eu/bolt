import m from "mithril";

import './logger.scss';

import Factory from '../factory';
import { Bolt, LogEntry } from '@bolt/core';
import { IPositionMessage } from '@bolt/protocol';
import { session } from '../../session';

const log = [] as ILogline[];

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

const formatter = {
  'action': ({ t, bolt, type, subtype, data }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Action'), cell('.subtype', subtype),
    cell('.id', data.id), cell('.device', data.device), cell('.command', data.command), cell('.target', data.target || ' '),
    cell('.payload', (data.payload || []).join(' ')),
  ]),
  'event': ({ t, bolt, type, subtype, data }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Event'), cell('.subtype', subtype),
    cell('.id', data?.msg?.id), cell('.device', data?.msg?.device), cell('.command', data?.msg?.command), cell('.target', data?.msg?.target),
    cell('.payload', data?.msg?.payload ? data.msg.payload.join(' ') : (typeof data === 'string' ? data : JSON.stringify(data?.sensordata ?? data ?? ''))),
  ]),
  'key': ({ t, bolt, type, subtype }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Key'), m('td.subtype', { colspan: 6 }, subtype),
  ]),
  'sensor': ({ t, bolt, type, subtype, data }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Sensor'), cell('.subtype', subtype),
    m('td.sensor', { colspan: 5 }, reduceSensorData(data?.sensordata)),
  ]),
  'info': ({ t, bolt, type, subtype }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Info'), m('td.subtype', { colspan: 6 }, subtype),
  ]),
  'error': ({ t, bolt, type, subtype }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Error'), m('td.subtype', { colspan: 6 }, subtype),
  ]),
  'camera': ({ t, bolt, type, subtype, data }: ILogline) => m('tr', { className: [bolt, type, subtype].join(' ') }, [
    cell('.timestamp', time(t)), cell('.bolt', bolt), cell('.type', 'Camera'), cell('.subtype', subtype),
    m('td.sensor', { colspan: 5 }, `x:${data.x.toFixed(1)}, y:${data.y.toFixed(1)}${data.heading !== undefined ? `, h:${Math.round(data.heading)}` : ''}`),
  ]),
} as { [key: string]: (line: ILogline) => m.Vnode };

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
    case 'warn':   return { ...base, type: 'error',  subtype: entry.subtype };
    case 'action': return { ...base, type: 'action', subtype: data?.name, data };
  }
  if (entry.subtype.startsWith('key')) return { ...base, type: 'key', subtype: entry.subtype };
  if (data && data.sensordata !== undefined && !data.msg) return { ...base, type: 'sensor', subtype: entry.subtype, data };
  return { ...base, type: 'event', subtype: entry.subtype, data };
}

const Logger = Factory.create('Logger', {

  name: 'Logger',

  push: Array.prototype.unshift.bind(log),

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

  error (source: { name: string }, error: string) {
    const msg = session.note(source.name, 'error', error);
    Logger.push({ t: msg.t, bolt: msg.bolt, type: 'error', subtype: error } as ILogline);
    m.redraw();
  },

  /** A camera position, already in the session file. */
  position (msg: IPositionMessage) {
    Logger.push({ t: msg.t, bolt: msg.bolt, type: msg.source || 'camera', subtype: 'position', data: msg } as ILogline);
  },

  reset () {
    while (log.length) { log.shift(); }
    Logger.info(this, 'Reset');
  },

  view () {
    const style = { height: '512px', overflowY: 'scroll' };
    return m('div.logger', { style },
      m('table', [
        m('thead', m('tr', [
          m('td', 'T'), m('td', 'Bolt'), m('td', 'Type'), m('td', 'Name'),
          m('td.tr', 'ID'), m('td.tr', 'D'), m('td.tr', 'C'), m('td.tr', 'T'), m('td.tr', 'Payload'),
        ])),
        m('tbody', {}, log.slice(0, 2000).map((line: ILogline) => (formatter[line.type] ?? formatter.event!)(line))),
      ])
    );
  },

});

export { Logger };

import m from 'mithril';
import './chip.scss';

import Factory from '../factory';
import { Bolts } from '../../bolts';
import { Bolt, BatteryState, ChargerState, StabilizationIndex } from '@bolt/core';
import { BoltCommands } from '../commands/commands';

/**
 * One compact chip per Bolt, in a single line that replaces the per-Bolt command
 * rows. The chip shows state at a glance; a click expands that Bolt's full command
 * row below the line (the existing BoltCommands, reused unchanged). One open at a
 * time. State comes from bolt.status only, so a redraw on 'change' keeps it live;
 * no polling.
 */

/** The BLE name of the expanded Bolt, or null. Module-level so it survives redraws. */
let expanded: string | null = null;

/** A small state pill. `on` lights it; a plain pill passes `bg`/`fg`. */
const pill = (label: string, opts: { on?: boolean; bg?: string; fg?: string; title?: string }) =>
  m('span.chip-pill.br2.f7.mono', {
    title: opts.title,
    style: {
      background: opts.bg ?? (opts.on ? '#cfc' : '#0000000f'),
      color:      opts.fg ?? (opts.on ? '#262' : '#0000006b'),
    },
  }, label);

const battery = (s: Bolt['status']) => {
  const bg = { [BatteryState.ok]: '#cfc', [BatteryState.low]: '#fe6', [BatteryState.critical]: '#f99', [BatteryState.unknown]: '#ddd' }[s.battery ?? BatteryState.unknown];
  const label = s.voltage != null ? s.voltage.toFixed(1) + 'V' : ({ [BatteryState.ok]: 'ok', [BatteryState.low]: 'low', [BatteryState.critical]: 'crit', [BatteryState.unknown]: 'bat?' }[s.battery ?? BatteryState.unknown]);
  return pill(label, { bg, fg: '#222', title: 'Battery' });
};

const summary = (bolt: Bolt) => {
  const s = bolt.status;
  if (!bolt.connected) {
    return [
      m('span.chip-name.mr2', bolt.name),
      m('span.f7', { style: { color: '#0000008c' } }, `rssi ${s.rssi ?? '–'}  tx ${s.txPower ?? '–'}`),
    ];
  }
  const charging = s.charger === ChargerState.charging || s.charger === ChargerState.charged;
  return [
    m('span.chip-name.mr2', bolt.name),
    battery(s),
    charging ? pill('chg', { bg: '#fe6', fg: '#222', title: 'Charging' }) : null,
    pill('Stb', { on: s.stabilization === StabilizationIndex.full, title: 'Stabilization' }),
    pill('Sns', { on: s.streaming.active, title: 'Sensor streaming' }),
  ];
};

/** Background encodes connection and readiness, tinted with the Bolt's own colour. */
const chipBackground = (bolt: Bolt): string => {
  const back = Bolts.configFor(bolt.name).colors.backcolor;
  if (!bolt.connected) return '#9aa0a6';           // connecting
  if (bolt.status.awake === false) return back + '55';  // sleeping
  if (!bolt.status.ready) return back + '99';      // connected, not reset yet
  return back;                                     // ready
};

const chip = (bolt: Bolt) => {
  const isExp = expanded === bolt.name;
  return m('div.boltchip.br2.mh1.pa1.pointer.flex.items-center.mono', {
    key: bolt.name,
    style: { background: chipBackground(bolt), border: isExp ? '2px solid #333' : '2px solid #0000' },
    onclick: () => { expanded = isExp ? null : bolt.name; },
  }, summary(bolt));
};

const BoltChips = Factory.create('BoltChips', {
  view () {
    const open = expanded ? Bolts.get(expanded) : undefined;
    return m('div.boltchips.w-100', [
      m('div.flex.flex-row.flex-wrap.items-center', Bolts.map((bolt: Bolt) => chip(bolt))),
      open ? m('div.w-100', m(BoltCommands, { bolt: open })) : null,
    ]);
  },
});

export { BoltChips };

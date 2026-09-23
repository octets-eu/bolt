import m from "mithril";
import './commands.scss';

import Factory      from '../factory';
import { Bolts }  from '../../bolts';
import { Bolt, StabilizationIndex }   from '@bolt/core';
import { Icon }   from '../icons';

const BoltCommands = Factory.create('Layout', {

  view( vnode: any ) {

    const bolt: Bolt = vnode.attrs.bolt;
    const className  = bolt.name
    const streaming  = bolt.status.streaming.active;
    const stabilized = bolt.status.stabilization === StabilizationIndex.full;
    /** Button handlers: run the step, report a failure in the log instead of an unhandled rejection. */
    const run = (fn: () => Promise<unknown>) => () => {
      fn().catch((e) => bolt.log('warn', String(e)));
    };

    return  ( !bolt.connected
      ? m('div.commands.w-100.pa2', { className }, m('[', [
          m('div.di.ma2.f3.mono', bolt.name),
          m('span.ml3.f5.mono', `Connecting: rssi: ${bolt.status.rssi}, txPOwer: ${bolt.status.txPower}`)
        ]))
      : m('div.commands.w-100.pa2', { className }, [
          m('div.di.f3.ma2.mono', bolt.name),
          m('button.br2.mh1.cmd', { onclick: () => Bolts.disconnectBolt(bolt) },                         'Disconnect'),
          m('button.br2.mh1.cmd', { title: 'Sleep (soft, wakes on command)',                onclick: run(() => bolt.lifecycle.sleep()) }, Icon('bed')),
          m('button.br2.mh1.cmd', { title: 'Wake',                                           onclick: run(() => bolt.lifecycle.wake()) },  Icon('alarmClock')),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.lifecycle.reset()) },                                    'Reset'),
          m('button.br2.mh1.cmd', { title: 'North: spins until two agree, faces it',               onclick: run(() => bolt.calibration.north()) },   Icon('compass')),
          m('button.br2.mh1.cmd', { title: 'Action: circle around, then roll back to origin',         onclick: run(() => bolt.experiments.action()) },      Icon('play')),
          m('button.br2.mh1.cmd', { title: 'Stress: roll to origin, circle around, roll to origin',   onclick: run(() => bolt.experiments.stress()) },      Icon('flame')),
          m('button.br2.mh1.cmd', { title: 'Info: query battery, charger, infrared, ambient light',   onclick: run(() => bolt.lifecycle.readAll()) }, Icon('info')),

          m('button.br2.mh1.cmd', {
            class: stabilized ? 'on' : '',
            title: stabilized ? 'Stabilization is on, click to turn off' : 'Stabilization is off, click to turn on',
            onclick: run(() => bolt.actuators.motor.stabilize(stabilized ? StabilizationIndex.none : StabilizationIndex.full)),
          }, 'Stab ' + (stabilized ? 'on' : 'off')),

          m('button.br2.mh1.cmd', {
            class: streaming ? 'on' : '',
            title: streaming ? 'Sensor streaming is on, click to turn off' : 'Sensor streaming is off, click to turn on',
            onclick: run(() => streaming ? bolt.sensors.motion.disable() : bolt.sensors.motion.enable()),
          }, 'Sensor ' + (streaming ? 'on' : 'off')),

          m('span.mono.pl2.cfff', 'Roll'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.actuators.motor.roll(25,   0)) },                       '▲'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.actuators.motor.roll(25, 270)) },                       '◀'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.actuators.motor.roll(25,  90)) },                       '▶'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.actuators.motor.roll(25, 180)) },                       '▼'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.actuators.motor.roll(0,    0)) },                       '▣'),

          m('button.br2.mh1.cmd', { onclick: run(() => bolt.navigation.rotate(-30)) },                         '↰'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.navigation.rotate(360)) },             '↻'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.navigation.rotate(+30)) },                         '↱'),
          m('button.br2.mh1.cmd', { onclick: run(() => bolt.actuators.motor.roll(25, bolt.heading)) },              '↑'),

        ])
    );

  },

});

export { BoltCommands };

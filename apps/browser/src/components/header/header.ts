import './header.scss';
import m from "mithril";

import Factory     from '../factory';
import { Bolts }  from '../../bolts';
import { Bolt }   from '@bolt/core';
import { Icon }   from '../icons';
import { session } from '../../session';
import { Logger } from '../logger/logger';

import iconBluetooth from './../../assets/bluetooth.icon.256.png';
import iconGreyBluetooth from './../../assets/bluetooth.icon.grey.256.png';

/** A header button's action, then the session file holds every line logged so far. */
const saved = (action: () => unknown) => async () => {
  try { await action(); }
  finally { await session.save(); }
};
const reload = async () => {
  await session.save();
  location.reload();
};

const Header = Factory.create('Header', {
  view () {

    return m('header.w-100.pa2.bg-777',

      !Bolts.count()
        ? m('[',[
            m('div.f3.di.mono.cfff.ma2', m.trust('Bolts&nbsp;&nbsp;')),
            Bolts.hasBluetooth
              ? m('img', {src: iconBluetooth, width: 24 })
              : m('img', {src: iconGreyBluetooth, width: 24  }),
            m('button.cmd.br2.ml1', { onclick: Bolts.pairBolt.bind(Bolts) },                                    'Pair'),
            m('button.cmd.br2.ml1', { onclick: reload },                                                        'Reload'),
            m('button.cmd.br2.ml1', { title: 'Clears the log on screen; the session file keeps everything', onclick: () => Logger.clear() }, 'Clear log'),
          ])
        : m('[',[
            m('div.f3.di.mono.cfff.ma2', m.trust('Bolts&nbsp;&nbsp;')),
            m('button.cmd.stop.br2.ml1', { title: 'Fullstop all, like space', onclick: () => Bolts.forEach( (bolt: Bolt) => void bolt.lifecycle.fullstop() ) }, 'STOP'),
            m('button.cmd.br2.ml1', { onclick: Bolts.pairBolt.bind(Bolts) },                                    'Pair'),
            m('button.cmd.br2.ml1', { onclick: saved(() => Bolts.disconnect()) },                               'DisConnect'),
            m('button.cmd.br2.ml1', { onclick: reload },                                                        'Reload'),
            m('button.cmd.br2.ml1', { onclick: saved(() => Bolts.reset()) },                                    'Reset'),
            m('button.cmd.br2.ml1', { title: 'Sleep all', onclick: saved(() => Promise.all(Bolts.map( (bolt: Bolt) => bolt.lifecycle.sleep() ))) }, Icon('bed')),
            m('button.cmd.br2.ml1', { title: 'Wake all',  onclick: saved(() => Promise.all(Bolts.map( (bolt: Bolt) => bolt.lifecycle.wake() ))) },  Icon('alarmClock')),
            m('button.cmd.br2.ml1', { title: 'Clears the log on screen; the session file keeps everything', onclick: () => Logger.clear() }, 'Clear log'),
          ]

        ),
    );
  },
});

export { Header };

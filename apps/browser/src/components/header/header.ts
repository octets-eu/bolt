import './header.scss';
import m from "mithril";

import Factory     from '../factory';
import { Bolts }  from '../../bolts';
import { Bolt }   from '@bolt/core';
import { Icon }   from '../icons';

import iconBluetooth from './../../assets/bluetooth.icon.256.png';
import iconGreyBluetooth from './../../assets/bluetooth.icon.grey.256.png';

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
            m('button.cmd.br2.ml1', { onclick: () => location.reload() },                                       'Reload'),
          ])
        : m('[',[
            m('div.f3.di.mono.cfff.ma2', m.trust('Bolts&nbsp;&nbsp;')),
            m('button.cmd.br2.ml1', { onclick: Bolts.pairBolt.bind(Bolts) },                                    'Pair'),
            m('button.cmd.br2.ml1', { onclick: Bolts.disconnect.bind(Bolts) },                               'DisConnect'),
            m('button.cmd.br2.ml1', { onclick: () => location.reload() },                                       'Reload'),
            m('button.cmd.br2.ml1', { onclick: () => Bolts.reset() },                                           'Reset'),
            m('button.cmd.br2.ml1', { title: 'Sleep all', onclick: () => Bolts.forEach( (bolt: Bolt) => bolt.lifecycle.sleep().catch((e) => bolt.log('warn', String(e))) ) }, Icon('bed')),
            m('button.cmd.br2.ml1', { title: 'Wake all',  onclick: () => Bolts.forEach( (bolt: Bolt) => bolt.lifecycle.wake().catch((e) => bolt.log('warn', String(e))) ) },  Icon('alarmClock')),
          ]

        ),
    );
  },
});

export { Header };

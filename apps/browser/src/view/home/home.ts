import m from "mithril";

import { Plotter }     from '../../components/plotter/plotter';
import Factory      from '../../components/factory';

import { Bolts }  from '../../bolts';
import { Bolt }   from '@bolt/core';
import { BoltCommands } from '../../components/commands/commands';
import { Logger } from '../../components/logger/logger';

const Home = Factory.create('Home', {

  oninit ( ) {
  },

  view (  ) {

    return m('[', [
      m('div.bolts.w-100', Bolts.map( (bolt: Bolt) => m(BoltCommands, { bolt }) )),

      m('div.panels.fill.w-100.bg-eee.f6.flex.flex-row', [
        m('div.panel', { style: { flex: '1 1 0', minWidth: 0 } }, [
          m('div.pa1.ceee.sans-serif.bg-999', 'Plotter'),
          m(Plotter),
        ]),
        // the label toggles the logger between all columns and the first four
        m('div.panel', { style: { flex: '0 0 auto', maxWidth: '900px' } }, [
          m('div.pa1.ceee.sans-serif.pointer.bg-999', { onclick: () => Logger.toggleWide() }, 'Logger'),
          m(Logger),
        ]),
      ]),
    ]);

  }

});


export { Home };

import m from "mithril";

import { Plotter }     from '../../components/plotter/plotter';
import { Panel }     from '../../components/panel';
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

      m('div.panels.w-100.bg-eee.f6.flex.flex-row', {}, [

        m(Panel, {title: 'Plotter', flex: '0 0 512px'},
          m(Plotter, {size: 512} )
        ),
        m(Panel, {title: 'Logger', flex: '1 1 600px' }, [
          m(Logger),
        ]),
        // m(Panel, {title: 'Meta', width: '164px'}, [
        //   m('pre.plotterstatus.f7.mono.c333.pa2', { style },
        //   JSON.stringify(Plotter.meta(), null, 2))
        // ]),

      ]),
    ]);

  }

});


export { Home };

import m from 'mithril';

import Factory           from '../../components/factory';
import { Panel }         from '../../components/panel';
import { BoltStatus }    from '../../components/status';
import { Bolts }         from '../../bolts';
import { Bolt }          from '@bolt/core';

/** One status box per connected Bolt. */
const Status = Factory.create('Status', {

  view () {

    return m('div.panels.w-100.bg-eee.f6.flex.flex-row', {},
      Bolts.count()
        ? Bolts.map((bolt: Bolt) => m(Panel, { title: bolt.name + ' - Status', flex: '1' }, m(BoltStatus, { name: bolt.name })))
        : m('div.mono.pa2.c666', 'No Bolt connected'),
    );

  },

});

export { Status };

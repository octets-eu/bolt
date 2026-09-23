import m from "mithril";

import { Header }       from '../components/header/header';
import { Plotter }     from '../components/plotter/plotter';
import { Last }         from '../components/last';
import Factory      from '../components/factory';

import { Bolts }  from '../bolts';
import { installKeyboard } from '../keyboard';

Bolts.activate();
Bolts.searchBolts();
Plotter.reset();
installKeyboard();

const Links = Factory.create('Links', {

  view () {

    const style = { color: '#fff', textDecoration: 'none' };

    return m('nav.w-100.bg-333.flex.flex-row.items-center', [
      m(m.route.Link, { style, class: 'mono ph2', href: '/'       }, 'Bolts'),
      m(m.route.Link, { style, class: 'mono ph2', href: '/status' }, 'Status'),
      m(m.route.Link, { style, class: 'mono ph2', href: '/camera' }, 'Camera'),
    ]);

  },

});

const Layout = Factory.create('Layout', {

  view( vnode: any ) {

    const { route, params } = vnode.attrs;

    return m('div.layout', [

      m(Links, { route, params }),
      m(Header, { route, params }),
      m("section", vnode.children),
      m(Last, { msecs: Date.now() }),

    ]);

  },

});

export { Layout };

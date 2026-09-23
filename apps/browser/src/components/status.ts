import m from "mithril";

// import './status.scss';
// import { H }        from '../view/services/helper';

import Factory from './factory';
import { Bolts } from '../bolts';
import { tracker } from '../tracking/tracker';

/** A Bolt's status: the driver object, plus where the camera last saw it. */
const BoltStatus = Factory.create('BoltStatus', {

  view( vnode: any ) {

    const name: string = vnode.attrs.name || vnode.attrs.bolt?.name;
    const bolt = Bolts.get(name);
    const track = tracker.tracks[name];
    const status = bolt ? { ...bolt.status, camera: track && track.cm ? { x: track.cm[0], y: track.cm[1], heading: track.heading, t: track.t } : undefined } : {};
    const style = { background: Bolts.configFor(name).colors.backcolor + '88', flex: 1, maxWidth: '260px', height: '512px', overflowY: 'auto', overflowX: 'hidden' };

    return (
      m('pre.boltstatus.f7.mono.c333.pa2.w-100', { style }, JSON.stringify(status, null, 2))
    );

  },

});

export { BoltStatus };

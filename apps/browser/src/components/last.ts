
import Factory   from './factory';
import m from "mithril";

let dispatcher: any = null;

const Last = Factory.create('Last', {

    onregister (disp: any) {
        dispatcher = disp;
    },
    view ( ) {
        return m('div.last.dn');
    },
    onupdate ({attrs:{msecs}}:any) {
        setTimeout( () => dispatcher.send('onafterupdates', { msecs }));
    },
    oncreate ({attrs:{msecs}}:any) {
        setTimeout( () => dispatcher.send('onafterupdates', { msecs }));
    },

});

export { Last };

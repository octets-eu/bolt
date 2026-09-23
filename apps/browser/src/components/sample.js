
import Dispatcher from './../globals/dispatcher';

const sample = {
    sample () {
        console.log('sample');
        fire();
    },
};

// const fire = Dispatcher.connect(sample, (msg) => {
//     if (sample[msg.action]){
//         sample[msg.action].apply(null, msg.params);
//         console.log('sample.listened', msg);
//     }
// });

const fire = Dispatcher.connect(sample);

export default function() {

    var count = 0; // added a variable

    return {
        oninit: function( /* vnode */ ){
            console.log('sample.oninit', count);
        },
        oncreate: function( /* vnode */ ) {
            console.log('sample.oncreate', count);
        },
        onbeforeupdate: function( /* newVnode, oldVnode */ ) {
            return true;
        },
        onupdate: function( /* vnode */ ) {
            console.log('sample.onupdate', count);
        },
        onbeforeremove: function( /* vnode */ ) {
            //console.log('exit animation can start');
            console.log('sample.onbeforeremove', count);
            return new Promise(function(resolve) {
                // call after animation completes
                resolve();
            });
        },
        onremove: function( /* vnode */ ) {
            console.log('sample.onremove', count);
        },
        view: function() {
            return m('main', [
                m('h1', {
                    class: 'title',
                }, 'My first component'),
                // changed the next line
                m('button', {
                    onclick: function() {
                        count++;
                    },
                }, count + ' clicks'),
            ]);
        },
    };

}

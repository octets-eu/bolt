
// import _ from 'lodash';

const $$    = document.querySelector.bind(document);
const $$$   = document.querySelectorAll.bind(document);

// https://lodash.com/docs/4.17.15
// https://gist.github.com/jbmusso/bcaafb36ab027ea6a13c

const H = {

    /**    O B J E C T S
     *
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object
    */

    // creates new object and removes prototype
    create () {
        const obj = !arguments.length ? {} : Object.assign.apply(null, arguments);
        Object.setPrototypeOf(obj, null);
        return obj;
    },

    // clone1 (...args) {
    //     const obj = Object.assign.apply(null, [ {}, ...args ]);
    //     const clone = H.deepcopy(obj);
    //     Object.setPrototypeOf(clone, null);
    //     return clone;
    // },

    // deep combines params to reference free clone without prototypes
    // Caissa.H.clone({}, {a:99}, {a:1, b:{c:99, d:4}}, {b:{c:3}})

    clone (...args) {
        const obj   = H.deepassign.apply(null, [ {}, ...args ]);
        const clone = H.deepcopy(obj);
        H.deepclean(clone);
        return clone;
    },

    // removes all props, so refs will continue to work
    clear (obj) {
        Object.keys(obj).forEach( prop => delete obj[prop] );
        return obj;
    },
    // createFreeze (obj) {
    //     return H.freeze(H.create(obj));
    // },

    // deep removes all prototypes from objects and arrays
    deepclean(obj) {
        const names = Object.getOwnPropertyNames(obj);
        for (let name of names) {
            const value = obj[name];
            if(typeof value === 'object') {
                H.deepclean(value);
                Object.setPrototypeOf(value, null);
            }
        }
        Object.setPrototypeOf(obj, null);
        return obj;
    },

    deepFreezeCreate () {

        const obj = !arguments.length ? {} : Object.assign.apply(null, arguments);
        const propNames = Object.getOwnPropertyNames(obj);

        // Freeze properties before freezing self
        for (let name of propNames) {
            const value = obj[name];
            if(value && typeof value === 'object') {
                Object.setPrototypeOf(value, null);
                Object.freeze(value);
            }
        }

        Object.setPrototypeOf(obj, null);
        Object.freeze(obj);

        return obj;

    },

    // freeze (obj) {
    //     return Object.freeze(obj);
    // },

    // deepFreeze (obj) {

    //     // Retrieve the property names defined on object
    //     var propNames = Object.getOwnPropertyNames(obj);

    //     // Freeze properties before freezing self
    //     for (let name of propNames) {
    //         let value = obj[name];

    //         if(value && typeof value === 'object') {
    //             H.deepFreeze(value);
    //         }
    //     }

    //     return Object.freeze(obj);

    // },

    each (obj, fn){
        for(let prop in obj){
            if(Object.prototype.hasOwnProperty.call(obj, prop)){
                fn(prop, obj[prop]);
            }
        }
    },


    // removes all undefined props & prototype, improves debugging readabilty
    strip (obj) {
        const copy = H.create(obj);
        Object.entries(copy).forEach( entry => {
            const [key] = entry;
            if (typeof copy[key] === 'undefined'){
                delete copy[key];
            }
        });
        return copy;
    },

    // very short log version of obj
    shrink (obj) {
        return JSON.stringify(H.strip(obj)).replace(/"/g, '').slice(0, 140);
    },

    deepcopy (obj){
        return JSON.parse(JSON.stringify(obj));
    },

    //TODO: checkout mergerino and patchinko
    deepassign (target, ...sources) {
        // overwrites arrays...
        for (const source of sources) {
            for (let [key, value] of Object.entries(source)) {
                if (Array.isArray(value)){
                    target[key] = [...value];
                } else if (value instanceof Object && key in target) {
                    value = H.deepassign({}, target[key], value);
                }
                target[key] = value;
            }
        }
        return target;
    },

    difference (a, b) {
        return Object
            .entries(b)
            .reduce( (ac, [k, v]) => (!a[k] || v !== a[k]) ? (ac[k] = b[k], ac) : ac, H.create())
        ;
    },

    map (o, fn) {
        const out = [];
        for(let a in o){
            out.push( fn(a, o[a]) );
        }
        return out;
    },

    transform (obj, fn) {
        const out = H.create();
        Object.keys(obj).forEach( prop => {
            out[prop] = fn( prop, obj[prop] );
        });
        return out;
    },


    /**    A R R A Y S     */

    // Array.from({length: n}, (v, i) => i);
    range (st, ed, sp) {
        var i,r=[],al=arguments.length;
        if(al===0){return r;}
        if(al===1){ed=st;st=0;sp=1;}
        if(al===2){sp=1;}
        for(i=st;i<ed;i+=sp){r.push(i);}
        return r;
    },

    /**
     * Distributes array elements over {length} new Arrays
     *
     * @param {Array} arr
     * @param {Number} length
     * @return {Array} of length {length}
     */
    partitions ( arr, length ) {

        const result = [];

        H.range(length).forEach( () => {
            result.push([]);
        });
        arr.forEach( (item, idx) => {
            result[ idx % length].push(item);
        });

        return result;

    },


    /**    N U M B E R S     */

    scale (x, xMin, xMax, min, max){
        return (max-min)*(x-xMin)/(xMax-xMin)+min;
    },

    clamp (val, min, max){
        return val < min ? min : val > max ? max : val;
    },


    /**    D O M     */

    isVisibleInView (ele, view) {

        if (ele && view) {

            // https://stackoverflow.com/questions/487073/how-to-check-if-element-is-visible-after-scrolling/41754707#

            const { top, bottom, height } = ele.getBoundingClientRect();
            const holderRect = view.getBoundingClientRect();

            return top <= holderRect.top
                ? holderRect.top - top <= height
                : bottom - holderRect.bottom <= height
            ;
        } else {
            return true;

        }
    },

    //https://stackoverflow.com/questions/19721439/download-json-object-as-a-file-from-browser
    downloadJson(json, exportName='data'){
        var data = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(json, null, 2));
        var node = document.createElement('a');
        node.setAttribute('href', data);
        node.setAttribute('download', exportName + '.json');
        document.body.appendChild(node); // required for firefox
        node.click();
        node.remove();
    },


    /**    S T R I N G S     */

    format (template, ...inserts) {
        let c = 0, tokens = template.split('%s');
        return tokens.map( t => t + (inserts[c++] || '') ).join('');
    },
    padZero (num, len){
        return ('000000' + num).slice(-(len || 2));
    },


    /**    I D S     */

    // http://davidjohnstone.net/pages/hash-collision-probability
    // 32bit has a 1% chance of collision with 10,000 item
    hash (string) {
        let i, char, hash = 0;
        if (string.length === 0) {
            throw('Can\'t do this');
        }
        for (i = 0; i < string.length; i++) {
            char  = string.charCodeAt(i);
            hash  = (( hash << 5) - hash) + char;
            hash |= 0;
        }
        return hash.toString(36);
    },
    // uuid () {
    //     // http://www.ietf.org/rfc/rfc4122.txt
    //     // https://github.com/tc39/proposal-uuid
    //     const s = [];
    //     const hexDigits = '0123456789abcdef';
    //     for (let i = 0; i < 36; i++) {
    //         s[i] = hexDigits.substr(Math.floor(Math.random() * 0x10), 1);
    //     }
    //     s[14] = '4';  // bits 12-15 of the time_hi_and_version field to 0010
    //     s[19] = hexDigits.substr((s[19] & 0x3) | 0x8, 1);  // bits 6-7 of the clock_seq_hi_and_reserved to 01
    //     s[8] = s[13] = s[18] = s[23] = '-';

    //     const uuid = s.join('');
    //     return uuid;
    // },
    // shortuuid() {
    //     let part1 = (Math.random() * 4665679) | 0;
    //     let part2 = (Math.random() * 4665679) | 0;
    //     part1  = ('0000' + part1.toString(36)).slice(-4);
    //     part2  = ('0000' + part2.toString(36)).slice(-4);
    //     return part1 + part2;
    // },


    /**    T I M E     */

    sleep (msecs) {
        return new Promise(resolve => setTimeout(resolve, msecs));
    },

    msec2HMSm (msecs) {
        const d = new Date(msecs) ;
        return [
            H.padZero(d.getUTCHours()),
            H.padZero(d.getUTCMinutes()),
            H.padZero(d.getUTCSeconds()),
        ].join(':') + '.' + Math.floor(d.getMilliseconds() / 100);
    },
    msec2HMS (msecs) {
        const d = new Date(msecs) ;
        return [
            H.padZero(d.getUTCHours()),
            H.padZero(d.getUTCMinutes()),
            H.padZero(d.getUTCSeconds()),
        ].join(':');
    },
    date2isoUtc (date) {
        const d = date || new Date();
        return [
            d.getUTCFullYear(),
            H.padZero(d.getUTCMonth() +1),
            H.padZero(d.getUTCDate()),
        ].join('-') + ' ' + [
            H.padZero(d.getUTCHours()),
            H.padZero(d.getUTCMinutes()),
            H.padZero(d.getUTCSeconds()),
        ].join(':');
    },

    date2isoLocal (date) {
        const d = date || new Date();
        return [
            d.getFullYear(),
            H.padZero(d.getMonth() +1),
            H.padZero(d.getDate()),
        ].join('-') + ' ' + [
            H.padZero(d.getHours()),
            H.padZero(d.getMinutes()),
            H.padZero(d.getSeconds()),
        ].join(':');
    },


    /**    E V E N T S     */

    eat (e) {
        e.preventDefault();
        e.stopPropagation();
        return false;
    },


    /**    C S S     */

    classes (def = {}, sep = ' ', classes = '') {
        for (const cls in def) {
            if (def[cls]) {
                classes += `${classes && sep}` + cls;
            }
        }
        return classes;
    },


    /**    S T U F F     */

    interprete (val){
        return typeof val === 'function' ? val() : val;
    },

    msecs2human (milliseconds) {

        // TIP: to find current time in milliseconds, use:
        // var  current_time_milliseconds = new Date().getTime();

        function numberEnding (number) {
            return (number > 1) ? 's' : '';
        }

        let temp = Math.floor(milliseconds / 1000);
        const years = Math.floor(temp / 31536000);
        if (years) {
            return years + ' year' + numberEnding(years);
        }
        //TODO: Months! Maybe weeks?
        const days = Math.floor((temp %= 31536000) / 86400);
        if (days) {
            return days + ' day' + numberEnding(days);
        }
        const hours = Math.floor((temp %= 86400) / 3600);
        if (hours) {
            return hours + ' hour' + numberEnding(hours);
        }
        const minutes = Math.floor((temp %= 3600) / 60);
        if (minutes) {
            return minutes + ' minute' + numberEnding(minutes);
        }
        const seconds = temp % 60;
        if (seconds) {
            return seconds + ' second' + numberEnding(seconds);
        }
        return 'less than a second'; //'just now' //or other string you like;
    },


};

export {H, $$, $$$};


import m from 'mithril';

import './components.scss';

// import { H }     from '../services/helper';
import Factory   from './factory';

const Error = Factory.create('Error', {
    view ( { attrs, children } ) {
        return m('div.error', {style:'padding: 1rem 2rem; color: darkred'},
            m('span.f4', attrs, children),
        );
    },
});

const Nothing = Factory.create('Nothing', {
    view ( ) {
        return m('div.nothing.dn');
    },
});

const Spacer = Factory.create('Spacer', {
    view ( vnode ) {
        return m('div.spacer', vnode.attrs, m.trust('&nbsp;'));
    },
});

const GrowSpacer = {
    view ( { attrs } ) {
        return m('div.spacer.flex-grow', attrs, m.trust('&nbsp;'));
    },
};

const ListFilter = {
    view ( vnode ) {
        const { oninput } = vnode.attrs;
        return m('input[type=text].w-100.pv2.ph3.bg-ddd.f4', {
            style: 'border: 0',
            oninput,
            placeholder: 'type to filter',
        });

    },
};

const PageTitle = Factory.create('PageTitle', {
    view ( { attrs, children } ) {
        return m('page-title', { className: attrs.className, onclick: attrs.onclick },
            m('span', { style: attrs.style }, children),
        );
    },
});

const HeaderLeft = {
    view ( v ) {
        return m('div.header-left.tl.saim.f3.white', m('span', v.attrs, v.children));
    },
};
const TextLeft = {
    view ( v ) {
        return m('div.text-left.tl.fiom.f4.white', m('span', v.attrs, v.children));
    },
};
const TextCenter = {
    view ( v ) {
        return m('div.text-center.tc.fiom.f4.white', m('span', v.attrs, v.children));
    },
};
const HeaderCentered = {
    view ( v ) {
        return m('div.header-center.tc.saim.f3.white', v.attrs, m('span', v.children));
    },
};


const FlexList = {
    view ( vnode ) {
        return m('div.flexlist', vnode.attrs, vnode.children);
    },
};

const FlexListGrow = {
    view ( vnode ) {
        return m('div.flexlist.h-100', vnode.attrs, vnode.children, m(GrowSpacer));
    },
};

const FixedList = {
    view ( vnode ) {
        return m('div.fixedlist.viewport-y', vnode.attrs, vnode.children);
    },
};

const FlexListFixed = {
    view ( vnode ) {
        return m('div.flexlist.flex.flex-column', vnode.attrs, vnode.children);
    },
};

const FlexListShrink = {
    view ( vnode ) {
        return m('div.flexlist.flex-shrink', vnode.attrs, vnode.children);
    },
};

const FlexListEntry = {
    view ( vnode ) {
        const { className, style, onclick } = vnode.attrs;
        return m('div.flexlistentry', { className, style, onclick }, vnode.children);
    },
};

const FixedButton = {
    view ( vnode ) {
        return m('div.header-center',
            m('button.flexcontrol.w-100', { onclick: vnode.attrs.onclick }, vnode.children ),
        );
    },
};





export {

    Error,
    Nothing,

    Spacer,
    GrowSpacer,

    ListFilter,

    PageTitle,

    // TitleLeft,
    HeaderLeft,
    HeaderCentered,
    TextCenter,
    TextLeft,

    FixedList,
    FlexList,
    FlexListFixed,
    FlexListShrink,
    FlexListGrow,
    FixedButton,
    FlexListEntry,
    // FlexListPlayEntry,

    // Panel,
    // PanelHeader,

};

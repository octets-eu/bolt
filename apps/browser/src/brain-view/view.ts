// The Brain tab: the connectome as tissue (anatomy.ts, scene.ts), lit by
// the network that runs. While the matrix brain mode or a seek runs, its
// network after every step (MatrixBrain.steps); otherwise a network of its
// own stepped with no input, the brain at rest in a dark room. The scene and
// its canvas live for the page; the view hosts them while it is shown.
//
// Click a cell or pick it from the list: the panel shows what it is, its rate
// now, and its synapses in and out with their contribution, the weight times
// the presynaptic rate, largest first; a partner's name selects it.

import m from 'mithril';
import Factory from '../components/factory';
import { Network } from '../../../../packages/core/src/brain/connectome/network.mjs';
import { connectome } from '../matrix-brain/connectome';
import { MatrixBrain } from '../matrix-brain/runner';
import type { BrainStep } from '../matrix-brain/runner';
import { grow } from './anatomy';
import type { Anatomy, Circuit } from './anatomy';
import { Light } from './light';
import { BrainScene, TOKENS } from './scene';

const IDLE_MS = 50;          // the resting network's step
const LIVE_GAP_MS = 500;     // without a live step this long, the resting network takes over
const PANEL_MS = 250;        // the panel's refresh while a cell is selected
const ROWS = 12;             // synapses listed each way

interface World { anatomy: Anatomy; light: Light; scene: BrainScene; rest: Network }
let world: World | null = null;
let live: { net: Network, at: number } | null = null;
let selected: number | null = null;
let timers: ReturnType<typeof setInterval>[] = [];

function make (): World {
  const anatomy = grow(connectome.circuit as unknown as Circuit);
  const light = new Light(anatomy.cells.length);
  const scene = new BrainScene(anatomy, light.shown);
  scene.onFrame = (dt) => light.frame(dt);
  scene.onPick = (i) => pick(i);
  return { anatomy, light, scene, rest: new Network(connectome) };
}

/** For the console and the browser tools: the scene, the light and the resting network, once the tab was shown. */
export const brainView = {
  get world (): World | null { return world; },
};

function pick (i: number | null): void {
  selected = i;
  world?.scene.select(i);
  m.redraw();
}

const onStep = (s: BrainStep): void => {
  live = { net: s.net, at: performance.now() };
  world?.light.take(s.net, s.dtMs);
};

const isLive = () => live !== null && performance.now() - live.at < LIVE_GAP_MS;
const network = (w: World): Network => (isLive() && live ? live.net : w.rest);

const fmt = (v: number) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2);

const text = { color: TOKENS.ink }, muted = { color: TOKENS.muted };
const button = { background: 'transparent', color: TOKENS.ink, border: `1px solid ${TOKENS.muted}`, borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', font: '12px monospace' };

function tools (w: World) {
  const roles = [...new Set(w.anatomy.cells.map((c) => c.def.role))];
  return m('div', { style: { position: 'absolute', top: '8px', left: '8px', right: '8px', zIndex: 2, display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, [
    ...(['home', 'above', 'side', 'ring'] as const).map((v) => m('button', { style: button, onclick: () => w.scene.view(v) }, v)),
    m('select', {
      style: { ...button, padding: '2px 4px' },
      value: selected === null ? '' : String(selected),
      onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; pick(v === '' ? null : Number(v)); },
    }, [
      m('option', { value: '' }, 'cell…'),
      ...roles.map((r) => m('optgroup', { label: r }, w.anatomy.cells.filter((c) => c.def.role === r).map((c) => m('option', { value: String(c.index) }, c.def.id)))),
    ]),
    m('span.mono', { style: { ...muted, fontSize: '12px', marginLeft: 'auto' } }, isLive() ? 'live: the running brain' : 'at rest: no input'),
  ]);
}

function synapses (w: World, title: string, list: [number, number][], contribution: (p: number, wt: number) => number) {
  const rows = list.map(([p, wt]) => ({ p, wt, c: contribution(p, wt) })).sort((a, b) => Math.abs(b.c) - Math.abs(a.c) || Math.abs(b.wt) - Math.abs(a.wt));
  return m('div', { style: { marginTop: '10px' } }, [
    m('div', { style: muted }, `${title}: ${list.length}`),
    rows.length ? m('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' } }, [
      m('tr', { style: muted }, [m('td', 'partner'), m('td', { style: { textAlign: 'right' } }, 'weight'), m('td', { style: { textAlign: 'right' } }, 'w × rate')]),
      ...rows.slice(0, ROWS).map((r) => m('tr', [
        m('td', m('a', { style: { ...text, cursor: 'pointer', textDecoration: 'underline' }, onclick: () => pick(r.p) }, w.anatomy.cells[r.p]!.def.id)),
        m('td', { style: { ...text, textAlign: 'right' } }, fmt(r.wt)),
        m('td', { style: { ...text, textAlign: 'right' } }, fmt(r.c)),
      ])),
    ]) : null,
    rows.length > ROWS ? m('div', { style: muted }, `and ${rows.length - ROWS} more`) : null,
  ]);
}

function panel (w: World) {
  const box = { width: '340px', flex: '0 0 340px', overflowY: 'auto', padding: '12px', background: TOKENS.surface, borderLeft: `1px solid #383835`, font: '12px monospace', lineHeight: '1.5' };
  if (selected === null) {
    return m('div', { style: box }, [
      m('div', { style: { ...text, fontSize: '14px' } }, 'The seeker\'s brain'),
      m('div', { style: muted }, `${w.anatomy.cells.length} cells, ${w.anatomy.contacts.length} contacts. Click a cell or pick one from the list.`),
      m('div', { style: { ...muted, marginTop: '10px' } }, 'Light is the rate: a cell glows white when it fires, an evidence cell when it stands out of its group.'),
      m('div', { style: { marginTop: '10px' } }, [
        m('div', [m('span', { style: { color: TOKENS.excite } }, '◆ '), m('span', { style: text }, 'an excitatory contact')]),
        m('div', [m('span', { style: { color: TOKENS.inhibit } }, '■ '), m('span', { style: text }, 'an inhibitory contact')]),
        m('div', [m('span', { style: { color: TOKENS.select } }, '● '), m('span', { style: text }, 'the selected cell')]),
        m('div', { style: { ...muted, marginTop: '6px' } }, 'Solid: a natural cell, a sum of synapses. Wire: a product cell\'s gate, a rule. Dashed grey: a stand-in, read by name in the network\'s rules.'),
      ]),
    ]);
  }
  const cell = w.anatomy.cells[selected]!, n = cell.def, net = network(w), rate = net.rate[selected] ?? 0;
  const facts = [
    n.angle !== undefined ? `angle ${n.angle}°` : null,
    n.channel !== undefined ? `channel ${n.channel}, ${n.ladder} ${n.strength}` : null,
    n.cm ? `${n.cm[0]} to ${n.cm[1]} cm` : null,
    n.band ? `band ${n.band[0]} to ${n.band[1] ?? '∞'} cm` : null,
    n.bias !== undefined ? `bias ${n.bias}` : null,
    n.tauCm !== undefined ? `forgets over ${n.tauCm} cm of travel` : null,
    n.tauParallax !== undefined ? `forgets over ${n.tauParallax} rad of potential parallax` : null,
    n.axis ? `the Bolt's own ${n.axis}, ${n.unit}` : null,
  ].filter(Boolean);
  const note = cell.grade === 'product' ? `rate = ${n.of} × the share of ${(n.gate ?? []).join(' ')} in the distance belief: a rule in network.mjs, no synapses on the gate field`
    : cell.grade === 'stand-in' ? 'no synapses: the network reads it by name to turn and carry the ring and the distance' : null;
  return m('div', { style: box }, [
    m('div', { style: { ...text, fontSize: '14px' } }, n.id),
    m('div', { style: muted }, `${n.role} · ${cell.grade}`),
    ...facts.map((f) => m('div', { style: text }, f)),
    note ? m('div', { style: { ...muted, marginTop: '6px' } }, note) : null,
    m('div', { style: { ...text, marginTop: '10px' } }, `rate ${rate.toFixed(3)}${n.evidence ? `, evidence ${(net.evidence[selected] ?? 0).toFixed(2)}` : ''}`),
    synapses(w, 'in', w.anatomy.incoming[selected]!, (p, wt) => wt * (net.rate[p] ?? 0)),
    synapses(w, 'out', w.anatomy.outgoing[selected]!, (_p, wt) => wt * rate),
    m('div', { style: { marginTop: '12px' } }, m('button', { style: button, onclick: () => pick(null) }, 'clear')),
  ]);
}

export const BrainView = Factory.create('BrainView', {

  oncreate (vnode: any) {
    world ??= make();
    const w = world;
    w.scene.attach(vnode.dom.querySelector('.brain-host'));
    MatrixBrain.steps.add(onStep);
    timers = [
      setInterval(() => { if (!isLive()) { w.rest.step({}, IDLE_MS); w.light.take(w.rest, IDLE_MS); } }, IDLE_MS),
      setInterval(() => { if (selected !== null) m.redraw(); }, PANEL_MS),
      setInterval(() => m.redraw(), 1000),   // the source's label
    ];
    m.redraw();   // the tools and the panel, now that the scene exists
  },

  onremove () {
    for (const t of timers) clearInterval(t);
    timers = [];
    MatrixBrain.steps.delete(onStep);
    world?.scene.detach();
  },

  view () {
    return m('div.brain-view', { style: { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'row', background: TOKENS.surface } }, [
      m('div', { style: { position: 'relative', flex: '1 1 0', minWidth: 0, overflow: 'hidden' } }, [
        m('div.brain-host', { style: { position: 'absolute', inset: 0 } }),
        world ? tools(world) : null,
      ]),
      world ? panel(world) : m('div', { style: { width: '340px' } }),
    ]);
  },

});

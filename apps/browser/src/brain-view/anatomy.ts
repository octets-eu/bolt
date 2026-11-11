// The connectome as tissue: every cell's body, neurites and synapses derived
// from the wiring of circuit.json and placed by its `vis` (@bolt/brain's
// build/vis.ts). Plain data, no three.js; scene.ts turns it into meshes.
//
// A cell's look follows from what it does (docs/brain-view.plan.md):
// - grade: `product` for a cell with `of` and `gate`, whose second input is a
//   rule; `stand-in` for a cell with no edges that nothing gates, read by name
//   in the network's rules (the self neurons); `natural` for the rest;
// - an edge is a synapse: about ten contacts per unit of weight, at least
//   one, on the postsynaptic cell's arbor; the presynaptic axon reaches them
//   through a trunk to a hub and thin twigs from the hub;
// - a ring cell's arbor is its wedge of the torus, a distance cell's its
//   layer of the column; inputs land on the ring by kind, corner reads on the
//   outer side, silent slots on the inner, the gated frames on top;
// - a product cell's first field reaches its channel's glomerulus, its
//   second, the gate, runs down the column to its band's layers, hollow;
// - a stand-in's fibres end without synapses, dashed;
// - `tauCm` or `tauParallax` marks the soma: the cell forgets by a rule.

import type { Circuit, NeuronDef, V3, Vis } from '@bolt/brain';

export type { Circuit, NeuronDef, V3, Vis };
export type Grade = 'natural' | 'product' | 'stand-in';

export interface Tube { path: V3[]; r: number }
export interface Cell {
  index: number;
  def: NeuronDef;
  grade: Grade;
  soma: V3;
  somaR: number;
  tubes: Tube[];          // solid neurites
  hollow: Tube[];         // a product cell's gate field
  twigs: { post: number; path: V3[] }[];   // terminal branches, thin, each toward one postsynaptic cell
  dashed: V3[][];         // a stand-in's fibres
  wedge?: { azimuth: number; arc: number };
  layer?: { z: number };
  forgets: boolean;
}
export interface Contact { pre: number; post: number; w: number; at: V3 }
export interface Anatomy { cells: Cell[]; contacts: Contact[]; vis: Vis; incoming: [number, number][][]; outgoing: [number, number][][] }

const CONTACTS_PER_W = 10;
const WEDGE_ARC = 9;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const lerp = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rad = (d: number) => d * Math.PI / 180;
/** The horizontal unit vector at `azimuth` deg clockwise from the nose. */
const dir = (azimuth: number): V3 => [Math.sin(rad(azimuth)), Math.cos(rad(azimuth)), 0];
const wrap180 = (a: number) => ((a % 360) + 540) % 360 - 180;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);

/** A deterministic number in [0, 1) from a key, so the same circuit always grows the same tissue. */
function rand (key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const jit = (key: string, span: number) => (rand(key) - 0.5) * 2 * span;
const jit3 = (key: string, span: number): V3 => [jit(key + 'x', span), jit(key + 'y', span), jit(key + 'z', span)];

/** A straight neurite bent through a midpoint off the line by 6 to 12 % of its length, as a fibre grows. */
function bend (path: V3[], key: string): V3[] {
  if (path.length !== 2) return path;
  const [a, b] = path as [V3, V3], d = sub(b, a), len = norm(d);
  if (len < 1e-6) return path;
  let side = cross(d, [0, 0, 1]);
  if (norm(side) < 1e-6 * len) side = cross(d, [1, 0, 0]);
  side = scale(side, 1 / norm(side));
  const up = cross(scale(d, 1 / len), side), turn = rand(key) * 2 * Math.PI, off = len * (0.06 + 0.06 * rand(key + 'k'));
  return [a, add(lerp(a, b, 0.5), add(scale(side, Math.cos(turn) * off), scale(up, Math.sin(turn) * off))), b];
}

export function grow (circuit: Circuit): Anatomy {
  const { neurons, edges, vis } = circuit;
  const index = new Map(neurons.map((n, i) => [n.id, i]));
  const at = (id: string) => { const i = index.get(id); if (i === undefined) throw new Error(`anatomy: no neuron ${id}`); return i; };
  const def = (i: number) => neurons[i] as NeuronDef;
  const soma = (id: string): V3 => { const p = vis.soma[id]; if (!p) throw new Error(`anatomy: no soma for ${id}`); return p; };
  const { ring, column, glomeruli, motor } = vis.neuropils;
  const { ears, muscle } = vis.organs;
  const gated = new Set(neurons.flatMap((n) => n.gate ?? []));
  const incoming: [number, number][][] = neurons.map(() => []);
  const outgoing: [number, number][][] = neurons.map(() => []);
  for (const [a, b, w] of edges) { outgoing[at(a)]!.push([at(b), w]); incoming[at(b)]!.push([at(a), w]); }

  // --- the places the wiring refers to
  const glomAt = (ch: number | undefined): V3 => { const p = glomeruli.at[String(ch)]; if (!p) throw new Error(`anatomy: no glomerulus ${ch}`); return p; };
  const glomAzimuth = (ch: number | undefined) => { const p = glomAt(ch); return Math.atan2(p[0], p[1]) * 180 / Math.PI; };
  /** A point on the ring's torus at `azimuth`, `phi` deg round the tube from the outer side upward, `off` beyond the surface. */
  const ringPoint = (azimuth: number, phi: number, off = 0): V3 => {
    const t = ring.tube + off;
    return add(add(ring.at, scale(dir(azimuth), ring.r + t * Math.cos(rad(phi)))), [0, 0, t * Math.sin(rad(phi))]);
  };
  /** A polyline along the ring from `a0` to `a1` the short way, at `phi` and `off`. */
  const alongRing = (a0: number, a1: number, phi: number, off: number): V3[] => {
    const d = wrap180(a1 - a0), n = Math.max(1, Math.ceil(Math.abs(d) / 8));
    return Array.from({ length: n + 1 }, (_, k) => ringPoint(a0 + d * k / n, phi, off));
  };
  const layerZ = (id: string) => { const z = column.layers[id]; if (z === undefined) throw new Error(`anatomy: no layer ${id}`); return z; };
  const columnTop = Math.max(...Object.values(column.layers)), columnBottom = Math.min(...Object.values(column.layers));
  const columnPoint = (azimuth: number, r: number, z: number): V3 => add(add(column.at, scale(dir(azimuth), r)), [0, 0, z]);
  const motorTop = motor.at[2] + motor.r * motor.flat;
  const tuft = (n: NeuronDef): V3 => n.role === 'steer' ? add(motor.at, scale(dir(n.angle ?? 0), 0.38))
    : n.role === 'axis' ? add(motor.at, [0, 0.18, -0.1]) : add(motor.at, [0, -0.18, -0.12]);
  const muscleTop = muscle.at[2] + muscle.size[2] / 2;
  const dendriteTip = (id: string): V3 => id === 'M_ROAM' ? add(soma(id), [0.3, 0.25, 0.25]) : add(soma(id), [-0.2, 0.1, 0.15]);

  // --- where a contact lands on its postsynaptic cell
  const contactAt = (pre: NeuronDef, post: NeuronDef, key: string): V3 => {
    switch (post.role) {
      case 'ring': {
        const phi = pre.role === 'corner' ? 0 : pre.role === 'slot' ? 180 : 90;
        return ringPoint((post.angle ?? 0) + jit(key + 'a', WEDGE_ARC / 2 - 0.5), phi + jit(key + 'p', 28), -0.01);
      }
      case 'distance': {
        const az = glomAzimuth(pre.channel) + (pre.role === 'slot' ? 7 : 0) + jit(key + 'a', 5);
        return columnPoint(az, column.r * (0.72 + jit(key + 'r', 0.12)), layerZ(post.id) + jit(key + 'z', 0.015));
      }
      case 'steer': case 'axis': case 'search': return add(tuft(post), jit3(key, 0.13));
      default: return add(dendriteTip(post.id), jit3(key, 0.05));
    }
  };

  const contacts: Contact[] = [];
  const contactsOf = neurons.map(() => [] as Contact[]);
  for (const [a, b, w] of edges) {
    const pre = at(a), post = at(b), n = Math.max(1, Math.round(Math.abs(w) * CONTACTS_PER_W));
    for (let k = 0; k < n; k++) {
      const c = { pre, post, w, at: contactAt(def(pre), def(post), `${a}>${b}#${k}`) };
      contacts.push(c);
      contactsOf[pre]!.push(c);
    }
  }

  // --- each cell's neurites
  const cells: Cell[] = neurons.map((n, i) => {
    const s = soma(n.id), mine = contactsOf[i]!;
    const cell: Cell = {
      index: i, def: n, soma: s, somaR: 0.06, tubes: [], hollow: [], twigs: [], dashed: [],
      grade: n.of ? 'product' : (!incoming[i]!.length && !outgoing[i]!.length && !gated.has(n.id) ? 'stand-in' : 'natural'),
      forgets: Number.isFinite(n.tauCm) || Number.isFinite(n.tauParallax),
    };
    const tube = (r: number, ...path: V3[]) => cell.tubes.push({ r, path: bend(path, `${n.id}#${cell.tubes.length}`) });
    /** One twig per postsynaptic cell, ending in a short stub to each of its contacts. */
    const byPost = (list: Contact[]) => {
      const groups = new Map<number, Contact[]>();
      for (const c of list) groups.set(c.post, [...(groups.get(c.post) ?? []), c]);
      return [...groups.values()];
    };
    const stubs = (end: V3, list: Contact[]) => { for (const c of list) cell.twigs.push({ post: c.post, path: [end, c.at] }); };
    /** Twigs from the hub at `hubAzimuth` along the ring at `phi`, to every contact onto the ring. */
    const fanOnRing = (hubAzimuth: number, phi: number, onRing: Contact[]) => {
      const off = 0.08 + rand(n.id + 'off') * 0.1, phiK = phi + jit(n.id + 'phi', 14);
      for (const list of byPost(onRing)) {
        const arc = alongRing(hubAzimuth, def(list[0]!.post).angle ?? 0, phiK, off);
        cell.twigs.push({ post: list[0]!.post, path: arc });
        stubs(arc[arc.length - 1]!, list);
      }
    };
    const fanFrom = (hub: V3, list: Contact[]) => {
      for (const group of byPost(list)) {
        const mid = scale(group.reduce((acc, c) => add(acc, c.at), [0, 0, 0] as V3), 1 / group.length);
        cell.twigs.push({ post: group[0]!.post, path: [hub, mid] });
        stubs(mid, group);
      }
    };
    const toRing = mine.filter((c) => def(c.post).role === 'ring');
    const rest = mine.filter((c) => def(c.post).role !== 'ring');

    switch (n.role) {
      case 'corner': {
        cell.somaR = 0.08;
        const az = Math.atan2(s[0], s[1]) * 180 / Math.PI, ear = ears.at[n.id.slice(3)];
        if (ear) tube(0.025, s, lerp(s, ear, 0.5), add(ear, scale(dir(az), -ears.depth)));
        const hub = ringPoint(az, 0, 0.14);
        tube(0.025, s, hub);
        fanOnRing(az, 0, toRing);
        break;
      }
      case 'frame': case 'slot': {
        cell.somaR = 0.045;
        const g = glomAt(n.channel), az = glomAzimuth(n.channel);
        tube(0.018, s, lerp(s, g, 0.5), g);
        const onColumn = rest.filter((c) => def(c.post).role === 'distance');
        if (onColumn.length) {
          const hub = columnPoint(az + (n.role === 'slot' ? 7 : 0), column.r + 0.12, (columnTop + columnBottom) / 2);
          tube(0.016, g, lerp(g, hub, 0.5), hub);
          for (const group of byPost(onColumn)) {
            const z = group[0]!.at[2], bend: V3 = [hub[0], hub[1], z], end = lerp(bend, group[0]!.at, 0.5);
            cell.twigs.push({ post: group[0]!.post, path: [hub, bend, end] });
            stubs(end, group);
          }
        }
        if (toRing.length) {
          const hub = ringPoint(az, 180, 0.12);
          tube(0.016, g, add(lerp(g, hub, 0.5), [0, 0, -0.3]), hub);
          fanOnRing(az, 180, toRing);
        }
        break;
      }
      case 'gated': {
        cell.somaR = 0.065;
        const g = glomAt(n.channel), az = glomAzimuth(n.channel);
        tube(0.02, s, lerp(s, g, 0.5), g);                                   // the first field: the frame it multiplies
        for (let k = 0; k < 3; k++) tube(0.01, g, add(g, jit3(`${n.id}tuft${k}`, 0.2)));
        const zs = (n.gate ?? []).map(layerZ), axis = scale(dir(az), 0.18);
        const top: V3 = [axis[0], axis[1], columnTop + 0.25];
        cell.hollow.push({ r: 0.022, path: [s, top, [axis[0], axis[1], Math.max(...zs)], [axis[0], axis[1], Math.min(...zs)]] });
        for (const z of zs) cell.hollow.push({ r: 0.014, path: [[axis[0], axis[1], z], columnPoint(az, column.r * 0.6, z)] });
        const hub = ringPoint(az, 90, 0.12);
        tube(0.02, s, hub);                                                  // the axon, down to the ring's top
        fanOnRing(az, 90, toRing);
        break;
      }
      case 'ring': {
        cell.somaR = 0.07;
        const az = n.angle ?? 0;
        cell.wedge = { azimuth: az, arc: WEDGE_ARC };
        tube(0.02, s, ringPoint(az, 40, 0));
        const hub: V3 = add(add(motor.at, scale(dir(az), 0.42)), [0, 0, motorTop - motor.at[2] + 0.05]);
        tube(0.014, ringPoint(az, -90, 0), hub);
        fanFrom(hub, rest);
        break;
      }
      case 'distance': {
        cell.somaR = 0.07;
        const z = layerZ(n.id);
        cell.layer = { z };
        tube(0.02, s, columnPoint(180, column.r, z));
        break;
      }
      case 'steer': case 'search': case 'axis': {
        cell.somaR = n.role === 'steer' ? 0.11 : 0.09;
        const t = tuft(n);
        tube(0.03, s, t);
        for (let k = 0; k < 4; k++) tube(0.012, t, add(t, jit3(`${n.id}tuft${k}`, 0.2)));
        const d = n.role === 'steer' ? scale(dir(n.angle ?? 0), 0.3) : scale(s, 0.5), out: V3 = [d[0], d[1], muscleTop];
        tube(0.025, s, lerp(s, out, 0.5), out);                              // to the muscle, which reads it by name
        fanFrom(t, rest);
        break;
      }
      case 'roam': {
        cell.somaR = 0.07;
        tube(0.02, s, dendriteTip(n.id));
        tube(0.02, s, [muscle.at[0] - muscle.size[0] / 2 + 0.1, muscle.at[1], muscleTop]);
        break;
      }
      case 'request': {
        cell.somaR = 0.07;
        tube(0.02, s, dendriteTip(n.id));
        break;
      }
      case 'presence': case 'near': {
        cell.somaR = 0.045;
        const target = rest[0]?.at;
        if (target) {
          const via: V3 = n.role === 'presence' ? [-0.95, 0.8, -1.7] : lerp(s, target, 0.5);
          tube(0.016, s, via, target);
        }
        break;
      }
      case 'self': {
        cell.somaR = 0.06;
        const low = (x: number): V3 => [x, -0.95, -0.95];
        if (n.axis === 'turned') {
          const a0 = 200;
          cell.dashed.push([s, low(-0.6), ringPoint(a0, -90, 0.1), ...alongRing(a0, a0 + 175, -90, 0.1).slice(1), ...alongRing(a0 + 175, a0 + 350, -90, 0.1).slice(1)]);
        } else {
          const side = n.axis === 'fwd' ? 0 : 0.6, az = n.axis === 'fwd' ? 180 : 135;
          const up = columnPoint(az, column.r + 0.08, columnBottom), to = columnPoint(az, column.r + 0.08, columnTop);
          cell.dashed.push([s, low(side), ringPoint(az, -90, 0.12), ringPoint(az, 180, 0.12), up, to]);
          cell.dashed.push([ringPoint(az, -90, 0.12), ...alongRing(az, az - 40, -90, 0.12).slice(1)]);
          cell.dashed.push([ringPoint(az, -90, 0.12), ...alongRing(az, az + 40, -90, 0.12).slice(1)]);
        }
        break;
      }
      default: throw new Error(`anatomy: no shape for role ${n.role}`);
    }
    return cell;
  });

  return { cells, contacts, vis, incoming, outgoing };
}

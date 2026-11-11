// The connectome as a replay estimator: the observation layer and the
// network fed with the recorded events instead of a Bolt, the brain exactly
// as the browser's matrix-brain mode runs it. The modules are @bolt/brain's;
// OLD=1 takes the old ones in packages/core/src/brain/connectome, the
// reference of docs/core-brain.plan.md's behaviour-identical steps. The
// observation layer reads the clock through performance.now(), so the
// replay's clock is put there; the motor's efference copies come from the
// locator's speed (forward) and the yaw (still), as the brain would have had
// them from its own commands. The estimate is the network's: the ring's peak,
// its share, the believed distance.
//
// The estimate digest: 32-bit FNV-1a over one line per network step,
// `t angle length distance` at six decimals, t the event's time in ms and
// distance `-` without a distance population, printed as eight hex digits.
// Two brains that step alike give the same digest; nothing less passes.
// `step` answers true when the network stepped, for replay.mjs's --steps.

import { readFileSync } from 'node:fs';

const OLD = process.env.OLD === '1';
const { Network, parseJsonc } = await import(OLD ? '../packages/core/src/brain/connectome/network.mjs' : '@bolt/brain');
const { Observation } = await import(OLD ? '../packages/core/src/brain/connectome/observation/observation.mjs' : '@bolt/brain');
const { loadConnectome } = await import(OLD ? '../packages/core/src/brain/connectome/load.mjs' : '@bolt/brain/load');

const STEP_MS = 25, SEEK_SPEED = 20;

/** 32-bit FNV-1a over the text fed to it, as eight hex digits. */
function fnv () {
  let h = 0x811c9dc5;
  return {
    add (text) { for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } },
    hex () { return h.toString(16).padStart(8, '0'); },
  };
}

/**
 * CIRCUIT=<path>: a circuit under test instead of circuit.json (build-circuit.mjs
 * with OUT); MAP=<path>: a sensory map under test instead of sensory_map.jsonc.
 * `forward=0` as a parameter silences what the map multiplies by self.forward.
 */
export function network (params = {}) {
  const connectome = loadConnectome();
  if (process.env.CIRCUIT) connectome.circuit = JSON.parse(readFileSync(process.env.CIRCUIT, 'utf8'));
  if (process.env.MAP) connectome.map = parseJsonc(readFileSync(process.env.MAP, 'utf8'));
  const net = new Network(connectome);
  const obs = new Observation({ sensors: { listenInfrared: async () => {} }, queue: { fire: async () => ({}) } }, { ...connectome.map.ir, repeat: 1 });   // no Bolt for the listen's re-arm; the recordings' ladder held each level one beat
  let now = 0;
  performance.now = () => now;
  obs.switchedAt = 0;
  let last = null;
  const digest = fnv();
  return {
    step (e) {
      now = e.t;
      if (e.type === 'frame') { if (obs.channels.has(e.channel)) obs.onNotify(e.channel); return; }
      if (e.type === 'read') { if (e.payload.some((c) => obs.channels.has(c))) { obs.stats.landed++; obs.onRead(e.payload); } return; }
      if (last === null) { last = e.t; obs.tick(e); return; }
      if (e.t - last < STEP_MS) return;
      const dt = Math.min(250, e.t - last);
      last = e.t;
      net.step(obs.tick(e, params.forward === 0 ? 0 : Math.min(1, e.speed / SEEK_SPEED)), dt);
      const est = net.estimate();
      digest.add(`${e.t.toFixed(6)} ${est.angle.toFixed(6)} ${est.length.toFixed(6)} ${est.distance === undefined ? '-' : est.distance.toFixed(6)}\n`);
      return true;
    },
    /** The ring and the distance, for `--dump`. */
    debug () { return `ring ${Array.from(net.ringRates(), (v) => v.toFixed(1)).join(' ')} | d ${net.believedDistance().toFixed(0)} cm`; },
    estimate () { return net.estimate(); },
    digest () { return digest.hex(); },
  };
}

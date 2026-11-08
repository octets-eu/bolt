// The agent's brain of 2026-11-07 as a replay estimator: its observation
// layer and network fed with the recorded events instead of a Bolt. The
// observation layer reads the clock through performance.now(), so the
// replay's clock is put there; the motor's efference copies come from the
// locator's speed (forward) and the yaw (still), as the brain would have had
// them from its own commands.

import { readFileSync } from 'node:fs';
import { Network, parseJsonc } from '../brain/connectome/network.mjs';
import { loadConnectome } from '../brain/connectome/load.mjs';
import { Observation } from '../brain/connectome/observation/observation.mjs';
import { ringVector } from '../brain/connectome/ring/ring.mjs';

const STEP_MS = 25, SEEK_SPEED = 20;

/**
 * CIRCUIT=<path>: a circuit under test instead of the agent's circuit.json;
 * MAP=<path>: a sensory map under test instead of sensory_map.jsonc.
 * `forward=0` as a parameter silences the gradient pair IR_APPROACH and
 * IR_RECEDE, which the brain feeds from its own motor command and the
 * replay from the locator's speed.
 */
export function baseline (params = {}) {
  const connectome = loadConnectome();
  if (process.env.CIRCUIT) connectome.circuit = JSON.parse(readFileSync(process.env.CIRCUIT, 'utf8'));
  if (process.env.MAP) connectome.map = parseJsonc(readFileSync(process.env.MAP, 'utf8'));   // MAP=<path>: a sensory map under test
  const net = new Network(connectome);
  const obs = new Observation({ sensors: { listenInfrared: async () => {} } }, { ...connectome.map.ir, repeat: 1 });   // no Bolt for the listen's re-arm; the recordings' ladder held each level one beat
  let now = 0;
  performance.now = () => now;
  obs.switchedAt = 0;
  let last = null, lastHeading = 0;
  const turns = [];
  return {
    step (e) {
      now = e.t;
      if (e.type === 'frame') { if (obs.channels.has(e.channel)) obs.onNotify(e.channel); return; }
      if (e.type === 'read') { if (e.payload.some((c) => obs.channels.has(c))) { obs.stats.landed++; obs.onRead(e.payload); } return; }
      if (last === null) { last = e.t; lastHeading = e.heading; return; }
      if (e.t - last < STEP_MS) return;
      const dt = Math.min(250, e.t - last);
      const turned = ((e.heading - lastHeading + 540) % 360) - 180;
      last = e.t; lastHeading = e.heading;
      turns.push({ t: e.t, turned });
      while (e.t - turns[0].t > 1000) turns.shift();
      const still = turns.reduce((a, x) => a + Math.abs(x.turned), 0) < 20 ? 1 : 0;
      net.step(obs.tick(params.forward === 0 ? 0 : Math.min(1, e.speed / SEEK_SPEED), still), dt, turned);
    },
    // `peak=1`: the direction is the ring's highest neuron instead of its population vector, which cancels for a nose-and-tail pair
    /** The ring and the sensory neurons, for `--dump`. */
    debug () { const r = net.ringRates(); return `ring ${Array.from(r, (v) => v.toFixed(1)).join(' ')} | ${['IR_AHEAD', 'IR_NOT_AHEAD', 'IR_BEHIND', 'IR_NOT_BEHIND', 'IR_AX', 'IR_FL', 'IR_FR'].filter((n) => net.index.has(n)).map((n) => `${n} ${net.get(n).toFixed(2)}`).join(' ')}`; },
    // `peak=2`: the peak refined by a parabola through its neighbours, a fraction of the 22.5° step
    estimate () {
      const r = net.ringRates(), n = r.length, v = ringVector(r);
      let k = 0; for (let j = 1; j < n; j++) if (r[j] > r[k]) k = j;
      const a = r[(k + n - 1) % n], b = r[k], c = r[(k + 1) % n], denom = a - 2 * b + c;
      const frac = params.peak === 2 && denom < 0 ? 0.5 * (a - c) / denom : 0;
      return { angle: params.peak ? (k + frac) * 360 / n : v.angle, length: v.length };
    },
  };
}

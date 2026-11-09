// The connectome as a replay estimator: the observation layer and the
// network fed with the recorded events instead of a Bolt, the brain exactly
// as brain.mjs and the browser's matrix-brain mode run it. The observation
// layer reads the clock through performance.now(), so the replay's clock is
// put there; the motor's efference copies come from the locator's speed
// (forward) and the yaw (still), as the brain would have had them from its
// own commands. The estimate is the network's: the ring's peak, its share,
// the believed distance.

import { readFileSync } from 'node:fs';
import { Network, parseJsonc } from '../brain/connectome/network.mjs';
import { loadConnectome } from '../brain/connectome/load.mjs';
import { Observation } from '../brain/connectome/observation/observation.mjs';

const STEP_MS = 25, SEEK_SPEED = 20;

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
  const obs = new Observation({ sensors: { listenInfrared: async () => {} } }, { ...connectome.map.ir, repeat: 1 });   // no Bolt for the listen's re-arm; the recordings' ladder held each level one beat
  let now = 0;
  performance.now = () => now;
  obs.switchedAt = 0;
  let last = null;
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
    },
    /** The ring and the distance, for `--dump`. */
    debug () { return `ring ${Array.from(net.ringRates(), (v) => v.toFixed(1)).join(' ')} | d ${net.believedDistance().toFixed(0)} cm`; },
    estimate () { return net.estimate(); },
  };
}

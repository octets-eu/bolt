// The connectome as a replay estimator: the observation layer and the
// network fed with the recorded events instead of a Bolt, the brain exactly
// as the browser's matrix-brain mode runs it. The modules are @bolt/brain's;
// OLD=1 takes the old ones in packages/core/src/brain/connectome, the
// reference of docs/core-brain.plan.md's behaviour-identical steps. The
// observation layer takes the replay's clock; the old one reads
// performance.now(), so under OLD=1 the clock is put there; the motor's efference copies come from the
// locator's speed (forward) and the yaw (still), as the brain would have had
// them from its own commands. The estimate is the network's: the ring's peak,
// its share, the believed distance.
//
// The estimate digest: 32-bit FNV-1a over one line per network step,
// `t angle length distance` at six decimals, t the event's time in ms and
// distance `-` without a distance population, printed as eight hex digits.
// Two brains that step alike give the same digest; nothing less passes.
// `step` answers true when the network stepped, for replay.mjs's --steps.
//
// The motor is called once a second, after the network step that crosses the
// second: `heading` that motion sample's, `commanded` the motor's own last
// heading (the first sample's to start), `dtMs` since the last call capped at
// 400 as live, `now` the replay's clock. Nothing drives on its rolls; the
// motor digest, FNV-1a over one line per call, `t mode heading speed` at six
// decimals, says two motors answer the same network alike. The old motor
// reads Date.now and keeps its timers as module state, so under OLD=1 the
// replay's clock is put there too and the module is imported afresh for
// every run.

import { readFileSync } from 'node:fs';

const OLD = process.env.OLD === '1';
const { Network, Observation, Motor } = await import(OLD ? '../packages/core/src/brain/connectome/network.mjs' : '@bolt/brain');
const old = OLD ? { ...await import('../packages/core/src/brain/connectome/observation/observation.mjs'), ...await import('../packages/core/src/brain/connectome/load.mjs') } : null;
const { loadCircuit } = OLD ? {} : await import('@bolt/brain/load');

const mod360 = (a) => ((a % 360) + 360) % 360;
let made = 0;

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
 * CIRCUIT=<path>: a circuit under test instead of circuit.json (build-circuit.ts
 * with OUT). `forward=0` as a parameter gives the observation layer no
 * efference copy.
 */
export async function network (params = {}) {
  const bolt = { sensors: { listenInfrared: async () => {} }, queue: { fire: async () => ({}) } };   // no Bolt for the listen's re-arm
  let now = 0;
  let net, obs, command;
  if (OLD) {
    const connectome = old.loadConnectome();
    if (process.env.CIRCUIT) connectome.circuit = JSON.parse(readFileSync(process.env.CIRCUIT, 'utf8'));
    net = new Network(connectome);
    obs = new old.Observation(bolt, { ...connectome.map.ir, repeat: 1 });   // the recordings' ladder held each level one beat
    performance.now = () => now;
    obs.switchedAt = 0;
    const { motorCommand } = await import(`../packages/core/src/brain/connectome/motor/motor.mjs?run=${made++}`);
    Date.now = () => now;
    command = (heading, commanded, dtMs) => motorCommand(net, heading, commanded, dtMs);
  } else {
    const circuit = process.env.CIRCUIT ? JSON.parse(readFileSync(process.env.CIRCUIT, 'utf8')) : loadCircuit();
    net = new Network(circuit);
    obs = new Observation(bolt, { ...circuit.observation, repeat: 1 }, { now: () => now });
    const motor = new Motor(circuit.motor);
    command = (heading, commanded, dtMs) => motor.command((port) => net.output(port), heading, commanded, dtMs, now);
  }
  let last = null;
  const digest = fnv(), motorDigest = fnv();
  let nextRoll = null, lastRoll = 0, commanded = 0;
  return {
    step (e) {
      now = e.t;
      if (nextRoll === null) { nextRoll = e.t + 1000; lastRoll = e.t; }
      if (e.type === 'frame') { if (obs.channels.has(e.channel)) obs.onNotify(e.channel); return; }
      if (e.type === 'read') { if (e.payload.some((c) => obs.channels.has(c))) { obs.stats.landed++; obs.onRead(e.payload); } return; }
      if (last === null) { last = e.t; obs.tick(e); commanded = e.heading; return; }
      if (e.t - last < STEP_MS) return;
      const dt = Math.min(250, e.t - last);
      last = e.t;
      net.step(obs.tick(e, params.forward === 0 ? 0 : Math.min(1, e.speed / SEEK_SPEED)), dt);
      const est = net.estimate();
      digest.add(`${e.t.toFixed(6)} ${est.angle.toFixed(6)} ${est.length.toFixed(6)} ${est.distance === undefined ? '-' : est.distance.toFixed(6)}\n`);
      if (e.t >= nextRoll) {
        const roll = command(e.heading, commanded, Math.min(400, e.t - lastRoll));
        commanded = mod360(roll.heading);
        lastRoll = e.t;
        while (nextRoll <= e.t) nextRoll += 1000;
        motorDigest.add(`${e.t.toFixed(6)} ${roll.mode} ${roll.heading.toFixed(6)} ${roll.speed.toFixed(6)}\n`);
      }
      return true;
    },
    /** The ring and the distance, for `--dump`. */
    debug () { return `ring ${Array.from(net.ringRates(), (v) => v.toFixed(1)).join(' ')} | d ${net.believedDistance().toFixed(0)} cm`; },
    estimate () { return net.estimate(); },
    digest () { return digest.hex(); },
    motorDigest () { return motorDigest.hex(); },
  };
}

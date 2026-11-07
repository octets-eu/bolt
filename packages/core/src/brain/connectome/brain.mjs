// The seeker's brain on a Bolt: observation -> network -> motor, one step per
// motion sample. The roll goes out right after each volley of corner reads,
// once per beat, so the link is idle when the next read is due; before the
// beat is learned, every `ROLL_MS`. The Bolt's own layers are
// its hands: the infrared stream and fired reads (observation), the motion
// stream for the yaw, the motor's roll. It knows nothing of where the sender
// is; it asks for a ladder through `onLadder` and the program passes it on.

import { mod360, StabilizationIndex } from '@bolt/core';
import { Network, loadConnectome } from './network.mjs';
import { Observation } from './observation/observation.mjs';
import { motorCommand, MOTOR } from './motor/motor.mjs';
import { ringVector } from './ring/ring.mjs';

const ROLL_MS = 100;
const STEP_MS = 25;   // the shortest network step

export class Brain {

  constructor (bolt, { onLadder = () => {}, onStep = () => {}, onRoll = () => {} } = {}) {
    const connectome = loadConnectome();
    this.bolt = bolt;
    this.net = new Network(connectome);
    this.obs = new Observation(bolt, connectome.map.ir);
    this.onLadder = onLadder;
    this.onStep = onStep;
    this.onRoll = onRoll;
    this.ladder = 'long';
    this.cmd = { mode: 'scan', dir: null, heading: 0, speed: 0 };
    this.modes = { target: 0, listen: 0, probe: 0, scan: 0, roam: 0 };
  }

  async start () {
    const { motor } = this.bolt.actuators;
    await motor.stabilize(StabilizationIndex.full);
    await this.obs.start();
    const turns = [];   // the last second's turns, for the efference copy self.still
    let last = null, lastHeading = null, lastRoll = 0, commanded = null, heading = 0;
    const roll = () => {
      if (commanded === null || this.stopped || this.bolt.queue.pending > 0) return;
      const now = Date.now();
      this.cmd = motorCommand(this.net, heading, commanded, Math.min(400, now - lastRoll));
      commanded = mod360(this.cmd.heading);
      lastRoll = now;
      this.modes[this.cmd.mode]++;
      void motor.roll(this.cmd.speed, commanded).catch(() => {});
      this.onRoll(this);
    };
    this.obs.afterVolley = roll;
    this.release = await this.bolt.sensors.motion.subscribe((s) => {
      heading = mod360(-s.angles.yaw);
      if (last === null) { last = s.t; lastHeading = heading; commanded = heading; return; }
      // the samples' times are their arrivals, which the link now and then bunches (13 in 50 s,
      // 2026-11-07): a step of 1 ms would take a corner read in at 1/250 of its weight; events and the turn wait
      if (s.t - last < STEP_MS) { this.obs.stats.bunched++; return; }
      const dt = Math.min(250, s.t - last);
      const turned = ((heading - lastHeading + 540) % 360) - 180;
      last = s.t; lastHeading = heading;

      turns.push({ t: s.t, turned });
      while (s.t - turns[0].t > 1000) turns.shift();
      const still = turns.reduce((a, x) => a + Math.abs(x.turned), 0) < 20 ? 1 : 0;
      const sources = this.obs.tick(this.cmd.speed / MOTOR.seekSpeed, still);
      this.net.step(sources, dt, turned);
      const want = this.net.get('REQ_SHORT') > 0.5 ? 'short' : 'long';
      if (want !== this.ladder) { this.ladder = want; this.onLadder(want); }

      if (!this.obs.timed && Date.now() - lastRoll >= ROLL_MS) roll();
      this.onStep(this);
    });
  }

  /** What the ring holds now: direction off the nose, length, and the rates. */
  ring () { const r = this.net.ringRates(); return { ...ringVector(r), rates: r }; }

  /** The motor first: unsubscribing first, the last roll drove on 40 cm past the tag (2026-11-07). */
  async stop () {
    this.stopped = true;
    this.obs.running = false;
    await this.bolt.actuators.motor.off().catch(() => {});
    await this.release?.();
    await this.obs.stop();
  }

}

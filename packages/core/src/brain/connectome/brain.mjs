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
    this.modes = { target: 0, probe: 0, scan: 0, roam: 0 };
  }

  async start () {
    const { motor } = this.bolt.actuators;
    await motor.stabilize(StabilizationIndex.full);
    await this.obs.start();
    let last = null, lastHeading = null, lastRoll = 0, commanded = null, heading = 0;
    const roll = () => {
      if (commanded === null || this.bolt.queue.pending > 0) return;
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
      const dt = Math.max(1, s.t - last);
      const turned = ((heading - lastHeading + 540) % 360) - 180;
      last = s.t; lastHeading = heading;

      const sources = this.obs.tick(this.cmd.speed / MOTOR.seekSpeed);
      this.net.step(sources, dt, turned);
      const want = this.net.get('REQ_SHORT') > 0.5 ? 'short' : 'long';
      if (want !== this.ladder) { this.ladder = want; this.onLadder(want); }

      if (this.obs.phase === null && Date.now() - lastRoll >= ROLL_MS) roll();
      this.onStep(this);
    });
  }

  /** What the ring holds now: direction off the nose, length, and the rates. */
  ring () { const r = this.net.ringRates(); return { ...ringVector(r), rates: r }; }

  async stop () {
    await this.release?.();
    await this.obs.stop();
    await this.bolt.actuators.motor.off().catch(() => {});
  }

}

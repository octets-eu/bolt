// Matrix brain mode: one Bolt sends the ladder, the other runs the agent's
// brain without its motor and shows the ring on its matrix. The hand is the
// motor: the yaw from the motion stream shifts the ring, the observation
// layer sees the frames and the timed corner reads as in a seek. Logging into
// the session: a state line per second, the landed reads, the ladder's
// switches. The receiver already logs every notify and every read's reply.

import type { Bolt } from '@bolt/core';
import { mod360, StabilizationIndex } from '@bolt/core';
import { Network } from '../../../../packages/core/src/brain/connectome/network.mjs';
import { Observation } from '../../../../packages/core/src/brain/connectome/observation/observation.mjs';
import { ringVector } from '../../../../packages/core/src/brain/connectome/ring/ring.mjs';
import { LadderSender } from '../../../../packages/core/src/brain/utils/ladder.mjs';
import { connectome } from './connectome';
import { ringPicture, peaks, PALETTE } from './render';

const OWNER = 'brain';
/** The seeker's LEDs while the mode runs: the nose a dim yellow the camera tells from the blue-green ring, the tail off. */
const NOSE_LED = [3, 3, 0] as const, TAIL_LED = [0, 0, 0] as const;
const STEP_MS = 25;        // the shortest network step, as brain.mjs
const DRAW_MS = 300;       // two commands of about 150 ms fit the beat's idle part after a volley
const FLASH_MS = 200;
const STATE_MS = 1000;

export class MatrixBrain {

  readonly seeker: Bolt;
  readonly sender: Bolt;
  private net = new Network(connectome);
  private obs: Observation & { afterVolley?: () => void };
  private ladder: LadderSender;
  private range = 'long';
  private release: (() => Promise<void>) | null = null;
  private running = false;
  private flashUntil = 0;
  private drawnAt = 0;
  private drawn = '';
  private drawing = false;
  private stateTimer: ReturnType<typeof setInterval> | null = null;
  private drawTimer: ReturnType<typeof setInterval> | null = null;
  private landed = 0;
  private heading = 0;

  constructor (seeker: Bolt, sender: Bolt) {
    this.seeker = seeker;
    this.sender = sender;
    this.obs = new Observation(seeker, connectome.map.ir);
    this.ladder = new LadderSender(sender, 'long', 2);
  }

  async start (): Promise<void> {
    this.running = true;
    const { matrix, motor } = this.seeker.actuators;
    matrix.hold(OWNER);
    await matrix.clear(OWNER);
    await matrix.picture(ringPicture([], 0, false).pixels, PALETTE, OWNER);   // the palette stored while the link is idle
    await this.seeker.actuators.led.set(NOSE_LED, TAIL_LED);
    await motor.stabilize(StabilizationIndex.full);
    void this.ladder.run().catch((e: unknown) => this.sender.log('warn', `brain ladder: ${String(e)}`));
    await this.obs.start();
    this.obs.afterVolley = () => void this.draw();

    const turns: { t: number, turned: number }[] = [];
    let last: number | null = null, lastHeading = 0;
    this.release = await this.seeker.sensors.motion.subscribe((s) => {
      const heading = mod360(-s.angles.yaw);
      this.heading = heading;
      if (last === null) { last = s.t; lastHeading = heading; return; }
      if (s.t - last < STEP_MS) { this.obs.stats.bunched++; return; }
      const dt = Math.min(250, s.t - last);
      const turned = ((heading - lastHeading + 540) % 360) - 180;
      last = s.t; lastHeading = heading;
      turns.push({ t: s.t, turned });
      while (s.t - turns[0]!.t > 1000) turns.shift();
      const still = turns.reduce((a, x) => a + Math.abs(x.turned), 0) < 20 ? 1 : 0;
      const sources: Record<string, number> = this.obs.tick(0, still);   // no motor: forward is 0
      const corners = ['FL', 'FR', 'BR', 'BL'].filter((c) => sources[`corner.${c}`]);
      if (sources['frame.carrier'] || sources['frame.miss'] || corners.length) this.flashUntil = performance.now() + FLASH_MS;
      if (this.obs.stats.landed > this.landed) {
        this.landed = this.obs.stats.landed;
        this.seeker.log('info', `brain read landed: corners ${corners.join(' ') || 'none named'}`);
      }
      this.net.step(sources, dt, turned);
      const want: string = (this.net.get('REQ_SHORT') ?? 0) > 0.5 ? 'short' : 'long';
      if (want !== this.range) { this.range = want; this.ladder.switch(want); this.seeker.log('info', `brain ladder ${want}`); }
    });
    // before the frames are timed, and for the flash's end
    this.drawTimer = setInterval(() => { if (!this.obs.timed || (this.flashUntil && performance.now() > this.flashUntil)) void this.draw(); }, 100);
    this.stateTimer = setInterval(() => this.state(), STATE_MS);
    this.seeker.log('info', `brain on: seeker ${this.seeker.name}, sender ${this.sender.name}, ladder long`);
  }

  /** What the ring holds now. */
  ring () { const r = this.net.ringRates(); return { ...ringVector(r), rates: r }; }

  /** The ring onto the matrix, when it changed and the last draw is DRAW_MS ago. */
  private async draw (): Promise<void> {
    if (!this.running || this.drawing) return;
    const now = performance.now();
    if (now - this.drawnAt < DRAW_MS) return;
    const flash = now < this.flashUntil;
    if (!flash) this.flashUntil = 0;
    const { rates, length } = this.ring();
    const pic = ringPicture(rates, length, flash);
    const key = pic.pixels.map((r) => r.map((v) => v.toString(16)).join('')).join('');
    if (key === this.drawn) return;
    this.drawing = true;
    this.drawnAt = now;
    try { await this.seeker.actuators.matrix.picture(pic.pixels, PALETTE, OWNER); this.drawn = key; }
    catch (e) { this.seeker.log('warn', `brain draw: ${String(e)}`); }
    finally { this.drawing = false; }
  }

  private state (): void {
    const { angle, length, rates } = this.ring();
    const s = this.obs.stats;
    const p = peaks(rates).map((a) => Math.round(a)).join('/');
    this.seeker.log('info', `brain ring ${Math.round((angle + 360) % 360)}° len ${length.toFixed(2)} yaw ${Math.round(this.heading)} peaks ${p || '-'} carrier ${this.obs.carrier ?? '-'} near ${this.obs.near ? 1 : 0} frames ${s.frames} reads ${s.reads} landed ${s.landed} named ${s.named} flooded ${s.flooded} misses ${s.misses}`);
  }

  async stop (): Promise<void> {
    this.running = false;
    if (this.drawTimer) clearInterval(this.drawTimer);
    if (this.stateTimer) clearInterval(this.stateTimer);
    this.ladder.running = false;
    await this.release?.();
    await this.obs.stop();
    await this.sender.communication.state('infrared', null).catch(() => {});
    await this.seeker.sensors.listenInfrared(false).catch(() => {});
    const { matrix } = this.seeker.actuators;
    await matrix.clear(OWNER).catch(() => {});
    matrix.release(OWNER);
    const { front, back } = this.seeker.config.colors;
    await this.seeker.actuators.led.set(front, back).catch(() => {});
    this.seeker.log('info', 'brain off');
  }

}

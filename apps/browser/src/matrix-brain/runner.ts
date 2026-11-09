// Matrix brain mode: one Bolt sends the ladder, the other runs the agent's
// brain and shows the ring on its matrix. Without motors the hand is the
// motor: the yaw from the motion stream shifts the ring, the observation
// layer sees the frames and the timed corner reads as in a seek. With
// `motors` the agent's motor layer drives the seeker as brain.mjs does, a
// roll after each volley, both Bolts armed for collisions, and the run ends
// on the tag (both reports within TAG_MS, brain/seek.mjs), the time limit
// of 1.5 times 30 s per metre of the given start distance, or a runaway by
// the locator. Logging into the session: a state line per second, the
// landed reads, the ladder's switches, the rolls' modes, the collisions and
// the result. The receiver already logs every notify and every read's reply.

import type { Bolt } from '@bolt/core';
import { mod360, StabilizationIndex } from '@bolt/core';
import { Network } from '../../../../packages/core/src/brain/connectome/network.mjs';
import { Observation } from '../../../../packages/core/src/brain/connectome/observation/observation.mjs';
import { ringVector } from '../../../../packages/core/src/brain/connectome/ring/ring.mjs';
import { LadderSender } from '../../../../packages/core/src/brain/utils/ladder.mjs';
import { motorCommand, fireRoll, MOTOR } from '../../../../packages/core/src/brain/connectome/motor/motor.mjs';
import { connectome } from './connectome';
import { ringPicture, peaks, PALETTE } from './render';

const OWNER = 'brain';
/** The seeker's LEDs while the mode runs: the nose a dim yellow the camera tells from the blue-green ring, the tail off. */
const NOSE_LED = [3, 3, 0] as const, TAIL_LED = [0, 0, 0] as const;
const STEP_MS = 25;        // the shortest network step, as brain.mjs
const DRAW_MS = 300;       // two commands of about 150 ms fit the beat's idle part after a volley
/** No pictures while the motors run: the picture's two commands per 300 ms loaded the link until a matrix command lost its ack and stalled the queue 3 s (run 10, 2026-11-09); the state line has the ring */
const DRAW_WHILE_DRIVING = false;
const FLASH_MS = 200;
const STATE_MS = 1000;
const ROLL_MS = 100;         // before the frames are timed, a roll this often (brain.mjs)
const TAG_MS = 300;          // both collision reports within this: found
const SECONDS_PER_M = 30;    // the goal; the run gets 1.5 times it
const RUNAWAY_CM = 250;      // the locator this far from the start ends the run
/** Collision thresholds of brain/seek.mjs: the seeker fires on contact, the standing sender on contact only. */
const THRESHOLDS = { seeker: { xThreshold: 15, yThreshold: 15, xSpeed: 0, ySpeed: 0 }, sender: { xThreshold: 10, yThreshold: 10, xSpeed: 0, ySpeed: 0 } };

/** `at`: the sender's place in the seeker's locator frame, from the sheet starts, for the replay's truth. */
export interface SeekOptions { motors: boolean; startCm: number; at?: { x: number, y: number } | undefined }
/** What a run leaves for the `good` mark: the replay's truth and the outcome. */
export interface RunSummary { seeker: string; sender: string; at: { x: number, y: number } | null; startCm: number; result: string; seconds: number }
/** What a listener gets after each network step: the network, the sources it stepped on, the step in ms. */
export interface BrainStep { net: Network; sources: Record<string, number>; dtMs: number }

export class MatrixBrain {

  /** Called after every network step, the brain view's live source; a listener that throws is logged and dropped, so a view never stops a run. */
  static readonly steps = new Set<(step: BrainStep) => void>();

  readonly seeker: Bolt;
  readonly sender: Bolt;
  private net = new Network(connectome);
  private obs: Observation & { afterVolley?: () => void; onRead: (payload: number[]) => void };
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
  private readonly options: SeekOptions;
  private cmd = { mode: 'scan', dir: null as number | null, heading: 0, speed: 0 };
  private commanded: number | null = null;
  private lastRoll = 0;
  private modes: Record<string, number> = {};
  private hit: Record<string, number> = {};
  private releases: (() => Promise<void>)[] = [];
  private t0 = 0;
  private start0: { x: number, y: number } | null = null;
  private result: string | null = null;
  /** The run's summary once it ended, for the mark. */
  summary: RunSummary | null = null;
  /** Resolves with the run's result once it ends; the toggle waits for it. */
  readonly ended: Promise<string>;
  private finish!: (result: string) => void;

  constructor (seeker: Bolt, sender: Bolt, options: SeekOptions = { motors: false, startCm: 100 }) {
    this.seeker = seeker;
    this.sender = sender;
    this.options = options;
    this.obs = new Observation(seeker, connectome.map.ir);
    this.ladder = new LadderSender(sender, 'long', 1);   // one beat per level, as brain/seek.mjs
    this.ended = new Promise((r) => { this.finish = r; });
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
    if (this.options.motors) {
      // the tag: both collision reports within TAG_MS
      for (const [name, bolt, thresholds] of [['seeker', this.seeker, THRESHOLDS.seeker], ['sender', this.sender, THRESHOLDS.sender]] as const) {
        this.releases.push(await bolt.sensors.collision.subscribe((c) => {
          this.hit[name] = Date.now();
          bolt.log('info', `brain collision ${name} at ${((this.hit[name]! - (this.t0 || this.hit[name]!)) / 1000).toFixed(1)} s, x ${c.xMagnitude} y ${c.yMagnitude}`);
          if (Math.abs((this.hit.seeker ?? -Infinity) - (this.hit.sender ?? -Infinity)) <= TAG_MS) this.end('found');
        }, thresholds));
      }
    }
    await this.obs.start();
    this.obs.afterVolley = () => { if (this.options.motors) this.roll(); void this.draw(); };
    let last: number | null = null;
    this.release = await this.seeker.sensors.motion.subscribe((s) => {
      const heading = mod360(-s.angles.yaw);
      this.heading = heading;
      if (this.options.motors) {
        if (!this.start0) this.start0 = { x: s.locator.positionX, y: s.locator.positionY };
        else if (Math.hypot(s.locator.positionX - this.start0.x, s.locator.positionY - this.start0.y) > RUNAWAY_CM) this.end('runaway');
      }
      const motion = { heading, x: s.locator.positionX, y: s.locator.positionY };
      if (last === null) { last = s.t; this.obs.tick(motion); this.commanded = heading; return; }
      if (s.t - last < STEP_MS) { this.obs.stats.bunched++; return; }
      const dt = Math.min(250, s.t - last);
      last = s.t;
      const sources: Record<string, number> = this.obs.tick(motion, this.options.motors ? this.cmd.speed / MOTOR.seekSpeed : 0);   // the motor's efference copy; by hand, 0
      const corners = ['FL', 'FR', 'BR', 'BL'].filter((c) => sources[`corner.${c}`]);
      if (sources['frame.carrier'] || sources['frame.miss'] || corners.length) this.flashUntil = performance.now() + FLASH_MS;
      if (this.obs.stats.landed > this.landed) {
        this.landed = this.obs.stats.landed;
        this.seeker.log('info', `brain read landed: corners ${corners.join(' ') || 'none named'}`);
      }
      this.net.step(sources, dt);
      for (const f of MatrixBrain.steps) {
        try { f({ net: this.net, sources, dtMs: dt }); } catch (e) { MatrixBrain.steps.delete(f); this.seeker.log('warn', `brain step listener dropped: ${String(e)}`); }
      }
      const want: string = (this.net.get('REQ_SHORT') ?? 0) > 0.5 ? 'short' : 'long';
      if (want !== this.range) { this.range = want; this.ladder.switch(want); this.seeker.log('info', `brain ladder ${want}`); }
      if (this.options.motors && !this.obs.timed && Date.now() - this.lastRoll >= ROLL_MS) this.roll();
    });
    // before the frames are timed, and for the flash's end
    this.drawTimer = setInterval(() => { if (!this.obs.timed || (this.flashUntil && performance.now() > this.flashUntil)) void this.draw(); }, 100);
    this.stateTimer = setInterval(() => this.state(), STATE_MS);
    if (this.options.motors) {
      const limitS = Math.max(20, 1.5 * SECONDS_PER_M * this.options.startCm / 100);
      setTimeout(() => this.end('time'), limitS * 1000);
      this.seeker.log('info', `brain seek: seeker ${this.seeker.name} on sender ${this.sender.name}, ${this.options.startCm} cm given, limit ${limitS.toFixed(0)} s, speed ${MOTOR.seekSpeed}`);
    } else this.seeker.log('info', `brain on: seeker ${this.seeker.name}, sender ${this.sender.name}, ladder long`);
  }

  /** The motor layer's roll, as brain.mjs: right after a volley, fired past the queue. */
  private roll (): void {
    if (this.commanded === null || !this.running || this.result) return;
    const now = Date.now();
    if (!this.t0) this.t0 = now;
    this.cmd = motorCommand(this.net, this.heading, this.commanded, Math.min(400, now - this.lastRoll));
    this.commanded = mod360(this.cmd.heading);
    this.lastRoll = now;
    this.modes[this.cmd.mode] = (this.modes[this.cmd.mode] ?? 0) + 1;
    void fireRoll(this.seeker, this.cmd.speed, this.commanded);
  }

  /** The run's end: the motor first, then the result into the log; the toggle does the rest. */
  private end (result: string): void {
    if (this.result) return;
    this.result = result;
    void this.seeker.actuators.motor.off().catch(() => {});
    const s = this.obs.stats, seconds = this.t0 ? (Date.now() - this.t0) / 1000 : 0;
    this.seeker.log('info', `brain seek ${result} after ${seconds.toFixed(1)} s: frames ${s.frames}, reads ${s.reads}, landed ${s.landed}, named ${s.named}, modes ${JSON.stringify(this.modes)}`);
    this.summary = { seeker: this.seeker.name, sender: this.sender.name, at: this.options.at ?? null, startCm: this.options.startCm, result, seconds: Math.round(seconds * 10) / 10 };
    this.finish(result);
  }

  /** What the ring holds now. */
  ring () { const r = this.net.ringRates(); return { ...ringVector(r), rates: r }; }

  /** The ring onto the matrix, when it changed and the last draw is DRAW_MS ago. */
  private async draw (): Promise<void> {
    if (!this.running || this.drawing || (this.options.motors && !DRAW_WHILE_DRIVING)) return;
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
    this.seeker.log('info', `brain ring ${Math.round((angle + 360) % 360)}° len ${length.toFixed(2)} yaw ${Math.round(this.heading)}${` dist ${Math.round(this.net.estimate().distance ?? 0)}`}${this.options.motors ? ` ${this.cmd.mode} speed ${Math.round(this.cmd.speed)}` : ''} peaks ${p || '-'} carrier ${this.obs.carrier ?? '-'} near ${this.obs.near ? 1 : 0} frames ${s.frames} reads ${s.reads} landed ${s.landed} named ${s.named} flooded ${s.flooded} misses ${s.misses}`);
  }

  async stop (): Promise<void> {
    this.running = false;
    if (this.options.motors) { this.end('stopped'); await this.seeker.actuators.motor.off().catch(() => {}); }
    if (this.drawTimer) clearInterval(this.drawTimer);
    if (this.stateTimer) clearInterval(this.stateTimer);
    this.ladder.running = false;
    await this.release?.();
    for (const r of this.releases) await r().catch(() => {});
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

// The mode's switches for the header: one MatrixBrain at a time, SB-9129 the
// seeker and SB-11DF the sender unless a run says otherwise; `brain`
// by hand, `seek` with the motors, which ends itself on the tag, the time
// limit or a runaway. A seek begins with both Bolts reset on reference
// points (the plotter's buttons) and starts where the seeker stands: the
// start distance is the points', and the sender's place in the seeker's
// locator frame is known for the replay. A fullstop or a disconnect turns
// either off. `Seek` is the same for the console and the browser tools, with
// the seek's exits and roles given for one run instead of the defaults.

import type { Bolt } from '@bolt/core';
import { NotConnectedError } from '@bolt/core';
import type { IEventMessage } from '@bolt/protocol';
import { Bolts } from '../bolts';
import { Plotter } from '../components/plotter/plotter';
import { session } from '../session';
import { MatrixBrain } from './runner';
import type { RunSummary, SeekOptions } from './runner';

export const ROLES = { seeker: 'SB-9129', sender: 'SB-11DF' };   // green seeks, blue sends (2026-11-09); `Seek.start({ seeker, sender })` swaps them for a run

/** The seek's exits, the user's: the time limit by start distance, cm and s, a start taking the nearest listed distance's; the runaway fence beyond the start distance. */
export const SEEK_DEFAULTS = { timeLimits: [[120, 60], [240, 100], [320, 130]] as [number, number][], fenceCm: 100 };
/** What one run may set instead of the defaults: its exits and its roles, the Bolts' names. */
export type SeekOverrides = Partial<Pick<SeekOptions, 'limitS' | 'fenceCm'>> & { seeker?: string; sender?: string };

let brain: MatrixBrain | null = null;
let busy = false;
let seeking = false;
/** The last seek's summary, until the user marks it good or the next seek starts. */
let lastRun: RunSummary | null = null;

export const matrixBrain = {
  get on (): boolean { return brain !== null; },
  get busy (): boolean { return busy; },

  get seeking (): boolean { return brain !== null && seeking; },
  /** A seek has ended and is not marked yet. */
  get markable (): boolean { return lastRun !== null && brain === null; },

  /** The user's verdict after a seek: the run is good for the replay bench, which takes only marked runs. */
  markGood (): void {
    if (!lastRun) return;
    const seeker = Bolts.get(lastRun.seeker) as Bolt | undefined;
    (seeker ?? Bolts.map((b: Bolt) => b)[0])?.log('info', `brain replay ${JSON.stringify(lastRun)}`);
    lastRun = null;
  },

  /** `motors`: a seek run from the points both Bolts were reset on, its exits and roles the defaults unless `overrides` gives them; otherwise the mode by hand. A running mode is turned off either way. */
  async toggle (motors = false, overrides: SeekOverrides = {}): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (brain) { const b = brain; brain = null; await b.stop(); return; }
      const names = { seeker: overrides.seeker ?? ROLES.seeker, sender: overrides.sender ?? ROLES.sender };
      const seeker = Bolts.get(names.seeker) as Bolt | undefined, sender = Bolts.get(names.sender) as Bolt | undefined;
      if (!seeker || !sender) throw new NotConnectedError(seeker ? names.sender : names.seeker);
      let startCm = 23, at: { x: number, y: number } | undefined;
      if (motors) {
        const from = Plotter.startOf(seeker.name), senderAt = Plotter.startOf(sender.name);
        if (!from || !senderAt) throw new Error('no start on the sheet');
        at = Plotter.toLocator(seeker.name, senderAt.x, senderAt.y)!;   // the sender in the seeker's locator frame, from the points
        startCm = Math.round(Math.hypot(from.x - senderAt.x, from.y - senderAt.y));
        lastRun = null;
      }
      const [, limitS] = SEEK_DEFAULTS.timeLimits.reduce((a, b) => (Math.abs(b[0] - startCm) < Math.abs(a[0] - startCm) ? b : a));
      const b = new MatrixBrain(seeker, sender, { motors, startCm, at, limitS: overrides.limitS ?? limitS, fenceCm: overrides.fenceCm ?? SEEK_DEFAULTS.fenceCm });
      seeking = motors;
      if (motors) void b.ended.then(() => { lastRun = b.summary; if (brain === b) void matrixBrain.toggle(); });
      const off = () => { if (brain === b) void matrixBrain.toggle(); };
      seeker.events.on('fullstop', off);
      sender.events.on('fullstop', off);
      seeker.events.on('disconnected', off);
      sender.events.on('disconnected', off);
      brain = b;
      await b.start();
    } finally { busy = false; }
  },
};

/** For the console and the browser tools: `Seek.start({ limitS: 120, seeker: 'SB-11DF', sender: 'SB-9129' })` seeks with the exits and roles given, `stop()` ends it, `last()` is the last run's brain lines in order, seconds first, without the step and roll lines unless asked. */
export const Seek = {
  defaults: SEEK_DEFAULTS,
  start: (overrides: SeekOverrides = {}): Promise<void> => matrixBrain.toggle(true, overrides),
  stop: (): Promise<void> => (matrixBrain.on ? matrixBrain.toggle() : Promise.resolve()),
  async last ({ steps = false, rolls = false } = {}): Promise<string[]> {
    const brain = (await session.messages()).filter((e): e is IEventMessage => e.kind === 'event' && e.name === 'info' && typeof e.data === 'string' && /^brain /.test(e.data));
    const i0 = brain.map((e) => /^brain seek:/.test(e.data as string)).lastIndexOf(true);
    const run = brain.slice(Math.max(0, i0)), t0 = run[0]?.t ?? 0;
    return run.filter((e) => (steps || !/^brain step/.test(e.data as string)) && (rolls || !/^brain roll/.test(e.data as string))).map((e) => `${((e.t - t0) / 1000).toFixed(1)} ${e.data as string}`);
  },
};

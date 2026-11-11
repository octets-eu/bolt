// The mode's switches for the header: one MatrixBrain at a time, SB-9129 the
// seeker and SB-11DF the sender until the header offers the choice; `brain`
// by hand, `seek` with the motors, which ends itself on the tag, the time
// limit or a runaway. A seek begins with both Bolts reset on reference
// points (the plotter's buttons) and starts where the seeker stands: the
// start distance is the points', and the sender's place in the seeker's
// locator frame is known for the replay. A fullstop or a disconnect turns
// either off.

import type { Bolt } from '@bolt/core';
import { NotConnectedError } from '@bolt/core';
import { Bolts } from '../bolts';
import { Plotter } from '../components/plotter/plotter';
import { MatrixBrain } from './runner';
import type { RunSummary } from './runner';

export const ROLES = { seeker: 'SB-9129', sender: 'SB-11DF' };   // green seeks, blue sends (2026-11-09)

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

  /** `motors`: a seek run from the points both Bolts were reset on; otherwise the mode by hand. A running mode is turned off either way. */
  async toggle (motors = false): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (brain) { const b = brain; brain = null; await b.stop(); return; }
      const seeker = Bolts.get(ROLES.seeker) as Bolt | undefined, sender = Bolts.get(ROLES.sender) as Bolt | undefined;
      if (!seeker || !sender) throw new NotConnectedError(seeker ? ROLES.sender : ROLES.seeker);
      let startCm = 23, at: { x: number, y: number } | undefined;
      if (motors) {
        const from = Plotter.startOf(seeker.name), senderAt = Plotter.startOf(sender.name);
        if (!from || !senderAt) throw new Error('no start on the sheet');
        at = Plotter.toLocator(seeker.name, senderAt.x, senderAt.y)!;   // the sender in the seeker's locator frame, from the points
        startCm = Math.round(Math.hypot(from.x - senderAt.x, from.y - senderAt.y));
        lastRun = null;
      }
      const b = new MatrixBrain(seeker, sender, { motors, startCm, at });
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

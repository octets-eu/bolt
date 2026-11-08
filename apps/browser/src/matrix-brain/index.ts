// The mode's switches for the header: one MatrixBrain at a time, SB-9129 the
// seeker and SB-11DF the sender until the header offers the choice; `brain`
// by hand, `seek` with the motors, which ends itself on the tag, the time
// limit or a runaway. A seek begins with both Bolts reset on the plan's
// starts, back to back; the seeker first rolls `PRE_ROLL_CM` south on the
// sheet by its navigation, so the seek starts about 1.2 m from the sender
// (23 cm was the hard end, 2026-11-08), and the locator frame stays the
// reset's, so the sender's place is known for the replay. A fullstop or a
// disconnect turns either off.

import type { Bolt } from '@bolt/core';
import { NotConnectedError } from '@bolt/core';
import { Bolts } from '../bolts';
import { Plotter } from '../components/plotter/plotter';
import { MatrixBrain } from './runner';
import type { RunSummary } from './runner';

export const ROLES = { seeker: 'SB-9129', sender: 'SB-11DF' };
const PRE_ROLL_CM = 120;

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

  /** `motors`: a seek run, after the pre-roll south from the start; otherwise the mode by hand. A running mode is turned off either way. */
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
        at = Plotter.toLocator(seeker.name, senderAt.x, senderAt.y)!;   // the sender in the seeker's locator frame, from the sheet
        const target = Plotter.toLocator(seeker.name, from.x, from.y + PRE_ROLL_CM)!;
        seeker.log('info', `brain pre-roll ${PRE_ROLL_CM} cm south on the sheet, to locator (${target.x.toFixed(0)}, ${target.y.toFixed(0)})`);
        await seeker.navigation.rollToPoint(target);
        startCm = Math.round(Math.hypot(from.x - senderAt.x, from.y + PRE_ROLL_CM - senderAt.y));
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

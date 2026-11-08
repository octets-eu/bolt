// The mode's switch for the header: one MatrixBrain at a time, SB-9129 the
// seeker and SB-11DF the sender until the header offers the choice. A
// fullstop or a disconnect turns it off.

import type { Bolt } from '@bolt/core';
import { NotConnectedError } from '@bolt/core';
import { Bolts } from '../bolts';
import { MatrixBrain } from './runner';

export const ROLES = { seeker: 'SB-9129', sender: 'SB-11DF' };

let brain: MatrixBrain | null = null;
let busy = false;

export const matrixBrain = {
  get on (): boolean { return brain !== null; },
  get busy (): boolean { return busy; },

  async toggle (): Promise<void> {
    if (busy) return;
    busy = true;
    try {
      if (brain) { const b = brain; brain = null; await b.stop(); return; }
      const seeker = Bolts.get(ROLES.seeker) as Bolt | undefined, sender = Bolts.get(ROLES.sender) as Bolt | undefined;
      if (!seeker || !sender) throw new NotConnectedError(seeker ? ROLES.sender : ROLES.seeker);
      const b = new MatrixBrain(seeker, sender);
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

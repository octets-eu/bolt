import type { Bolts } from './bolts';
import type { session } from './session';
import type { tracker } from './tracking/tracker';
import type { Debug } from './debug/debug';

declare global {
  /** Git commit of the app, from vite.config.ts; "+dirty" when the tree had changes at server start. */
  const __COMMIT__: string;

  interface Window {
    Bolts: typeof Bolts;
    Session: typeof session;
    Tracker: typeof tracker;
    Debug: typeof Debug;
  }
}

export {};

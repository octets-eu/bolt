import type { Bolts } from './bolts';
import type { session } from './session';
import type { tracker } from './tracking/tracker';
import type { Debug } from './debug/debug';
import type { brainView } from './brain-view/view';
import type { Seek } from './matrix-brain';
import type { Survey } from './survey';

declare global {
  /** Git commit of the app, set in the page's head by vite.config.ts at every page load; "+dirty" when the tree had changes. */
  const __COMMIT__: string;

  interface Window {
    Bolts: typeof Bolts;
    Session: typeof session;
    Tracker: typeof tracker;
    Debug: typeof Debug;
    BrainView: typeof brainView;
    Seek: typeof Seek;
    Survey: typeof Survey;
  }
}

export {};

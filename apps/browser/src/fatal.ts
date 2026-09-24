import { Bolt } from '@bolt/core';

import { Bolts } from './bolts';
import { Logger } from './components/logger/logger';
import { tracker } from './tracking/tracker';

let failed = false;

/**
 * Any error ends the session: nothing is recovered, the page is reloaded.
 * The first error is logged, the app stops its own work, then every
 * connected Bolt fails, see Lifecycle.fail. Later errors are echoes of the
 * first and change nothing.
 */
export function fatal (error: unknown): void {
  if (failed) return;
  failed = true;
  Logger.fatal({ name: '*' }, `${String(error)}, reload the page`);
  tracker.stop();
  Bolts.forEach((bolt: Bolt) => {
    if (bolt.connected) bolt.lifecycle.fail(error);
  });
}

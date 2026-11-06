// The seeker on the floor during a run, by the camera: each fresh frame
// against the dark frame of the start, the brightest rise is the seeker, lit
// white. A point is where the seeker was about 1.9 s before it arrives (the
// stream's lag, camera.mjs), so a fence on it stops late by that much driving.

import sharp from 'sharp';
import { cam, litBlob } from './camera.mjs';

const LAG_MS = 1900;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Follow until `stop()`; `onPoint({ t, x, y })`, t the floor's moment (ms epoch), x y plan cm. */
export function track (dark, map, onPoint) {
  let running = true, lastT = 0;
  const done = (async () => {
    while (running) {
      const r = await cam('frame').catch(() => ({ text: '' }));
      if (r.text.startsWith('frame')) {
        const [, size, age] = r.text.split(' ').map(Number);
        const t = Date.now() - age - LAG_MS;
        if (t > lastT + 200 && r.bytes.length === size) {
          lastT = t;
          const { data, info } = await sharp(r.bytes).greyscale().raw().toBuffer({ resolveWithObject: true });
          const blob = litBlob({ gray: data, w: info.width, h: info.height }, dark, 20);
          if (blob.found) onPoint({ t, ...map.toPlan(blob) });
        }
      }
      await wait(250);
    }
  })();
  return async () => { running = false; await done; };
}

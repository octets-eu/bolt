// Find both Bolts by the camera and, when asked, drive one to a plan spot in
// short time-capped legs, a frame after each. The first leg goes straight
// ahead for a moment: the camera's displacement gives phi, plan heading minus
// heading frame, and the speed per command. Prints, appends nothing.
//
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/place.mjs [name x y [first]]

import { mod360 } from '@bolt/core';
import { NAMES, bringUp, locate, leg, letGo, cam, pt, r1, dist, planHeading } from './utils/rig.mjs';

const [name, tx, ty, first = 0] = process.argv.slice(2);   // first: heading of the first leg, 180 backs away from what the Bolt faces
const SPEED = 40, FIRST_MS = 700, MAX_CM = 35, TOL = 8, MAX_LEGS = 8;

const entries = [];
try {
  console.log(`camera ${(await cam('on')).text}`);
  for (const n of NAMES) {
    const e = await bringUp(n);
    console.log(`${n} battery state ${e.bolt.status.battery}`);
    if (e.bolt.status.battery >= 2) throw new Error(`${n} battery low`);
    entries.push(e);
  }
  let { at } = await locate(entries, 'place0');
  for (const n of NAMES) console.log(`${n} at ${pt(at[n])}`);
  console.log(`apart ${r1(dist(at[NAMES[0]], at[NAMES[1]]))} cm`);

  if (name) {
    const e = entries.find((x) => x.name === name), target = { x: Number(tx), y: Number(ty) };
    let here = at[name], phi = null, cmPerMs = null;
    for (let i = 1; i <= MAX_LEGS && dist(here, target) > TOL; i++) {
      const togo = dist(here, target);
      const heading = phi === null ? Number(first) : mod360(planHeading({ x: target.x - here.x, y: target.y - here.y }) - phi);
      const ms = phi === null ? FIRST_MS : Math.min(MAX_CM, togo) / Math.max(cmPerMs, 0.018)   // a leg that was held back must not make the next one long;
      await leg(e, heading, SPEED, ms);
      const now = (await locate([e], `place${i}`)).at[name];
      const moved = dist(now, here);
      console.log(`leg ${i}: heading ${r1(heading)}, ${Math.round(ms)} ms, moved ${r1(moved)} cm to ${pt(now)}, ${r1(dist(now, target))} to go`);
      if (moved > 2) {
        const seen = mod360(planHeading({ x: now.x - here.x, y: now.y - here.y }) - heading);
        phi = phi === null ? seen : mod360(phi + 0.5 * (((seen - phi + 540) % 360) - 180));
        cmPerMs = moved / ms;
      } else if (phi === null) throw new Error(`${name} did not move`);
      if (moved > MAX_CM * 1.6) throw new Error(`${name} moved ${r1(moved)} cm in one leg`);
      here = now;
    }
    console.log(`phi ${r1(phi)}°, ${r1(cmPerMs * 1000)} cm/s at speed ${SPEED}`);
    at = (await locate(entries, 'placed')).at;
    console.log(`apart ${r1(dist(at[NAMES[0]], at[NAMES[1]]))} cm: ${NAMES.map((n) => `${n} ${pt(at[n])}`).join(', ')}`);
  }
} catch (err) {
  console.log(`ERROR ${err.message}`);
} finally {
  await letGo(entries);
  console.log(`camera ${(await cam('off')).text}`);
}

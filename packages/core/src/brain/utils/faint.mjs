// Where a Bolt's light shows at all: lit against dark with no minimum rise,
// for a Bolt half hidden. Prints the peak's pixel, plan point and rise.
// --wiggle: short gentle legs on headings 0, 90, 180, 270 of its own frame,
// a look after each, until it shows clearly (rise 25), to free a hidden Bolt.
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/faint.mjs [name] [--wiggle]
import { bringUp, light, letGo, cam, leg } from './rig.mjs';
import { frameAfter, litBlob, partitionEnds, similarity } from './camera.mjs';
const e = await bringUp(process.argv.slice(2).find((a) => a.startsWith('SB-')) ?? 'SB-9129');
await cam('on');
const look = async () => {
  await light(e, false);
  const dark = await frameAfter(Date.now());
  await light(e, true);
  const lit = await frameAfter(Date.now());
  const b = litBlob(lit, dark, 0), ends = partitionEnds(dark), map = similarity(ends.left, ends.right);
  console.log(`peak pixel (${Math.round(b.x)}, ${Math.round(b.y)}), rise ${b.rise}, plan`, map.toPlan(b));
  return b.rise;
};
let rise = await look();
for (const h of process.argv.includes('--wiggle') ? [0, 90, 180, 270] : []) {
  if (rise >= 25) break;
  await leg(e, h, 30, 600);
  console.log(`leg on ${h}`);
  rise = await look();
}
await letGo([e]); await cam('off'); process.exit(0);

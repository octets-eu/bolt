// One frame with a Bolt lit white, downscaled to frames/look.jpg, for finding a Bolt by eye.
//   BRIDGE_HOST=192.168.5.2 npx tsx packages/core/src/brain/utils/look.mjs [name]
import sharp from 'sharp';
import { bringUp, light, letGo, cam } from './rig.mjs';
import { frameAfter } from './camera.mjs';
const e = await bringUp(process.argv[2] ?? 'SB-9129');
console.log((await cam('on')).text, 'battery', e.bolt.status.battery);
await light(e, true);
const f = await frameAfter(Date.now());
await sharp(f.jpeg).resize(600).toFile('frames/look.jpg');
await letGo([e]); await cam('off'); process.exit(0);

// Counts a ladder survey, the app's Survey.ladder, from a session file: per
// pass, a distance and a sender, the frames heard of the sends per strength,
// in all and by the listener's heading, and the corner reads fired, replied
// and hit, with the volleys that had a hit.
//
//   node bench/ladder.mjs frames/session-<stamp>.jsonl
//
// A segment lies between a `ladder seg` line, which names the pass, and the
// next `ladder segend`. A frame is a code's notify more than SECOND_MS after
// that code's last one; a volley is reads less than VOLLEY_MS apart; a read
// hits when a receiver names a code.

import { readFileSync } from 'node:fs';

const SECOND_MS = 120, VOLLEY_MS = 60;
const SEND = 42, READ = 34, NONE = 255;   // the sensor device's commands, a receiver that hears nothing

const file = process.argv[2];
if (!file) { console.error('usage: node bench/ladder.mjs <session.jsonl>'); process.exit(1); }

const passes = new Map();   // the pass's title -> its counts
let seg = null;
for (const line of readFileSync(file, 'utf8').split('\n')) {
  if (!line) continue;
  const e = JSON.parse(line), text = e.name === 'info' && typeof e.data === 'string' ? e.data : '';
  if (text.startsWith('ladder seg ')) seg = open(JSON.parse(text.slice(11)));
  else if (text === 'ladder segend') seg = null;
  else if (seg) count(seg, e);
}

/** A segment's state, its pass made on the first one. */
function open ({ cm, sender, listener, heading, codes, strengths }) {
  const title = `${cm} cm, ${sender} sends, ${listener} listens`;
  if (!passes.has(title)) passes.set(title, { strengths, sent: codes.map(() => 0), acked: 0, frames: codes.map(() => 0), headings: new Map(), fired: 0, replied: 0, hit: 0, volleys: 0, volleysHit: new Set() });
  const pass = passes.get(title);
  if (!pass.headings.has(heading)) pass.headings.set(heading, { frames: codes.map(() => 0), fired: 0, hit: 0 });
  return { pass, at: pass.headings.get(heading), sender, listener, codes, sends: new Set(), reads: new Map(), last: new Map(), volleyAt: -Infinity };
}

function count (s, e) {
  const { pass, at } = s, msg = e.data?.msg;
  if (e.bolt === s.sender && e.name === 'action' && e.data.command === SEND) {
    pass.sent[s.codes.indexOf(e.data.payload[0])]++;
    s.sends.add(e.data.id);
  } else if (e.bolt === s.sender && e.name === 'ack' && msg.command === SEND && s.sends.delete(msg.id)) {
    pass.acked++;
  } else if (e.bolt === s.listener && e.name === 'infrared') {
    const code = msg.payload[0], k = s.codes.indexOf(code);
    if (k >= 0 && e.t - (s.last.get(code) ?? -Infinity) > SECOND_MS) { pass.frames[k]++; at.frames[k]++; }
    s.last.set(code, e.t);
  } else if (e.bolt === s.listener && e.name === 'action' && e.data.command === READ) {
    if (e.t - s.volleyAt > VOLLEY_MS) pass.volleys++;
    s.volleyAt = e.t;
    pass.fired++; at.fired++;
    s.reads.set(e.data.id, pass.volleys);   // the read's volley, until its reply
  } else if (e.bolt === s.listener && e.name === 'ack' && msg.command === READ && s.reads.has(msg.id)) {
    const volley = s.reads.get(msg.id);
    s.reads.delete(msg.id);
    pass.replied++;
    if (msg.payload.some((c) => c !== NONE)) { pass.hit++; at.hit++; pass.volleysHit.add(volley); }
  }
}

const row = (name, cells) => `  ${name.padEnd(12)}${cells.map((c) => String(c).padStart(5)).join('')}`;
for (const [title, p] of passes) {
  console.log(`${title}: ${p.acked} of ${p.sent.reduce((a, b) => a + b, 0)} sends acked`);
  console.log(row('strength', p.strengths));
  console.log(row('sent', p.sent));
  console.log(row('frames', p.frames));
  for (const [heading, h] of p.headings) console.log(`${row(`heading ${heading}`, h.frames)}   reads hit ${h.hit} of ${h.fired}`);
  console.log(`  reads: ${p.fired} fired, ${p.replied} replied, ${p.hit} hit; volleys: ${p.volleys}, ${p.volleysHit.size} with a hit`);
}
if (!passes.size) console.log('no ladder survey in this file');

// The ring on the seeker's matrix, egocentric like the ring: the border pixel
// toward the ring's direction, the top row taken as the nose. Green while
// targeted, blue while scanning, dim red while roaming, brighter with a
// longer vector. Two pixel commands at most per update, twice a second,
// right after a roll, in the link's idle part of the beat.

const OWNER = 'brain', BLACK = [0, 0, 0], EVERY_MS = 500;

function borderPixel (deg) {
  const a = deg * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a);
  const t = 3.5 / Math.max(Math.abs(dx), Math.abs(dy));
  return { x: Math.round(3.5 + dx * t), y: Math.round(3.5 + dy * t) };
}

export class MatrixView {

  constructor (bolt) { this.matrix = bolt.actuators.matrix; this.last = 0; this.pixel = null; }

  async start () { this.matrix.hold(OWNER); await this.matrix.clear(OWNER); }

  update (brain) {
    const now = Date.now();
    if (now - this.last < EVERY_MS) return;
    this.last = now;
    const ring = brain.ring(), mode = brain.cmd.mode;
    const peak = ring.rates.indexOf(Math.max(...ring.rates));
    const angle = mode === 'target' ? ring.angle : peak * 360 / ring.rates.length;
    const k = Math.min(1, 0.25 + ring.length / 2);
    const color = mode === 'target' ? [0, 255 * k, 0] : mode === 'probe' ? [0, 160 * k, 255 * k] : mode === 'scan' ? [0, 0, 255 * k] : [60, 0, 0];
    const p = Math.max(...ring.rates) > 0.02 ? borderPixel(angle) : { x: 3, y: 3 };
    const old = this.pixel;
    this.pixel = p;
    void (async () => {
      if (old && (old.x !== p.x || old.y !== p.y)) await this.matrix.pixel(old.x, old.y, BLACK, OWNER);
      await this.matrix.pixel(p.x, p.y, color.map(Math.round), OWNER);
    })().catch(() => {});
  }

  async stop () { await this.matrix.clear(OWNER).catch(() => {}); this.matrix.release(OWNER); }

}

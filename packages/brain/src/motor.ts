// The motor neurons' rates as a Bolt's roll: a heading in its heading frame
// and a speed, gentle on purpose.
//
// - Targeted, M_SEARCH under half: turn toward atan2(R - L, F - B), the
//   ring's direction off the nose, at most `maxTurn` per command, and drive
//   in proportion to how far ahead it lies (scaling by the ring's length too
//   dithered 20 s at the start and softened the contact, 2026-11-06); a sender behind is turned to in
//   place first. While driving, the nose casts: a weave of +-`castDeg` over
//   `castMs`, as a moth casts across a plume. The ring is shifted by the yaw,
//   so carrier frames heard at one end of the swing pile up on that side and
//   tip the axis the gradient leaves open; the swing also widens the catch
//   at contact, where straight drives passed the sender by a few cm. Near,
//   on the short ladder (IR_NEAR), the weave narrows to `nearCastDeg` and a
//   sender more than `nearDriveDeg` off is turned to in place: the full weave
//   and arcs of up to 60 deg circled the sender at 13 to 20 cm for 30 s, where
//   a hit needs the nose within about 14 deg at 30 cm (2026-11-07).
// - The axis, M_AXIS on, the ring holding nose and tail with no side: stand
//   and listen for `listenMs`, the sender in the lobe, for a corner read to
//   name the side; then probe ahead for the gradient. Turning or driving, the
//   corner reads hardly land: in one scan none of 102 did, standing facing
//   the sender six in seven volleys (2026-11-07).
// - Search, M_SEARCH over half: turn on the spot in steps of `scanStep`,
//   standing `scanHoldMs` after each, as the sweep listens a round per
//   heading; with nothing heard at all, M_ROAM, roll a wide circle instead,
//   to come into range.
//
// `fireRoll` sends the roll past the queue, like the reads and the listen's
// re-arm: a queued roll waited 3 s behind a matrix picture that lost its
// ack and the seeker drove blind on its last command (run 10, 2026-11-09).

import { DeviceId, DrivingCommand, Target, mod360 } from '@bolt/core';
import type { Bolt } from '@bolt/core';
import type { Network } from './network';

/** A roll: the mode it serves, the ring's direction off the nose it followed (none for the scan and the roam), the heading and speed to send. */
export interface Roll { mode: 'target' | 'listen' | 'probe' | 'scan' | 'roam'; dir: number | null; heading: number; speed: number }

/** The roll as a fired command: heading in the Bolt's heading frame, speed 0..255; the status heading follows. */
export function fireRoll (bolt: Pick<Bolt, 'status' | 'queue'>, speed: number, heading: number): Promise<void> {
  const h = mod360(Math.round(heading)), v = Math.min(255, Math.max(0, Math.round(speed)));
  bolt.status.heading = h;
  return bolt.queue.fire({ name: 'roll', device: DeviceId.driving, id: DrivingCommand.driveWithHeading, target: Target.st, data: [v, (h >> 8) & 0xff, h & 0xff, 0] }, 300).then(() => undefined, () => undefined);
}

export const MOTOR = {
  seekSpeed:   32,    // roll speed, about 17 cm/s (40 gave 22); at 21 cm/s runs passed 15 cm off, at 13 a touch went unreported
  probeSpeed:  28,
  listenMs:    2500,  // standing on the axis before the probe
  scanStep:    45,    // deg per turn of the scan
  scanHoldMs:  1300,  // standing after each, a round and a half of the long ladder
  roamSpeed:   25,
  maxTurn:     35,    // deg per command
  castDeg:     45,    // weave amplitude while targeting: past the edge of the carrier's lobe
  castMs:      2500,  // weave period
  nearCastDeg: 15,
  nearDriveDeg: 30,
};

const state: { axisSince: number | null; scanAt: number } = { axisSince: null, scanAt: 0 };
const cast = (deg: number): number => deg * Math.sin(2 * Math.PI * Date.now() / MOTOR.castMs);

/** `heading`: where the nose points; `commanded`: the last roll's heading, which listening and the scan's stand hold; `dtMs` since that roll. */
export function motorCommand (net: Pick<Network, 'get'>, heading: number, commanded: number, dtMs: number): Roll {
  const F = net.get('M_FWD'), B = net.get('M_BACK'), R = net.get('M_RIGHT'), L = net.get('M_LEFT');
  const search = net.get('M_SEARCH'), roam = net.get('M_ROAM');
  if (search <= 0.5) {
    const dir = Math.atan2(R - L, F - B) * 180 / Math.PI;
    const near = net.get('IR_NEAR') > 0.5;
    const driving = Math.abs(dir) <= (near ? MOTOR.nearDriveDeg : 60);
    const turn = Math.max(-MOTOR.maxTurn, Math.min(MOTOR.maxTurn, dir + (driving ? cast(near ? MOTOR.nearCastDeg : MOTOR.castDeg) : 0)));
    const ahead = Math.max(0, Math.cos(dir * Math.PI / 180)) ** 2;
    return { mode: 'target', dir, heading: heading + turn, speed: driving ? MOTOR.seekSpeed * ahead : 0 };
  }
  const now = Date.now();
  if (net.get('M_AXIS') > 0) {
    state.axisSince ??= now;
    return now - state.axisSince < MOTOR.listenMs ? { mode: 'listen', dir: 0, heading: commanded, speed: 0 } : { mode: 'probe', dir: 0, heading, speed: MOTOR.probeSpeed };
  }
  state.axisSince = null;
  if (roam > 0.5) return { mode: 'roam', dir: null, heading: commanded + 35 * dtMs / 1000, speed: MOTOR.roamSpeed };
  if (now - state.scanAt < MOTOR.scanHoldMs) return { mode: 'scan', dir: null, heading: commanded, speed: 0 };
  state.scanAt = now;
  return { mode: 'scan', dir: null, heading: heading + MOTOR.scanStep, speed: 0 };
}

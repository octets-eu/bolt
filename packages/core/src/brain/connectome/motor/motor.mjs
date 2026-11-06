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
//   at contact, where straight drives passed the sender by a few cm.
// - Search, M_SEARCH over half: turn on the spot at `scanDegPerS`, the lobes
//   sweeping past the sender; with nothing heard at all, M_ROAM, roll a
//   wide circle instead, to come into range.

export const MOTOR = {
  seekSpeed:   32,    // roll speed, about 17 cm/s (40 gave 22); at 21 cm/s runs passed 15 cm off, at 13 a touch went unreported
  probeSpeed:  28,
  roamSpeed:   25,
  maxTurn:     35,    // deg per command
  scanDegPerS: 70,
  castDeg:     45,    // weave amplitude while targeting: past the edge of the carrier's lobe
  castMs:      2500,  // weave period
};

const cast = () => MOTOR.castDeg * Math.sin(2 * Math.PI * Date.now() / MOTOR.castMs);

/** `heading`: where the nose points; `commanded`: the last roll's heading, which a scan advances; `dtMs` since that roll. */
export function motorCommand (net, heading, commanded, dtMs) {
  const F = net.get('M_FWD'), B = net.get('M_BACK'), R = net.get('M_RIGHT'), L = net.get('M_LEFT');
  const search = net.get('M_SEARCH'), roam = net.get('M_ROAM');
  if (search <= 0.5) {
    const dir = Math.atan2(R - L, F - B) * 180 / Math.PI;
    const driving = Math.abs(dir) <= 60;
    const turn = Math.max(-MOTOR.maxTurn, Math.min(MOTOR.maxTurn, dir + (driving ? cast() : 0)));
    const ahead = Math.max(0, Math.cos(dir * Math.PI / 180)) ** 2;
    return { mode: 'target', dir, heading: heading + turn, speed: driving ? MOTOR.seekSpeed * ahead : 0 };
  }
  if (net.get('M_AXIS') > 0) return { mode: 'probe', dir: 0, heading, speed: MOTOR.probeSpeed };
  if (roam > 0.5) return { mode: 'roam', dir: null, heading: commanded + MOTOR.scanDegPerS * dtMs / 2000, speed: MOTOR.roamSpeed };
  return { mode: 'scan', dir: null, heading: commanded + MOTOR.scanDegPerS * dtMs / 1000, speed: 0 };
}

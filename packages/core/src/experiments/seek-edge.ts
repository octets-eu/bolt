import type { Bolt } from '../bolt';
import type { Context } from '../context';
import { LADDER } from './seek-to-collision';
import { angleDistance, distance, mod360 } from '../helpers/math';
import type { Point } from '../helpers/math';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';

/**
 * seekEdge: the seeker that keeps the sender on the edge of its hearing and
 * tacks toward it.
 *
 * The weakest level of the ladder that arrives is heard with the sender
 * within about 60 degrees of the fore-aft axis, either end, and falls
 * silent with the sender abeam (pass-by, 2026-10-05). Inside that lobe the
 * notifies say nothing about the direction; they only change at its edge.
 * So the seeker holds the sender at an edge, `edge` degrees off its nose,
 * and rolls: a round in which the carrier is heard means the sender slid
 * inward, turn a step away from its side; a round in which it is silent
 * while a stronger level came through means it slid out, turn a step toward
 * it. A leg closes `legCm` cos(edge) on the sender.
 *
 * Standing at first, the same rule turns the ball until the verdict
 * changes, which is the edge; then it rolls. A leg ends after `legCm` by the
 * locator, or as soon as the carrier has been silent `slidOut` rounds in a
 * row: the sender has slid out of the lobe faster than a step a round can
 * follow, which happens the nearer it is. Then the ball stands, turns 2 edge
 * through the sender, and holds the other edge for the next leg: tacking,
 * so the path stays within half a leg of the line to the sender and the two
 * edges' asymmetry cancels, with legs that shorten by themselves near the
 * sender.
 *
 * A leg cut short carries the range: the sender crosses the edge zone,
 * about 20 degrees, while the ball rolls the leg at `edge` off it, so the
 * distance is about sin(edge) / 0.35 = `rangeFactor` times the leg. When
 * `dashAfter` legs in a row were cut short, the ball turns only `edge`, so
 * it faces the sender, and rolls straight `rangeFactor` times the last leg
 * and a ball more; the collision ends the run, or the ball stops and tacks
 * on.
 *
 * A sender behind sounds the same as one ahead. The turns the rule orders
 * while rolling tell them apart: approaching, every leg turns toward the
 * side the sender is held on, because it drifts aft; receding, away. When
 * the last `legWindow` legs, all on one carrier, sum to `flipNet` of turning
 * away, the sender is at the other end: half a turn, on with the legs.
 *
 * The carrier is the weakest level heard in the last `history` rounds. A
 * round with no notify says nothing; standing it turns the ball a step, to
 * find anything.
 *
 * Runs 1 and 2 (2026-10-10, 1.5 m, green seeking, one edge held for the
 * whole approach, a spiral) found the edge and came to 54 and 82 cm; both
 * then lost the weakest level to a carrier that moved up, and the spiral's
 * swing ended at the partition. Their near, slow and dash rules are gone.
 * Run 3 (fixed legs of 40 cm) tacked from 152 to 45 cm in nine legs; near
 * the sender the legs went sideways, 36 cm of swing for 17 cm closed.
 *
 * A belief over directions is kept as in `seek` and logged, for the record:
 * it does not steer. Logs `edge start` with the constants and one `edge`
 * record per round with the verdict, the side, the leg's net turn, the
 * last legs and the belief. Ends on fullstop.
 */
export interface SeekEdgeResult {
  rounds: number;
  heard: number;
  silent: number;
  none: number;
  /** Rounds standing before the first edge. */
  standing: number;
  legs: number;
  /** Legs ended by the sender sliding out, and dashes. */
  shortLegs: number;
  dashes: number;
  flips: number;
  events: number;
}

/**
 * `onStandingTurn` is called before every standing turn, tack, flip or the
 * turn into a dash: a hard turn out of rolling trips the collision detector
 * on the floor (run 3), so a referee can disregard reports right after.
 */
export async function seekEdge (seeker: Bolt, onStandingTurn: () => void = () => {}): Promise<SeekEdgeResult> {

  const ctx: Context = seeker;
  const { actuators, sensors, status } = seeker;
  const { motor } = actuators;
  const s = ctx.motion;

  const roundMs    = 650;   // one ladder round of 615 ms and the notify's scatter
  const edge       = 65;    // degrees off the nose the sender is held at, where the pass-by runs put the lobe edge; chosen
  const step       = 10;    // degrees per verdict; chosen
  const seekStep   = 15;    // degrees per round with no notify, standing; chosen
  const turnMs     = 600;   // a step's turn and its swing, standing; chosen
  const tackMs     = 1000;  // a 130 or 180 degree turn and its swing; chosen
  const history    = 10;    // rounds the carrier looks back; 6 let it move up at the edge (run 2); chosen
  const legCm      = 40;    // chosen
  const slidOut    = 2;     // silent rounds in a row that end a leg; chosen
  const rangeFactor = 2.6;  // distance per cm of a leg cut short: sin(65) / 0.35 rad of edge zone
  const dashAfter  = 2;     // legs in a row cut short before the dash; chosen
  const dashSpeed  = 25;    // moved the ball in run 1; chosen
  const ball       = 10;    // cm the dash rolls past the range, about a ball; chosen
  const dashMax    = 80;    // cm; chosen
  const legWindow  = 3;     // legs the turns are summed over for the end of the line; chosen
  const flipNet    = -30;   // summed turns, degrees, away from the sender's side, that say the other end; chosen
  const speed      = 20;    // run 2: about 15 cm/s; chosen
  const cells      = 72;    // directions of the belief, 5 degrees each
  const sureWithin = 20;

  /** Share of the carrier's frames heard with the sender `off` degrees from the front; as in `seek`. */
  const hearing = (off: number): number => {
    const a = Math.abs(off), fromAxis = a > 90 ? 180 - a : a;
    if (fromAxis <= 60) return 0.72;
    if (fromAxis < 70)  return 0.72 - (fromAxis - 60) / 10 * 0.64;
    return 0.08;
  };

  const heading = (): number => mod360(-(status.angles?.yaw ?? 0));
  const direction = (cell: number): number => cell * 360 / cells;
  let belief = new Array<number>(cells).fill(1 / cells);
  const weigh = (weight: (d: number) => number): void => {
    belief = belief.map((v, cell) => v * weight(direction(cell)));
    const sum = belief.reduce((a, v) => a + v, 0);
    belief = belief.map(v => v / sum);
  };
  const peak = (): { at: number, sure: number } => {
    const at = direction(belief.indexOf(Math.max(...belief)));
    const sure = belief.reduce((a, v, cell) => Math.abs(angleDistance(at, direction(cell))) <= sureWithin ? a + v : a, 0);
    return { at, sure };
  };

  // notifies of the running round, and of the last `history` rounds
  const heardRound = LADDER.map(() => 0);
  const past: number[][] = [];
  const eventsPerLevel = LADDER.map(() => 0);
  const result: SeekEdgeResult = { rounds: 0, heard: 0, silent: 0, none: 0, standing: 0, legs: 0, shortLegs: 0, dashes: 0, flips: 0, events: 0 };
  let records = 0;

  const offInfrared = await sensors.infrared.subscribe(({ payload }) => {
    const channel = payload[0] ?? 255;
    if (channel < LADDER.length) {
      heardRound[channel] = (heardRound[channel] ?? 0) + 1;
      eventsPerLevel[channel] = (eventsPerLevel[channel] ?? 0) + 1;
      result.events++;
    }
    // the listen is one-shot
    void sensors.listenInfrared(true);
  });
  await sensors.listenInfrared(true);
  const release = await sensors.motion.subscribe(null);
  await motor.stabilize(StabilizationIndex.full);
  await ctx.events.once('sensordata', { timeoutMs: 1000 });
  ctx.log('info', `edge start ${JSON.stringify({ ladder: LADDER, roundMs, edge, step, seekStep, turnMs, tackMs, history, legCm, slidOut, rangeFactor, dashAfter, dashSpeed, ball, dashMax, legWindow, flipNet, speed, cells })}`);

  /** The weakest level heard in the past rounds, else null. */
  const carrier = (): number | null => {
    const level = LADDER.findIndex((_, k) => past.some(r => (r[k] ?? 0) > 0));
    return level >= 0 ? level : null;
  };

  /** One round of listening: what the carrier said. */
  const round = async (): Promise<'heard' | 'silent' | 'none'> => {
    heardRound.fill(0);
    await wait(roundMs);
    result.rounds++;
    past.push([...heardRound]);
    if (past.length > history) past.shift();
    const level = carrier();
    const said = level === null ? 'none'
      : (heardRound[level] ?? 0) > 0 ? 'heard'
      : heardRound.some((n, k) => k > level && n > 0) ? 'silent'
      : 'none';
    result[said]++;
    if (said !== 'none') weigh(d => said === 'heard' ? hearing(angleDistance(heading(), d)) : 1 - hearing(angleDistance(heading(), d)));
    return said;
  };

  // the side the sender is held on, right positive, and the turns of the running leg and of the last legs (times the side: positive means approaching)
  let side = 1, legNet = 0;
  const legs: number[] = [];
  const legCarriers: (number | null)[] = [];

  const record = (rule: string, extra: object = {}): void => {
    const { at, sure } = peak();
    ctx.log('info', `edge ${JSON.stringify({
      n: records++, rule, heading: Math.round(heading()), at: [Math.round(status.position.x), Math.round(status.position.y)],
      carrier: carrier(), round: [...heardRound], side, legNet, lastLegs: [...legs],
      peak: at, sure: Math.round(sure * 100) / 100, ...result, events: eventsPerLevel,
      belief: belief.map(x => Math.round(x * 1000)), ...extra,
    })}`);
  };

  let target = heading();

  // standing: the rule turns the ball until the verdict changes, which is the edge
  let last: 'heard' | 'silent' | null = null;
  while (!s.aborted) {
    await motor.roll(0, mod360(target));
    await wait(turnMs);
    const said = await round();
    result.standing++;
    if (last !== null && said !== 'none' && said !== last) {
      record('edge', { said });
      break;
    }
    if (said !== 'none') last = said;
    target += said === 'heard' ? -step : said === 'silent' ? step : seekStep;
    record(said);
  }

  // rolling: legs on one edge, a tack through the sender to the other, a dash when the legs have become short
  let legCarrier = carrier(), legFrom: Point = { ...status.position }, silentRun = 0, shortRun = 0;
  while (!s.aborted) {
    await motor.roll(speed, mod360(target));
    const said = await round();
    const turn = said === 'heard' ? -side * step : said === 'silent' ? side * step : 0;
    target += turn;
    legNet += turn;
    silentRun = said === 'silent' ? silentRun + 1 : said === 'heard' ? 0 : silentRun;
    if (carrier() !== legCarrier) legCarrier = null;
    let rule: string = said;

    const legLen = distance(legFrom, status.position);
    const short = silentRun >= slidOut && legLen < legCm;
    if (short || legLen >= legCm) {
      legs.push(side * legNet);
      legCarriers.push(legCarrier);
      if (legs.length > legWindow) { legs.shift(); legCarriers.shift(); }
      shortRun = short ? shortRun + 1 : 0;
      if (short) result.shortLegs++;
      const oneCarrier = legCarriers.length === legWindow && legCarriers.every(c => c !== null && c === legCarriers[0]);
      onStandingTurn();
      if (oneCarrier && legs.reduce((a, x) => a + x, 0) <= flipNet) {
        // the legs turn away from the side the sender is held on: it is at the other end
        target += 180;
        legs.length = 0;
        legCarriers.length = 0;
        result.flips++;
        rule = 'flip';
        await motor.roll(0, mod360(target));
        await wait(tackMs);
      } else if (shortRun >= dashAfter) {
        // the legs have become short: face the sender and roll the range the last leg gave
        const run = Math.min(dashMax, rangeFactor * legLen + ball);
        target += side * edge;
        await motor.roll(0, mod360(target));
        await wait(tackMs);
        record('dash', { legLen: Math.round(legLen), run: Math.round(run) });
        const from: Point = { ...status.position };
        while (!s.aborted && distance(from, status.position) < run) {
          await motor.roll(dashSpeed, mod360(target));
          await round();
        }
        onStandingTurn();
        await motor.roll(0, mod360(target));
        await wait(turnMs);
        legs.length = 0;
        legCarriers.length = 0;
        shortRun = 0;
        result.dashes++;
        rule = 'dash end';
      } else {
        // through the sender to the other edge
        target += side * 2 * edge;
        side = -side;
        result.legs++;
        rule = short ? 'tack short' : 'tack';
        await motor.roll(0, mod360(target));
        await wait(tackMs);
      }
      legNet = 0;
      silentRun = 0;
      legCarrier = carrier();
      legFrom = { ...status.position };
      record(rule, { legLen: Math.round(legLen) });
      continue;
    }
    record(rule);
  }

  await motor.stop();
  await motor.stabilize(StabilizationIndex.none);
  await release();
  await offInfrared();
  return result;
}

import type { IEventMessage, TLogLine, TMessage } from '@bolt/protocol';
import { session } from '../session';

/**
 * The drive's limits from the runs of `experiments.tiltStep` in a session,
 * by the Bolt's own samples: locator speed and distance, pitch. Times are
 * the session's, from the log lines of the commands and the samples.
 */

interface Sample { t: number, v: number, pitch: number, x: number, y: number }

export interface TiltRun {
  run: number,
  config: string,
  heading: number,
  /** Median time between samples, ms. */
  sampleMs: number,
  /** From the step command to the first sample that shows it, ms: pitch 5 degrees off rest, speed over 3 cm/s. */
  latencyPitchMs: number | null,
  latencySpeedMs: number | null,
  /** Pitch at rest, its peak during the step, and the time from the command to 90 % of the rise. */
  pitchRest: number,
  pitchMax: number,
  pitchRiseMs: number | null,
  /** Largest speed gain over two sample intervals during the step, cm/s². */
  accelMax: number,
  /** Locator distance from the step command to the brake command, and speed then; the peak speed of the run. */
  stepCm: number,
  vAtBrake: number,
  vPeak: number,
  /**
   * The speed can peak after the brake command: from the command to the peak,
   * from the peak to under 2 cm/s, and the locator distance from the peak to rest.
   */
  peakAfterBrakeMs: number,
  stopMs: number | null,
  stopCm: number,
  /** Mean deceleration from the peak, by time (vPeak / stopMs) and by distance (vPeak² / 2 stopCm), cm/s². */
  brakeByTime: number | null,
  brakeByDist: number | null,
  pitchMinAfterBrake: number,
}

const round = (v: number, d = 0) => Math.round(v * 10 ** d) / 10 ** d;
const dist = (a: Sample, b: Sample) => Math.hypot(b.x - a.x, b.y - a.y);
const text = (m: TMessage) => (m.kind === 'event' && typeof m.data === 'string' ? m.data : '');

export function evaluateTiltStep (messages: TMessage[]): TiltRun[] {
  const samples: Sample[] = [];
  for (const m of messages) {
    if (m.kind !== 'event' || m.name !== 'sensordata') continue;
    const sd = (m.data as { sensordata?: { locator?: { positionX: number, positionY: number, velocityX: number, velocityY: number }, angles?: { pitch: number } } }).sensordata;
    if (!sd?.locator || !sd.angles) continue;
    samples.push({ t: m.t, v: Math.hypot(sd.locator.velocityX, sd.locator.velocityY), pitch: sd.angles.pitch, x: sd.locator.positionX, y: sd.locator.positionY });
  }
  const commands = messages.filter((m): m is IEventMessage => m.kind === 'event' && m.name === 'action' && ['roll', 'rawMotors'].includes((m.data as { name?: string })?.name ?? ''));
  const between = (a: number, b: number) => samples.filter(s => s.t >= a && s.t < b);
  const last = (t: number) => samples.filter(s => s.t <= t).at(-1);
  const runs: TiltRun[] = [];
  let config = '';
  const marks = messages.filter(m => /^tiltStep/.test(text(m)));
  marks.forEach((mark, k) => {
    const line = text(mark);
    if (/^tiltStep: \d/.test(line)) { config = line.slice('tiltStep: '.length); return; }
    const step = /^tiltStep (\d+): step heading (\d+)/.exec(line);
    if (!step) return;
    const brakeMark = marks.slice(k + 1).find(m => text(m) === `tiltStep ${step[1]}: brake`);
    const endMark = marks.slice(k + 1).find(m => /^tiltStep( \d+: step|: done|: \d)/.test(text(m)));
    if (!brakeMark || !endMark) return;
    const stepCmd = commands.find(m => m.t >= mark.t && ((m.data as { payload?: number[] }).payload?.[0] ?? 0) > 0)?.t ?? mark.t;
    const brakeCmd = commands.find(m => m.t >= brakeMark.t)?.t ?? brakeMark.t;
    const rest = between(mark.t - 400, stepCmd);
    const during = between(stepCmd, brakeCmd);
    const after = between(brakeCmd, endMark.t);
    const s0 = last(stepCmd), sb = last(brakeCmd), send = after.at(-1);
    if (!s0 || !sb || !send || !during.length) return;
    const pitchRest = rest.length ? rest.reduce((a, s) => a + s.pitch, 0) / rest.length : s0.pitch;
    const pitchMax = Math.max(...during.map(s => s.pitch), ...after.slice(0, 3).map(s => s.pitch));
    const rise = between(stepCmd, endMark.t).find(s => s.pitch - pitchRest >= 0.9 * (pitchMax - pitchRest));
    let accelMax = 0;
    for (let i = 0; i + 2 < during.length; i++) accelMax = Math.max(accelMax, (during[i + 2]!.v - during[i]!.v) / ((during[i + 2]!.t - during[i]!.t) / 1000));
    const vPeak = Math.max(...between(stepCmd, endMark.t).map(s => s.v));
    const peak = between(stepCmd, endMark.t).find(s => s.v === vPeak)!;
    const stopped = after.find(s => s.t > peak.t && s.v < 2);
    const stopCm = dist(peak, send), stopMs = stopped ? stopped.t - peak.t : null;
    runs.push({
      run: Number(step[1]), config, heading: Number(step[2]),
      sampleMs: round(median(between(stepCmd, endMark.t).map((s, i, a) => i ? s.t - a[i - 1]!.t : NaN).filter(Number.isFinite))),
      latencyPitchMs: nullable(between(stepCmd, endMark.t).find(s => Math.abs(s.pitch - pitchRest) > 5)?.t, stepCmd),
      latencySpeedMs: nullable(between(stepCmd, endMark.t).find(s => s.v > 3)?.t, stepCmd),
      pitchRest: round(pitchRest), pitchMax: round(pitchMax), pitchRiseMs: nullable(rise?.t, stepCmd),
      accelMax: round(accelMax),
      stepCm: round(dist(s0, sb), 1), vAtBrake: round(sb.v), vPeak: round(vPeak),
      peakAfterBrakeMs: round(peak.t - brakeCmd), stopMs: stopMs === null ? null : round(stopMs), stopCm: round(stopCm, 1),
      brakeByTime: stopMs ? round(vPeak / (stopMs / 1000)) : null,
      brakeByDist: stopCm > 0 ? round(vPeak ** 2 / (2 * stopCm)) : null,
      pitchMinAfterBrake: round(Math.min(...after.map(s => s.pitch))),
    });
  });
  return runs;
}

function nullable (t: number | undefined, from: number): number | null {
  return t === undefined ? null : round(t - from);
}

function median (xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : NaN;
}

/** The runs in the current session, or in a stored session file by name. */
export async function tiltStep (file?: string): Promise<TiltRun[]> {
  if (!file) return evaluateTiltStep(await session.messages());
  const lines = (await (await session.open(file)).text()).split('\n').filter(Boolean).map(l => JSON.parse(l) as TLogLine);
  return evaluateTiltStep(lines.filter((l): l is TMessage => l.kind !== 'session'));
}

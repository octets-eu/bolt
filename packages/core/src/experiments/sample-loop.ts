import type { Actuators } from '../actuators/actuators';
import type { Context } from '../context';
import type { SensorSample } from '../sensors/motion';
import type { Sensors } from '../sensors/sensors';
import { StabilizationIndex } from '../protocol/constants';
import { wait } from '../helpers/utils';

/**
 * The frame every sample-driven step shares: hold the motion stream and
 * stabilization, call `onSample` on every sample until it returns a result
 * or motion aborts, then stop, wait until the ball is still and let go.
 * `onSample` steers with `rollIfIdle`; once it has returned a result it is
 * not called again, though the stream lasts through the stop.
 */
export async function sampleLoop<R> (
  ctx: Context, actuators: Actuators, sensors: Sensors,
  onSample: (sample: SensorSample) => R | undefined,
): Promise<R | 'aborted'> {
  const s = ctx.motion;
  let ended = false;
  let finish: (r: R | 'aborted') => void = () => {};
  const result = new Promise<R | 'aborted'>((resolve) => { finish = (r) => { ended = true; resolve(r); }; });

  await actuators.motor.stabilize(StabilizationIndex.full);
  const release = await sensors.motion.subscribe((sample) => {
    if (ended) return;
    if (s.aborted) return finish('aborted');
    const r = onSample(sample);
    if (r !== undefined) finish(r);
  });

  const r = await result;
  await actuators.motor.stop();
  while (!ctx.status.isStill && !s.aborted) await wait(50);
  await actuators.motor.stabilize(StabilizationIndex.none);
  await release();
  return r;
}

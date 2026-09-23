import type { Context } from '../context';
import { Infrared } from './infrared';
import { Led } from './led';
import { Matrix } from './matrix';
import { Motor } from './motor';
import { Power } from './power';

/**
 * Bottom layer, the hardware and nothing else: one device object per piece
 * of hardware, one packet per call, resolved on the Bolt's ack. This class
 * only constructs them. See README.md in this folder.
 */
export class Actuators {

  readonly motor:    Motor;
  readonly matrix:   Matrix;
  readonly led:      Led;
  readonly infrared: Infrared;
  readonly power:    Power;

  constructor (ctx: Context) {
    this.motor    = new Motor(ctx);
    this.matrix   = new Matrix(ctx);
    this.led      = new Led(ctx);
    this.infrared = new Infrared(ctx);
    this.power    = new Power(ctx);
  }

}

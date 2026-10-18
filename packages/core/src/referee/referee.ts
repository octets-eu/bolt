import type { Bolt } from '../bolt';
import { LADDERS } from '../communication/communication';
import type { Ladder, LadderRange } from '../communication/communication';

/** Whom a seeker asks for the ladder: the referee, or a stand-in in a test. */
export interface LadderAuthority {
  /** The sender sends the `range` ladder from the next round on; the ladder to listen to. */
  ladder (range: LadderRange): Promise<Ladder>;
}

/**
 * The referee of a round: holds the two Bolts in their roles, starts and
 * ends the sender's ladder, and switches it when the seeker asks, see
 * docs/archive/hide-and-seek.md. The tag rule still lives in seekToCollision.
 */
export class Referee implements LadderAuthority {

  readonly seeker: Bolt;
  readonly sender: Bolt;
  private sending: Promise<number> | null = null;

  constructor (seeker: Bolt, sender: Bolt) {
    this.seeker = seeker;
    this.sender = sender;
  }

  /** The sender starts the long ladder; it runs until `end`. */
  start (): void {
    this.sending = this.sender.communication.sendLadder('long');
  }

  async ladder (range: LadderRange): Promise<Ladder> {
    await this.sender.communication.switchLadder(range);
    return LADDERS[range];
  }

  /** End the sender's ladder. */
  async end (): Promise<void> {
    this.sender.abortMotion();
    await this.sending?.catch(() => undefined);
    this.sending = null;
  }

}

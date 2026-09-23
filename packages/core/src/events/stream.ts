import type { Listener } from './emitter';

export type Release = () => Promise<void>;

/**
 * What a stream needs from its hardware. All three hooks are optional: a
 * notification the Bolt sends unasked (awake, compass) has none of them.
 */
export interface StreamSource<T, O> {
  /**
   * Send the hardware setting for the held options; `[]` means nobody holds
   * and the source goes quiet. Called when the setting changes and on reapply.
   */
  configure?: (held: readonly O[]) => Promise<void>;
  /** Whether a hold with `options` sees `event`. Absent: every hold sees every event. */
  accept?: (event: T, options: O) => boolean;
  /** Identity of the setting `held` produces, so an unchanged setting is not sent again. Default: the options as JSON. */
  key?: (held: readonly O[]) => string;
}

/**
 * Hold counting over one source of events from the Bolt. The first hold
 * configures the hardware on, the last release configures it off, and the
 * setting is derived from every hold at once (the lowest threshold), so
 * callers never touch switches. `reapply` sends the
 * setting again after the firmware forgot it in sleep. Events reach every
 * hold with a listener that the source accepts them for.
 */
export class Stream<T, O = undefined> {

  private readonly source: StreamSource<T, O>;
  private readonly holds  = new Map<symbol, { options: O; listener: Listener<T> | null }>();
  private applying: Promise<void> = Promise.resolve();
  private appliedKey: string | null = null;
  private manual: Release | null = null;

  constructor (source: StreamSource<T, O> = {}) {
    this.source = source;
  }

  /** Whether anybody holds the stream. */
  get active (): boolean { return this.holds.size > 0; }

  get count (): number { return this.holds.size; }

  /**
   * Hold the stream and receive its events. Returns the release; the hardware
   * setting has gone out when the returned promise resolves. A `null`
   * listener holds without receiving, e.g. so the status keeps updating.
   */
  async subscribe (listener: Listener<T> | null, options?: O): Promise<Release> {
    const key = Symbol('hold');
    this.holds.set(key, { options: options as O, listener });
    await this.apply();
    return async () => {
      if (!this.holds.delete(key)) return;
      await this.apply();
    };
  }

  /** One manual hold, e.g. from a UI toggle or a command; a second enable replaces the first. */
  async enable (options?: O): Promise<void> {
    if (this.manual) await this.manual();
    this.manual = await this.subscribe(null, options);
  }

  /** Release the manual hold. Other holds keep the stream running. */
  async disable (): Promise<void> {
    const release = this.manual;
    this.manual = null;
    if (release) await release();
  }

  /** Send the current setting again, e.g. after a sleep wiped it. Nothing held means nothing to send: sleep left it off. */
  reapply (): Promise<void> {
    this.appliedKey = null;
    return this.holds.size ? this.apply() : Promise.resolve();
  }

  /** The source delivers one event. */
  push (event: T): void {
    for (const hold of [...this.holds.values()]) {
      if (!hold.listener) continue;
      if (this.source.accept && !this.source.accept(event, hold.options)) continue;
      hold.listener(event);
    }
  }

  private apply (): Promise<void> {
    // serialised, and a failed setting does not block the next attempt
    this.applying = this.applying.catch((): void => undefined).then(() => this.configure());
    return this.applying;
  }

  private async configure (): Promise<void> {
    if (!this.source.configure) return;
    const held = [...this.holds.values()].map(h => h.options);
    const key  = this.source.key ? this.source.key(held) : JSON.stringify(held);
    if (key === this.appliedKey) return;
    await this.source.configure(held);
    this.appliedKey = key;
  }

}

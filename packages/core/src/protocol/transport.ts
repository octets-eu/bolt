/**
 * The seam between the driver and whatever carries bytes to a Bolt.
 * `@bolt/web-ble` implements it over Web Bluetooth; a replay or a fake can too.
 */
export interface Transport {

  /** Device name as advertised, e.g. "SB-9129". */
  readonly name: string;

  /** True only while `write` can succeed: the link is up and `connect()` has completed. */
  readonly connected: boolean;

  /**
   * Write one framed packet. With response (the default) the promise resolves
   * once the Bolt's GATT layer confirmed receipt and rejects on a link error;
   * without response it resolves once the link queued the bytes.
   */
  write (bytes: Uint8Array, withResponse?: boolean): Promise<void>;

  /** Raw bytes arriving from the Bolt, possibly holding a partial packet or several. */
  onFrame (listener: (bytes: Uint8Array) => void): void;

  onDisconnect (listener: () => void): void;

  close (): void;

}

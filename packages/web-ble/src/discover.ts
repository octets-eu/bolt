import { SPHERO_INITIALIZE_SERVICE, SPHERO_SERVICE } from './gatt';

const NAME_PREFIX = 'SB-';

export function isBluetoothAvailable (): Promise<boolean> {
  if (!navigator.bluetooth) return Promise.resolve(false);
  return navigator.bluetooth.getAvailability();
}

export function onAvailabilityChanged (listener: (available: boolean) => void) {
  navigator.bluetooth?.addEventListener('availabilitychanged', (event: Event) => {
    listener(!!(event as unknown as { value: boolean }).value);
  });
}

/** Bolts this origin was granted before. Needs the persistent permissions backend, see research/setup.md. */
export async function getPermittedBolts (): Promise<BluetoothDevice[]> {
  if (!navigator.bluetooth?.getDevices) return [];
  const devices = await navigator.bluetooth.getDevices();
  return devices.filter(device => device.name?.startsWith(NAME_PREFIX));
}

/** Opens the chooser. Needs a user gesture. Rejects when the user cancels. */
export function requestBolt (): Promise<BluetoothDevice> {
  return navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: NAME_PREFIX, services: [SPHERO_SERVICE] }],
    optionalServices: [SPHERO_INITIALIZE_SERVICE],
  });
}

export interface IAdvertisement {
  rssi?:    number | undefined;
  txPower?: number | undefined;
}

export interface IWatchOptions {
  /** How long to wait for the first advertisement before re-arming the watch. */
  timeoutMs?: number;
  /** Cap for the backoff between re-arms. */
  maxBackoffMs?: number;
  /** Called for every advertisement, before and after the first. */
  onAdvertisement?: (advertisement: IAdvertisement) => void;
}

/**
 * Resolves on the first advertisement from a permitted device. Chrome sometimes
 * arms a watch and never delivers anything although the Bolt is advertising, so
 * the watch is aborted and re-armed with backoff until one arrives.
 */
export async function waitForAdvertisement (device: BluetoothDevice, options: IWatchOptions = {}): Promise<IAdvertisement> {

  const timeoutMs    = options.timeoutMs    ?? 4000;
  const maxBackoffMs = options.maxBackoffMs ?? 30000;

  let attempt = 0;

  for (;;) {

    const controller = new AbortController();
    const first = new Promise<IAdvertisement>((resolve) => {
      const listener = (event: Event) => {
        const { rssi, txPower } = event as unknown as IAdvertisement;
        options.onAdvertisement?.({ rssi, txPower });
        resolve({ rssi, txPower });
      };
      device.addEventListener('advertisementreceived', listener, { signal: controller.signal });
    });

    try {
      await device.watchAdvertisements({ signal: controller.signal });
    } catch (error) {
      console.warn(device.name, 'watchAdvertisements failed', error);
    }

    const wait = Math.min(timeoutMs * 2 ** attempt, maxBackoffMs);
    const result = await Promise.race([
      first,
      new Promise<null>(resolve => setTimeout(() => resolve(null), wait)),
    ]);

    if (result) {
      // keep watching so the caller keeps getting rssi updates
      if (options.onAdvertisement) {
        device.addEventListener('advertisementreceived', (event: Event) => {
          const { rssi, txPower } = event as unknown as IAdvertisement;
          options.onAdvertisement?.({ rssi, txPower });
        });
      }
      return result;
    }

    controller.abort();
    attempt += 1;
    console.log(device.name, `no advertisement in ${wait} ms, re-arming watch (attempt ${attempt + 1})`);

  }

}

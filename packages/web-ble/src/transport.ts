import type { Transport } from '@bolt/core';
import * as G from './gatt';

type FrameListener = (bytes: Uint8Array) => void;

/**
 * Web Bluetooth implementation of the core Transport: one GATT connection to
 * one Bolt. `connect()` maps the characteristics, subscribes to the API v2
 * notifications and sends the anti-DoS handshake the firmware wants first.
 */
export class WebBleTransport implements Transport {

  readonly device: BluetoothDevice;

  private characteristics = new Map<string, BluetoothRemoteGATTCharacteristic>();
  private frameListeners: FrameListener[] = [];
  private disconnectListeners: (() => void)[] = [];
  /** Set at the end of `connect()`, cleared on disconnect; the GATT flag alone is up before the link is writable. */
  private ready = false;

  constructor (device: BluetoothDevice) {
    this.device = device;
    device.addEventListener('gattserverdisconnected', () => {
      this.ready = false;
      for (const listener of this.disconnectListeners) listener();
    });
  }

  get name () { return this.device.name ?? this.device.id; }

  get connected () { return this.ready && (this.device.gatt?.connected ?? false); }

  async connect (): Promise<void> {

    const gatt = this.device.gatt;
    if (!gatt) throw new Error(`${this.name}: no GATT server`);

    const server   = await gatt.connect();
    const services = await server.getPrimaryServices();

    for (const service of services) {

      if (service.uuid === G.SPHERO_SERVICE) {
        for (const charac of await service.getCharacteristics()) {
          if (charac.uuid === G.APIV2_CHARACTERISTIC) await this.map(charac);
        }

      } else if (service.uuid === G.SPHERO_INITIALIZE_SERVICE) {
        for (const charac of await service.getCharacteristics()) {
          if (charac.uuid === G.ANTIDOS_CHARACTERISTIC     ||
              charac.uuid === G.DFU_CONTROL_CHARACTERISTIC ||
              charac.uuid === G.DFU_INFO_CHARACTERISTIC    ||
              charac.uuid === G.SUBS_CHARACTERISTIC) {
            await this.map(charac);
          }
        }
      }

    }

    if (!this.characteristics.has(G.APIV2_CHARACTERISTIC)) {
      throw new Error(`${this.name}: API v2 characteristic not found`);
    }

    // the firmware refuses commands until this magic string arrives
    await this.characteristics.get(G.ANTIDOS_CHARACTERISTIC)?.writeValueWithResponse(G.ANTIDOS_KEY);

    this.ready = true;

  }

  private async map (charac: BluetoothRemoteGATTCharacteristic) {

    if (charac.properties.notify) {
      await charac.startNotifications();
      charac.addEventListener('characteristicvaluechanged', (event: Event) => {
        const view = (event.target as BluetoothRemoteGATTCharacteristic).value;
        if (!view) return;
        if (charac.uuid !== G.APIV2_CHARACTERISTIC) {
          console.log('WebBleTransport.characteristicvaluechanged', charac.uuid, view.byteLength);
          return;
        }
        const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
        for (const listener of this.frameListeners) listener(bytes);
      });
    }

    this.characteristics.set(charac.uuid, charac);

  }

  async write (bytes: Uint8Array, withResponse = true): Promise<void> {
    const charac = this.characteristics.get(G.APIV2_CHARACTERISTIC);
    if (!charac) throw new Error(`${this.name}: not connected`);
    const value = new Uint8Array(bytes);
    if (withResponse) await charac.writeValueWithResponse(value);
    else              await charac.writeValueWithoutResponse(value);
  }

  onFrame (listener: FrameListener) {
    this.frameListeners.push(listener);
  }

  onDisconnect (listener: () => void) {
    this.disconnectListeners.push(listener);
  }

  close () {
    this.ready = false;
    this.device.gatt?.disconnect();
  }

}

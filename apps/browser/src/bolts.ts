/// <reference types="web-bluetooth" />

import m from 'mithril';

import { Bolt, BoltConfig } from '@bolt/core';
import { WebBleTransport, isBluetoothAvailable, onAvailabilityChanged, getPermittedBolts, requestBolt, waitForAdvertisement } from '@bolt/web-ble';

import { Logger }  from './components/logger/logger';
import { Plotter } from './components/plotter/plotter';
import { session } from './session';

/**
 * The app's Bolt manager: which Bolts exist, how they get connected, and how
 * the views hear about them. Everything Bluetooth is in @bolt/web-ble, the
 * driver itself in @bolt/core.
 */

class bolts {

  public map;
  public find;
  public forEach;

  public hasBluetooth = false;

  private bolts = [] as Bolt[];

  private configs: { [key: string]: BoltConfig } = {

    'SB-9129' : {
      colors: {
        console: '#595', plot: 'green', backcolor: '#77b57b', log: '#5ec19d44',
        front: [10, 0, 0], back: [ 5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30]
      },
    },

    'SB-2B96' : {
      colors: {
        console: '#79C', plot: 'blue',  backcolor: '#759cc5', log: '#5895d444',
        front: [10, 0, 0], back: [ 5, 5, 5], black: [0, 0, 0], matrix: [30, 30, 240]
       }
    },

  };

  private defaultConfig: BoltConfig = {
    colors: {
      console: '#79C', plot: 'brown', backcolor: '#bfbf85', log: '#bfbf8544',
      front: [10, 0, 0], back: [ 5, 5, 5], black: [0, 0, 0], matrix: [30, 240, 30]
    },
  };

  constructor ( ) {

    this.map     = Array.prototype.map.bind(this.bolts);
    this.find    = Array.prototype.find.bind(this.bolts);
    this.forEach = Array.prototype.forEach.bind(this.bolts);

    // allows: await Bolts.get('SB-9129').actuators.motor.roll(0, 90) in console
    window.Bolts = this;

    // make css for bolt names
    const style = document.createElement('style');
    for (const [key, config] of Object.entries(this.configs)) {
      style.innerHTML += `.${key} { background-color: ${config.colors.backcolor}; }`;
    }
    document.head.appendChild(style);

	}

  public count () {return this.bolts.length;}
  public get (name: string) { return this.find( (bolt: Bolt) => bolt.name === name); }

  configFor (name: string): BoltConfig {
    return this.configs[name] || this.defaultConfig;
  }

  /** Every Bolt with a configuration, connected or not; what the camera looks for. */
  knownNames (): string[] {
    return Array.from(new Set([...Object.keys(this.configs), ...this.bolts.map(b => b.name)]));
  }

  reset () {
    Logger.reset();
    Plotter.reset();
    this.forEach((bolt: Bolt) => {
      bolt.lifecycle.reset().catch((e) => console.warn(bolt.name, 'reset', e));
    });
  }

  activate () {

    onAvailabilityChanged((available) => {
      this.hasBluetooth = available;
      console.log(`> Bluetooth is ${available ? 'available' : 'unavailable'}`);
      m.redraw();
    });

    // Chrome drops GATT links on navigation anyway; closing them here is synchronous
    // and makes the Bolt re-advertise at once, so the reloaded page reconnects fast.
    // Async work (like a sleep command) cannot complete in this handler.
    window.addEventListener('pagehide', () => {
      for (const bolt of this.bolts) {
        if (bolt.connected) {
          console.log('Bolts.pagehide', bolt.name, 'disconnecting');
          bolt.transport.close();
        }
      }
    });

  }

  private remove (bolt: Bolt) {
    const index = this.bolts.indexOf(bolt);
    if (index > -1) {
      this.bolts.splice(index, 1);
    }
  }

  /** Reconnect every Bolt this origin was granted before, as soon as it advertises. */
  public async searchBolts () {

    this.hasBluetooth = await isBluetoothAvailable();
    m.redraw();

    if (!this.hasBluetooth) {
      console.log('searchBolts', 'No Bluetooth');
      return;
    }

    const devices = await getPermittedBolts();
    console.log('%cBolts.searching...', 'color: darkorange; font-weight: 800', devices.map( d => d.name));

    await Promise.all(devices.map(device => this.reconnect(device)));

  }

  private async reconnect (device: BluetoothDevice) {

    await waitForAdvertisement(device, {
      onAdvertisement: ({ rssi, txPower }) => {
        const bolt = device.name ? this.get(device.name) : undefined;
        if (bolt) {
          bolt.status.rssi    = rssi ?? null;
          bolt.status.txPower = txPower;
          m.redraw();
        }
      },
    });

    console.log('%c' + device.name + ' connecting...', 'color: darkorange; font-weight: 800');
    await this.connectBolt(device);

  }

  /** Opens the chooser; needs a click. */
  public async pairBolt () {

    let device: BluetoothDevice;
    try {
      device = await requestBolt();
    } catch (err) {
      // DOMException: User cancelled the requestDevice() chooser.
      return;
    }
    await this.connectBolt(device);
    m.redraw();

  }

  private async connectBolt (device: BluetoothDevice) {

    const transport = new WebBleTransport(device);
    const bolt      = new Bolt(transport.name, this.configFor(transport.name), transport);

    // the views and the session file hear the Bolt through its log events
    Logger.attach(bolt);
    Plotter.attach(bolt);
    session.attach(bolt);
    bolt.events.on('change', () => m.redraw());

    this.bolts.push(bolt);
    m.redraw();

    try {
      await transport.connect();
    } catch (err) {
      console.log('Bolts.connectBolt', device.name, err);
      this.remove(bolt);
      m.redraw();
      return;
    }

    bolt.log('info', 'Connected');
    console.log(...bolt.format('connected'));

    try {
      await bolt.lifecycle.takeover();
    } catch (err) {
      console.warn(...bolt.format('takeover failed'), err);
    }
    m.redraw();

  }

  public disconnect () {
    this.forEach(this.disconnectBolt.bind(this));
  }

  public async disconnectBolt ( bolt: Bolt ) {

    console.log(bolt.name, 'Disconnecting ...');

    if (bolt.connected) {
      bolt.transport.close();
      this.remove(bolt);
      Logger.info(bolt, 'disconnected');

    } else {
      console.log(bolt.name, 'is already disconnected');

    }

    m.redraw();

  }

}

export const Bolts = new bolts();

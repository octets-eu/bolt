/// <reference types="web-bluetooth" />

import m from 'mithril';

import { Bolt, BoltConfig, NotConnectedError, Referee, approachTest, passBy, seekToCollision, sweepTest, sweepTrials } from '@bolt/core';

/** A direction on the sheet: up or down it, or a heading in degrees clockwise from up. */
type SheetDirection = 'up' | 'down' | number;
import type { LadderRange } from '@bolt/core';
import type { SeekMethod } from '@bolt/core';
import { WebBleTransport, isBluetoothAvailable, onAvailabilityChanged, getPermittedBolts, requestBolt, waitForAdvertisement } from '@bolt/web-ble';

import { Logger }  from './components/logger/logger';
import { Plotter } from './components/plotter/plotter';
import { session } from './session';
import { fatal } from './fatal';
import { tracker } from './tracking/tracker';

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

    'SB-11DF' : {
      colors: {
        console: '#79C', plot: 'blue',  backcolor: '#759cc5', log: '#5895d444',
        front: [10, 0, 0], back: [ 5, 5, 5], black: [0, 0, 0], matrix: [30, 30, 240]
       }
    },

    'SB-2B96' : {
      colors: {
        console: '#a77f19', plot: 'goldenrod', backcolor: '#bb9951', log: '#c1983a44',
        front: [10, 0, 0], back: [ 5, 5, 5], black: [0, 0, 0], matrix: [240, 200, 30]
      },
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

  /** The state of every Bolt on the list as plain data, one row per Bolt; what a script reads in place of the chips. */
  public summary () {
    return this.bolts.map(bolt => {
      const { ready, awake, voltage, battery, charger, stabilization, streaming, rssi } = bolt.status;
      return { name: bolt.name, plot: bolt.config.colors.plot, connected: bolt.connected, ready, awake, voltage, battery, charger, stabilization, streaming: streaming.active, rssi };
    });
  }

  /** Resolves with the summary once every Bolt in `names` is connected and ready; rejects with the summary's state after `timeoutMs`. */
  public async whenReady (names: string[], timeoutMs = 30000) {
    const until = Date.now() + timeoutMs;
    const ready = () => names.every(name => { const bolt = this.get(name); return bolt?.connected && bolt.status.ready; });
    while (!ready()) {
      if (Date.now() > until) throw new Error(`whenReady: not ready after ${timeoutMs} ms: ${JSON.stringify(this.summary())}`);
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    return this.summary();
  }

  /** The seekToCollision experiment with two connected Bolts by name, `method` 'edge' (default) or 'belief'; see @bolt/core experiments/seek-to-collision.ts. */
  public seekToCollision ({ seeker, sender, seconds = 60, method = 'edge' }: { seeker: string, sender: string, seconds?: number, method?: SeekMethod }) {
    const a = this.get(seeker), b = this.get(sender);
    if (!a || !b) throw new NotConnectedError(a ? sender : seeker);
    return seekToCollision(a, b, seconds, method);
  }

  /** The floor test of the sweep behavior: `seeker` sweeps trial after trial, armed by a tap, while `sender` sends the ladder; see @bolt/core experiments/sweep-trials.ts. */
  public sweepTrials ({ seeker, sender, range = 'long', reads = 5 }: { seeker: string, sender: string, range?: LadderRange, reads?: number }) {
    const a = this.get(seeker), b = this.get(sender);
    if (!a || !b) throw new NotConnectedError(a ? sender : seeker);
    return sweepTrials(new Referee(a, b), { range, reads });
  }

  /**
   * The sweep behavior judged by the locator: both Bolts on their reference points, the seeker walks
   * `stepCm` a trial along `direction`, up or down the sheet or a sheet heading in degrees clockwise
   * from up, turns at random and sweeps, until a sweep is off by more than `tolerance` degrees, finds
   * nothing, or `trials` are done; `legs` walks several directions in turn, `reset: false` continues from where they stand; see @bolt/core behavior/sweep-test.ts.
   */
  public sweepTest ({ seeker, sender, direction = 'up', stepCm = 25, startCm = stepCm, until = 'nothing', trials, legs, reset = true, tolerance = 30, range = 'long', reads = 5 }: { seeker: string, sender: string, direction?: SheetDirection, stepCm?: number, startCm?: number, until?: 'nothing' | 'miss', trials?: number, legs?: { direction: SheetDirection, stepCm: number, trials?: number }[], reset?: boolean, tolerance?: number, range?: LadderRange, reads?: number }) {
    const a = this.get(seeker), b = this.get(sender);
    if (!a || !b) throw new NotConnectedError(a ? sender : seeker);
    const home = Plotter.startOf(seeker), mark = Plotter.startOf(sender);
    if (!home || !mark) throw new Error(`no start on the sheet for ${home ? sender : seeker}`);
    const at = Plotter.toLocator(seeker, mark.x, mark.y)!;
    // up is -y on the sheet; a unit sheet vector along the direction, turned into the seeker's frame, as a heading
    const heading = (direction: SheetDirection): number => {
      const sheet = (direction === 'up' ? 0 : direction === 'down' ? 180 : direction) * Math.PI / 180;
      const v = Plotter.toLocator(seeker, home.x + Math.sin(sheet), home.y - Math.cos(sheet))!;
      return Math.round((Math.atan2(v.x, v.y) * 180 / Math.PI + 360) % 360);
    };
    const walkLegs = legs?.map(leg => ({ ...leg, direction: heading(leg.direction) }));
    return sweepTest(new Referee(a, b), { at, direction: heading(direction), stepCm, startCm, until, trials, legs: walkLegs, reset, tolerance, range, reads });
  }

  /** The approach judged by the locator: both on their reference points, green walks `startCm` up the sheet, turns at random and approaches blue; see @bolt/core experiments/approach.ts. */
  public approachTest ({ seeker, sender, startCm = 150, reads = 5 }: { seeker: string, sender: string, startCm?: number, reads?: number }) {
    const a = this.get(seeker), b = this.get(sender);
    if (!a || !b) throw new NotConnectedError(a ? sender : seeker);
    const home = Plotter.startOf(seeker), mark = Plotter.startOf(sender);
    if (!home || !mark) throw new Error(`no start on the sheet for ${home ? sender : seeker}`);
    const at = Plotter.toLocator(seeker, mark.x, mark.y)!;
    const v = Plotter.toLocator(seeker, home.x, home.y - 1)!;
    const direction = Math.round((Math.atan2(v.x, v.y) * 180 / Math.PI + 360) % 360);
    return approachTest(new Referee(a, b), { at, direction, startCm, reads });
  }

  /** The passBy experiment with two connected Bolts by name; see @bolt/core experiments/pass-by.ts. */
  public passBy ({ roller, sender, from, to, passes, cmPerSec, ladder }: { roller: string, sender: string, from: { x: number, y: number }, to: { x: number, y: number }, passes?: number, cmPerSec?: number, ladder?: number[] }) {
    const a = this.get(roller), b = this.get(sender);
    if (!a || !b) throw new NotConnectedError(a ? sender : roller);
    return passBy(a, b, from, to, passes, cmPerSec, ladder);
  }

  /** As Bolt.format, for a device that is no Bolt yet. */
  private format (name: string, text: string): [string, string] {
    return [`%c${name} ${text}`, `color: ${this.configFor(name).colors.console}; font-weight: 800`];
  }

  configFor (name: string): BoltConfig {
    return this.configs[name] || this.defaultConfig;
  }

  /** Every Bolt with a configuration, connected or not; what the camera looks for. */
  knownNames (): string[] {
    return Array.from(new Set([...Object.keys(this.configs), ...this.bolts.map(b => b.name)]));
  }

  async reset () {
    Logger.reset();
    Plotter.reset();
    await Promise.all(this.map((bolt: Bolt) => bolt.lifecycle.reset()));
  }

  activate () {

    onAvailabilityChanged((available) => {
      this.hasBluetooth = available;
      console.log(`> Bluetooth is ${available ? 'available' : 'unavailable'}`);
      m.redraw();
    });

    // Off since 2026-10-02: after this close the reloaded page got no advertisement
    // for minutes, twice. Chrome drops GATT links on navigation anyway; closing them
    // here was meant to make the Bolt re-advertise at once.
    // window.addEventListener('pagehide', () => {
    //   for (const bolt of this.bolts.splice(0)) {
    //     if (bolt.connected) {
    //       console.log('Bolts.pagehide', bolt.name, 'disconnecting');
    //       bolt.transport.close();
    //     }
    //   }
    // });

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
      log: (text) => console.log(...this.format(device.name!, text)),
      onAdvertisement: ({ rssi, txPower }) => {
        const bolt = device.name ? this.get(device.name) : undefined;
        if (bolt) {
          bolt.status.rssi    = rssi ?? null;
          bolt.status.txPower = txPower;
          m.redraw();
        }
      },
    });

    console.log(...this.format(device.name!, 'connecting...'));
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
    tracker.attach(bolt);
    bolt.events.on('change', () => m.redraw());
    // a Bolt still on the list did not disconnect on purpose, see disconnectBolt and pagehide
    bolt.events.on('disconnected', () => {
      if (this.bolts.includes(bolt)) fatal(new NotConnectedError(bolt.name));
    });

    this.bolts.push(bolt);
    m.redraw();

    try {
      await transport.connect();
    } catch (err) {
      console.log(...bolt.format('connect failed'), err);
      this.remove(bolt);
      m.redraw();
      return;
    }

    bolt.log('info', 'Connected');
    console.log(...bolt.format('connected'));

    await bolt.lifecycle.takeover();
    m.redraw();

  }

  public async disconnect () {
    // a copy: disconnectBolt removes the Bolt from the list
    await Promise.all([...this.bolts].map(bolt => this.disconnectBolt(bolt)));
  }

  /** Disconnects the Bolt and has Chrome forget it, so no reload reconnects it; Pair brings it back. */
  public async unpairBolt ( bolt: Bolt ) {
    await this.disconnectBolt(bolt);
    await (bolt.transport as WebBleTransport).device.forget();
    console.log(...bolt.format('unpaired'));
  }

  public async disconnectBolt ( bolt: Bolt ) {

    console.log(...bolt.format('disconnecting ...'));

    if (bolt.connected) {
      this.remove(bolt);
      bolt.transport.close();
      Logger.info(bolt, 'disconnected');

    } else {
      console.log(...bolt.format('is already disconnected'));

    }

    m.redraw();

  }

}

export const Bolts = new bolts();

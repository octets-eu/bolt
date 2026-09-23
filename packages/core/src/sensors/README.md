# sensors/

The hardware and nothing else. Frozen since 2026-09-20: a change here needs
a measured reason, recorded below with its date. 2026-09-21: the sample
types `Angles`, `Locator`, `SensorSample` moved into `motion.ts` from the
old `types.ts`; declarations only, no behaviour.

Three kinds of things:

- **Values to read.** `batteryVoltage`, `batteryState`, `chargerState`,
  `infraredReadings`, `ambientLight`. One packet each; the ack arrives
  decoded and typed by the command name (`protocol/payloads.ts`), the status
  gets the value.
- **Streams.** Everything the Bolt sends, one shape: `subscribe(listener,
  options)` holds the stream and returns a release. The first hold switches
  the notification or mask on, the last release switches it off, the setting
  is derived from every hold at once, so callers never touch a switch.
  `motion`, `collision`, `battery`, `charger`, `gyromax`, `infrared` have a
  switch; `awake`, `willsleep`, `didsleep`, `compass` are sent unasked.
  `Stream` in `src/events/stream.ts` is the support class: a source gives
  it `configure`, optionally `key` and `accept`.
- **Switches and masks.** The one-packet commands the streams drive. Public,
  but nothing above this folder calls them.

Nothing here waits or judges. What a reading means for the ball, still,
tilted, at rest, is decided one layer up.

## Facts the code relies on

| Fact | Consequence in code | Measured |
|---|---|---|
| Every sample has one layout: orientation, accelerometer, locator, gyro, 13 floats, 52 bytes | the masks always ask for all four; a payload of any other length is dropped and logged as a sensor line `incomplete sample: N of 52 bytes` | 2026-09-20 |
| The base mask starts and stops the stream, the extended mask only adds the gyro; samples sent while the two disagree carry 40 bytes | a start sends the extended mask first, a stop sends the base mask alone and leaves the extended mask set; seven starts, a sleep and a wake gave zero incomplete samples | 2026-09-20 |
| Sleep wipes both masks and every notification switch | `Sensors.reapply()` forgets the extended mask and sends every held setting again; lifecycle calls it on every awake | 2026-09-18 |
| The sensor side does not ack switches while the Bolt sleeps; the power side does | lifecycle takes its holds after the wake; a switch sent asleep stalls the queue until the ack timeout | 2026-09-20 |
| The mask stream is push, it does not pass through the serial queue | samples arrive between acks at the set interval; polled values cost one round trip each | 2026-09-17 |
| One collision detector in the firmware, one configuration, one notification | it runs at the lowest thresholds and shortest dead time any hold asks for; each hold sees only impacts whose reported power reaches its own thresholds (`accept`) | 2026-09-20, filter 2026-09-23 |
| The reported power is on the threshold's scale: 20 to 30 at threshold 20, 135 to 179 at 100 | the filter compares power with the hold's thresholds; speed terms are not compared | 2026-09-23 |
| Collision threshold 40 fires on the ramp lip and on wall bumps; 100 never fired rolling into a speaker at speed 80 | defaults are 100; a hold lowers them | 2026-09-17 |
| The collision notification is 16 bytes, on BOLT+ 18 | fields are null when short, `raw` always holds the bytes | 2026-09-19 |


Measurements about the device itself, speeds, thresholds, timings, live in
`research/bolt.md`. This file holds what the code in this folder does with them.

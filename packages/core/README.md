# @bolt/core

The Sphero BOLT driver. Pure TypeScript, strict: no DOM, no Bluetooth, no UI.
`@bolt/web-ble` supplies the transport, `apps/browser` the views.

## Layers

```
experiments/                   functions under test, a work log in code; what qualifies moves into its folder
lifecycle/  navigation/  communication/  calibration/   sequences, waits, sensor feedback
sensors/   actuators/                              exactly one packet per call
protocol/  transport  queue  receiver  packet  payloads  bytes, sequence numbers, acks, decoded values
```

Beside the layers, two folders nothing in them knows the Bolt: `events/`
(the typed emitter, the stream support class, the event map) and `helpers/`
(angles and points, wait, range, clamp, abort signals).

Rules that keep the layers honest:

- A bottom-layer function sends one packet and returns its ack. Anything with
  a second packet, a wait or a sensor read in it lives one layer up.
- Layer three modules may use each other, but only downwards or sideways:
  navigation may call calibration, calibration may call sensors and
  actuators, nothing calls navigation from below.
- The sensor layer and the receiver write `status`; actuators write only what
  was commanded (heading, stabilization, matrix rotation). Everything above reads.
- Every step that moves the ball holds the motion stream while it runs and
  switches stabilization on before and off after. `status.isStill` is the
  ball neither moving nor turning across the last half second of the
  buffer; it throws without a fresh sample. `navigation.rotate` and
  `navigation.rollToPoint` are driver loops: on every sample one roll by
  `motor.rollIfIdle`, a heading ahead of the yaw turned so far, or a heading
  to the target at a speed that follows the locator speed.
  `navigation.roll(distance, heading)` is a rollToPoint.
  A sample is logged only while the ball is not still. Exceptions are for
  the link: `CommandError`, `AckTimeoutError`, `WriteError`, `NotConnectedError`.

## Lifecycle and calibration

- `lifecycle.takeover` once per connection; `reset` on every awake event,
  because sleep wipes masks, switches and lights.
  `status.ready` is true from the end of a reset until sleep or the next
  reset; the camera tracker lights its marker on it, since a matrix written
  before the reset is gone after it.
- `calibration.north` spins for the firmware's north, verifies each spin by
  the yaw it swept, averages the spins into `northHeading` with
  `northSpread`, and turns the ball to face it; the reset runs it on every
  wake. Yaw is never reset: north is a heading.
- Stabilization is on only while a navigation step drives and until the
  locator says still.
  See research/bolt.md for the measurements behind this.

## Sensor streams

Everything the Bolt sends is a stream on `sensors` with one shape:
`subscribe(listener, options)` holds it and returns a release; the first hold
switches the hardware on, the last release off. Each navigation step holds
`motion` for its whole step, and lifecycle holds battery, charger, gyro max, infrared and collision for
the connection. The folder is frozen; `src/sensors/README.md` has the
contract and the facts it rests on.

## Actuators

One object per device on `actuators`: `motor`, `matrix`, `led`, `infrared`,
`power`, one method per firmware command. The matrix hold is the one piece
of arbitration. The folder is frozen; `src/actuators/README.md` has the
contract and the facts it rests on.

## Events

`bolt.events` is a typed emitter, see `src/events/`. Notifications from the Bolt
arrive as `awake`, `willsleep`, `didsleep`, `battery`, `charger`, `collision`,
`compass`, `infrared`, `sensordata`, `scrolldone`. `log` carries every packet
and info line for the session log; `change` says a UI may redraw.

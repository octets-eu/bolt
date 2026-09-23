# actuators/

The hardware and nothing else. Frozen since 2026-09-21: a change here needs
a measured reason, recorded below with its date.

One file per device, one method per firmware command, one packet per call,
resolved on the ack. `actuators.ts` only constructs the five and holds no
methods of its own.

- **motor** roll, stop, raw, off, stabilize, resetYaw, resetLocator,
  calibrateToNorth. Writes the commanded heading and stabilization into the
  status. `resetLocator` and `calibrateToNorth` are filed under the sensor
  device by the firmware but command the ball.
- **matrix** hold, release, color, pixel, char, fill, line, clear, rotation,
  scrollText. Writes the commanded rotation into the status.
- **led** set.
- **infrared** send. Receiving is a stream in `sensors/`.
- **power** ping, wake, sleep, hibernate. Ping goes to the API processor.

Nothing here waits, reads a sensor or sends a second packet. Anything with a
wait, a sequence or a decision lives one layer up: `lifecycle`, `navigation`,
`communication`, `calibration`.

**The one exception: the matrix hold.** The matrix is a shared resource, so
`matrix.hold(owner)` and `matrix.release(owner)` keep at most one owner in
the status, and every matrix write from anyone else is dropped and logged
once per hold. Core knows a lock, not who wants it. The camera tracker in
the app holds the matrix while it runs; nothing in core does.

## Facts the code relies on

| Fact | Consequence in code | Measured |
|---|---|---|
| The firmware stops driving when `roll` is not repeated | callers repeat at `magic.rollInterval`; one `roll` is a nudge, not a drive | carried over from the flat actuators.ts, undated |
| Raw motor torque switches the firmware's stabilization off | `motor.raw` writes stabilization 0 into the status; a step that needs the loop sends `stabilize` again after | carried over, undated |
| A matrix image written before the reset that follows a wake is gone after it | the tracker lights its marker on `status.ready`, set by `lifecycle.reset`, and again after each reset | 2026-09-21 |
| The power side acks while the Bolt sleeps; the sensor side does not | `power.wake` and `power.sleep` are safe asleep; masks and switches are not, see `sensors/README.md` | 2026-09-20 |
| Scroll text takes at most 25 characters and speed 1..31; `scrolldone` marks the end | `matrix.scrollText` truncates and clamps; `communication.scrollText` waits for the event | carried over, undated |

Measurements about the device itself live in `research/bolt.md`. This file holds
what the code in this folder does with them.

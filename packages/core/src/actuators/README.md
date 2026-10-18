# actuators/

The hardware and nothing else. A change here needs a measured reason, which
goes in the commit message.

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

The device facts the code rests on, a roll must be repeated, raw torque
switches stabilization off, the matrix picture and the LEDs are gone after
sleep, the power side acks asleep and the sensor side does not, are in
`docs/bolt-reference.md`.

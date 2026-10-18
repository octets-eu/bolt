# sensors/

The hardware and nothing else. A change here needs a measured reason, which
goes in the commit message.

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
tilted, at rest, is decided one layer up. The device facts the code rests
on, the sample layout, the masks, what sleep wipes, the one collision
detector and its power scale, are in `docs/bolt-reference.md`.

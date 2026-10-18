---
title: Rules of practice
kind: rules
tags: [rules, practice, lessons]
created: 2026-09-19
updated: 2026-09-19
status: living
aliases: [lessons, practice]
---

# Rules of practice

What the Bolt taught us about how to work with it. Imperative, undated, no
numbers; the numbers are in [[bolt]] and [[rig]].

## Sessions

- Finish code before an experiment. A code edit reloads the page, the page
  reconnects the Bolt, and every calibration of the connection is gone.
- Never reuse a heading measured in an earlier connection. Heading zero is
  arbitrary per connect.
- Never reset yaw. The locator's axes stay where they were and the two frames
  drift apart; keep north as a heading and learn the locator offset from legs.
- Handshake when in doubt. Acks prove nothing about motion; only the awake
  notification after a real sleep does.
- Expect a sleep to have wiped the streaming mask, the notification switches
  and the LED colours. Reset on every awake.

## Driving

- Never commit a long move on an unverified frame. Do one short leg first and
  check where the ball went.
- Re-read the position before every decision, not after a batch of moves, and
  check it against the mat bounds before planning the next.
- When the picture and the numbers disagree, stop and ask where the ball is.
  Dead reckoning is the last resort, not the first.
- Keep the stop conditions explicit in every drive loop: charger event, stall,
  timeout. Collisions are information, not a stop.
- Every routine has a budget and gives up. A loop that tries forever fights
  every later command through the same queue.
- Keep drives short and aimed at open floor. The speakers have magnets and the
  ball has momentum.
- Keep stabilization off while handling the ball by hand, on while a step
  drives, and off again once the locator says still.
- Read tilt only at rest, and let the gyro say when rest is.

## Calibration

- Upright first, then north, then drive. A spin with a jammed chassis reports
  garbage, and a raw righting pulse voids north.
- Take north as the mean of spins that agree, and record the spread.
- Do not trust the magnetometer as an absolute reference on the mat until the
  magnetic survey has been repeated with the phone and speakers removed.
- A behavior that needs a mat direction without the camera needs the north fix
  and the mat's compass bearing, which is a property of the room.

## Camera and marker

- The camera scores behaviors from outside. No behavior reads it; keep that
  structural, in the module graph, not in good intentions.
- The matrix has one owner at a time. The tracker holds it while it runs and
  lights the marker; core drops every other write until the tracker stops.
  Core knows a lock, not a marker. Nothing else holds the matrix today.
- The marker level depends on the room light. When the tracker gets no fix,
  difference frames with the matrix off and on before touching the classifier.
  Check the tracker's first fix by eye.
- Marker colours are green and blue. Red is not one on this camera.
- Blank the matrix during any light reading; the sensor sits next to it.
- Draw overlays from a fresh frame or draw markers only, or every screenshot
  shows the last analysed frame.

## Documentation

- Facts go to the fact books, once, dated, corrected in place.
- Rules go here, without numbers.
- Plans say where we are, and delete what is answered.

# Motion test 2026-11-04T20:04:03.677Z

Bolt SB-9129 (port 7001), bridge 192.168.5.2. Turn in place by navigation.rotate, lead 20 degrees, tolerance 2; watchdog at 5 cm locator travel.

- takeover done: battery state 1, voltage 4.13 V, awake true

| reading | yaw ° | heading ° (= -yaw) | locator x cm | locator y cm | samples |
|---|---|---|---|---|---|
| 1 at rest | 0 | 0 | 0 | 0 | 9 |
| 2 after +90 | -90.8 | 90.8 | -0.8 | -2.1 | 9 |
| 3 back at start | -1.2 | 1.2 | 0.1 | -3.3 | 9 |

- turn 1: rotate(90) 5340 ms, missing -0.8°, 3 correction rounds; measured 90.8°
- turn 2: rotate(-90.8) 2671 ms, missing -1.2°, 1 correction rounds; end 1.2° off the start heading
- locator: largest distance from the start during the test 3.5 cm; end 3.3 cm from the start
- stop: motors off
- let go: socket closed

## Unexpected

- The locator moved while the ball only turned: 2.2 cm after the +90° turn, 3.3 cm after the turn back, both mostly along −y (the Bolt's back at the start). It reached 3.5 cm at most, under the 5 cm watchdog, so the watchdog did not fire. The locator is dead reckoned from the wheels, so this may be the carriage pivoting off-centre inside the shell rather than the shell rolling. The camera was not used, so it is unknown whether the ball really moved.
- Turn 1 needed 3 correction rounds after the paced turn and took 5.3 s. With the gentle lead of 20° the paced part ends about 20° short, and the firmware's dead band then leaves a residual each round. Turn 2 needed one round and took 2.7 s.
- The Bolt was asleep at connect: the wake sent the awake notification, so takeover did a hard reset, and reading 1 is exactly yaw 0 and locator (0, 0). Heading is taken as −yaw. No yaw reset was sent, so the heading and locator frames agree.
- The heading ended 1.2° past the start heading, inside rotate's 2° tolerance.

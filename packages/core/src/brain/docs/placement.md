# Placement test 2026-11-04T20:15:55.948Z

Bridge 192.168.5.2. Frames under frames/placement-2026-11-04T20-15-55-947Z-*.jpg.

- camera on: on 2
- SB-9129: battery state 1, 4.14 V
- SB-11DF log warn: awake: yaw and locator start again at this pose
- SB-11DF: battery state 1, 4.2 V
- partition ends in pixels: left (323, 742), right (837, 723.5), 514.3 px apart; 0.3 cm/px, frame turned 2.1° to the plan
- partition top's width by the frame: left 16.1 cm, right 17 cm; the plan says 19
- SB-9129 seen at pixel (621.1, 717.5), rise 203, 726 px: plan (234.1, 291.2)
- SB-11DF seen at pixel (512.3, 740.4), rise 207, 807 px: plan (203.6, 296.5)
- the Bolts 30.9 cm apart by the camera
- candidate SB-9129 down to (234.1, 391.2): free
- candidate SB-9129 up to (234.1, 191.2): free
- candidate SB-11DF down to (203.6, 396.5): free
- candidate SB-11DF up to (203.6, 196.5): free
- chosen: SB-9129 to (234.1, 391.2), pixel (634, 1076.9)
- start: camera (234.1, 291.2), locator (0, 0) cm, yaw -0.1°

| leg | locator heading ° | asked cm | locator after | moved by locator cm | camera after | moved by camera cm | to spot cm | locator predicts | off cm |
|---|---|---|---|---|---|---|---|---|---|
- first leg: plan heading 275.1°, locator heading 0.1°, phi 275°
| 1 | 0.1 | 12 | (0, 16.6) | 16.6 | (217.3, 289.7) | 16.8 | 102.9 | (217.6, 289.7) | 0.3 |
| 2 | 255.6 | 25 | (-21.6, 15.8) | 21.6 | (316.2, 320.2) | 103.5 | 108.5 | (216.4, 311.3) | 100.1 |
- ERROR: SB-9129 is 100.1 cm from where its locator says after leg 2
- stop: motors off; Bolts sent to sleep; let go: sockets closed
- camera off: off
- QUESTION: SB-9129 is 100.1 cm from where its locator says after leg 2

## Summary, written after the run

The run stopped on the 30 cm rule after leg 2. The Bolt did **not** reach the spot. Both Bolts were stopped (motors off), sent to sleep and let go. The camera is off.

**The spot and why.** SB-9129 to plan (234.1, 391.2), room frame cm: 100 cm straight down the plan (+y) from where the camera first saw it. I picked down because that floor is lit, has no furniture, and keeps clear of everything the plan draws or the frame shows. The lower danger zone ends at x 160, 74 cm to the left of the path. The left speaker is at about (144, 315) and the right one at about (297, 319). The cushion is at about (267, 443), roughly 50 cm from the spot. All four candidates (each Bolt, up or down) came out free. The program takes the first free one, which was SB-9129 going down.

**How the frame is laid on the plan.** One dark frame from the ultrawide. The program finds the inner ends of the two partition parts as the ends of their white tops, at pixels (323, 742) and (837, 723.5). They are mapped to the plan's landmarks (151, 295) and (294, 295) with a similarity transform (scale, rotation, shift): 0.279 cm per pixel, frame turned 2.1° against the plan. Checks: the partition tops come out 16 to 17 cm wide (the plan says 19, with skirting), and the beacon sits about 8 cm from the left end (the plan says 3 ± 5). Each Bolt was found as the blob that brightens when its matrix and both LEDs go white against the dark frame.

**Start.** By the camera, SB-9129 was at (234.1, 291.2) and SB-11DF at (203.6, 296.5), 30.9 cm apart. SB-9129's locator read (0, 0) and yaw −0.1° after a sleep and wake.

**Legs** (gentle: rollToPoint with a top wanted speed of 15 cm/s, tolerance 3 cm):
1. 12 cm straight ahead to learn the locator's axes. The locator measured 16.6 cm and the camera 16.8 cm, from (234.1, 291.2) to (217.3, 289.7): straight ahead is plan heading 275°, so phi = 275°. Locator and camera agreed to 0.3 cm.
2. 25 cm asked on locator heading 255.6°, meaning plan heading 170.6°, toward the spot. The locator says it moved 21.6 cm, to (−21.6, 15.8), which by phi puts it at (216.4, 311.3). The camera saw it at (316.2, 320.2), **100 cm away from that**. That is 103.5 cm from where it stood after leg 1, mostly toward +x, i.e. east, not down.

**End.** By the camera, (316.2, 320.2), pixel about (905, 810). That is just below the right partition part, beside the right speaker. I confirmed this by eye in `frames/placement-2026-11-04T20-15-55-947Z-leg2.jpg`. SB-11DF has not moved. By the locator: (−21.6, 15.8) cm. The spot is 108.5 cm away. SB-9129 is inside the play area and outside the danger zones, but it may be touching the speaker.

## Unexpected

- **Leg 2.** The ball travelled about 100 cm east while its locator counted 21.6 cm, heading down the plan. In leg 1 the two agreed to 0.3 cm. I have no explanation. The motion stream was held throughout, but I recorded only the end of each leg, not the path, so I can't tell where it went wrong: a fast roll the locator did not see, a bump, or a heading off between the drive and the locator frame. rollToPoint ended about 6 cm from its locator goal without logging a budget warning.
- **The Bolts are not set up like the plan's example.** SB-9129 sits on the blue circle (234, 295), but its front faced −x, toward SB-11DF. The program assumed back to back, so the 12 cm first leg drove it toward SB-11DF, ending 15.3 cm centre to centre from it (about 8 cm of gap). A first leg must not assume a facing.
- **The camera stream lags.** It runs about 1.9 s behind the `age` the forwarder reports: LEDs switched at t show from t + 1.9 s in frames reporting 20 to 300 ms of age. The first two attempts saw no change for that reason. `frameAfter` now waits 2.5 s.
- After `on`, the camera took about 7 s before it answered `frame` instead of `no frame yet`.
- SB-9129 was awake at connect (no awake notification), so takeover kept its frame and the program then did a hard reset. SB-11DF woke from sleep.
- Earlier attempts this session, all without motion: one stopped on "SB-9129 not found" (the stale frames above), and three short test programs lit SB-9129's LEDs and matrix to find the lag.

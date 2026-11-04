# Chain test 2026-11-04T20:01:20.205Z

Bridge host 192.168.5.2. No motion; the Bolts were only taken over, read and let go.

## Bolts
- SB-9129 (port 7001): battery voltage 4.19 V, battery state 1 (ok, per BatteryState in protocol/constants.ts)
- SB-11DF (port 7002): battery voltage 4.22 V, battery state 1 (ok, per BatteryState in protocol/constants.ts)

## M5 beacon (port 7010)
- ping: `m5 ok`
- `send 7 10 200` reply: `sent 10 on 7`
- SB-9129 heard 12 of 10 frames on channel 7; 12 infrared notifies on any channel
- 12 heard for 10 sent: each channel-7 notify was counted, with no de-duplication. The extra 2 are probably frames heard twice, by two of the four receivers or across a re-arm. Not investigated in this test.

## Camera (port 7020)
- ping: `cam ok`
- on: `on 2`
- ultrawide frame: 67048 bytes announced, 67048 bytes received, age 404 ms, after 16 retries
- off: `off`

Let go: SB-9129, SB-11DF sockets closed, no drive command sent.

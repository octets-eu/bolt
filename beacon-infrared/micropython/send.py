# Send a Bolt infrared frame from the Unit IR emitter (Port B, G26).
# Captured 2026-09-29 from SB-9129 with capture.py: 8 bits, most significant
# first, pulse-width coded, no header, one frame per message. A 1 is a long
# burst and a short gap, a 0 a short burst and a long gap, ~1 ms per bit.
# The low nibble is the channel.

import esp32
from machine import Pin

CODES = (0x00, 0xE1, 0xD2, 0x33, 0xB4, 0x55, 0x66, 0x87)   # channel 0..7
ONE = (650, 350)
ZERO = (330, 670)

rmt = esp32.RMT(0, pin=Pin(26), clock_div=80, idle_level=False, tx_carrier=(38000, 33, 1))

def pulses(byte):
    p = []
    for k in range(7, -1, -1):
        p.extend(ONE if byte >> k & 1 else ZERO)
    return p[:-1]              # the last gap is idle anyway

def send(channel):
    rmt.write_pulses(pulses(CODES[channel]), 1)
    rmt.wait_done(timeout=50)

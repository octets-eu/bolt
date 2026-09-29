# The M5 as a Bolt broadcaster: the rhythm captured from SB-9129 and SB-11DF
# on 2026-09-29. Per cycle the near code first, the far code 17 ms after its
# end, then 168 ms idle. The Unit IR has one LED, so the near frame is made
# weak by a low carrier duty.

import esp32
import time
from machine import Pin
from send import CODES, pulses

def rmt(duty):
    return esp32.RMT(0, pin=Pin(26), clock_div=80, idle_level=False, tx_carrier=(38000, duty, 1))

def frame(code, duty):
    r = rmt(duty)
    r.write_pulses(pulses(CODES[code]), 1)
    r.wait_done(timeout=50)
    r.deinit()

def run(far, near, seconds=10, far_duty=33, near_duty=1):
    import send
    send.rmt.deinit()
    end = time.ticks_add(time.ticks_ms(), seconds * 1000)
    cycles = 0
    while time.ticks_diff(end, time.ticks_ms()) > 0:
        start = time.ticks_ms()
        frame(near, near_duty)
        time.sleep_ms(17)
        frame(far, far_duty)
        cycles += 1
        time.sleep_ms(max(0, 200 - time.ticks_diff(time.ticks_ms(), start)))
    print('cycles', cycles)

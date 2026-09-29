# Raw IR capture on the Unit IR receiver (Port B, G36).
# The receiver output is high when idle and low during a 38 kHz burst.
# A viper loop polls the GPIO input register (hard IRQs are not available
# on the ESP32 port) and stores the time of every edge. A gap over GAP_US
# closes a frame, printed as alternating burst/gap lengths in microseconds.
# A large gap_us keeps a whole broadcast in one frame, so nothing is lost
# while printing.

import micropython
from machine import Pin
from array import array
import time

GPIO_IN1 = const(0x3FF44040)     # GPIO 32..39 input levels
RX_BIT = const(16)          # bit 36 - 32
GAP_US = const(20000)
N = const(2000)

Pin(36, Pin.IN)
edges = array('i', [0] * N)

@micropython.viper
def frame(edges, wait_ms: int, gap_us: int) -> int:
    reg = ptr32(GPIO_IN1)
    e = ptr32(edges)
    ticks_us = time.ticks_us
    start = int(time.ticks_ms())
    # wait for the first burst
    while reg[0] & RX_BIT:
        if int(time.ticks_ms()) - start > wait_ms:
            return 0
    n = 0
    level = 0
    last = int(ticks_us())
    e[0] = last
    n = 1
    while n < N:
        now = int(ticks_us())
        if (reg[0] & RX_BIT) != level:
            level ^= RX_BIT
            e[n] = now
            n += 1
            last = now
        elif level and now - last > gap_us:
            break
    return n

def run(seconds=30, gap_us=GAP_US):
    end = time.ticks_add(time.ticks_ms(), seconds * 1000)
    while time.ticks_diff(end, time.ticks_ms()) > 0:
        n = frame(edges, 200, gap_us)
        if n:
            print('frame', time.ticks_ms(), [edges[k + 1] - edges[k] for k in range(n - 1)])

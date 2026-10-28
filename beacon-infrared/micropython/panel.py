# A minimal panel for the M5Stack Fire on vanilla MicroPython: the ILI9342C
# 320x240 display driven over SPI in horizontal bands (a full framebuffer does
# not fit the heap), and the three face buttons A/B/C. No display driver on the
# device, so the init sequence and the pixel pushes are here.
#
# Pins are the M5Stack Fire/Core assignment. Colours are byte-swapped for the
# panel's big-endian RGB565 so framebuf writes them in the order it wants.
from machine import Pin, SPI
import framebuf
import time

WIDTH, HEIGHT = 320, 240
BAND = 16                      # rows pushed per blit; 320*16*2 = 10 KB

_SCK, _MOSI, _MISO = 18, 23, 19
_CS, _DC, _RST, _BL = 14, 27, 33, 32
_BTN = (39, 38, 37)            # A, B, C; active low, external pull-ups

spi = SPI(2, baudrate=40_000_000, sck=Pin(_SCK), mosi=Pin(_MOSI), miso=Pin(_MISO))
cs  = Pin(_CS, Pin.OUT, value=1)
dc  = Pin(_DC, Pin.OUT, value=0)
rst = Pin(_RST, Pin.OUT, value=1)
bl  = Pin(_BL, Pin.OUT, value=0)
btn = [Pin(n, Pin.IN) for n in _BTN]

def _cmd(c, data=None):
    dc(0); cs(0); spi.write(bytes([c])); cs(1)
    if data is not None:
        dc(1); cs(0); spi.write(bytes(data)); cs(1)

def init():
    rst(0); time.sleep_ms(20); rst(1); time.sleep_ms(120)
    _cmd(0x11); time.sleep_ms(120)         # sleep out
    _cmd(0x3A, b"\x55")                     # 16-bit colour
    _cmd(0x36, b"\x08")                     # MADCTL: BGR, native 320x240 landscape
    _cmd(0x21)                              # inversion on (ILI9342C panels want it)
    _cmd(0x29)                              # display on
    bl(1)

def color(r, g, b):
    """RGB888 to the panel's byte-swapped RGB565, so framebuf stores it right."""
    c = ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3)
    return ((c & 0xFF) << 8) | (c >> 8)

def _window(x0, y0, x1, y1):
    _cmd(0x2A, bytes([x0 >> 8, x0 & 0xFF, x1 >> 8, x1 & 0xFF]))
    _cmd(0x2B, bytes([y0 >> 8, y0 & 0xFF, y1 >> 8, y1 & 0xFF]))
    _cmd(0x2C)

def fill(c):
    band = bytearray(WIDTH * BAND * 2)
    hi, lo = (c >> 8) & 0xFF, c & 0xFF
    for i in range(0, len(band), 2):
        band[i] = hi; band[i + 1] = lo
    _window(0, 0, WIDTH - 1, HEIGHT - 1)
    dc(1); cs(0)
    for _ in range(HEIGHT // BAND):
        spi.write(band)
    cs(1)

# one reusable text band
_buf = bytearray(WIDTH * BAND * 2)
_fb = framebuf.FrameBuffer(_buf, WIDTH, BAND, framebuf.RGB565)

def line(row, text, fg, bg):
    """One row of 8x8 text, row 0..14 down the screen."""
    _fb.fill(bg)
    _fb.text(text, 4, 4, fg)
    y = row * BAND
    _window(0, y, WIDTH - 1, y + BAND - 1)
    dc(1); cs(0); spi.write(_buf); cs(1)

def show(lines, fg=None, bg=None):
    """Clear and write a list of strings, one per row."""
    fg = color(220, 220, 220) if fg is None else fg
    bg = color(10, 10, 16) if bg is None else bg
    fill(bg)
    for i, text in enumerate(lines[:HEIGHT // BAND]):
        line(i, text, fg, bg)

def buttons():
    """A, B, C as booleans, True while pressed."""
    return tuple(p.value() == 0 for p in btn)

def selftest(seconds=12):
    init()
    for c in (color(0, 0, 255), color(255, 0, 0), color(0, 200, 0)):
        fill(c); time.sleep_ms(600)
    show(["M5 panel ok", "", "press A / B / C ..."])
    last = None
    end = time.ticks_add(time.ticks_ms(), seconds * 1000)
    while time.ticks_diff(end, time.ticks_ms()) > 0:
        b = buttons()
        if b != last:
            print("buttons", b)
            line(3, "A=%d B=%d C=%d" % tuple(int(x) for x in b), color(120, 255, 120), color(10, 10, 16))
            last = b
        time.sleep_ms(50)
    print("selftest done")

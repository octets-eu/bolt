# Decode what capture.py printed on the M5: which Bolt frames were on the
# air, on which channel, and how far apart. Used 2026-10-04 to see what a
# Bolt sends when it gets two send commands per beat.
#
# Capture on the M5 without a frame gap, so a whole run is one line:
#   uvx mpremote connect /dev/cu.usbserial-56230442421 exec \
#     "import capture; capture.run(14, 500000)" > capture.txt
# Decode:
#   python3 decode_capture.py capture.txt
#
# A line is "frame <ms> [burst, gap, burst, gap, ...]" in microseconds. A gap
# over 3 ms ends a Bolt frame; a burst over 500 us is a 1 (send.py: a 1 is
# 650/350, a 0 is 330/670). The byte is the code of a channel.

import collections
import re
import sys

CODES = {0x00: 0, 0xE1: 1, 0xD2: 2, 0x33: 3, 0xB4: 4, 0x55: 5, 0x66: 6, 0x87: 7}


def frames(line):
    """(start in us from the line's first edge, channel or '?') per Bolt frame."""
    intervals = [int(x) for x in re.match(r'frame (\d+) \[(.*)\]', line).group(2).split(',')]
    out, bursts, t, start = [], [], 0, 0
    for i in range(0, len(intervals), 2):
        burst = intervals[i]
        gap = intervals[i + 1] if i + 1 < len(intervals) else None
        if not bursts:
            start = t
        bursts.append(burst)
        t += burst
        if gap is None or gap > 3000:
            bits = ''.join('1' if b > 500 else '0' for b in bursts)
            out.append((start, CODES.get(int(bits, 2), '?') if len(bits) == 8 else '?'))
            bursts = []
        t += gap or 0
    return out


for line in open(sys.argv[1]):
    if not line.startswith('frame'):
        continue
    fr = frames(line)
    span = (fr[-1][0] - fr[0][0]) / 1e6
    print(f'{len(fr)} frames in {span:.1f} s')
    print('per channel:', dict(collections.Counter(ch for _, ch in fr)))
    # the sequence as channel, ms to the next frame's start, channel, ...
    print(''.join(str(ch) if i == 0 else f'-{round((s - fr[i - 1][0]) / 1000)}-{ch}' for i, (s, ch) in enumerate(fr)))
    # frames less than 60 ms apart share a beat
    beats = []
    for s, ch in fr:
        if beats and s - beats[-1][0][0] < 60000:
            beats[-1].append((s, ch))
        else:
            beats.append([(s, ch)])
    print('channels per beat:', dict(collections.Counter(tuple(ch for _, ch in b) for b in beats)))
    inside = [round((b[1][0] - b[0][0]) / 1000, 1) for b in beats if len(b) == 2]
    if inside:
        print(f'start to start inside a beat: {min(inside)} to {max(inside)} ms')

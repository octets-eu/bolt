# /// script
# requires-python = ">=3.12"
# dependencies = ["bleak>=1.0"]
# ///
"""
Bolt bridge: the one process on this Mac that touches Bluetooth.

Connects every Bolt in BOLTS by its advertised name, sends the anti-DoS
unlock the firmware wants first, and offers one TCP port per Bolt. A client
writes packets and gets the Bolt's notifications back as bytes; the protocol
stays with the client (packages/core). A Bolt that drops is scanned for and
connected again, forever; clients see the link go down and come up.

Motors off (raw motors, all off, no response asked) goes to a Bolt when its
client disconnects, when a client stays silent for DEADMAN_S, and on `stop`
over the control port. That is the only command the bridge ever composes.

Wire format on a data port, both ways: type (1 byte), length (2 bytes,
big-endian), payload.

  client -> bridge   0x01 write with response    0x02 write without response
                     0x03 heartbeat (empty)
  bridge -> client   0x11 frame from the Bolt    0x12 written, one per 0x01, in order
                     0x13 write failed, utf-8 reason
                     0x20 link, one byte: 1 up, 0 down; also sent when a client connects

Data ports listen on every interface and accept loopback and the colima
network only. The control port listens on loopback; one text line per
command: status, stop, quit.

Run:   uv run bridge.py                 serve
       uv run bridge.py status|stop|quit
       uv run bridge.py probe SB-9129   one ping through the bridge
"""

import asyncio
import ipaddress
import json
import signal
import socket
import sys
import time

BOLTS = {"SB-9129": 7001, "SB-11DF": 7002}
CONTROL_PORT = 7000
DEADMAN_S = 3.0
SCAN_TIMEOUT_S = 15.0
ALLOWED = [ipaddress.ip_network(n) for n in ("127.0.0.0/8", "::1/128", "192.168.5.0/24")]

APIV2 = "00010002-574f-4f20-5370-6865726f2121"
ANTIDOS = "00020005-574f-4f20-5370-6865726f2121"
ANTIDOS_KEY = b"usetheforce...band"
CHUNK = 20  # a longer GATT write fails on the Bolt

WRITE_RESP, WRITE_NORESP, HEARTBEAT = 0x01, 0x02, 0x03
FRAME, WRITTEN, WRITE_FAILED, LINK = 0x11, 0x12, 0x13, 0x20


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def packet(flags, target, device, command, seq, data):
    """One framed command: flags, optional target, device, command, sequence, data, checksum, escaped."""
    body = [flags] + ([target] if target is not None else []) + [device, command, seq] + list(data)
    body.append((~sum(body)) & 0xFF)
    out = bytearray([0x8D])
    for b in body:
        if b == 0x8D:
            out += b"\xab\x05"
        elif b == 0xAB:
            out += b"\xab\x23"
        elif b == 0xD8:
            out += b"\xab\x50"
        else:
            out.append(b)
    out.append(0xD8)
    return bytes(out)


# raw motors, all off, to the ST; flags: resets inactivity timeout, has target, no response
MOTORS_OFF = packet(0x18, 0x12, 0x16, 0x01, 0xFE, [0, 0, 0, 0])
# ping to the API processor; flags: requests response, resets inactivity timeout
PING = packet(0x0A, None, 0x10, 0x00, 0x01, [])


def message(kind, payload=b""):
    return bytes([kind, len(payload) >> 8, len(payload) & 0xFF]) + payload


scan_lock = asyncio.Lock()


class Bolt:

    def __init__(self, name, port):
        self.name = name
        self.port = port
        self.client = None
        self.clients = set()
        self.write_lock = asyncio.Lock()
        self.frames = 0
        self.last_frame = None

    # - - - - - the Bluetooth side - - - - - #

    async def run(self):
        from bleak import BleakClient, BleakScanner
        from bleak.exc import BleakBluetoothNotAvailableError
        while True:
            try:
                async with scan_lock:
                    log(self.name, "scanning")
                    device = await BleakScanner.find_device_by_name(self.name, timeout=SCAN_TIMEOUT_S)
                if device is None:
                    log(self.name, "not found")
                    await asyncio.sleep(2)
                    continue
                lost = asyncio.Event()
                loop = asyncio.get_running_loop()
                async with BleakClient(device, disconnected_callback=lambda _c: loop.call_soon_threadsafe(lost.set)) as client:
                    await client.start_notify(APIV2, self.on_frame)
                    await client.write_gatt_char(ANTIDOS, ANTIDOS_KEY, response=True)
                    self.client = client
                    log(self.name, "connected")
                    self.broadcast(message(LINK, b"\x01"))
                    await lost.wait()
            except BleakBluetoothNotAvailableError as error:
                # a process started over SSH gets no Bluetooth grant; start the bridge from rig's screen session
                log(self.name, "bluetooth not available:", error.args[0], "- retry in 30 s")
                await asyncio.sleep(30)
            except Exception as error:
                log(self.name, "link error:", repr(error))
            if self.client is not None:
                self.client = None
                log(self.name, "disconnected")
                self.broadcast(message(LINK, b"\x00"))
            await asyncio.sleep(1)

    def on_frame(self, _sender, data):
        self.frames += 1
        self.last_frame = time.time()
        self.broadcast(message(FRAME, bytes(data)))

    async def write(self, payload, with_response):
        async with self.write_lock:
            client = self.client
            if client is None:
                raise ConnectionError(f"{self.name} not connected")
            for i in range(0, len(payload), CHUNK):
                await client.write_gatt_char(APIV2, payload[i:i + CHUNK], response=with_response)

    async def motors_off(self):
        if self.client is None:
            return
        try:
            await self.write(MOTORS_OFF, False)
            log(self.name, "motors off")
        except Exception as error:
            log(self.name, "motors off failed:", repr(error))

    # - - - - - the client side - - - - - #

    def broadcast(self, data):
        for writer in list(self.clients):
            try:
                writer.write(data)
            except Exception:
                self.clients.discard(writer)

    async def serve(self):
        server = await asyncio.start_server(self.on_client, host="0.0.0.0", port=self.port)
        log(self.name, "listening on", self.port)
        async with server:
            await server.serve_forever()

    async def on_client(self, reader, writer):
        peer = writer.get_extra_info("peername")
        address = ipaddress.ip_address(peer[0].split("%")[0])
        if not any(address in net for net in ALLOWED):
            log(self.name, "refused", peer)
            writer.close()
            return
        log(self.name, "client", peer)
        self.clients.add(writer)
        writer.write(message(LINK, b"\x01" if self.client else b"\x00"))
        silent = False
        try:
            while True:
                try:
                    head = await asyncio.wait_for(reader.readexactly(3), DEADMAN_S)
                except asyncio.TimeoutError:
                    if not silent:
                        silent = True
                        log(self.name, "deadman: client silent for", DEADMAN_S, "s")
                        await self.motors_off()
                    continue
                silent = False
                kind, length = head[0], (head[1] << 8) | head[2]
                payload = await reader.readexactly(length) if length else b""
                if kind == HEARTBEAT:
                    continue
                if kind in (WRITE_RESP, WRITE_NORESP):
                    try:
                        await self.write(payload, kind == WRITE_RESP)
                        if kind == WRITE_RESP:
                            writer.write(message(WRITTEN))
                    except Exception as error:
                        if kind == WRITE_RESP:
                            writer.write(message(WRITE_FAILED, repr(error).encode()))
                        else:
                            log(self.name, "write without response failed:", repr(error))
                    continue
                log(self.name, "unknown message type", kind)
        except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
            pass
        finally:
            self.clients.discard(writer)
            writer.close()
            log(self.name, "client gone", peer)
            await self.motors_off()

    def status(self):
        return {
            "name": self.name, "port": self.port, "link": self.client is not None,
            "clients": len(self.clients), "frames": self.frames,
            "lastFrameAgeS": None if self.last_frame is None else round(time.time() - self.last_frame, 1),
        }


async def control(bolts, stop):
    async def on_client(reader, writer):
        while True:
            line = await reader.readline()
            if not line:
                break
            command = line.decode().strip()
            if command == "status":
                writer.write((json.dumps([b.status() for b in bolts]) + "\n").encode())
            elif command == "stop":
                for b in bolts:
                    await b.motors_off()
                writer.write(b"ok\n")
            elif command == "quit":
                for b in bolts:
                    await b.motors_off()
                writer.write(b"bye\n")
                await writer.drain()
                stop.set()
            else:
                writer.write(b"unknown command\n")
            await writer.drain()
        writer.close()
    server = await asyncio.start_server(on_client, host="127.0.0.1", port=CONTROL_PORT)
    log("control on", CONTROL_PORT)
    async with server:
        await server.serve_forever()


async def serve():
    bolts = [Bolt(name, port) for name, port in BOLTS.items()]
    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, stop.set)
    tasks = [asyncio.create_task(b.run()) for b in bolts] + [asyncio.create_task(b.serve()) for b in bolts]
    tasks.append(asyncio.create_task(control(bolts, stop)))
    await stop.wait()
    log("stopping")
    for b in bolts:
        await b.motors_off()
    for task in tasks:
        task.cancel()
    log("bye")


def send_control(command):
    with socket.create_connection(("127.0.0.1", CONTROL_PORT), timeout=3) as s:
        s.sendall((command + "\n").encode())
        print(s.makefile().readline().strip())


def unescape(frame):
    out, escaped = [], False
    for b in frame:
        if escaped:
            out.append(b | 0x88)
            escaped = False
        elif b == 0xAB:
            escaped = True
        else:
            out.append(b)
    return out


def parse_packet(raw):
    """A full packet's unescaped bytes (checksum included, start/end stripped) into fields."""
    flags, i = raw[0], 1
    if flags & 0x10:
        i += 1  # target
    if flags & 0x20:
        i += 1  # source
    device, command, seq, i = raw[i], raw[i + 1], raw[i + 2], i + 3
    error = raw[i] if (flags & 0x01) and seq != 0xFF else None
    return device, command, seq, error


def probe(name):
    """One ping through the bridge: expects written, then the Bolt's response, reassembled across notifications."""
    port = BOLTS[name]
    with socket.create_connection(("127.0.0.1", port), timeout=5) as s:
        s.sendall(message(WRITE_RESP, PING))
        f = s.makefile("rb")
        buffer, in_packet, escaped = [], False, False
        deadline = time.time() + 4
        while time.time() < deadline:
            head = f.read(3)
            if len(head) < 3:
                break
            kind, length = head[0], (head[1] << 8) | head[2]
            payload = f.read(length)
            if kind == LINK:
                print("link", "up" if payload == b"\x01" else "down")
            elif kind == WRITTEN:
                print("written")
            elif kind == WRITE_FAILED:
                print("write failed:", payload.decode())
                return
            elif kind == FRAME:
                print("notification", payload.hex())
                for b in payload:  # reassemble like core's PacketParser
                    if b == 0x8D:
                        buffer, in_packet, escaped = [], True, False
                    elif not in_packet:
                        continue
                    elif b == 0xD8:
                        device, command, seq, error = parse_packet(buffer)
                        print(f"packet device {device:#04x} command {command:#04x} seq {seq} error {error}")
                        if device == 0x10 and command == 0x00 and seq == 1:
                            print("ping answered" if error == 0 else f"ping error {error}")
                            return
                        in_packet = False
                    elif b == 0xAB:
                        escaped = True
                    elif escaped:
                        buffer.append(b | 0x88)
                        escaped = False
                    else:
                        buffer.append(b)
        print("no ping response within 4 s")


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args:
        asyncio.run(serve())
    elif args[0] in ("status", "stop", "quit"):
        send_control(args[0])
    elif args[0] == "probe" and len(args) == 2:
        probe(args[1])
    else:
        print(__doc__)
        sys.exit(2)

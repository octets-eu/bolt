# /// script
# requires-python = ">=3.12"
# dependencies = ["mpremote>=1.29"]
# ///
"""
M5 forwarder: the host service that owns the M5 beacon's serial port and lets
the container drive it, the same split as the Bolt bridge. colima cannot pass
USB through, so the container never opens the port; it asks over TCP.

The M5 runs MicroPython with send.py and beacon.py (see the device). This
forwarder runs one mpremote exec per request, serialised, since the port is
single-access. Each request is one text line on the control port; the reply is
the M5's stdout, or `error <reason>`.

  ping                              print a liveness line on the M5
  send <ch> [count] [gapMs]         send.send(ch), count frames gapMs apart
  frame <ch> <duty> [count]         beacon.frame(ch, duty), count frames
  beacon <far> <near> <seconds> [farDuty] [nearDuty]   beacon.run(...), blocks

Channels are 0..7; the Bolt reads the low nibble as the channel. 7 is free of
the ladders (0..6). Listens on loopback and the colima network only.

  uv run m5.py                      serve
  uv run m5.py ping|send 7 3        one request from the CLI
"""

import asyncio
import ipaddress
import os
import socket
import sys
import time

PORT = int(os.environ.get("M5_PORT", "7010"))
SERIAL = os.environ.get("M5_SERIAL", "/dev/cu.usbserial-56230442421")
ALLOWED = [ipaddress.ip_network(n) for n in ("127.0.0.0/8", "::1/128", "192.168.5.0/24")]
exec_lock = asyncio.Lock()


def log(*parts):
    print(time.strftime("%H:%M:%S"), *parts, flush=True)


def code_for(command, args):
    """The MicroPython to run on the M5 for a control line, or None if unknown."""
    if command == "ping":
        return 'print("m5 ok")'
    if command == "send":
        ch = int(args[0]); count = int(args[1]) if len(args) > 1 else 1; gap = int(args[2]) if len(args) > 2 else 200
        return f"import send, time\nfor _ in range({count}):\n send.send({ch})\n time.sleep_ms({gap})\nprint('sent', {count}, 'on', {ch})"
    if command == "frame":
        ch = int(args[0]); duty = int(args[1]); count = int(args[2]) if len(args) > 2 else 1
        return f"import beacon, time\nfor _ in range({count}):\n beacon.frame({ch}, {duty})\n time.sleep_ms(200)\nprint('framed', {count}, 'on', {ch}, 'duty', {duty})"
    if command == "beacon":
        far = int(args[0]); near = int(args[1]); seconds = int(args[2])
        far_duty = int(args[3]) if len(args) > 3 else 33
        near_duty = int(args[4]) if len(args) > 4 else 1
        return f"import beacon\nbeacon.run({far}, {near}, {seconds}, {far_duty}, {near_duty})"
    return None


async def run_on_m5(code):
    """One mpremote exec, serialised; returns (ok, output)."""
    async with exec_lock:
        proc = await asyncio.create_subprocess_exec(
            sys.executable, "-m", "mpremote", "connect", SERIAL, "exec", code,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT,
        )
        try:
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
        except asyncio.TimeoutError:
            proc.kill()
            return False, "timeout"
        return proc.returncode == 0, out.decode(errors="replace").strip()


async def on_client(reader, writer):
    peer = writer.get_extra_info("peername")
    address = ipaddress.ip_address(peer[0].split("%")[0])
    if not any(address in net for net in ALLOWED):
        log("refused", peer); writer.close(); return
    try:
        while True:
            line = await reader.readline()
            if not line:
                break
            parts = line.decode().split()
            if not parts:
                continue
            command, args = parts[0], parts[1:]
            code = code_for(command, args)
            if code is None:
                writer.write(b"error unknown command\n")
                await writer.drain(); continue
            log(command, *args)
            try:
                ok, out = await run_on_m5(code)
            except Exception as error:
                ok, out = False, repr(error)
            writer.write(((out + "\n") if ok else f"error {out}\n").encode())
            await writer.drain()
    except (asyncio.IncompleteReadError, ConnectionResetError, BrokenPipeError):
        pass
    finally:
        writer.close()


async def serve():
    server = await asyncio.start_server(on_client, host="0.0.0.0", port=PORT)
    log(f"m5 forwarder on {PORT}, serial {SERIAL}")
    async with server:
        await server.serve_forever()


def send_cli(command, args):
    code = code_for(command, args)
    if code is None:
        print("unknown command"); sys.exit(2)
    ok, out = asyncio.run(run_on_m5(code))
    print(out)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    argv = sys.argv[1:]
    if not argv:
        asyncio.run(serve())
    else:
        send_cli(argv[0], argv[1:])

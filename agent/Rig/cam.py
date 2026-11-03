#!/usr/bin/env python3
"""
Camera forwarder: the host service that owns the phone over the floor and
hands the container its frames, the same split as the Bolt bridge and the M5
forwarder. The phone is reached through adb (USB or Wi-Fi) by scrcpy, which
streams the ultrawide camera as H.265 into a named pipe; ffmpeg reads the pipe
and keeps one JPEG current. The container asks over TCP (port 7020, loopback
and the colima net only), one text line per connection:

  ping                 -> cam ok
  on [id]              -> on <id>       (starts the stream from camera <id>, default
                          CAM_ID; a different id restarts the stream)
  off                  -> off           (stops it)
  status               -> status on <id>|off age=<ms>|none battery=<pct>% charging|discharging|none
  frame                -> frame <bytes> <age_ms>\n followed by the JPEG bytes
                          error off  when the stream is not on
  error <reason>       on anything else

The stream runs only between `on` and `off`; nothing is recorded. Environment:
CAM_SERIAL selects the adb device when more than one is attached (an address
like <ip>:5555 or an adb mDNS name), CAM_ID the default camera id (2, the
ultrawide; 0 is the main camera, half the floor at twice the detail),
CAM_SIZE the longer side (1632), CAM_FPS the frames kept per second (2),
CAM_PORT the port (7020). Run on the M1 as rig: python3 cam.py
"""
import os, signal, socket, socketserver, subprocess, sys, tempfile, threading, time

PORT = int(os.environ.get("CAM_PORT", "7020"))
SERIAL = os.environ.get("CAM_SERIAL", "")
CAM_ID = os.environ.get("CAM_ID", "2")
SIZE = os.environ.get("CAM_SIZE", "1632")
FPS = os.environ.get("CAM_FPS", "2")
ALLOWED = ("127.", "192.168.5.")

WORK = tempfile.mkdtemp(prefix="cam-")
FIFO = os.path.join(WORK, "stream.mkv")
LATEST = os.path.join(WORK, "latest.jpg")
lock = threading.Lock()
procs = {}          # "scrcpy", "ffmpeg" -> Popen
started = 0.0
current = None      # camera id of the running stream


def alive():
    return all(p.poll() is None for p in procs.values()) and len(procs) == 2


def start(cam_id=CAM_ID):
    global started, current
    if alive() and cam_id == current:
        return f"on {cam_id} already"
    if SERIAL:  # a phone over Wi-Fi drops off adb with its reboot or Wi-Fi; a connect is idempotent
        try:
            subprocess.run(["adb", "connect", SERIAL], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=10)
        except (OSError, subprocess.TimeoutExpired):
            pass
    stop()
    if os.path.exists(FIFO):
        os.unlink(FIFO)
    os.mkfifo(FIFO)
    if os.path.exists(LATEST):
        os.unlink(LATEST)
    scrcpy = ["scrcpy"] + (["-s", SERIAL] if SERIAL else []) + [
        "--video-source=camera", f"--camera-id={cam_id}", "--camera-ar=sensor",
        f"--max-size={SIZE}", "--video-codec=h265", "--video-bit-rate=2M",
        "--no-playback", "--no-audio", "--record-format=mkv", f"--record={FIFO}"]
    ffmpeg = ["ffmpeg", "-loglevel", "error", "-i", FIFO, "-vf", f"fps={FPS}",
              "-update", "1", "-atomic_writing", "1", "-q:v", "3", LATEST]
    # each in its own process group, so stop() also takes scrcpy's adb children
    procs["scrcpy"] = subprocess.Popen(scrcpy, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    procs["ffmpeg"] = subprocess.Popen(ffmpeg, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
    started = time.time()
    current = cam_id
    return f"on {cam_id}"


def stop():
    for p in list(procs.values()):
        if p.poll() is None:
            os.killpg(p.pid, signal.SIGTERM)
            try:
                p.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(p.pid, signal.SIGKILL)
    procs.clear()
    return "off"


def frame_age_ms():
    try:
        return int((time.time() - os.path.getmtime(LATEST)) * 1000)
    except OSError:
        return None


def phone_battery():
    """The phone's battery as `<pct>% charging|discharging`, or `none` when adb has no phone."""
    try:
        out = subprocess.run(["adb"] + (["-s", SERIAL] if SERIAL else []) + ["shell", "dumpsys", "battery"],
                             capture_output=True, text=True, timeout=5).stdout
    except (OSError, subprocess.TimeoutExpired):
        return "none"
    fields = dict(line.strip().split(": ", 1) for line in out.splitlines() if ": " in line)
    level, state = fields.get("level"), fields.get("status")
    if level is None:
        return "none"
    return f"{level}% {'charging' if state in ('2', '5') else 'discharging'}"


def status():
    age = frame_age_ms()
    return f"status {('on ' + str(current)) if alive() else 'off'} age={age if age is not None else 'none'} battery={phone_battery()}"


def handle(line):
    with lock:
        if line == "ping":
            return b"cam ok\n"
        if line == "on" or line.startswith("on "):
            cam_id = line[3:].strip() or CAM_ID
            if not cam_id.isdigit():
                return b"error camera id must be a number\n"
            return (start(cam_id) + "\n").encode()
        if line == "off":
            return (stop() + "\n").encode()
        if line == "status":
            return (status() + "\n").encode()
        if line == "frame":
            if not alive():
                return b"error off\n"
            age = frame_age_ms()
            if age is None:
                return b"error no frame yet\n"
            with open(LATEST, "rb") as f:
                data = f.read()
            return f"frame {len(data)} {age}\n".encode() + data
        return f"error unknown command {line[:30]}\n".encode()


class Handler(socketserver.StreamRequestHandler):
    def handle(self):
        if not self.client_address[0].startswith(ALLOWED):
            return
        line = self.rfile.readline().decode(errors="replace").strip()
        if line:
            self.wfile.write(handle(line))


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    with Server(("0.0.0.0", PORT), Handler) as srv:
        print(f"cam forwarder on {PORT}, work dir {WORK}, device {SERIAL or 'first'}", flush=True)
        try:
            srv.serve_forever()
        finally:
            stop()

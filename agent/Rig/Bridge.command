#!/bin/bash
# Double-click on rig's Desktop: the rig's bring-up after a reboot and its state
# at any time. Starts the Bolt bridge in this Terminal window, which carries the
# Bluetooth grant a process started over SSH never gets, starts the M5 and camera
# forwarders and colima when they are down, waits for both links, and prints the
# rig's state: links, Bolt batteries, whether the
# M5 answers, the camera forwarder and the phone's battery. With a bridge already
# running it prints the state alone. The bridge's lines go to the window and to
# ~/Rig/bridge.log; when the bridge ends, the window says so with the exit code and
# stays open on a failure until Enter. The adb call starts the adb server from this
# GUI session when none runs, which is the start it needs. Closing the window or
# Ctrl-C ends the bridge; `uv run bridge.py stop` from anywhere cuts the motors
# and leaves it running. Not while a session drives: the battery read is a
# client, and its disconnect cuts the motors. Lives in ~/Rig, the Desktop links it.
export PATH=/opt/homebrew/bin:$PATH
cd ~/Rig || exit 1
# shellcheck source=/dev/null
[ -f ~/Rig/rig.env ] && { set -a; . ~/Rig/rig.env; set +a; }   # CAM_SERIAL and friends, exported for the forwarders
# adb's mDNS auto-connect opens a second connection to the phone by its paired name; the phone
# keeps one, the first dies with "error: closed" and the server sticks. One connection only.
export ADB_MDNS="${ADB_MDNS:-0}"

ask () {  # <port> <line>: one line to a forwarder on the host, its first reply line
  ( exec 3<>/dev/tcp/127.0.0.1/$1 && printf '%s\n' "$2" >&3 && read -t 20 -r reply <&3 && echo "$reply" ) 2>/dev/null
}

if nc -z -w 2 127.0.0.1 7000 >/dev/null 2>&1; then
  echo "bridge: already running"
else
  echo "--- start $(date '+%Y-%m-%d %H:%M:%S')" >> ~/Rig/bridge.log
  uv run bridge.py > >(tee -a ~/Rig/bridge.log) 2>&1 &
  bridge=$!
  for _ in $(seq 1 30); do  # both links, up to 60 s; a Bolt asleep in the cradle does not advertise
    sleep 2
    if ! kill -0 "$bridge" 2>/dev/null; then
      echo "bridge: ended during start, see above and ~/Rig/bridge.log"
      break
    fi
    links=$(uv run bridge.py status 2>/dev/null | jq -r '[.[] | select(.link)] | length' 2>/dev/null)
    [ "${links:-0}" = "2" ] && break
  done
fi

started=
if ! nc -z -w 2 127.0.0.1 7010 >/dev/null 2>&1; then
  echo "m5 forwarder: starting, log in ~/Rig/m5.log"
  nohup uv run m5.py >> ~/Rig/m5.log 2>&1 & disown; started=1
fi
if ! nc -z -w 2 127.0.0.1 7020 >/dev/null 2>&1; then
  echo "camera forwarder: starting, log in ~/Rig/cam.log"
  nohup python3 cam.py >> ~/Rig/cam.log 2>&1 & disown; started=1
fi
[ -n "$started" ] && sleep 3
if colima status >/dev/null 2>&1; then
  docker_state="colima running"
else
  echo "docker: colima stopped, starting"
  docker_state=$(colima start >/dev/null 2>&1 && echo "colima running" || echo "colima failed to start")
fi

echo "--- rig at $(date +%H:%M)"
uv run bridge.py status 2>/dev/null | jq -r '.[] | "\(.name) link \(if .link then "up" else "down" end), last frame \(.lastFrameAgeS) s ago"'
uv run bridge.py battery
m5=$(ask 7010 ping); echo "beacon: ${m5:-no answer on 7010}"
cam=$(ask 7020 status); echo "camera: ${cam:-forwarder not running}"
# the phone answering? else connect; else a fresh server (it inherits ADB_MDNS) and connect: an adb
# server that lost the phone once keeps failing with "No route to host" while ping and nc reach it
phone_ok () { [ "$(adb -s "$CAM_SERIAL" shell echo ok 2>/dev/null | tr -d '\r\n')" = ok ]; }
if [ -n "${CAM_SERIAL:-}" ] && ! phone_ok; then
  perl -e 'alarm shift; exec @ARGV' 10 adb connect "$CAM_SERIAL" >/dev/null 2>&1
  if ! phone_ok; then
    adb kill-server >/dev/null 2>&1
    perl -e 'alarm shift; exec @ARGV' 10 adb connect "$CAM_SERIAL" >/dev/null 2>&1
  fi
fi
phone=$(adb ${CAM_SERIAL:+-s "$CAM_SERIAL"} shell dumpsys battery 2>/dev/null | awk '/^ *level:/{l=$2} /^ *status:/{s=$2} END{if (l != "") printf "%s%% %s", l, (s == 2 || s == 5) ? "charging" : "discharging"}')
echo "phone: ${phone:-adb sees no phone}"
echo "docker: $docker_state"
echo "---"
if [ -n "${bridge:-}" ]; then
  wait "$bridge"; code=$?
  echo "bridge: ended with exit $code; log in ~/Rig/bridge.log"
  [ "$code" -ne 0 ] && read -r -p "Enter closes this window " _
fi

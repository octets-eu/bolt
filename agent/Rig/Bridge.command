#!/bin/bash
# Double-click on rig's Desktop: starts the Bolt bridge in this Terminal window,
# which carries the Bluetooth grant a process started over SSH never gets, waits
# for both links, and prints the rig's state: links, Bolt batteries, whether the
# M5 answers, the camera forwarder and the phone's battery. With a bridge already
# running it prints the state alone. The adb call starts the adb server from this
# GUI session when none runs, which is the start it needs. Closing the window or
# Ctrl-C ends the bridge; `uv run bridge.py stop` from anywhere cuts the motors
# and leaves it running. Not while a session drives: the battery read is a
# client, and its disconnect cuts the motors. Lives in ~/Rig, the Desktop links it.
export PATH=/opt/homebrew/bin:$PATH
cd ~/Rig || exit 1
# shellcheck source=/dev/null
[ -f ~/Rig/rig.env ] && . ~/Rig/rig.env   # CAM_SERIAL, the phone's adb address
# adb's mDNS auto-connect opens a second connection to the phone by its paired name; the phone
# keeps one, the first dies with "error: closed" and the server sticks. One connection only.
export ADB_MDNS="${ADB_MDNS:-0}"

ask () {  # <port> <line>: one line to a forwarder on the host, its first reply line
  ( exec 3<>/dev/tcp/127.0.0.1/$1 && printf '%s\n' "$2" >&3 && read -t 20 -r reply <&3 && echo "$reply" ) 2>/dev/null
}

if nc -z -w 2 127.0.0.1 7000 >/dev/null 2>&1; then
  echo "bridge: already running"
else
  uv run bridge.py &
  bridge=$!
  for _ in $(seq 1 30); do  # both links, up to 60 s; a Bolt asleep in the cradle does not advertise
    sleep 2
    links=$(uv run bridge.py status 2>/dev/null | jq -r '[.[] | select(.link)] | length' 2>/dev/null)
    [ "${links:-0}" = "2" ] && break
  done
fi

echo "--- rig at $(date +%H:%M)"
uv run bridge.py status 2>/dev/null | jq -r '.[] | "\(.name) link \(if .link then "up" else "down" end), last frame \(.lastFrameAgeS) s ago"'
uv run bridge.py battery
m5=$(ask 7010 ping); echo "beacon: ${m5:-no answer on 7010}"
cam=$(ask 7020 status); echo "camera: ${cam:-forwarder not running}"
# an adb server that lost the phone once keeps failing with "No route to host" while ping and nc
# reach it; a fresh server connects. So: fresh server (it inherits ADB_MDNS), then connect
if [ -n "${CAM_SERIAL:-}" ]; then
  adb kill-server >/dev/null 2>&1
  perl -e 'alarm shift; exec @ARGV' 10 adb connect "$CAM_SERIAL" >/dev/null 2>&1
fi
phone=$(adb ${CAM_SERIAL:+-s "$CAM_SERIAL"} shell dumpsys battery 2>/dev/null | awk '/^ *level:/{l=$2} /^ *status:/{s=$2} END{if (l != "") printf "%s%% %s", l, (s == 2 || s == 5) ? "charging" : "discharging"}')
echo "phone: ${phone:-adb sees no phone}"
echo "---"
[ -n "${bridge:-}" ] && wait "$bridge"

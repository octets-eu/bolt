#!/bin/bash
# Double-click on rig's Desktop: the rig's bring-up after a reboot and its check
# at any time. Starts the Bolt bridge in this Terminal window, which carries the
# Bluetooth grant a process started over SSH never gets, starts the M5 and camera
# forwarders and colima when they are down, waits for both links, wakes both
# Bolts, then checks the rig with each line proven by the thing itself: the link,
# the ST answering a ping, the volts, the M5 answering through mpremote, the
# camera delivering a frame, the phone reporting its battery, the sandbox image
# and volume present and a container reaching the API through its firewall, the
# key file in shape. The last line is the verdict, ALL GOOD or NOT GOOD with the
# failed checks, and the window stays open on NOT GOOD until Enter. With a bridge
# already running it checks alone. The bridge's lines go to the window and to
# ~/Rig/bridge.log; when the bridge ends, the window says so with the exit code
# and stays open on a failure. Closing the window or Ctrl-C ends the bridge;
# `uv run bridge.py stop` from anywhere cuts the motors and leaves it running.
# Not while a session drives: the checks are clients, and a client's disconnect
# cuts the motors. Lives in ~/Rig, the Desktop links it.
export PATH=/opt/homebrew/bin:$PATH
cd ~/Rig || exit 1
# shellcheck source=/dev/null
[ -f ~/Rig/rig.env ] && { set -a; . ~/Rig/rig.env; set +a; }   # CAM_SERIAL and friends, exported for the forwarders
# adb's mDNS auto-connect opens a second connection to the phone by its paired name; the phone
# keeps one, the first dies with "error: closed" and the server sticks. One connection only.
export ADB_MDNS="${ADB_MDNS:-0}"

failed=()
ok  () { echo "$1"; }
bad () { echo "$1"; failed+=("$2"); }
ask () {  # <port> <line> [seconds]: one line to a forwarder on the host, its first reply line
  ( exec 3<>/dev/tcp/127.0.0.1/$1 && printf '%s\n' "$2" >&3 && read -t "${3:-20}" -r reply <&3 && echo "$reply" ) 2>/dev/null
}

# --- the bridge, in this window
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

# --- the forwarders and colima, when down
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
if ! colima status >/dev/null 2>&1; then
  echo "docker: colima stopped, starting"
  colima start >/dev/null 2>&1
fi

# --- the checks
echo "--- rig at $(date +%H:%M)"
status=$(uv run bridge.py status 2>/dev/null)
for name in SB-9129 SB-11DF; do
  if [ "$(jq -r --arg n "$name" '.[] | select(.name==$n) | .link' <<<"$status" 2>/dev/null)" = true ]; then
    ok "$name link up"
  else
    bad "$name link down" "$name link"
  fi
done
while read -r line; do  # "SB-9129 awake", or what went wrong
  case "$line" in "") ;; *" awake") ok "$line";; *) bad "$line" "${line%% *} awake";; esac
done < <(uv run bridge.py wake 2>/dev/null)
while read -r line; do  # "SB-9129 4.24 V", or what went wrong
  case "$line" in "") ;; *" V") ok "$line";; *) bad "$line" "${line%% *} battery";; esac
done < <(uv run bridge.py battery 2>/dev/null)
m5=$(ask 7010 ping)  # runs on the M5 itself, through mpremote
if [ "$m5" = "m5 ok" ]; then ok "beacon: m5 ok"; else bad "beacon: ${m5:-no answer on 7010}" "beacon"; fi
on=$(ask 7020 on 40)  # the camera: on, a frame within 20 s, off
if [ -z "$on" ]; then
  bad "camera: forwarder not running" "camera"
else
  frame=; t0=$(date +%s)
  for _ in $(seq 1 20); do
    sleep 1
    st=$(ask 7020 status 30)
    case "$st" in ""|*"age=none"*) ;; *) frame="$st"; break;; esac
  done
  off=$(ask 7020 off 30)
  if [ -n "$frame" ]; then
    ok "camera: first frame after $(( $(date +%s) - t0 )) s, ${frame#status }, then ${off:-no off}"
  else
    bad "camera: no frame within 20 s (${st:-no status}), then ${off:-no off}" "camera"
  fi
fi
# the phone over adb: answering? else connect; else a fresh server and connect, since an adb
# server that lost the phone once keeps failing with "No route to host" while ping and nc reach it
phone_ok () { [ "$(adb -s "$CAM_SERIAL" shell echo ok 2>/dev/null | tr -d '\r\n')" = ok ]; }
if [ -n "${CAM_SERIAL:-}" ] && ! phone_ok; then
  perl -e 'alarm shift; exec @ARGV' 10 adb connect "$CAM_SERIAL" >/dev/null 2>&1
  phone_ok || { adb kill-server >/dev/null 2>&1; perl -e 'alarm shift; exec @ARGV' 10 adb connect "$CAM_SERIAL" >/dev/null 2>&1; }
fi
phone=$(adb ${CAM_SERIAL:+-s "$CAM_SERIAL"} shell dumpsys battery 2>/dev/null | awk '/^ *level:/{l=$2} /^ *status:/{s=$2} END{if (l != "") printf "%s%% %s", l, (s == 2 || s == 5) ? "charging" : "discharging"}')
if [ -n "$phone" ]; then ok "phone: $phone"; else bad "phone: adb sees no phone" "phone"; fi
if colima status >/dev/null 2>&1; then  # the sandbox: image, volume, and the API from inside the firewall
  docker image inspect bolt-sandbox >/dev/null 2>&1 && img=yes || img=no
  docker volume inspect bolt_node_modules >/dev/null 2>&1 && vol=yes || vol=no
  code=$(docker run --rm --cap-add=NET_ADMIN --cap-add=NET_RAW bolt-sandbox bash -c 'curl -s -o /dev/null -m 15 -w "%{http_code}" https://api.anthropic.com/' 2>/dev/null)
  if [ "$img" = yes ] && [ "$vol" = yes ] && [ -n "$code" ] && [ "$code" != 000 ]; then
    ok "sandbox: image, volume, api.anthropic.com answers $code from inside"
  else
    bad "sandbox: image $img, volume $vol, api from inside ${code:-no answer}" "sandbox"
  fi
else
  bad "sandbox: colima not running" "sandbox"
fi
if grep -q '^ANTHROPIC_API_KEY=sk-' ~/Rig/secret.env 2>/dev/null; then ok "key: in shape"; else bad "key: ~/Rig/secret.env missing or not ANTHROPIC_API_KEY=sk-..." "key"; fi

if [ ${#failed[@]} -eq 0 ]; then echo "ALL GOOD"; else echo "NOT GOOD: ${failed[*]}"; fi
echo "---"

if [ -n "${bridge:-}" ]; then
  wait "$bridge"; code=$?
  echo "bridge: ended with exit $code; log in ~/Rig/bridge.log"
  [ "$code" -ne 0 ] && read -r -p "Enter closes this window " _
elif [ ${#failed[@]} -ne 0 ]; then
  read -r -p "Enter closes this window " _
fi

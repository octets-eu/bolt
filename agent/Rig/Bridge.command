#!/bin/bash
# Double-click on rig's Desktop: starts the Bolt bridge in this Terminal window,
# which carries the Bluetooth grant a process started over SSH never gets. Does
# nothing when a bridge already answers on the control port. Closing the window
# or Ctrl-C ends the bridge; `uv run bridge.py stop` from anywhere cuts the
# motors and leaves it running. Lives in ~/Rig, the Desktop holds a link to it.
export PATH=/opt/homebrew/bin:$PATH
cd ~/Rig || exit 1
if nc -z -w 2 127.0.0.1 7000 >/dev/null 2>&1; then
  echo "bridge: already running"
  uv run bridge.py status
  exit 0
fi
exec uv run bridge.py

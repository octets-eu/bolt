#!/usr/bin/env bash
# Build the sandbox image and run a command in it, the repo mounted and the
# egress firewall on. No docker socket is passed in, so nothing inside can
# widen its own mounts or reach another container.
#
#   rig/sandbox/run.sh                      a shell in the sandbox
#   rig/sandbox/run.sh npm run rig          bring up the Bolts from inside
#   rig/sandbox/run.sh npm run rig -- SB-9129
#
# First time in a fresh checkout, from the shell: npm install && \
#   npm run build --workspace packages/core && \
#   npm run build --workspace packages/node-socket
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
image="bolt-sandbox"

docker build -t "$image" "$here" >&2

exec docker run --rm -it \
  --cap-add=NET_ADMIN --cap-add=NET_RAW \
  -e BRIDGE_HOST="${BRIDGE_HOST:-192.168.5.2}" \
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)" \
  -v "$repo":/workspace \
  -v bolt_node_modules:/workspace/node_modules \
  -w /workspace \
  "$image" "${@:-bash}"

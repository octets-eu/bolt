#!/usr/bin/env bash
# Lay the rig down on the M1 from the repo: the subset that sync.rules names
# goes into ~/Rig/container (core, node-socket, the public docs, the package
# files, the floor plan, the two photos from the mount and rig.env for the start
# script), then agent/Rig/ goes over ~/Rig as it is (bridge, forwarders, sandbox,
# start script, README, and container/ with the brief, the challenge, the session). Copies and overwrites, never
# deletes, so the key, claude-home and sessions on the M1 are never touched; a
# stale file there is removed by hand. The target and the key come from
# agent/rig.env (RIG_TARGET, RSYNC_RSH), which is not in the repo.
#
#   agent/sync.sh              push; prints every file that changed
#   agent/sync.sh --dry-run    show what would go, send nothing
#
# After a sync the workspace needs its builds, see agent/Rig/container/CLAUDE.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
env="$here/rig.env"
[ -f "$env" ] || { echo "sync: $env missing (RIG_TARGET, RSYNC_RSH)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$env"
export RSYNC_RSH
dest="${RIG_TARGET%/}/"

rsync -a --itemize-changes "$@" --filter="merge $here/sync.rules" "$repo/" "${dest}container/"
# the floor plan lives with the browser app, which loads it from its public folder;
# the workspace gets a copy under docs/, the one place its documents point at
rsync -a --itemize-changes "$@" "$repo/apps/browser/public/floor-plan.svg" "${dest}container/docs/"
# the two photos from the mount, private since they show the room, go to the workspace root
rsync -a --itemize-changes "$@" "$repo/documentation/moto-cam-reference/floor-ultra-wide.jpg" "$repo/documentation/moto-cam-reference/floor-main.jpg" "${dest}container/"
# the start script on the M1 reads NTFY_TOPIC from its own copy of rig.env
rsync -a --itemize-changes "$@" "$env" "${dest}rig.env"
rsync -a --itemize-changes "$@" --exclude __pycache__/ --exclude .DS_Store "$here/Rig/" "$dest"

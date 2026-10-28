#!/usr/bin/env bash
# Lay the rig down on the M1 from the repo: the subset that sync.rules names
# goes into ~/Rig/container (core, node-socket, the public docs, the package
# files), then agent/Rig/ goes over ~/Rig as it is (bridge, forwarder, sandbox,
# README, and container/CLAUDE.md the brief). Copies and overwrites, never
# deletes, so the key, claude-home and sessions on the M1 are never touched; a
# stale file there is removed by hand. The target and the key come from
# docs/private/rig.env (RIG_TARGET, RSYNC_RSH), which is not in the repo.
#
#   agent/sync.sh              push; prints every file that changed
#   agent/sync.sh --dry-run    show what would go, send nothing
#
# After a sync the workspace needs its builds, see agent/Rig/container/CLAUDE.md.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
env="$repo/docs/private/rig.env"
[ -f "$env" ] || { echo "sync: $env missing (RIG_TARGET, RSYNC_RSH)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$env"
export RSYNC_RSH
dest="${RIG_TARGET%/}/"

rsync -a --itemize-changes "$@" --filter="merge $here/sync.rules" "$repo/" "${dest}container/"
rsync -a --itemize-changes "$@" "$here/Rig/" "$dest"

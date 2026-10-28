#!/usr/bin/env bash
# Watch and steer the agent: attach to its tmux session on the M1 over SSH.
# The session is created by the start script; if it is not there yet this
# makes an empty one of that name, so the same window serves to start by hand.
# Detach with Ctrl-b d, the session keeps running. Host and key come from
# docs/private/rig.env (RIG_TARGET, RSYNC_RSH), the same as sync.sh.
#
#   agent/watch.sh            attach to session "agent"
#   agent/watch.sh <name>     another session
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
env="$here/../docs/private/rig.env"
[ -f "$env" ] || { echo "watch: $env missing (RIG_TARGET, RSYNC_RSH)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$env"
host="${RIG_TARGET%%:*}"
session="${1:-agent}"

# RSYNC_RSH is "ssh <options>"; word-split on purpose
# shellcheck disable=SC2086
exec $RSYNC_RSH -t "$host" "export PATH=/opt/homebrew/bin:\$PATH; tmux new -A -s '$session'"

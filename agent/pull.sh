#!/usr/bin/env bash
# Bring the agent's work back. The challenge (agent/Rig/container/Challenge.md)
# confines the agent to packages/core/src/brain/, so only that folder is
# pulled: ~/Rig/container/packages/core/src/brain on the M1 is copied over the
# same path here, and `git status` and `git diff` show what the agent changed
# and created; you commit what you want. Copies and overwrites, never deletes,
# so a file the agent removed stays here. The tree must be clean before a
# pull, or the copy would bury your own changes.
# The camera frames the agent kept, ~/Rig/container/frames, come along into
# frames/ at the repo's root, the path its reports cite; the folder is
# gitignored, so they are here to look at and never in a commit. Only their
# number is printed.
# The record of the sessions comes along too, into agent/sessions/, gitignored
# as well: ~/Rig/sessions (per session the stream, every command of the agent
# with its output, and the report line), Claude Code's own transcripts from
# the container's home under claude-transcripts/, and the rig's logs
# (~/Rig/*.log). Again only the number of files is printed.
# Last, the daily brain: the pulled circuit drawn as agent/brains/<date>.svg
# by connectome_svg.py, tracked, so the day's last pull leaves that day's brain.
#
#   agent/pull.sh              pull; prints every file that changed
#   agent/pull.sh --dry-run    show what would come, fetch nothing
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/.." && pwd)"
env="$repo/docs/private/rig.env"
[ -f "$env" ] || { echo "pull: $env missing (RIG_TARGET, RSYNC_RSH)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$env"
export RSYNC_RSH
sub="packages/core/src/brain/"
src="${RIG_TARGET%/}/container/$sub"

if [ -n "$(git -C "$repo" status --porcelain)" ] && [ "${1:-}" != "--dry-run" ]; then
  echo "pull: the tree has uncommitted changes; commit or stash them first" >&2; exit 1
fi

mkdir -p "$repo/$sub"
rsync -a --itemize-changes "$@" --exclude .DS_Store "$src" "$repo/$sub"

mkdir -p "$repo/frames"
n="$(rsync -a --itemize-changes "$@" --exclude .DS_Store "${RIG_TARGET%/}/container/frames/" "$repo/frames/" | grep -c '^>f' || true)"
echo "frames: $n new"

rig="${RIG_TARGET%/}"
mkdir -p "$here/sessions/claude-transcripts"
n="$( { rsync -a --itemize-changes "$@" --exclude .DS_Store "$rig/sessions/" "$here/sessions/"
        rsync -a --itemize-changes "$@" --exclude .DS_Store "$rig/claude-home/.claude/projects/-workspace/" "$here/sessions/claude-transcripts/"
        rsync -a --itemize-changes "$@" --include '/*.log' --exclude '*' "$rig/" "$here/sessions/"
      } | grep -c '^>f' || true)"
echo "sessions: $n files new or changed"

circuit="$repo/${sub}connectome/circuit.json"
if [ -f "$circuit" ] && [ "${1:-}" != "--dry-run" ]; then
  mkdir -p "$here/brains"
  python3 "$here/connectome_svg.py" "$circuit" "$here/brains/$(date +%F).svg" "$(date +%F)"
fi

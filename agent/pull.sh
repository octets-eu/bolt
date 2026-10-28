#!/usr/bin/env bash
# Bring the agent's work back. The challenge (agent/Rig/container/Challenge.md)
# confines the agent to packages/core/src/brain/, so only that folder is
# pulled: ~/Rig/container/packages/core/src/brain on the M1 is copied over the
# same path here, and `git status` and `git diff` show what the agent changed
# and created; you commit what you want. Copies and overwrites, never deletes,
# so a file the agent removed stays here. The tree must be clean before a
# pull, or the copy would bury your own changes.
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

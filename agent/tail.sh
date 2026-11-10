#!/usr/bin/env bash
# Follow an agent session on the M1 in readable form: the agent's text and,
# indented, its commands, then the result line when the session ends. A print
# mode session writes its stream to ~/Rig/sessions/<stamp>/stream.jsonl and
# nothing to the tmux screen, so this is the view of a running session;
# watch.sh attaches to the screen. Ctrl-c ends the view, not the session.
# Host and key come from agent/rig.env (RIG_TARGET, RSYNC_RSH), the
# same as sync.sh.
#
#   agent/tail.sh             the newest session
#   agent/tail.sh <stamp>     another one, e.g. 2026-11-06_1652
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
env="$here/rig.env"
[ -f "$env" ] || { echo "tail: $env missing (RIG_TARGET, RSYNC_RSH)" >&2; exit 1; }
# shellcheck source=/dev/null
. "$env"
host="${RIG_TARGET%%:*}"
stamp="${1:-}"

# one line of the stream to what a reader wants of it; lines that are not JSON are skipped
filter='fromjson?
  | if .type == "assistant" then
      .message.content[]
      | if .type == "text" then "\n" + .text
        elif .type == "tool_use" then "  > " + (.input.command // .input.file_path // .name | tostring | .[0:200])
        else empty end
    elif .type == "result" then "\nresult \(.subtype), cost \(.total_cost_usd), turns \(.num_turns)"
    else empty end'

# RSYNC_RSH is "ssh <options>"; word-split on purpose
# shellcheck disable=SC2086
exec $RSYNC_RSH -t "$host" "
  d=\$HOME/Rig/sessions
  s='$stamp'; [ -n \"\$s\" ] || s=\$(ls \"\$d\" | tail -1)
  echo \"session \$s\"
  tail -n 200 -f \"\$d/\$s/stream.jsonl\" | /opt/homebrew/bin/jq -Rr --unbuffered '$filter'"

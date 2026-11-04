#!/usr/bin/env bash
# One agent session in the sandbox on the M1, run as rig. A session is a budget:
#
#   ~/Rig/run-agent.sh 10                  a session of $10; dollars throughout, as the flag
#                                          and the monthly credit count
#   ~/Rig/run-agent.sh 10 --interactive    the same with a terminal, for a session you sit
#                                          in; run it inside tmux (agent/watch.sh opens one).
#                                          The budget flag is print mode only, so this run is
#                                          bounded by the console's limit alone
#   MODEL=opus EFFORT=high AUTOCOMPACT=300k ~/Rig/run-agent.sh 10
#                                          the model (alias or id), the thinking depth (low,
#                                          medium, high, xhigh, max) and the context size at
#                                          which compaction runs; unset, claude's defaults
#   PROMPT=~/Rig/comprehension.md ~/Rig/run-agent.sh 3
#                                          another prompt file than ~/Rig/prompt.md, for a test
#
# Before the run: refuses while the last section of brain/docs/questions.md has no
# answer; commits the workspace, so the agent's diff at the end is its work alone;
# writes the budget as the one line of Session.md. The run: the firewalled
# container, claude in print mode with the prompt from ~/Rig/prompt.md, the stream
# into ~/Rig/sessions/<stamp>/stream.jsonl. After the run: the result record (cost,
# turns, subtype) goes to the session's report.md, then the bell: an unanswered
# question, a budget stop or an error page the phone over ntfy and beep the M5
# three times; a clean end beeps once and pages "done". NTFY_TOPIC (and NTFY_URL,
# default https://ntfy.sh) come from ~/Rig/rig.env, the API key from ~/Rig/secret.env.
set -euo pipefail

rig="$HOME/Rig"
workspace="$rig/container"
questions="$workspace/packages/core/src/brain/docs/questions.md"
budget="${1:?usage: run-agent.sh <budget> [--interactive]}"
mode="${2:-}"
export PATH=/opt/homebrew/bin:$PATH
# shellcheck source=/dev/null
[ -f "$rig/rig.env" ] && . "$rig/rig.env"
NTFY_URL="${NTFY_URL:-https://ntfy.sh}"

# The last section of questions.md, and whether an Answer: line follows it.
last_question () { grep '^## ' "$questions" 2>/dev/null | tail -1 | sed 's/^## //'; }
unanswered () {
  [ -f "$questions" ] || return 1
  awk '/^## /{q=1; a=0} /^Answer:/{a=1} END{exit (q && !a) ? 0 : 1}' "$questions"
}
page () {  # <text>
  [ -n "${NTFY_TOPIC:-}" ] || return 0
  curl -s -o /dev/null -m 10 -d "$1" "$NTFY_URL/$NTFY_TOPIC" || true
}
beep () {  # <n>
  ( exec 3<>/dev/tcp/127.0.0.1/7010 && printf 'beep %s\n' "$1" >&3 && read -t 10 -r _ <&3 ) 2>/dev/null || true
}

if unanswered; then
  echo "run-agent: the last question has no answer: $(last_question)" >&2
  exit 2
fi

stamp="$(date +%Y-%m-%d_%H%M)"
dir="$rig/sessions/$stamp"
mkdir -p "$dir"
printf '# Session\n\nBudget: $%s, the number the start script enforces.\n' "$budget" > "$workspace/Session.md"
git -C "$workspace" add -A
git -C "$workspace" commit -q -m "before session $stamp" || true

docker_flags=(
  --rm --cap-add=NET_ADMIN --cap-add=NET_RAW
  -e HOST_UID="$(id -u)" -e HOST_GID="$(id -g)"
  -e HOME=/claude-home -e CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
  -e BRIDGE_HOST=192.168.5.2
  --env-file "$rig/secret.env"
  -v "$workspace":/workspace -v bolt_node_modules:/workspace/node_modules
  -v "$rig/claude-home":/claude-home -w /workspace
)
claude_flags=( --strict-mcp-config )
[ -n "${MODEL:-}" ] && claude_flags+=( --model "$MODEL" )
[ -n "${EFFORT:-}" ] && claude_flags+=( --effort "$EFFORT" )
[ -n "${AUTOCOMPACT:-}" ] && claude_flags+=( --autocompact "$AUTOCOMPACT" )

status=0
if [ "$mode" = "--interactive" ]; then
  docker run -it "${docker_flags[@]}" bolt-sandbox claude "${claude_flags[@]}" || status=$?
else
  prompt="$(cat "${PROMPT:-$rig/prompt.md}")"
  docker run "${docker_flags[@]}" bolt-sandbox \
    claude "${claude_flags[@]}" --max-budget-usd "$budget" -p "$prompt" --output-format stream-json --verbose \
    > "$dir/stream.jsonl" 2> "$dir/stderr.log" || status=$?
fi

# the result record: the last line of type result; the container's entrypoint prints its firewall
# line first, which is not JSON and would abort jq, so only lines that start a JSON object count
result="$(grep '^{' "$dir/stream.jsonl" 2>/dev/null | jq -c 'select(.type=="result")' 2>/dev/null | tail -1 || true)"
subtype="$(jq -r '.subtype // "none"' <<<"${result:-{}}" 2>/dev/null || echo none)"
cost="$(jq -r '.total_cost_usd // "?"' <<<"${result:-{}}" 2>/dev/null || echo '?')"
turns="$(jq -r '.num_turns // "?"' <<<"${result:-{}}" 2>/dev/null || echo '?')"
{
  echo "# Session $stamp"
  echo
  echo "budget $budget, cost $cost, turns $turns, result $subtype, exit $status"
} >> "$dir/report.md"

if unanswered; then
  reason="question: $(last_question)"; beep 3
elif [ "$subtype" = "error_max_budget_usd" ]; then
  reason="budget stop at $cost"; beep 3
elif [ "$status" -ne 0 ] || [ "$subtype" != "success" ]; then
  reason="error: result $subtype, exit $status"; beep 3
else
  reason="done: cost $cost, $turns turns"; beep 1
fi
page "agent $stamp $reason"
echo "run-agent: $reason; log in $dir"

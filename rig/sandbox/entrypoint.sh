#!/usr/bin/env bash
# Apply the firewall as root, then run the command as the host user so files
# written into the mounted repo belong to that user, not root. HOST_UID and
# HOST_GID default to the rig user on the M1 (501:20).
set -euo pipefail

if /usr/local/bin/init-firewall.sh; then :; else
  echo "firewall: NOT applied; run with --cap-add=NET_ADMIN for the egress limit" >&2
fi

uid="${HOST_UID:-501}"
gid="${HOST_GID:-20}"
# the node_modules volume comes up owned by root; hand it to the run user
chown "${uid}:${gid}" /workspace/node_modules 2>/dev/null || true
# a persistent HOME volume (Claude Code creds, workspace trust) likewise
if [ -n "${HOME:-}" ] && [ "$HOME" != "/" ]; then
  mkdir -p "$HOME" && chown -R "${uid}:${gid}" "$HOME" 2>/dev/null || true
fi

exec setpriv --reuid "$uid" --regid "$gid" --clear-groups "$@"

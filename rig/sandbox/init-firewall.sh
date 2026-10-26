#!/usr/bin/env bash
# Limit the container's outbound reach to what the work needs: the bridge on
# the host, DNS, and the allowlisted domains. Everything else is dropped. Needs
# NET_ADMIN (run.sh adds it); without it the container still runs, open.
#
# Domains resolve to IPs at this moment, so a domain that moves behind new IPs
# needs this script run again. The bridge is reached by IP, so it is stable.
set -euo pipefail

BRIDGE_HOST="${BRIDGE_HOST:-192.168.5.2}"
# 7000-7002 the Bolt bridge, 7010 the M5 forwarder
BRIDGE_PORTS="${BRIDGE_PORTS:-7000:7010}"
# space separated; registry.npmjs.org lets the container install and build, drop it for full lockdown
ALLOW_DOMAINS="${ALLOW_DOMAINS:-api.anthropic.com registry.npmjs.org}"

iptables -F; iptables -X 2>/dev/null || true

iptables -P INPUT DROP
iptables -P FORWARD DROP
iptables -P OUTPUT DROP

# loopback and replies to connections we opened
iptables -A INPUT  -i lo -j ACCEPT
iptables -A OUTPUT -o lo -j ACCEPT
iptables -A INPUT  -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT
iptables -A OUTPUT -m conntrack --ctstate ESTABLISHED,RELATED -j ACCEPT

# DNS, so the domains below can be resolved
iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
iptables -A OUTPUT -p tcp --dport 53 -j ACCEPT

# the bridge on the host: the only way to a Bolt
iptables -A OUTPUT -p tcp -d "$BRIDGE_HOST" --dport "$BRIDGE_PORTS" -j ACCEPT

# the allowlisted domains, pinned to the IPs they resolve to now
for host in $ALLOW_DOMAINS; do
  for ip in $(getent ahostsv4 "$host" | awk '{print $1}' | sort -u); do
    iptables -A OUTPUT -p tcp -d "$ip" --dport 443 -j ACCEPT
  done
done

echo "firewall: egress limited to DNS, ${BRIDGE_HOST}:${BRIDGE_PORTS}, and: ${ALLOW_DOMAINS}"

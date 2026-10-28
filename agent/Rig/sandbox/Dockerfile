# The sandbox an agent runs in: Node, git, and an egress firewall. It holds no
# Bolt code; the repo is mounted at /workspace at run time (see run.sh). The
# container reaches the Bolts only through the bridge on the host, and the
# firewall lets it reach only the bridge, DNS, and the allowlisted domains.
FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      iptables ipset iproute2 dnsutils ca-certificates curl git jq procps util-linux \
 && rm -rf /var/lib/apt/lists/*

# the Claude Code CLI, for an interactive Remote-Control session in the sandbox
RUN npm install -g @anthropic-ai/claude-code

COPY init-firewall.sh entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/init-firewall.sh /usr/local/bin/entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["bash"]

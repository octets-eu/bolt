# Checklist before the first agent session

What has to be in place and tested, in the order it is needed. `[x]` is proven, `[ ]` is open. Hosts, keys and paths that are private stay in `docs/private/m1-rig.md`.

## 1 Repo and sync

- [x] Layout: `agent/` stays here, `agent/Rig/` mirrors `~/Rig/` on the M1, `agent/Rig/container/` is the workspace the container mounts. `agent/sync.sh` with no argument stages into `agent/stage/`.
- [ ] Commit the layout.
- [ ] First push with `RSYNC_RSH` and the M1 target. Then on the M1: trash `~/Rig/bolt` and `~/Rig/bridge/` from the old layout, start the bridge from `~/Rig/bridge.py`.
- [ ] Update the paths in `docs/private/m1-rig.md`.
- [ ] Git in the workspace, once, on the M1 as rig: `git init` in `~/Rig/container`, identity `operator <operator@hypatia.earth>` set locally there, `.gitignore` already in place; then `git add -A && git commit -m baseline`. Never pulled; the agent's own checkpoints and history.
- [ ] The start script commits the synced state before every session, so the agent starts clean and its diff at the end is exactly its work.
- [ ] Rebuild the image on the M1 from `~/Rig/sandbox`.
- [ ] Build core and node-socket inside the container; open the registry for that one shell if the `bolt_node_modules` volume is missing.
- [ ] `npm run rig` from inside the container: both Bolts up, battery read.
- [ ] `npm run m5test` from inside: frames on channel 7 heard.
- [ ] `agent/pull.sh` after the first session: `packages/core/src/brain/`, the agent's only folder, lands in the repo and `git diff` shows it; needs a clean tree, so commit before a pull.

## 2 Host services on the M1, as rig

- [x] colima runs, the image builds, the firewall allows the API alone; the registry opens per run with `ALLOW_DOMAINS`.
- [ ] Bridge started once from rig's GUI Terminal for the Bluetooth grant; `uv run bridge.py status` shows both links up; `probe` each Bolt.
- [ ] Forwarder running: `uv run m5.py`; `ping` answers.
- [ ] Bridge safety by hand: kill a client while a Bolt rolls, motors stop; `uv run bridge.py stop`, motors stop.
- [ ] Key file passes `grep -q '^ANTHROPIC_API_KEY=sk-' ~/Rig/secret.env`; never printed. Workspace spend limit set in the console.
- [ ] Decide the speed cap in the bridge; today the floor is deadman plus motors-off.

## 3 M5 beep, not built

- [ ] `beep` command in `m5.py`, a PWM tone on the M5 Fire's speaker (GPIO 25) over mpremote.
- [ ] Heard from the container through the forwarder.
- [ ] Decide when the agent beeps: session start, session end, stuck.

## 4 tmux

- [x] tmux 3.8 on the M1; `send-keys` and `capture-pane` proven over SSH.
- [ ] The agent session runs inside `tmux new -d -s agent`; attach from the M4 over SSH.
- [ ] Detach, drop the SSH connection, reconnect, attach: the session is still there.
- [ ] `pipe-pane` writes the screen to a log file.

## 5 Start script, `~/Rig/run-agent.sh`, documented in `agent/Rig/README.md`

- [ ] docker flags: firewall caps, host uid, `HOME=/claude-home`, nonessential traffic off, env-file, mounts for `container` and `claude-home`, `--strict-mcp-config`.
- [ ] claude flags: `-p` with the prompt read from a file, `--output-format stream-json` into a log, `--max-budget-usd`, `--autocompact` window, the model.
- [ ] The result record, cost and turns, appended to the session's report.
- [ ] Logs under `~/Rig/sessions/<date>/`, outside the container.
- [ ] An interactive variant with `-it` for watching and steering.

## 6 The brief and the workspace documents

- [ ] Situation: the floor, the fixed things, what drifts during a session, what the agent senses and does, what is unknown at the start, what counts as evidence.
- [ ] Architecture: the connectome, the observation layer, the ring, the two skills, the diagnosis order; the channel and circuit file formats.
- [ ] Goal and gate with no human in the loop: the agent varies the start heading, switches the beacon, judges by the locator; reports are read afterwards.
- [ ] Setup file: floor size, beacon bearing, Bolt spots, filled before a session.
- [ ] Report format and folder; the next session reads the last report first.

## 7 Test runs, in order

- [x] Smoke: `claude -p "Hi"` answers from the firewalled container.
- [ ] Comprehension: the agent explains the rig, the environment and the challenge in its own words and says what it would verify first; no Bolt touched. Where it misreads, the brief is wrong.
- [ ] Chain: the agent brings up both Bolts, reads the batteries, pings the M5, hears channel 7; numbers only, no motion.
- [ ] Motion: one 90° turn and back, locator heading reported, then stop.
- [ ] Budget: `--max-budget-usd 0.50`; the session stops and the record carries the cost.
- [ ] Steering: `send-keys` mid-run, `capture-pane` shows it.
- [ ] Long run: a small `--autocompact` window; the report survives the compaction.

## 8 The floor before every session

- [ ] Bolts charged above 4.0 V and on their spots; beacon on its spot, powered, USB to the M1; floor clear.
- [ ] Nobody is needed during the session. A Bolt that leaves the floor ends it; no guard exists.

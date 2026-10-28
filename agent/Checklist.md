# Checklist before the first agent session

What has to be in place and tested, in the order it is needed. `[x]` is proven, `[ ]` is open. Hosts, keys and paths that are private stay in `docs/private/m1-rig.md`.

## 1 Repo and sync

- [x] Layout: `agent/` stays here, `agent/Rig/` mirrors `~/Rig/` on the M1, `agent/Rig/container/` is the workspace the container mounts. `agent/sync.sh` with no argument stages into `agent/stage/`.
- [x] Commit the layout.
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
- [x] Bridge running with both links up (status, 28.10.). `probe` times out while the Bolts sleep; it needs them awake, so it is a floor item.
- [x] Forwarder running; `ping` answers `m5 ok` (28.10.).
- [ ] Bridge safety by hand: kill a client while a Bolt rolls, motors stop; `uv run bridge.py stop`, motors stop.
- [x] Key file passes `grep -q '^ANTHROPIC_API_KEY=sk-' ~/Rig/secret.env`; never printed.
- [ ] Workspace spend limit set in the console.
- [ ] Decide the speed cap in the bridge; today the floor is deadman plus motors-off.

## 3 M5: beep, menu, dashboard, not built

- [ ] `beep` command in `m5.py`, a PWM tone on the M5 Fire's speaker (GPIO 25) over mpremote.
- [ ] Heard from the container through the forwarder.
- [ ] Decide when the agent beeps: session start, session end, stuck; three beeps mean "I need you", per the brief.
- [ ] The forwarder holds the serial port open: a loop on the M5 pushes button events up and takes draw commands down, beacon sends go through the same link. The forwarder is then the only process on the port; the CLI `uv run m5.py send` goes away.
- [ ] The M5 stays dumb: it draws lines and reports A, B, C and long presses. Menu items are a table in the forwarder, label to function; a new item is one line there and nothing on the M5.
- [ ] Stop button: `stop` to the bridge's control port (motors off on both Bolts), `docker pause` on the agent's container, a beep, "STOPPED" on the screen; a second press resumes the container, the motors stay off until the agent commands them.
- [ ] First actions: stop and resume; beacon on channel 7 on and off, long or short ladder; Bolts to sleep and awake; agent start, stop, "I am here" clearing the attention; restart the bridge, restart the forwarder.
- [ ] Dashboard as the resting screen, refreshed every second or two: per Bolt link, client, age of the last frame from the bridge's status; battery once something polls it; agent running, elapsed, cost from its log, last report line; beacon idle or sending, channel, frames; camera up, frames per second; the attention reason until a button clears it.
- [ ] Buttons: A and C move, B selects, a long press on B goes back to the dashboard. The menu appears on the first press.

## 4 tmux

- [x] tmux 3.8 on the M1; `send-keys` and `capture-pane` proven over SSH.
- [x] The agent session runs inside `tmux new -d -s agent` (proven 28.10. with an interactive `docker run -it ... claude` inside); `agent/watch.sh` from here attaches to it over SSH, Ctrl-b d detaches.
- [x] The session lives on the M1's tmux server, not on the SSH connection: it was driven from five separate SSH connections (28.10.).
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
- [x] Budget: `--max-budget-usd 0.006` on a four-step task stopped it after 3 turns with `subtype error_max_budget_usd`, cost 0.0285 in the record (28.10.). The check runs between turns, so a session overshoots by up to one turn; the budget is a stop, not a cap.
- [x] Steering: `send-keys` answered the first-run prompts and asked a question, `capture-pane` read the answer (28.10.). Submit with `C-m`, not `Enter`: Claude Code's prompt box ignores tmux's Enter. First-run onboarding (theme, API key confirmation, security notes, trust of /workspace) is done once and persists in `claude-home`; the interactive default is auto mode.
- [ ] Long run: a small `--autocompact` window; the report survives the compaction.

## 8 The floor before every session

- [ ] Bolts charged above 4.0 V and on their spots; beacon on its spot, powered, USB to the M1; floor clear.
- [ ] Nobody is needed during the session. A Bolt that leaves the floor ends it; no guard exists.

## 9 Camera: the moto g35 as the agent's judge, arriving 29.10.

- [ ] On the phone: developer options, USB debugging; one cable to the M1. On the M1 as noiv: `brew install android-platform-tools scrcpy`; `adb devices` as rig sees the phone after the fingerprint prompt.
- [ ] `scrcpy --video-source=camera --list-cameras`: three or more ids with a wide size means the ultrawide is open. If not, the fallback is mirroring the stock camera app.
- [ ] The frame forwarder on the M1, beside the bridge: owns the phone, serves the latest frame as a JPEG on port 7020, loopback and the colima net only. How it gets frames out of scrcpy on macOS is the open piece; a file recording, a pipe, or a client that decodes the stream are the candidates, to be tested with the phone in hand.
- [ ] Firewall: the bridge range `7000:7010` grows to cover the camera port.
- [ ] Libraries in the image or the node_modules volume, so the agent has them without the registry: a JPEG decoder, `sharp`, OpenCV as WebAssembly.
- [ ] A frames folder in the workspace the agent can save to and look at with its Read tool.
- [ ] The camera example, `packages/node-socket/camtest.mjs` behind `npm run camtest`: fetches one frame from port 7020, saves it to the frames folder, prints its size and the time it took. The third of the three examples, next to `connect.mjs` and `m5test.mjs`.
- [ ] One line in the brief: the port, the packages, the folder. Nothing about what to do with them.
- [ ] The phone on its mount above the floor, powered over USB, screen off, camera open during a session.

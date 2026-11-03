# Checklist before the first agent session

What has to be in place and tested, in the order it is needed. `[x]` is proven, `[ ]` is open. Hosts, keys and paths that are private stay in `docs/private/m1-rig.md`.

## 1 Repo and sync

- [x] Layout: `agent/` stays here, `agent/Rig/` mirrors `~/Rig/` on the M1, `agent/Rig/container/` is the workspace the container mounts. `agent/sync.sh` with no argument stages into `agent/stage/`.
- [x] Commit the layout.
- [x] First push (03.11., 85 files); the old `~/Rig/bolt` and `~/Rig/bridge/` are in rig's Trash. The bridge from `~/Rig/bridge.py` needs its first start from rig's GUI Terminal again: over SSH it gets no Bluetooth, the grant did not follow the move.
- [x] Update the paths in `docs/private/m1-rig.md`.
- [x] Git in the workspace (03.11.): `~/Rig/container` is a repo with the identity `operator <operator@hypatia.earth>` and a baseline commit of 81 files, the brain folder skeleton (`docs`, `utils`, `connectome/{motor,ring,observation}`, each with a `.gitkeep`) included. Never pulled; the agent's own checkpoints and history.
- [ ] The start script commits the synced state before every session, so the agent starts clean and its diff at the end is exactly its work.
- [x] Rebuild the image on the M1 from `~/Rig/sandbox` (03.11.; the firewall says 7000:7020).
- [x] Built inside the container (03.11.): the old volume had folders from the first install under another uid and `npm install` failed with EACCES, so the volume was removed and made fresh, registry opened once: 115 packages, core and node-socket compiled, `sharp` arm64 and the decoders load. A volume belongs to one uid; recreate it rather than fix it.
- [x] `npm run rig` from inside the container (03.11., new layout): both Bolts up through the bridge, SB-11DF at 4.24 V, the matrix char ran.
- [x] `npm run m5test` from inside (03.11.): 11 of 10 frames heard on channel 7.
- [x] `agent/pull.sh` proven (03.11.): the brain folder skeleton's five placeholders came from the M1 into `packages/core/src/brain/` and `git status` showed them. Needs a clean tree, so commit before a pull.

## 2 Host services on the M1, as rig

- [x] colima runs, the image builds, the firewall allows the API alone; the registry opens per run with `ALLOW_DOMAINS`.
- [x] Bridge running with both links up (status, 28.10.). `probe` times out while the Bolts sleep; it needs them awake, so it is a floor item.
- [x] Forwarder running; `ping` answers `m5 ok` (28.10.).
- [ ] Camera forwarder running after a reboot: `cd ~/Rig && CAM_SERIAL=<phone>:5555 nohup python3 cam.py > cam.log &`; the phone\'s plain port dies with its reboot, then the paired name goes in `CAM_SERIAL` instead.
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
- [ ] Page the human over ntfy: the ntfy app on the iPhone 13 subscribed to a private topic, the topic name in `docs/private/rig.env`, one `curl` from the forwarder; `page <reason>` becomes a forwarder command next to the beep, so the agent's "I need you" rings the phone anywhere, not only the room. The FRITZ!App Fon as a real call is the later upgrade.

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

- [x] Situation (03.11.): folded into the end of `Challenge.md` as "what is where", one line per file the brief does not name: the floor plan, the two photos from the mount, four pointers into the seek's code. The brief links the challenge, the challenge links `Session.md`; no file is named twice.
- [ ] Architecture: the connectome, the observation layer, the ring, the two skills, the diagnosis order; the channel and circuit file formats.
- [ ] Goal and gate with no human in the loop: the agent varies the start heading, switches the beacon, judges by the locator; reports are read afterwards.
- [ ] `Session.md` (the form exists, 03.11.): the beacon's place, the Bolts' places and roles, the camera's address, the budget; filled before each session.
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

## 9 Camera: the moto g35 as the agent's eye on the floor

- [x] On the phone: developer options, USB debugging, fingerprint accepted; adb sees it as `moto_g35_5G`, USB name "Unisoc Phone" (29.10., on the M4).
- [x] The same on the M1, over Wi-Fi since no cable reaches the mount (03.11.): `brew install scrcpy` and `brew install --cask android-platform-tools` as noiv; the phone's Wireless debugging paired from the M1 as rig with `adb pair <ip>:<pair-port> <code>`, after which the phone announces itself as `adb-ZE223G3PP3-1PuuVZ._adb-tls-connect._tcp` and adb connects by that name after every reboot. The M1's adb server must be started once from rig's GUI Terminal: started over SSH, every TCP connect to the phone fails with "no route to host" (macOS Local Network permission), the same wall as Bluetooth. scrcpy from the M1 lists the three cameras.
- [x] `scrcpy --video-source=camera --list-cameras` (scrcpy 5.0.1): id 0 back 4080x3072, id 1 front, id 2 back 3264x2448, the 8 MP ultrawide, open to apps. A frame from id 2 shows the keyboard, mouse and cup that id 0 cuts out. No fallback needed.
- [x] The frame forwarder, `agent/Rig/cam.py`, running on the M1 as rig since 03.11. (`CAM_SERIAL=<phone>:5555 nohup python3 cam.py`): `ping`, `on`, `off`, `status`, `frame`; the first frame 5 s after `on`, 1600x1200 H.265 over Wi-Fi, two a second, nothing recorded, the stream runs only between `on` and `off`. Proven from the host; from the container after the push. The frame path underneath (29.10.): `scrcpy --video-source=camera --camera-id=2 --camera-size=3264x2448 --video-bit-rate=4M --no-playback --no-audio --record-format=mkv --record=<fifo>` and `ffmpeg -i <fifo> -vf fps=1 ...` pulls frames live through a named pipe, one per second; with `-update 1` ffmpeg keeps one latest JPEG current for the forwarder to serve. `--time-limit` ends a recording cleanly; `--camera-size` and `--max-size` cannot be combined; an mp4 killed mid-way is unreadable, mkv is not.
- [x] Firewall: the host range is `7000:7020` now, in `init-firewall.sh`; takes effect with the next image build.
- [x] Libraries: `jpeg-js`, `sharp` and `@techstark/opencv-js` are root devDependencies (03.11.); they reach the volume with the next install, registry opened once.
- [x] `frames/` in the workspace, gitignored, created by the first `camtest`.
- [x] The camera example, `npm run camtest`, from inside the firewalled container (03.11.): ping, on, a 120 KB frame into `frames/` after 4.6 s, off. It polls for 30 s and prints the forwarder's status on failure. `npm run camtest -- 0` takes the main camera: the forwarder's `on [id]` makes the lens the agent's choice, id 2 the ultrawide and the whole floor, id 0 the main camera and the stretch between the speakers at twice the detail; `floor-ultra-wide.jpg` and `floor-main.jpg` in the workspace show each.
- [x] One line in the brief: the camera bullet under "What the rig provides", port, protocol, packages, folder.
- [x] Over Wi-Fi too (29.10.): `adb tcpip 5555` while on USB, then `adb connect <phone-ip>:5555`, and scrcpy with `-s <ip>:5555`. At 960x720 and 2 Mbit/s the pipe path delivered 10 frames in 15 s with no decode errors, both Bolts visible on the floor from about 1.5 m; at 3264x2448 and 3 Mbit/s packet loss tore the frames. From the M1 over Wi-Fi with H.265 at `--max-size=1632` (1600x1200) and 2 Mbit/s: 10 frames in 15 s, no decode errors (03.11.). That is the mount's setting. The plain TCP mode lasts until the phone reboots; the paired service does not.
- [x] The phone on its mount on the partition's ceiling since 03.11., 2 m up, no cable, on its own battery, Wi-Fi to the M1; the camera runs only between the agent's `on` and `off`.

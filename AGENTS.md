# AGENTS.md — Circuit Overdrive

Repository instructions for Codex and other coding agents. These rules apply to the entire repository unless a more specific, approved instruction file narrows the scope.

## 1. Mission

Build **Circuit Overdrive**, an original, high-speed, offline-first 3D arcade racing game powered by selected **QSOLKCB/VANILLAJS** components.

**Creative direction:** the immediacy, colourful stock-car racing, dense traffic and spectacular scenery associated with 1990s arcade racers such as *Daytona USA*, combined with the scenic point-to-point roads, exotic vehicle variety and camera presentation associated with *Need for Speed II*. Treat these as gameplay and aesthetic references **only**. Create original tracks, car silhouettes, liveries, UI, music, logos and audio; never import or recreate copyrighted commercial assets, trademarks, tracks, vehicle branding, source code or proprietary game data.

This is a **game**, not a new general-purpose engine or an editor-first research project. Prioritise getting a race on screen that feels enjoyable to drive. Readable road geometry, responsive handling, convincing opponent behaviour and clear race feedback outrank speculative features.

**Current repository status at project inception:** documentation and Apache-2.0 licence only. Features below describe targets, not existing functionality. Inspect the actual checkout before claiming anything is implemented.

## 2. Authority and upstream references

- Game repository: https://github.com/QSOLKCB/Circuit-Overdrive
- Engine repository: https://github.com/QSOLKCB/VANILLAJS
- Engine composition guidance: https://github.com/QSOLKCB/VANILLAJS/blob/main/BUILD_A_GAME.md
- Original Racing Lab: https://github.com/QSOLKCB/VANILLAJS/blob/main/docs/RACING_LAB.md
- HORIZON racing guide: https://github.com/QSOLKCB/VANILLAJS/blob/main/docs/HORIZON_RACING.md
- Vehicle dynamics: https://github.com/QSOLKCB/VANILLAJS/blob/main/docs/VEHICLE3D_API.md
- Scenic rendering: https://github.com/QSOLKCB/VANILLAJS/blob/main/docs/SCENIC3D_API.md
- Lit rendering: https://github.com/QSOLKCB/VANILLAJS/blob/main/docs/RENDER_LIT_API.md
- Vehicle audio: https://github.com/QSOLKCB/VANILLAJS/blob/main/docs/VEHICLE_AUDIO_API.md

Read the **actual files at the pinned upstream commit**, including any module contracts, before writing imports. Some engine documentation is experimental and may be outdated. A branch name or latest README is not proof of a stable API. Do not copy an upstream demo wholesale or represent a demo's gameplay policy as a reusable module contract.

When adopting engine code, choose an **exact immutable 40-character commit SHA**, record it and the selected modules in an inspectable provenance manifest, and retain applicable LICENSE/NOTICE material and source attribution. Vendor only the complete necessary module dependency closure; do not depend on upstream main at runtime. Keep engine upgrades in their own reviewed PRs. No silent runtime fetches from GitHub.

Candidate modules to inspect, **not assumed integration decisions**: vehicle3d, scenic3d, render-lit, render-webgl, vehicle-audio, time, input, gamepad, collision, road-arcade, exact-course and integer-replay. Select the smallest useful set by verified contracts. Keep game rules and world content inside this repository.

## 3. Non-negotiable engineering constraints

- Native browser technologies: JavaScript ES modules, HTML, CSS, WebGL and Web Audio. Prefer the standard library and small inspectable components.
- No runtime npm packages, Node framework, Three.js, Unity, Unreal, Babylon.js, CDN, telemetry, mandatory account, remote API, Docker, Kubernetes or cloud backend.
- Node may be used as an **optional development/test runner** if already available; do not introduce npm installation as a prerequisite.
- The game must run locally through a loopback HTTP server, for example: **python3 -m http.server 8000 --bind 127.0.0.1**. All runtime assets must be local and work without internet after checkout/deployment.
- Design for static GitHub Pages hosting under the **/Circuit-Overdrive/** repository subpath. Avoid root-absolute paths and environment-specific origins. Do not turn on Pages or change repository settings without owner approval.
- Preserve Apache-2.0 licensing, SPDX headers where appropriate and all upstream notices. Do not import third-party art, music or sound without an explicit compatible licence, provenance and permission review.
- Avoid large generated blobs, opaque minified code and dependency-heavy tooling. Prefer original procedural or hand-authored assets.
- Do not use nondeterministic browser globals, wall-clock time or unseeded randomness inside authoritative simulation updates.
- No merges, releases, tags, destructive branch operations or production deployments without explicit owner approval. Work in a focused branch and open a PR for review.

## 4. Game design targets

**The feeling:** fast and accessible within seconds; dramatic speed cues; wide, banked turns; opponent packs; close overtakes; exciting but controllable slides; and distinct environments. Keep it arcade fun rather than a strict motorsport simulator. Physics approximations must be documented and tested.

**Presentation targets**
- Third-person chase camera as default, with optional bonnet/hood, bumper and high rear-view alternatives where practical.
- Original 1990s-inspired colourful low-poly 3D visual language, crisp road markings, guardrails, cliffs, mountains, forests, bridges, tunnels, sky and horizon depth.
- Readable race HUD: large speed display in **km/h**, RPM/gear or simplified power band, lap and position, elapsed time, countdown, checkpoint/split feedback, race status and simple course/traffic map.
- Strong motion sensation through scenery cadence, camera follow, engine pitch, tyre effects, lateral slip and bounded camera shake. Do not compromise steering readability.
- Native original procedural engine/exhaust/tyre audio, with mute and user-gesture audio activation. Music is optional, original and separately controllable.

**Race formats**
- **Circuit:** multiple laps with a grid start, opponents, live ranking and a finish classification.
- **Scenic sprint:** point-to-point race with checkpoint progression, traffic and timed splits.
- Future-only ideas: championship ladder, time trial, ghost replay, rival difficulty, weather/night, unlockable original cars and track editor. Do not implement all of these before a core race is complete.

**Vehicle classes**
- Begin with one distinctive unbranded arcade touring/stock-car-style vehicle. Add a separately tuned sports/supercar class only after the core loop is validated.
- Distinguish handling via documented game-owned parameters (acceleration, top speed, grip, braking, weight feel and steering response), not just cosmetic colours.
- Keyboard first; gamepad support should preserve focus and disconnection safety. Design touch controls only when they can be properly tested.

## 5. Simulation, race rules and AI

- **One authoritative fixed-step simulation** (target 60 Hz) owns every car's position, motion, collisions, checkpoints and classification. Render timing and camera interpolation must not alter game state.
- Explicit input snapshots per tick; seeded, documented random streams for procedurally varied opponent decisions. Keep update order stable.
- Use the upstream vehicle dynamics where its verified contract fits; implement only a **bounded game-specific arcade handling policy** on top. Never teleport the rendered car separately from its collision state.
- Follow upstream units and conventions where integrated: SI units, right-handed coordinates, **+Y up, -Z forward**. Document conversions at every boundary; display speed in km/h.
- Race state machine should explicitly represent menu, countdown, racing, paused, finished and restart/recovery. Countdown must not silently advance during menu/UI focus.
- Course topology, spawn grids, forward-only checkpoint passage, lap completion, wrong-way detection and ranking must be derived from authoritative world state. No skipped-gate credit via reset, recovery or shortcut.
- AI should use the **same accepted vehicle motion and collision path** as the player. Start with lane/line following, corner-speed planning, simple overtaking and bounded collision avoidance; do not move opponents as decorative scripted animations.
- Resolve car-to-car, roadside and barrier interactions in a stable order. Test high-speed pass-through/tunnelling and spawn overlap; document unsupported collision classes explicitly rather than pretending they are physical.
- Recovery goes to the last valid safe track state with clear speed reset, cooldown and a disclosed race penalty. It must never advance a checkpoint or ranking illegitimately.
- Pause, tab hide, blur, controller disconnection and pointer/touch cancellation must clear held control state. Resuming requires fresh input. No death-on-spawn scenario while waiting for focus.
- Prefer bounded recordings of tick inputs and seeded initial conditions so race playback can be reproduced at the declared engine revision. Do **not** claim cross-browser bit-exact determinism without real evidence.

## 6. Architecture

Keep boundaries simple and one-way:

1. **core / simulation:** pure or explicit-state race rules, physics orchestration, track progression, AI and deterministic replay; no DOM or ambient time.
2. **platform / input:** keyboard/gamepad lifecycle, focus management and user settings.
3. **presentation:** WebGL scene and effects, chase cameras, HUD, menus and optional Web Audio.
4. **content:** original validated track definitions, car tuning, seeds, scenery and local assets.
5. **vendor:** exact pinned, unmodified VANILLAJS module closure with attribution.

Suggested paths (create only as needed): **index.html**, **src/**, **assets/**, **tracks/**, **tests/**, **vendor/vanillajs/**, **docs/** and **.github/workflows/**. These are proposals, not evidence that files already exist.

At the presentation boundary, render interpolated previous/current simulation snapshots. Avoid allocations per car/triangle/frame when possible; retain appropriate GPU buffers and document context-loss fallback. Validate all imported track and replay data with finite numeric bounds, count limits, schema/version checks and explicit rejection behaviour. Treat content as inert data, never executable scripts.

## 7. Roadmap: small, reviewable vertical slices

**CO-001 — First Race / playable prototype**
- Original small closed circuit with road surface, barriers, scenery and visible sky.
- One controllable car, chase camera, throttle/brake/steering, start countdown and working pause/restart.
- Fixed-step simulation, basic collision and speed/gear/lap HUD.
- Fully local static build that boots at the GitHub Pages subpath.
- A deterministic pure-simulation test and a real browser smoke test.
- **Exit:** player can start, complete a lap, finish and restart without a broken input lifecycle.

**CO-002 — Pack Racing**
- At least five computer opponents for an initial six-car field.
- Grid start, overtaking, collisions, live ranking, lap classification and end-of-race results.
- Tests for collisions, tie-breaking, wrong-way gates, recovery and AI repeatability.
- **Exit:** a multi-car race can finish consistently and the displayed positions agree with the simulation.

**CO-003 — Scenic Overdrive**
- Distinct point-to-point mountain/canyon/forest or coast sprint with bridges/tunnels and traffic.
- Roadside detail, speed sensation, traffic-aware HUD and split/checkpoint logic.
- Keep scenery geometry separate from actual contact geometry; explicitly test where barriers are solid.
- **Exit:** the complete sprint is drivable and finishable; no invisible-roadblock regressions.

**CO-004 — Arcade Polish**
- Improved original car silhouettes and liveries, better chase camera, sound, menus, competition feedback and telemetry-driven effects. Prepare the platform input boundary for controller profiles.
- Fix handling rough edges before adding more features.
- **Exit:** manual play-through evidence for both modes, visible UI clarity and no major focus/pause faults.

**CO-005 — Controller Profiles**
- Add gamepad, steering-wheel and mobile touch profiles through the shared driving-command interface.
- Verify calibration, neutral arming, disconnect and touch cancellation alongside the keyboard controls.
- **Exit:** supported profiles complete races on both courses and preserve focus, pause and recovery safety.

**CO-006 — Release Engineering**
- Reproducible offline packaging, GitHub Pages workflow (owner-reviewed), immutable engine provenance, licence checks, tests, browser validation and release notes.
- **Exit:** reviewed/approved release candidate with recorded commit SHAs, evidence and known limitations. Publication remains owner-controlled.

Do not bundle multiple roadmap phases into one large PR unless explicitly requested. An early screenshot or loading screen is not completion of a playable phase.

## 8. Verification and performance

For each implementation PR, provide the exact commands actually run, results, tested browser/OS and commit SHA. Distinguish **executed** checks from inferred behaviour or untested scenarios.

**Minimum validation, when those files exist:**
- Syntax/import integrity and any repository-specific static checks.
- Pure deterministic tests for race progression, AI decisions, vehicle commands, rankings, collision edge cases and invalid input.
- Replay/differing-render-rate check: the same fixed-tick commands must produce the same supported simulation outputs under the declared runtime.
- Browser smoke: game boots on localhost and under the **/Circuit-Overdrive/** nested path; canvas renders; countdown, controls, pause, focus loss, restart and finish operate.
- Browser input regression: key held -> blur -> key released off-window -> refocus must **not** drive until a fresh press; test gamepad disconnect and touch cancellation when implemented.
- Collision/checkpoint regression: no finish by gate skip or recovery exploit, no opponent passing through a tested solid barrier, no silent unsupported high-speed contact.
- Offline/no-network check: no required runtime URLs to third-party hosts.
- Review fallback for WebGL unavailable/lost context with a clear, non-crashing error or recovery path.

**Performance objective:** target perceptually smooth **60 FPS at 1080p on the documented test machine**, while preserving consistent simulation at slower render rates. Capture actual frame-time measurements, environment, race population and visual quality settings before making a performance claim. Avoid presenting headless Node tests, emulated graphics, or theoretical math as native-GPU validation. Offer bounded quality scaling without changing track or collision authority.

Use the repository's actual test commands as implemented; **do not fabricate passing tests or copy VANILLAJS's own CI command list into this game as though its scripts already exist**.

## 9. Codex workflow

1. Inspect branch, files, tests, project status and relevant pinned upstream module docs before editing.
2. State the selected **CO-00x** milestone, specific acceptance criteria, engine source commit and risks.
3. Implement the **smallest independently playable and reviewable increment**. Keep engine changes upstream if genuinely reusable; do not silently fork shared physics.
4. Add tests and focused documentation for every behaviour change. Include negative and boundary cases, especially pause/focus, high-speed collision, checkpoints and offline paths.
5. Run what can genuinely run; report executed versus unavailable checks with exact commands and outputs.
6. Open a focused PR describing changed files, demonstrated behaviour, evidence, remaining limitations and manual play-test steps.
7. Stop for owner review. **Never self-approve, merge, tag or deploy.**

**First Codex assignment:** implement **CO-001 — First Race**. Do not spend the first milestone building a generic toolchain, external asset pipeline, multiplayer service, expansive track editor or speculative physics rewrite. Deliver a car that drives, turns, collides, completes a lap and feels like an arcade game.

**QSOL-IMC principle: modern convenience, minimal dependencies, old-school correctness. Correctness outranks speed.**

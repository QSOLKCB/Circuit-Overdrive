# Circuit Overdrive — Roadmap

**Owner:** QSOL-IMC · **Project:** [Circuit Overdrive](https://github.com/QSOLKCB/Circuit-Overdrive) · **Engine:** [VANILLAJS](https://github.com/QSOLKCB/VANILLAJS)  
**Updated:** 2026-11-23 · **Licence:** Apache-2.0

> **Six cars. Several disciplines. One authoritative racing engine.**  
> Modern convenience, minimal dependencies, old-school correctness. **Correctness outranks speed.**

This is the forward development programme, not a claim that proposed features already exist. The release table is historical through v0.6.0; later entries are owner-approved goals, each subject to tests, review and owner sign-off. See [AGENTS.md](AGENTS.md) for engineering policy, [README.md](README.md) for implemented gameplay, and [offline release](docs/offline-release.md) for source-bound packaging.

## 1. Non-negotiable project contracts

- **One simulation authority:** fixed 60 Hz tick, real VANILLAJS vehicle/collision models, deterministic AI ordering, validated race progress, explicitly normalized commands, and bounded replay records. Graphics, sound, cameras, controllers and career UI are observers or validated command producers; none may secretly advance race state.
- **Immutable provenance:** selected VANILLAJS modules and transitive dependencies are copied from an exact commit, checksummed with SHA-256, and shipped with applicable LICENSE/NOTICE. No silently tracking upstream `main`.
- **Offline-first:** native ES modules, HTML/CSS, WebGL and Web Audio. No mandatory CDN, hosted API, accounts, multiplayer service or runtime package installation. A loopback HTTP server serves native modules for local play.
- **Exact evidence:** executed versus inferred checks, exact source SHA, test commands and environments, replay/release receipts, actual browser/GPU/device coverage and honest limits.
- **Fail closed:** hostile/unknown content, invalid numerical values, unsupported controllers, tampered archives and stale replay revisions must not create false progress, payments or trust.
- **Owner-controlled releases:** work in focused PRs; no self-merges, tags, official releases or production publication without explicit owner authorization. Pages verification deploys only from approved `main`.

## 2. Released foundation

| Release | Milestone | Delivered baseline |
| --- | --- | --- |
| **v0.1.0** | CO-001 — First Ignition | Original Overdrive Speedway, Ignition GT, three laps, four-wheel physics, banked-rail stability, fixed-step controls and classification |
| **v0.2.0** | CO-002 — Pack Racing | Six independent vehicles, five seeded AI drivers, physically interacting chassis, positions and finish classification |
| **v0.3.0** | CO-003 — Scenic Overdrive | 4.51 km Redline Ridge finite mountain sprint, bridge/tunnel, shared course authority, GitHub Pages deployment and public verification |
| **v0.4.0** | CO-004 — The Speed Machine | Touring-car polish, skid marks, smoke, sparks, camera tuning, adaptive presentation and expanded procedural engine audio |
| **v0.5.0** | CO-005 — Controller Profiles | Standard gamepads, generic/digital/steering-wheel profile calibration, touch controls, and input-source-independent deterministic replay |
| **v0.6.0** | CO-006 — Arcade Certification Lab | Device diagnostics, reproducible source-stamped offline ZIP, SHA-256 receipts, endurance evidence, keyboard handling and parallel browser verification |

**Current published tag:** [v0.6.0](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v0.6.0) at `020e5dc4c7e2485e01f0f47c698f80ee58fe228b`. Source content and verification after this tag belong to later reviews, not retroactive v0.6.0 claims.

## 3. Immediate soundtrack milestone — v0.6.1

### CO-MUSIC-001 — SYNTH//OVERDRIVE: Bounded Phrase Sequencer

**Purpose:** original, deterministic, procedural chiptune music for the *existing* races, with music scores ready for future modes without inventing playable features. This patch release is inserted before CO-007, **without renumbering the gameplay roadmap**.

**Reusable foundations:** the pinned VANILLAJS `modules/chip-audio` (four 8-bit PCM voices, SID-inspired linear ADSR and Paula-style stereo panning), `modules/soundtrack` (bounded phrase sequencing) and `modules/audio2d` (seeded integer waveform PCM). Examine their pinned contracts: `chip-audio` limits a score to **8 seconds**, `soundtrack` to **64 seconds**; neither alone is an unbounded live music backend.

**Required game-owned feature:** a **Bounded Phrase Sequencer (BPS-001)** that validates compact phrase descriptors, tracks absolute musical position, schedules sample-indexed 48 kHz PCM in bounded chunks with finite lookahead, carries envelope/filter/oscillator state correctly across chunk boundaries, and loops with no phase resets or artificial silence. A tick is **800 samples at 60 Hz**, but note boundaries may occur *inside* a tick. Use integer/fixed-point or explicitly bounded deterministic arithmetic; do not confuse bit-exact offline PCM with hardware speaker timing.

**Original soundtrack programme**

| Track | Genre / target BPM | Live assignment / future use |
| --- | --- | --- |
| **NEON HORIZON** | Synthwave × chiptune · 120 BPM | Overdrive Speedway — playable now |
| **IRON HORSEPOWER** | Industrial guitar-like chiptune · 150 BPM | Redline Ridge — playable now |
| **RASTER VELOCITY** | Tracker/demoscene chiptune · 180 BPM | Rocket Overdrive (CO-010) — soundtrack catalogue only until mode exists |
| **MIDNIGHT PROTOCOL** | Cyberpunk/dark chiptune · 144 BPM | After Dark (CO-008) — soundtrack catalogue only until mode exists |
| **DIGITAL DOMINION** | Arcade championship anthem · 120 BPM | W.O.C. (CO-007) — soundtrack catalogue only until mode exists |
| **STEEL RIOT** | Industrial/demolition chiptune · 150 BPM | Total Destruction (CO-012) — soundtrack catalogue only until mode exists |

Create distinct original melodies, bass figures, drums, harmonies and timbres. Industrial guitar-like tones may use bounded Karplus–Strong pluck, distortion and filtered power-chord synthesis. No sampled commercial recordings, existing copyrighted songs, music-generation service or runtime downloads.

**Gameplay integration:** own a separate music gain control, preserve existing master/engine/effects sliders and gesture-owned audio-device lifecycle; provide a sound-off fallback. Accept explicit race state (course, tick, countdown, overtake, split, final lap, finish) to vary arrangement at musical boundaries. Music is **read-only to simulation** and must not change physics, AI, tick timing, scores or replay results. Avoid using ambient clock or `Math.random()` for composition.

**Suggested review sequence**

1. **CO-MUSIC-001A — BPS-001 & pure synth:** bounded descriptors, deterministic ADSR/waveforms/pluck/filter, stream chunks and tests; source pin and attribution preserved.
2. **CO-MUSIC-001B — Course score & mixer:** finished Speedway/Ridge tracks, controlled music bus, adaptive cues, user settings, real-browser audio/start/pause/failure testing, static-asset closure.
3. **CO-MUSIC-001C — Future score catalogue & receipts:** four finished original tracks, development-only deterministic WAV/score exports, manifests/hashes and documentation; future modes do not appear playable before implementation.

**Acceptance gates:** equal bytes for repeated same-runtime exports; chunking/loop consistency; bounded CPU/memory/polyphony; finite unclipped samples; exact track/seed/score revision; no audible gaps at phrase transitions; no AudioContext before permitted user gesture; correct pause/blur/restart/course switching; music-disabled browser races still pass; 60 Hz physics and replay unchanged; offline ZIP and GitHub Pages verification pass; owner listening review records actual hearing rather than claims from pure tests.

**Release:** proposed `v0.6.1`, **only after** the three PRs are reviewed, merged and verified.

## 4. Replay spectator milestone — v0.6.2

### CO-REPLAY-001 — REPLAY THEATRE: Watch, Inspect and Share

**Purpose:** turn the existing **source-stamped JSON race recordings** into a genuinely watchable, offline-first replay experience. The input recording already exists, but an offline Node classification verifier is **not** a visual replay player. This separate patch milestone follows the v0.6.1 soundtrack work and precedes CO-007 without renumbering gameplay releases.

**Core experience:** an in-game Replay Theatre entrypoint and a separately packaged browser page. Players can import a bounded `.json` replay, see the entire six-car race re-simulated with the exact game's VANILLAJS physics and AI, play/pause/restart, seek to a tick with bounded asynchronous re-simulation, select chase views or competitor follow cameras, and inspect position, lap/checkpoint and finishing classification. Exported records are shared **as files** with friends, who load them in a compatible release; no upload server, account, public storage or telemetry.

**Source authority and longevity:** version 2 recordings contain an **exact 40-hex game revision**. Verify source identity before playback; reject malformed, oversized, truncated, overlong, non-finite, or mismatched recordings before simulating. No user-supplied scripts, URL-to-file fetch, remote game code or replay-originated DOM markup. Future physics changes may make old input streams diverge: publish or retain the matching **immutable offline build** so old recordings remain watchable, and report a clear incompatible-version message rather than pretending that new physics will reproduce them. Never claim a cryptographic signature or anti-cheat property for owner-editable files.

**Deterministic spectator features:** driven by the exact same fixed-step `stepRace` and accepted recovery requests. Camera selection and playback-speed setting are presentation only. Timeline seeking resets and resimulates authoritative ticks in capped work batches; it cannot assign arbitrary car positions, edit official time or skip race gates. Once a replay finishes, the results must exactly match the independent Node verifier. Preserve source-identified replay export and make sharing workflow understandable.

**Delivery:** one focused **CO-REPLAY-001 — Replay Theatre** PR, including accessible keyboard, controller and touch-operated browser controls, static-package allowlist and source stamp, bounded-memory/error UX, Node unit tests, real-browser replay completion on both courses, compatibility checks, and GitHub Pages/public verification. Owner review controls merge, tag and publication.

**Release:** proposed `v0.6.2` after v0.6.1; do not mark as implemented until accepted and published.

## 5. Road to v1.0.0 — gameplay expansions

| Version | Milestone | Minimum product | Acceptance boundary |
| --- | --- | --- | --- |
| **v0.7.0** | **CO-007 — WORLD OVERDRIVE CHAMPIONSHIP (W.O.C.)** | Original offline multi-event championship, deterministic points/standings/ties, persistent progress, rival identities, trophy/podium | Race results settle **once**; save/resume is validated; full championship can finish; no fabricated points or duplicate awards |
| **v0.8.0** | **CO-008 — AFTER DARK / NIGHTSHIFT** | Night variants and original illuminated racing environment with actual headlights, roadside lighting, optional visibility conditions and night score | Readable driving, deterministic race authority and measured WebGL behaviour; lighting never masks nonexistent collision geometry |
| **v0.9.0** | **CO-009 — NITRO OVERDRIVE** | Separate arcade stunt/boost discipline: drift charging, bounded nitro, ramps, jumping, air manoeuvres and original stunt track | Physically driven command path, genuine airborne states, no scoring by shortcut, finite energy/cooldowns and replay integrity |
| **v1.0.0** | **CO-010 — ROCKET OVERDRIVE / DEFY GRAVITY** | Dedicated rocket-racing mode with flight assistance, 3D traversable routes, wall/ceiling adhesion and transitions, air dodges and six-car AI | No car teleportation or fake wall riding; explicit surface-relative collision/gravity, 3D checkpoints, bounded contact and real-browser complete races |

**Game influence policy:** broad arcade mechanics may evoke classic racing, stunt or rocket-racing genres, but all tracks, vehicles, music, art, brands and code must be original or independently licensed. Do not reproduce proprietary game assets or tracks. Rocket motion must be a separate mode, never overwrite grounded Speedway/Ridge physics.

## 6. Post-v1.0.0 — destruction, garage and economy

| Version | Milestone | Minimum product | Acceptance boundary |
| --- | --- | --- | --- |
| **v1.1.0** | **CO-011 — CRASH LAB** | Collision stress environment: swept/high-speed contacts, damage zones, impulse and energy accounting, component-specific damage, visual deformation | Repeatable impacts, stable pair ordering, no tunnelling or explosive overlap, damage follows physical contacts and bounded numerical state |
| **v1.2.0** | **CO-012 — TOTAL DESTRUCTION** | Original vehicle-on-vehicle demolition derby arenas, knockouts, damage-aware AI, persistent mechanical effects within the round and classifications | Playable multi-car full derby; no phantom hits; recover/retire paths do not award illegitimate knockouts; crowd/pedestrians are not attack targets |
| **v1.3.0** | **CO-013 — STREET ROD: THE GARAGE** | Original buy/sell catalogue, multiple owned vehicles, garage bays, local integer credits, cash and inventory UI | Explicit validated transactions, unique car identities, bounded save/import/export, no negative funds or unintended duplication |
| **v1.4.0** | **CO-014 — BUILT NOT BOUGHT** | Real vehicle-build variations: engine, intake, exhaust, gearing, tyres, suspension, paint, repairs, tuning and benchmark comparisons | Every fitted upgrade has a documented physical effect; no visual-only stats marketed as physical; race/replay revision tracks vehicle build |
| **v1.5.0** | **CO-015 — STREET ROD: THE UNDERGROUND** | Earnable cash/reputation, rival challenges, garages and upgrades connected to championship, racing and derby modes | Results settle once against originating career revision; abandoned practice is non-paying; no real-money economy, microtransactions or monetization |

**Relevant internal donor:** [STREET-RACER](https://github.com/QSOLKCB/STREET-RACER) already implements original garage purchases, upgrades, a four-bay career, recovery jobs, validated save transactions, and a separate *Impact Arena* demonstration. Reuse **reviewed contracts**, not its distinct driving authority: preserve Circuit Overdrive's VANILLAJS simulation and exact import provenance. Cash means local fictional credits only. Car damage and repairs must be causally linked to actual vehicle state. A player must have a fair recoverable path after losing a car or funds.

## 7. Shared verification policy for every future milestone

| Gate | Required evidence |
| --- | --- |
| **Source** | Exact game HEAD and immutable upstream SHA; PR diff and preserved licences |
| **Determinism** | Accepted command/seed replay at declared runtime, stable classification and failure-path regressions |
| **Gameplay** | Real browser completion of every affected course/mode and real input-to-simulation path |
| **Input lifecycle** | Neutral arming, disconnect, blur, tab hide, touch cancel and explicit resume |
| **Physics** | Finite states, contact/geometry agreement, rails, overlaps, forward checkpoints, recovery penalties |
| **Audio** | Gesture-only enablement, mute, pause, failure, no resource leak and separation from race authority |
| **Delivery** | Deterministic allowlisted offline archive plus checksum and verified Pages subpath |
| **Performance** | Native GPU and real-device measurements identified separately from headless/software browser tests |
| **Release** | Owner play-through and sign-off; CI green at exact merge SHA; immutable tag and reviewable notes |

Review and update this document whenever milestones ship. Move entries into the **Released foundation** section only after the owner publishes that version. A future-roadmap feature must never be presented as a currently playable feature.

## 8. Longer-term research backlog (not committed to dates)

- More original racing circuits and configurable car classes, gated by simulation and performance tests.
- Championship ghosts, race comparisons and source-bound musical score receipts.
- Optional controller hardware acceptance on real Xbox, PlayStation, retro USB, wheels/pedals, Android and iOS.
- Formal collision/transaction invariants where their proof obligations are tractable.
- Race, car, soundtrack and championship mod formats using inert data and explicit authority limits.
- Distinct audio albums and original standalone releases for the QSOL-IMC sonification programme.
- Broader platform support without a mandatory server or dependency explosion.

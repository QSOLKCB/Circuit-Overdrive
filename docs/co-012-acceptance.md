# CO-012 Total Destruction acceptance

v1.2.0 remains an owner-reviewed candidate. The derby browser runs and replay receipts use the packaged gameplay revision `493f2c35295c23c1b857dcdbb165a7f05b6eb8b4`. The published v1.1.1 comparison uses `541ba6ca27dabe644ab23fe9a061c91dda8794a6`. Both use VANILLAJS `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Evidence index](evidence/co-012f/README.md) · [VANILLAJS provenance](../vendor/vanillajs/provenance.json)

## Actual browser matches

Chrome 158.0.8127.36 selected the shipping mode, armed the grid, started the three-second countdown, and drove the live simulation through the keyboard handler. The browser harness supplied frame timestamps at 60 Hz in batches of up to six ticks. It left the production input, clock, simulation, audio, HUD and WebGL draw path in control. Playwright used its keyboard API for the drive and ordinary menu controls, and attached read-only probes to validate physical receipts and renderer data. The separate native time measurements used ordinary animation timestamps.

| Seed 27 match | Accepted keyboard drive | Official result | Accepted ticks | Physical receipts | Eliminations |
| --- | --- | --- | ---: | ---: | ---: |
| The Crucible | Hold **W** | Mara Vale #14, last car standing | 9,540 | 3,402 | 5 |
| Iron Pit | Hold **W**. Hold **D** on ticks 55–84 | Kit Vega #83, time-limit winner | 10,800 | 2,973 | 4 |
| The Crucible | Hold **W** on ticks 1–599. Hold **A** on ticks 130–239 | Player #27, last car standing | 8,286 | 3,932 | 5 |

The Crucible wall strike disabled the player at tick 2,274 and recorded no attacking driver. Mara won 7,266 accepted spectator ticks later. In Iron Pit the player and Emi Park both lost drive from contact `112/2/5/0`. Each received credit for the other's disablement. The two wrecks stayed in the arena. Later mutual failure of Mara and Luca left Kit and Rory operational at the time limit. In the player victory, the contact with Rory at tick 8,286 gave the player the final legitimate knockout. [Live Eliminations and final classifications](evidence/co-012f/README.md#match-recordings)

All three matches accumulated accepted damage independently on all six cars. The HUD's survivor count, awarded knockouts, result heading and six-driver classification matched the authoritative state. The harness also checked Escape pause, fresh input after resume, restart, fixed settlement and graphics recovery. Theatre imported the exported v6 input tape, sought to the tick before the first knockout, sought through it and continued to the official endpoint. Live and reconstructed positions, velocities, damage, eliminations, classification and receipt digests matched exactly in Chrome. [Browser report](evidence/co-012f/browser-derby.json)

Node v22.18.0 independently reconstructed source-bound recordings generated in Node. The Iron Pit Node run reached a simultaneous-elimination draw at tick 5,414 after the same opening mutual knockout. Chrome reached the time limit on that driving pattern. The raw floating-point simulation can diverge between the two runtimes, especially after repeated collisions. Keep the tested source and runtime with an inspectable receipt. [Node reconstruction](evidence/co-012f/README.md#node-reconstruction) · [Replay format and precision](replay-theatre.md#total-destruction-version-6)

## Collision and rules checks

The existing CO-012A 1,000-world proof varies six-car and fixture-array order and compares the exact states, contact order and receipts. It covers 15 moving pairs, 96 possible obstacle pairs, simultaneous entries, thin barriers, rotating chassis, no penetration at accepted ticks, separating latches and all solver-budget limits. CO-012C exercises real rear contact under reverse drive, wreck contact, both winners, mutual and all-driver elimination and a diagnostic technical stop. The 12-round certification test adds replayed seeded driving across both arenas and checks each elimination against its accepted damage-producing contact. It also settles a zero-damage time-limit boundary with the driver-ID tie-break. [Authority acceptance](derby-impact.md#review-and-reproduce) · [Match rules](derby-rules.md)

## Native WebGL and resource evidence

The Ryzen 9 5950X ran Ubuntu Linux 7.0.0-43-generic with an NVIDIA GeForce RTX 5060 Ti, driver 595.99.02, Chrome 158.0.8127.36, ANGLE OpenGL ES 3.2, Playwright 1.64.0 and Node v22.18.0. The probe measured a 1920 × 1080 drawing buffer in High quality with original music enabled. It used normal animation timestamps for 900 accepted driving ticks per arena. The baseline opposing trial is the published two-car workload on the same host. Its rows show each of two runs. [Native derby measurements](evidence/co-012f/browser-derby-native.json) · [Published baseline measurements](evidence/co-012f/v111-crash-native.json)

| Workload | Frames | Interval median / p95 / worst ms | Physics median / p95 / worst ms | Draw CPU median / p95 / worst ms | Draw GPU median / p95 / worst ms |
| --- | ---: | --- | --- | --- | --- |
| The Crucible | 901 | 16.7 / 16.7 / 16.8 | 0.2 / 0.3 / 1.7 | 1.3 / 1.5 / 4.6 | 0.780 / 0.902 / 3.905 |
| Iron Pit | 901 | 16.7 / 16.7 / 16.8 | 0.2 / 0.4 / 2.3 | 1.2 / 1.5 / 3.8 | 1.495 / 2.307 / 3.589 |
| v1.1.1 opposing, run 1 | 361 | 16.7 / 16.7 / 16.8 | 0.0 / 0.1 / 0.2 | 0.4 / 0.5 / 3.3 | 0.528 / 2.875 / 3.757 |
| v1.1.1 opposing, run 2 | 361 | 16.7 / 16.7 / 16.8 | 0.0 / 0.1 / 0.1 | 0.4 / 0.5 / 2.6 | 0.534 / 0.904 / 3.888 |

The Crucible's retained field was 84 meshes, 42,156 vertices and 85 buffers with 1,854,888 bytes of WebGL storage. Iron Pit was 86 meshes, 42,732 vertices and 87 buffers with 1,880,232 bytes. Both kept two programs. The native windows saw up to 13 and 16 resolved constraints in one tick, respectively. Each registered 11 damage-bearing entry contacts. The median dirty draw performed four uploads, with maxima of four and five. Panel generation and upload times are measured separately. The full-match runs bound the spark pool at eight. They observed eight PCM buffers with up to eight active sources in the accelerated workload and a peak of six in the native timing windows. All started sources ended after pausing the native match. Post-GC JavaScript heap was 5.46 MB in The Crucible and 5.66 MB in Iron Pit during native profiling. The baseline opposing trials retained 28 meshes, 29 buffers and 1,058,400 bytes and peaked at three audio sources.

The isolated panel endurance fixture drew all six car bodies at damage levels 0, 250, 500, 750 and 1,000 in all body regions. Every damage change caused 54 uploads. The next draw at the same ledger caused zero. Mesh, vertex and buffer storage budgets held even with six wreck markers. An exact zero reset restored clean panel bytes. Each live match then verified preserved round state and panel bytes after WebGL context restoration, a clean grid on restart and explicit renderer disposal. The saturated fixture tests the presentation boundary separately from the real matches. [Browser report](evidence/co-012f/browser-derby.json) · [Panel contract](computational-impact-panels.md)

The native samples cover the opening 15 seconds at the measured machine and quality. Full match evidence covers later heavy damage and all elimination outcomes with bounded test-clock callbacks. Owner controller hardware use and soundtrack listening are separate acceptance items.

## Reproduce and review

Check out the tested runtime revision. Build the static site and a separate ZIP from the same committed tree. Run browser acceptance against the source-stamped site under `/Circuit-Overdrive/`. Run the native comparison against a separate v1.1.1 package with the same Chrome and GPU.

```sh
node --test tests/*.test.mjs
CO_V111_CHECKOUT=/path/to/local/v1.1.1 node --test tests/derby-lab-parity.test.mjs
node tests/compare-v100.mjs /path/to/local/v1.1.1
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs "$SITE_ROOT/Circuit-Overdrive"
python3 scripts/offline-release.py build "$NEW_OFFLINE_PATH"
python3 scripts/offline-release.py verify "$NEW_OFFLINE_PATH"
node scripts/verify-pages.mjs "$URL"
EVIDENCE_DIR="$EVIDENCE/native" NATIVE_GL=1 node tests/browser-derby.mjs "$URL" --profile
EVIDENCE_DIR="$EVIDENCE/matches" node tests/browser-derby.mjs "$URL"
node tests/browser-crash-performance.mjs "$BASELINE_URL"
```

Use the certification checkout for the derby runners and the exact v1.1.1 checkout for the baseline profiler. [Package and browser setup](pages.md) · [Offline ZIP and receipts](offline-release.md)

For owner play-through, choose each arena from Total Destruction, arm and start the grid, drive with **WASD**, change the view with **C** and pause with **Esc**. Allow the rivals to finish if the player is eliminated. Inspect the body panels and evidence, export the completed tape and seek through a knockout in Theatre. Verify final integrated main, required CI and public Pages checks before any tag or publication. [Controls and results](total-destruction.md)

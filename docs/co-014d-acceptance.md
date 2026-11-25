# CO-014D — Proving Grounds owner review

Release target: v1.4.0, still unpublished. This is PR D of six; the complete Machine Shop and final certification remain E/F. No release tag, publication or merge is performed by this branch.

## Exact source

- Base: PR C merge `80343db601b53df4f42071a46c377617e450d25e`.
- Tested implementation: `a7abf42213aa831608eb3d25726200d503addf53`.
- Published comparison: v1.3.0 `1c745a90258d0f6cb968935f773354cff702b276`.
- VANILLAJS: `9d95d74b355ec17add32db0b55f0f71130f9c004`, unchanged and checksum-verified.
- Branch: `feature/co-014d-proving-grounds`. Subsequent evidence and CI-suite wiring commits do not change the tested runtime assets. The PR identifies its exact review head separately.

The owner reported PR C merged without issues and post-merge CI green. Remote main was checked at the base above before D began. D started in an isolated clean worktree.

## Delivered authority

The new pure core compiles an accepted build, admits its real stock-equilibrium spawn and advances the pinned vehicle3d solver at 60 accepted calls/s. The renderer follows actual body and four-wheel state for all six original silhouettes. Four measured tests share immutable facility geometry and expose invalid routes, non-completion and physical failures. Stock/current/proposed comparisons declare their accepted commands; only acceleration uses an identical fixed command stream.

Read-only admission resolves the exact selected owned ID from the validated saved garage. Free stock and proposed tests allocate no ownership, inventory, money or condition. Explicit current driving uses that accepted saved build. The page uses existing keyboard, touch, gamepad and saved-profile paths, fresh neutral arming, focus/visibility clearing and context restoration. A changed saved garage invalidates owned admission until Load; no silent live build replacement occurs.

Diagnostic receipts bind the source, engine, installed build, complete canonical recipe digest, track, rules, seed, starting pose, command tape and actual terminal result. Independent tests reconstruct the actual pinned solver and repeat the recorded commands. Receipts are not v7 replay admission. Published v2–v6 contracts are untouched.

Production source changes: `src/proving-ground.js`, `src/proving-ground-admission.js`, `src/proving-ground-page.js`, `src/proving-ground-scene.js`, `src/proving-ground.css`, `proving-ground.html`; Garage test-drive entry in `src/garage-ui.js`; menu/return routing in `index.html` and `src/main.js`; allowlist/fragment-aware dependency traversal in `scripts/package-site.mjs`. Offline instructions, measurement/browser/test tooling and focused documentation accompany these changes. No race recipe, racing simulation, command adapter, vendor module or save schema changes.

## Physical measurements

All 24 stock benchmarks and 11 modified configurations completed in the actual solver, with finite state, no barrier contacts, recovery or truncation. Full precision, source hashes, identities and diagnostics are in [physical evidence](evidence/co-014d/physical-summary.json).

| Stock model | 0–100 s | Braking m | Slalom s | Handling s |
| --- | ---: | ---: | ---: | ---: |
| Cinder Two | 8.105225 | 37.978944 | 27.454496 | 29.937289 |
| Lilt | 7.830108 | 36.446930 | 27.516734 | 30.014680 |
| Evening Line | 7.259136 | 36.087408 | 27.044264 | 29.498449 |
| Rivet Eight | 5.429358 | 35.943638 | 25.754024 | 28.180654 |
| Yardhand | 8.381533 | 41.116170 | 27.095236 | 29.692532 |
| Glass Comet | 4.754065 | 32.057240 | 25.775495 | 28.105939 |

Braking is the documented reached-100-to-stop alternative: starting accepted speeds span 100.015–100.222 km/h and stopping threshold is 0.1 m/s. The receipts retain exact speeds. Slalom/handling use deterministic feedback targeting 8 m/s; commands differ between cars and builds. Their times measure that policy, rather than optimum lap potential or controlled part-only effects.

Cinder's identical 900-call acceleration tape measures stock 8.105225 s, street engine 7.602682 s, stock-engine short gearbox 7.956955 s and long gearbox 8.266275 s. Intake, exhaust and final drive also produce distinct accepted physical motion. Handling with performance tyres reduces integrated absolute wheel lateral speed from 4.505505 m to 3.395711 m under the declared feedback policy; economy tyres measure 5.336990 m. These are physical slip observations, not a grip ranking inferred from lap time. This slow controller largely compensates suspension/steering differences; tiny time changes are not presented as substantial gains. Part-by-part certification remains F.

The browser actually buys Cinder, confirms a street rebuild, drives it, measures it, and later purchases/fits the short gearbox to the **same** `car-000001`. Engine-only acceleration is 7.602682 s; installed engine plus short gearbox is 7.582483 s under the identical 900-call tape. The second improvement is small but reproduced from accepted motion; no substituted performance badge is used. Starting 2,400 → purchase 1,800 → engine fit 1,530 → gearbox fit 1,350; the subsequent intentional second-tab paint fit leaves 1,280. Tests themselves leave the exact serialized Vault envelope unchanged.

## Executed verification

The [evidence index](evidence/co-014d/README.md) records logs, hashes, screenshots and reproducible commands. Node v22.18.0/Linux and Chrome 158.0.8127.36 were used. Browser functional runs use SwiftShader.

| Check | Expected / actual |
| --- | --- |
| `node --test tests/*.test.mjs` | 504/504 passed, including 29 new physical/admission/scene tests; zero failures/skips. |
| `node scripts/measure-proving-ground.mjs --summary` | 24 stock + 11 variants complete; 35/35 completed. |
| Independent direct solver reconstruction | Exact accepted states, crossings and gates reproduce all four tests and engine/gearing/tyre variants. One regenerated tyre receipt and tape also reproduce their SHA-256 exactly. |
| `tests/browser-proving-ground.mjs` | 13 real production-control scenarios pass; zero page/request errors and zero external requests. |
| Existing garage / parts browser | 23 garage and eight parts scenarios pass on initial implementation `248b9b9e8924bf81c7bcc1a61703c42042e274c7`; these adapters are byte-identical in the final runtime. |
| Published/current browser migration | Final candidate against actual v1.3.0 package, same origin; six migration/recovery scenarios pass. |
| Historical comparison | Both the full-suite historical comparison and direct published v1.3.0 comparison retain 45,225 accepted ticks; final receipts/logs recorded with exact candidate source. |
| `python3 tests/test_offline_release.py` | Passed independent cross-timezone builds, source stamping, archive/allowlist validation and tamper rejection. |
| `bash tests/browser-pages-shards.sh` | Passed. Added Proving Grounds inside the existing lifecycle worker, retaining all previous suites and the exact seven-worker matrix; new failure/evidence checks pass. |
| Standalone / HTTP | Fresh 113-file package; every HTTP byte and MIME type verified under `/Circuit-Overdrive/`. |
| Fresh offline ZIP | Built and independently verified against tested source; SHA-256 `c2d3d5d1f8215e61a6a3f42b41d9272bca03e38703d09464b80a965446f0094d`. |

Negative coverage includes malformed commands/builds/selection, exact owned identity, independent same-model cars, no free proposal inventory, unsupported combined torque, honest zero-throttle non-completion, disjoint slalom gates, handling boundaries, actual barrier contact and recovery rejection. Review found and fixed stopping-tick boundary ordering: leaving the straight while reaching the stopping threshold now rejects before awarding completion.

Native pointer cancellation, real WebGL service loss/restoration, blur/off-window key release, real second-tab paint transactions and explicit unowned URL rejection are exercised. Controller reports/disconnection use a disclosed synthetic device service. Existing package race smoke, WebGL-unavailable and audio-device failure checks pass.

## Save, replay and performance limits

There is **no D save migration or write operation**. Existing version 2 Garage/Vault protocols and embedded legacy backup remain unchanged; every admitted current car retains its owned identity. The actual published-save migration regression remains protected.

Persistent damage and repair are deliberately deferred: the pinned facility contacts have no reviewed impact-energy-to-owned-damage adapter. Benchmark completion never invents damage or a repair bill. Cars remain pristine. No career income, race rewards or championship vehicle substitution exists.

The retained scene owns 18 meshes, 11,370–11,784 vertices total. Recording-WebGL tests cover eight complete cycles per model, interpolation, cameras, all paint variants, changed physical suspension stance, no extra mesh uploads, upload failure cleanup and context recreation. These are resource correctness checks. SwiftShader screenshots prove original visible geometry and playable input; **native GPU frame intervals, physical workload CPU profiling, audio/heap endurance and replay seeking remain E/F work**. No 60 FPS or native certification claim is made here.

## Owner play-test

1. Serve the fresh standalone package over loopback. Open The Garage, create or explicitly migrate it, and select an owned Cinder bay.
2. Drive at the Proving Grounds. Inspect Current saved build and owned ID, load free practice, arm and drive. Pause, release controls and re-arm.
3. Select Acceleration and reference driving, Load, arm and finish. Export the source-bound receipt. Use reference comparisons to inspect the measured stock/current/proposed table and its exact receipts.
4. Return to The Garage, purchase a street engine, confirm fitting, re-enter and repeat. Fit a short gearbox and repeat again. Confirm the same owned ID and actual measured changes.
5. Compare braking, slalom and handling. Try proposed tyres without purchasing; verify no money or inventory changes. A feedback comparison explicitly reports that commands may differ.
6. Run free stock practice for another original model. Return/reload the Garage and export/import a validated save. Check installed parts remain. A second-tab paint purchase should block stale driving until Load.

Stop for owner review. D acceptance does not authorize E, merge, tagging or release publication.

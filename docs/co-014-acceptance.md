# CO-014 — Built Not Bought candidate certification

Target: **v1.4.0 — The Machine Shop**, still an owner-controlled release candidate. This is the sixth focused PR. It supplies certification tooling and evidence; it does not merge itself, tag, publish a release or substitute for the owner's play-through.

## Exact sources and review gates

| Authority | Exact source |
| --- | --- |
| Published v1.3.0 baseline/tag | `1c745a90258d0f6cb968935f773354cff702b276` |
| F base, owner-merged E / PR #65 | `b03516f6c967f7fbd0ae3f07fe81433ca279621b` |
| Functional, physical, economy and full browser certification | `6eb0d1da9a5209b875bd064da97e74d08d6ecef2` |
| Native profiler and independently verified native archive | `5454e365fc39bd4400df4c8f7a0e6818ca5cc2c9` |
| Immutable VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

The review head is recorded in the PR. Later evidence/documentation commits do not change the measured shipped runtime. All **118 raw runtime file blobs are identical** across the E base and both F measurement commits; each package deliberately receives its own exact source stamp. The [runtime receipt](evidence/co-014f/runtime-parity.json) records that comparison and a SHA-256 fingerprint. F adds no gameplay, physics, save, replay, geometry, audio, shader or vendor runtime changes.

The owner merged A #61 (`eb3b11d50ec2c92f026455d0790a79214f525242`), B #62 (`20e0b2bf8f242901ed21a056815eaf5926af99d2`), C #63 (`80343db601b53df4f42071a46c377617e450d25e`), D #64 (`57a30486fcf8674e30486d01dea972b8981bcccd`) and E #65 (base above). The current main, clean worktree, v1.3.0 tag and unchanged engine provenance were checked before F began. All eighteen E post-merge checks succeeded, including seven local and seven public browser workers. A separate read-only HTTP check matched all 118 public Pages assets to that exact merged E source. These baseline checks do not claim that the unmerged F head has been deployed.

## What the player can do

Six original cars compile through a pure validated build pipeline into pinned vehicle3d recipes. Each owned ID retains its own installed parts, tuning, paint, inventory and pristine condition. Confirmed fitting uses the established whole-state Vault commit; a preview cannot spend credits or install parts. The selected accepted car drives in the Proving Grounds, where acceleration, braking, slalom and handling are measured from actual simulator state. Stock/proposed simulations are free. Measured comparisons reconstruct source-bound evidence before display. V7 recordings reconstruct the original build and accepted commands independently of later garage changes.

The Machine Shop identifies the exact owned car and distinguishes accepted specifications from proposed configurations and measured outcomes. No horsepower badges, arbitrary performance scores, hidden physical sliders or invented rewards replace those contracts. Paint/rim/exhaust presentation follows accepted configuration. The physics, renderer and display remain separate authorities. [Build Forge](vehicle-builds.md) · [Build Registry/migration](garage-build-registry.md) · [Parts](vehicle-parts.md) · [Proving Grounds](proving-ground.md) · [Machine Shop](machine-shop.md) · [V7](proving-replay.md)

## Independent physical evidence

The [physical certification](machine-certification-physics.md) executes all eight mechanical categories through direct pinned-solver rigs. It verifies motion and relevant state, rather than accepting a changed recipe field as performance evidence. The default fixture is hypothetical developer test data, not a claim of purchased parts or a damage event. Its initial conditions, commands, road/bump geometry, units and threshold rules are recorded.

| Cinder category | Actual before → after observation |
| --- | --- |
| Street engine | 0–100: 8.105225 → 7.602682 s |
| Duct intake | 0–100: 8.105225 → 7.918378 s |
| Flow exhaust | 0–100: 8.105225 → 7.894786 s |
| Short gearbox | RPM at 2 s: 2308.439 → 2816.317; first shift: 292 → 254 accepted ticks |
| Final drive, trim +4 | RPM at 2 s: 2308.439 → 2983.887; first shift: 292 → 243 ticks |
| Performance tyres | Exact-initial-100 braking: 37.904049 → 32.284016 m; corner slip integral: 7.536646 → 6.497861 m |
| Adjustable stiff suspension | Bump peak load: 3359.938 → 3733.550 N; heave range: 0.027544 → 0.052068 m |
| Quick steering | Wheel angle at tick 3: 0.09 → 0.12 rad; subsequent yaw: 1.084002 → 1.210676 rad |

Suspension is a measured response change, not a universal improvement. The common stock starting pose includes modified-suspension settling. Direct-rig braking begins at the declared valid initial 100 km/h state; the playable facility instead accelerates to its first accepted speed at least 100 km/h and discloses that exact slightly over-threshold speed. Both use actual tyre/road forces and accepted brake commands. Paint leaves all controlled physical trajectories identical.

The facility matrix completes **92 tests / 23 accepted configurations**, covering all six models, stock/responsive/soft-long builds and maximum supported combinations. The Rivet maximum combination correctly rejects at 559 Nm above the combined 550 Nm limit, before spawn. Every accepted run independently repeats the raw solver tape and checks complete terminal state, physical path, threshold/gate observations and identities. All 107 canonical build/recipe identities match. Ten v7 records also reproduce full-state digests and seek/restart; the largest is 219,580 bytes, within 2 MiB. All matrix cars retain finite state, four grounded wheels and no barrier contact, recovery or truncation.

Stock characteristics remain distinct: Cinder 0–100 8.105225 s, Lilt 7.830108 s, Evening Line 7.259136 s, Rivet Eight 5.429358 s, Yardhand 8.381533 s and Glass Comet 4.754065 s. All six complete all four supported tests. Slalom/handling feedback follows declared rules and can generate different commands between builds; it is not an optimized lap-time claim or a controlled part-only comparison.

## Economy, identities and migration

[Economy certification](machine-certification-economy.md) runs **1,024 mixed-model sequences / 24,576 operations** against an independently authored money/inventory ledger. It covers all six models and all nine slots, 7,797 accepted installations, 68 refits, 75 setup changes, and both obsolete-retry and fresh-duplicate rejection for every installation. It checks whole ownership, balances, serials/revisions, per-car builds and rejected-operation invariants throughout.

Of these sequences, 514 use the published 2,400-credit opening budget; 510 use explicitly synthetic high-budget validator fixtures to exercise premium combinations and duplicate catalogue models. Those fixtures are not game income, browser purchases or newly implemented rewards. Real browser journeys separately prove purchases and fitting with the actual budget and confirmations.

Eighteen immutable published ownership fixtures preserve credits, IDs, all four bays, active selection, serial counters and revisions. Six fixture source files match the actual published Git blobs. Exhaustion, malformed schemas, stale tabs, corrupt imports and interrupted storage remain protected. New targeted cases include two different owned cars racing to fit against the same revision and a write-then-throw installation that requires reload reconciliation without guessing rollback or charging twice.

Measured maximum UTF-8 sizes are **708 bytes per build, 3,444 bytes per garage and 3,942 bytes per coordinated Vault envelope including legacy backup**. The existing 64 KiB bounds remain unchanged. The same-slot explicit v1→v2 migration retains an exportable legacy backup and rejects obsolete confirmations; no multi-key atomicity is claimed. Test evidence is separately bounded and untrusted; it cannot create another active garage or settle money.

All owned condition is pristine. **No repairs required** is correct. Unsupported repair/over-repair/negative-cost requests reject without payment. No benchmark or unrelated Derby result manufactures persistent damage. A reviewed impact-energy adapter remains deferred, as accepted in D/E; no repair bill or imaginary restoration is included in certification.

## Browser, replay and old racing checks

- **560/560 Node tests passed**, with zero skips/failures, including 17 new physics/economy cases and the recording-cancellation regression.
- **All seven browser workers / 23 suites passed.** They retain every historical suite. The new production-control matrix completes 24 stock benchmark pairs (all six models × four tests) and ten mechanical proposal pairs, with zero page errors and no created ownership. Native driving and software functional results remain separate.
- Production controls buy Cinder, fit actual parts, measure stock/current builds, change gearing/tyres/setup/paint, reload, perform native JSON save export/import, and record/play/seek the original v7 build after the live build changes. The accepted owned ID and exact credits/inventory remain bound to the saved car.
- Extra real browser checks cover published/current save migration, part purchases/failure paths and the owner-reported recording-admission cancellation. The controlled cancellation test identifies its CDP scheduling condition; it does not inject physics, builds or results.
- The direct **45,225-tick comparison against published v1.3.0 matches**. The complete Node suite also passes the historical comparison. Racing, championship, driver-command and historical replay authority sources remain unchanged.

The original showroom silhouettes and conservative physical contact approximation remain documented. The pinned solver's chassis contact cube exceeds the visible panels; spawns and gates use tested clearances. Timing gates observe accepted physical chassis-centre passage, not arbitrary imported positions. No competitive vehicle was resized to accommodate the garage.

## Native GPU and resource evidence

The quiet native run **completed all eight cycles**, with zero errors, warnings or external requests. Hardware: Ryzen 9 5950X, NVIDIA RTX 5060 Ti, driver 595.99.02, native Chrome 158.0.8127.36, Ubuntu 26.04.1 LTS / Linux 7.0.0-43-generic. The actual NVIDIA ANGLE OpenGL ES 3.2 renderer and GPU timers were verified. The viewport is 1920×1080; actual drawing buffers are 1400×989 for the workshop and 1500×1026 for proving/replay.

The profiler executed six actual native stock admissions and eight complete upgraded workshop → physical test → v7 viewer → return cycles. It observes real RAF intervals/callback CPU, GL uploads/buffers/programs, GPU elapsed time, native audio scheduling/silence, post-GC heaps and deliberate context restoration. Compiler, geometry and solver microbenchmarks are isolated actual packaged-module calls, separately labelled from live callback time. The observer does not rewrite runtime modules, install fictional parts or inject positions/commands/results.

TouringAudio intentionally reuses one AudioContext while paused. Silence is checked through ended native sources and fade target zero, rather than claiming that pause closes the device or treating a gain parameter as a measured acoustic output level. Heap figures are V8 heaps, not all browser/driver/GPU memory. Bounded cycles do not prove unlimited-session leak freedom. Native results are reported separately from SwiftShader functionality; no old v1.3.0 showroom result substitutes for this workload.

Measured driving RAF intervals across 7,219 samples: **16.7 ms median / 16.8 ms p95 / 34.5 ms worst**. Full callback CPU p95 is 2.4 ms; GPU elapsed p95 is 1.159 ms. This observes approximately 60 Hz median cadence, not a locked 60 FPS tail guarantee. Isolated solver/compile/geometry p95 values are 0.3 / 0.2 / 6.8 ms. All eight actual all-nine-part/tuned Cinder runs reproduce 6.782275 s to 100 km/h, 900 accepted calls, the same accepted result and identical v7 recording bytes. This attributes the result to the complete installed configuration; it is not an individual-part comparison.

Driving retains 19 target-canvas buffers / 503,472 bytes / two programs, with no ordinary per-frame uploads. Deliberate restoration recreates those resources. All nine closed-workshop observations have zero live workshop buffers/programs; the separate main-menu renderer is outside that count. All 1,889 native audio sources ended, with zero live voices after pause. The post-GC closed-workshop heap changes from 6,490,812 to 5,945,504 bytes (−545,308). Context restoration takes 151.38 ms for proving and 126.53 ms for replay, including a deliberate 100 ms interruption. Full methods, traces, scope and limits are in [native performance](machine-performance.md). The close chase camera can crop the Yardhand rear bumper at the lower edge; High view is available for full-vehicle inspection.

## Offline delivery and final release gates

The functional source's fresh standalone ZIP independently verifies at SHA-256 **`8d1e2355f988910ce7243664a7b5ce917bd5bc6f4e8eda37e8aac9d080ea31d9`**. The native source's fresh ZIP independently verifies at **`6ccaea2a3a6e5bd093b80d9cdc22a40e55739a00efe60804e2865dd613cf02c3`**; native tests serve that actual extracted archive. HTTP checks match every one of the 118 allowlisted assets and MIME types under `/Circuit-Overdrive/`. Archive tests cover timezone-independent reproduction, source stamping, licences/provenance, relative ES-module/JSON paths and tamper rejection. No runtime npm, remote asset, account or mandatory network service is introduced.

After owner approval and merge of F, the owner must identify the exact final main SHA, require protected tests/package/all seven local and public Pages workers to pass, rebuild and independently verify a fresh archive at that final SHA, confirm its stamp/hash, and complete the manual purchase → fit → test → save/reload → replay play-through before manually tagging/publishing v1.4.0. Branch-era recordings require their original matching runtime; they must not silently be reinterpreted as final-source recordings.

Career winnings, settlement, cloud saves, trading, executable mods/editors and championship garage substitution remain outside CO-014. The v1.5.0 Underground and long-term Foundries roadmap entries are preserved.

For concrete manual controls and the complete owner journey, follow [The Machine Shop guide](machine-shop.md) and the [E play-test steps](co-014e-acceptance.md#owner-play-test) using the chosen exact-source package. F review and final publication remain the owner’s actions.

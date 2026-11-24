# CO-012A — Six-Car Impact Authority

The first Total Destruction gate admits up to six physical chassis into a shared planar impact world. The published baseline is v1.1.1 at `541ba6ca27dabe644ab23fe9a061c91dda8794a6`. The world uses the immutable VANILLAJS arcade recipe from `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Published release](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.1.1) · [Vendor provenance](../vendor/vanillajs/provenance.json)

## World and tick

`derbyDamageWorld(cars, fixtures, revision)` admits 1–6 cars and up to 16 fixed capsule fixtures. The world owns copied launch states with unique immutable driver IDs and starts each car with a fresh eight-channel ledger. Drivers and fixtures use distinct IDs in 0–255, so pairs have a total order independent of input array order. The arena gate will validate enclosure, fixtures and spawn placements against this envelope.

`stepDerbyTick(world, commands)` takes one throttle, brake and steer record per car in ascending driver-ID order. It checks and snapshots the whole batch before moving any car. Cars with engine or tyre damage at 1,000 use neutral controls and stay in the collision world. They can coast, rebound and receive impulses. Each remaining car uses the same 60 Hz planar road forces and damage-dependent coefficients. The step returns the effective command batch, accepted contacts and solver measurements. [Damage and driving condition](crash-damage.md)

Every car uses the same 1,200 kg mass and 1,750 kg·m² yaw inertia. Three overlapping discs describe a 4.4 × 1.95 m chassis. Near-phase sweeps evaluate the true rotating feature centres, with the existing separating-plane bound on translation and angular acceleration. The normal and tangential impulse, kinetic energy and local damage-zone calculations are shared with Crash Lab. The 120 m/s cap applies to launch and drive integration. Collision sweeps use actual velocities, including impulse-induced speeds above that cap.

## Pair ordering and rejection

Each pass rejects a moving pair only if its relative translating centre segment stays outside the sum of enclosing chassis radii on at least one axis. A fixed pair compares the car's translating centre segment with the fixture's endpoint bounds expanded by the fixture radius. Each chassis radius is 2.2 m and encloses every orientation. Both tests also allow 35 mm plus the witness tolerance for latch release. The solver repeats the tests after each impulse or position correction, so changed velocities cannot leave stale broad-phase bounds.

Surviving pairs run the same swept disc or capsule queries in ascending numeric participant order. Equal times preserve the pair order and the fore, middle, aft feature order. A completed pass can advance only to the earliest verified candidate. Pair order is deterministic even when several contacts share the same time, so the order is part of the rules.

## Damage and contact episodes

An entry impulse starts an episode. Derby receipts carry `discipline: "derby"`, impact rules 1, the source revision, the accepted tick and contact ordinal, and `episodeId` equal to the first accepted receipt ID for that pair. Continued constraints retain that episode ID, zero restitution and empty damage increments. The latch can release when the solver observes more than 35 mm of separation after time has advanced since that pair's latest response.

Initial intersections and deep projections start in recovery. The solver may apply a continuing impulse after projection to constrain motion. A recovery without a witnessed entry has a null episode ID and awards zero damage. Positional correction at the same instant cannot create a new episode. An opposing chassis behind or beside a disabled car still encounters the physical wreck.

The damage allocator uses the existing minimum of normal energy and dissipated energy, divided among the damageable participants. It applies the published allowance and component weights. Each car's front, rear, left, right, engine, steering, tyres and suspension integers saturate at 1,000. The future scene can use those same four body integers for computational panels. [Impact accounting](crash-impact.md) · [Computational panels](computational-impact-panels.md)

## Work bounds and technical stop

| At six cars and sixteen fixtures | Bound |
| --- | ---: |
| Distinct pairs | 15 moving + 96 fixed |
| Feature candidates per full pass | 135 moving + 288 fixed |
| Resolution passes per tick | 96 |
| Broad-phase pair checks per tick | 10,656 |
| Feature query starts per tick | 40,608 |
| Conservative advances per feature | 40 |
| Aggregate narrow-phase samples per tick | 65,536 |
| Extra geometric samples on admission or terminal diagnosis | Up to 423 per operation |
| Impulse receipts retained by a single step | 96 |

The derby profile budgets for clustered contacts. The original Lab keeps its four-car, eight-fixture, 24-pass rules-1 path. Derby pair latches are bounded by admitted pairs and the authority stores no cumulative contact history. Consumers own their round receipts. The solver bounds each individual position correction to 0.1 m total across its movable participants.

The per-feature limit stops at the conservative safe time. An interrupted sample scan holds the last accepted pose because unexamined features could contain an earlier collision. A pass limit also holds the remaining interval. All three paths report `stats.limited`, the reason (`sweep`, `samples` or `passes`), unadvanced seconds and maximum residual penetration. They record a terminal `world.technicalStop` and reject further updates to that world. The fixed-step drive forces are applied before the sweep. A limited step can expose genuine prefix impulses and damage, and marks that the attempted contact interval did not complete. Later settlement must treat this as a technical stop. A near-tangent sweep or physically impossible fixture layout can reach these limits.

## Runtime evidence

The authority and test source is `957ba00f0694fd7f6022e6f8c44cf1f0a28d6767`. A Ryzen 9 5950X ran the production functions under Node v22.18.0 on Ubuntu 26.04.1 LTS, Linux 7.0.0-43-generic. Each sample below uses 20,000 measured ticks from six-car, 16-fixture worlds after 1,000 warm-up ticks. The converging workload varies launch radius, speed, yaw and spin across 1,000 worlds generated from a fixed seed. Timings measure CPU work in Node. [Raw timings, peak counts and source hashes](evidence/co-012a/solver-benchmark.json)

| Workload | Operation | Median / p95 / worst ms |
| --- | --- | ---: |
| Sparse | Full tick | 0.012 / 0.013 / 0.487 |
| Converging | Collision solver | 0.011 / 0.367 / 1.818 |
| Converging | Collision and damage | 0.011 / 0.395 / 1.417 |
| Converging | Full tick | 0.022 / 0.426 / 1.401 |

The sparse world rejected all 111 pairs in one pass per tick. Converging full ticks peaked at 80 passes, 8,880 pair checks, 7,029 feature candidates, 8,938 narrow-phase samples, 79 impulse receipts and ten new episodes in one tick. Contact ticks had a p95 of 0.881 ms. The full-tick run logged 68,526 accepted impulses and 18,260 damage-bearing sites. All 120,000 measured ticks across the three operations and two workloads completed without a technical stop. The adversarial tests exercise those stops separately.

Native Chrome 158.0.8127.36 on the RTX 5060 Ti drove all three existing Crash Lab experiments from the extracted package. The accepted first-impact values were 815 front and 733 engine at the wall, 19 right at the rail and 401 front each in the opposing test. The browser and Node matched the exported input, contact and final-state digests after replay. The run also exercised focus loss, reset and context restoration. The included v5 tapes open in a package stamped at the tested runtime. Six-car rendering and frame timing belong to the playable-experience and certification gates. [Native Crash Lab summary and tape digests](evidence/co-012a/native-crash.json)

A separate Chromium probe imported the packaged authority and drove six initially stationary cars from three parallel opposing lanes. At tick 59, three accepted contacts produced 64 front and 57 engine damage per car. The browser exposed the NVIDIA ANGLE OpenGL backend and the probe checked all 111 admitted pairs. [Packaged authority probe](evidence/co-012a/chrome-authority.json)

The complete Node suite passed 275 tests, including 45,225 matching legacy racing ticks and the same-runtime v1.1.1 reference comparison. Python 3.14.4 passed the offline release test. The browser-worker contract and all seven real browser shards passed. The shards used Chrome 158 with SwiftShader against the extracted package under `/Circuit-Overdrive/`. The 81-file static package matched the extracted offline ZIP and the independent ZIP verifier passed. The tested archive SHA-256 is `c4d338d988365dfa4801d807d6481a16033cc451293fa09460b02b7957103c89`. The public v1.1.1 Pages verifier matched 81 files and MIME types.

## Review and reproduce

The focused suite exercises all 15 moving pairs at the launch cap, three simultaneous pairs, a dense centre approach, thin and corner barriers, rotating tips, a disabled wreck, overlap recovery and all three technical-stop paths. The 1,000 seeded six-car scenes compare complete states, contact receipts, latches and solver measurements after permuting both car and fixture arrays. The published parity suite pins all 958 accepted ticks across the three Lab experiments, an adversarial overlap, the exact Lab limits and v5 admission. Old v5 recordings still use their matching source build.

```sh
node --test tests/derby-impact.test.mjs tests/derby-lab-parity.test.mjs
CO_V111_CHECKOUT=/path/to/clean-v1.1.1 node --test tests/derby-lab-parity.test.mjs
node tests/derby-impact-bench.mjs
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
```

The optional comparison checkout must point to the published SHA. It compares unrounded states and receipts in the same Node runtime in addition to the offline golden traces. For a browser review, serve a source-stamped package under `/Circuit-Overdrive/`, drive the existing Wall, Glancing Blow and Two-Car Impact tests, then reset and open a completed recording in Replay Theatre. [Package commands](pages.md#build-and-play-the-package-locally) · [Replay source rules](replay-theatre.md#crash-lab-version-5)

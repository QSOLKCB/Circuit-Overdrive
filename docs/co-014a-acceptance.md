# CO-014A — Build Forge owner-review record

PR A establishes six validated stock physical machines and their compiler.
The following five PRs remain unimplemented pending their preceding owner gates.
This is not v1.4.0 release certification. No approval, merge, tag or publication
is performed by the implementation agent.

## Exact sources and scope

| Item | Source |
| --- | --- |
| Published v1.3.0 / exact PR base / main at inspection | `1c745a90258d0f6cb968935f773354cff702b276` |
| Tested implementation | `f625eaf7aa6e420b5aa30216d587484f677ebe36` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |
| Inspected STREET-RACER reference; no imported code | `e6b43907c5e97e639f27e4da41bc6a8153df8563` |

The subsequent evidence commit adds only documentation and receipts. Evidence
digests identify the tested implementation above, not a relabelled later source.
The original local main checkout had an untracked `Circuit-Overdrive.png` and
an older HEAD. It was preserved; A used an isolated, initially clean worktree.

Changed implementation files are `src/vehicle-builds.js`,
`scripts/measure-vehicle-builds.mjs`, `tests/vehicle-builds.test.mjs`,
`tests/vehicle-build-physics.test.mjs`, `tests/vehicle-build-geometry.test.mjs`,
`tests/vehicle-build-driver.mjs`, `tests/browser-vehicle-builds.mjs` and the exact
v1.3.0 admission in `tests/compare-v100.mjs`. Documentation changes are this
record, its evidence directory, `docs/vehicle-builds.md` and `ROADMAP.md`.

## New authority and measured behavior

The [contract](vehicle-builds.md) defines build format/version/rules, strict
stock part admission, complete SI specification tables, actual pinned solver
equations, immutable recipes, canonical ordering and domain-separated SHA-256
identities. The compiler has no storage, DOM or established race imports.
Raw user recipes, executable fields, unknown parts and unsupported versions fail
before any accepted recipe returns. Stock build size is 248 bytes UTF-8.

Expected: six stable, distinct stock designs which support their own mass,
accelerate through actual drivetrain shifts, brake and physically steer.
Actual: all six do so; all observed accepted steps retain four contacts,
finite motion, no truncation and no recovery. Repeated same-runtime runs
reproduce complete receipts. Node and Chrome measured acceleration, braking
distance and heading agree within the declared 1e-6 tolerance.

| Model | 0–100 km/h s | Near-100-to-stop path m | Steering heading change rad |
| --- | ---: | ---: | ---: |
| Cinder Two | 8.105 | 37.979 | .907 |
| Lilt | 7.830 | 36.447 | .954 |
| Evening Line | 7.259 | 36.087 | .827 |
| Rivet Eight | 5.429 | 35.944 | .931 |
| Yardhand | 8.382 | 41.116 | .803 |
| Glass Comet | 4.754 | 32.057 | 1.029 |

Acceleration interpolates consecutive accepted horizontal speeds at 100 km/h.
Braking starts from the unaltered first over-threshold tick and stops at ≤.1
m/s; its actual start speed is retained. Whole-design comparisons use the same
deterministic threshold policy/command values; lengths and start speeds differ.
They are not controlled single-part or byte-identical timed-tape comparisons.
The separate steering test starts at a declared 10 m/s, settles for one second,
then coasts through three seconds of .35 steer. No arbitrary acceleration is
added to a driven state. Full starting poses, rules, seed, commands, ticks,
loads, RPM, shifts, angular state and identities are in the receipts.

Geometry tests independently inspect all six actual Float32 silhouettes,
wheel centres, radii, visual extensions, suspension support and real solver wall
contacts. They verify the conservative cube blocks within 10 µm of its declared
boundary. This cube is substantially larger than the visible body. Chassis
height is a dimensional/inertia approximation, not a tight oriented visual hull.
The current static showroom retains a .03 m gap; future physical presentation
must follow actual wheel hubs and body state.

## Executed validation

See [verification.json](evidence/co-014a/verification.json) for exact commands,
counts, runtimes and artifact hashes, and the [evidence index](evidence/co-014a/README.md)
for source-bound receipts.

| Executed check | Actual result |
| --- | --- |
| Complete Node suite | 384 passed, 0 failed; 277.756 s |
| Focused compiler, geometry and physical suite | 24 passed, 0 failed |
| Historical v1.0.0 full-state comparison (inside full suite) | 45,225 matching ticks |
| Direct published v1.3.0 full-state comparison | 45,225 matching ticks |
| Browser stock solver and source-byte checks | Six models, repeated receipts, zero errors |
| Packaged browser smoke | Passed, including graphics/audio failure paths |
| Packaged Garage | 22 scenarios and 17 rejected imports passed |
| Offline reproduction unit test | 1 passed |
| Seven-worker orchestration and failure propagation | Passed |

Browser-native source modules reproduced all six physical runs in
Chrome 158.0.8127.36. Fresh standalone packaging retained 103 runtime files;
the offline builder and independent verifier produced the same SHA-256 archive.

The first exploratory whole-suite run rejected uncommitted source at the
existing clean-tree historical parity guard. The final run uses committed
implementation bytes; no guard was weakened. Default sandbox child-process
reporting was insufficient for trustworthy subtest counts, so the complete
suite ran with real subprocess access and the focused suite was also executed
with `--experimental-test-isolation=none`.

## Save, replay, delivery and performance boundaries

Save migration impact: none in A. Owned IDs, all four bays, credits, allocator,
active selection, revision, v1 schema and the existing vault protocol stay
unchanged. No new save slot, upgrade purchase, damage or repair is introduced.
B must review its migration design before implementation; obsolete-tab recovery
and non-atomic multi-key transitions are explicitly identified in the contract.

Replay compatibility: published v2–v6 parsers and sources remain unchanged.
Build receipts are development evidence, not a v7 replay. Existing races,
championship, damage authority, driver commands and vendor files remain byte
identical to the inspected baseline. Direct full-state race comparisons and
the historical test validate 45,225 accepted ticks each.

Packaging impact: the Forge is a development authority until D/E integration.
It is intentionally not added as an unreachable production asset. The existing
relative import graph, source stamp, 103-file allowlist, seven-worker browser
architecture, verification aggregation and main-only publication policy remain.
The packaged browser regressions use SwiftShader, separately from the native
ES module physics checks; neither is native GPU performance certification.

Performance evidence: no frame-time, GPU-resource or eight-workshop-cycle claim
is made by A. Hardware discovery outside the sandbox confirms Ryzen 9 5950X,
RTX 5060 Ti and driver 595.99.02. Actual upgraded facility profiling is D/F work
and cannot inherit old showroom measurements. Real controller hardware and owner driving acceptance
also remain later gates.

## Owner review steps

1. Check out the tested implementation above and inspect `docs/vehicle-builds.md`
   alongside the compiler, pinned engine and independent geometry tests.
2. Run `node --experimental-test-isolation=none --test tests/vehicle-build*.test.mjs`.
3. Run `node scripts/measure-vehicle-builds.mjs > stock-physical.json`. Verify
   `workingTreeMatchesHead` is true and inspect the six recipes and raw receipts.
4. Serve the source checkout on loopback. With an existing Playwright/Chrome
   installation, run the browser command in the contract and inspect its receipt.
5. Build/verify the offline ZIP and open its unchanged Garage: create a fresh
   garage, buy Cinder Two, inspect all silhouettes, export and reload ownership.
   There is no Machine Shop or owned-car test entry in PR A.
6. Review and accept or request changes to A. Only after an owner-approved merge
   should B be retargeted and its migration design implemented.

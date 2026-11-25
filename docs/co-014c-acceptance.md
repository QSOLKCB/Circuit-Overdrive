# CO-014C — Parts Counter owner-review record

C introduces real supported mechanical parts, per-car acquisition/refit/setup,
original paint and explicit fitting controls. Every price and physical effect
comes from authored bounded data and actual compiler/solver admission. D/E's
playable owned-car facility, complete Machine Shop, damage/repair authority and
new replay contract remain later work. No release is claimed by this PR.

## Exact sources and scope

| Item | Exact source |
| --- | --- |
| Owner-merged PR B / C base | `20e0b2bf8f242901ed21a056815eaf5926af99d2` |
| Tested implementation | `17426dd8359ed69ba95db1466f1af626c670e706` |
| Published legacy v1.3.0 | `1c745a90258d0f6cb968935f773354cff702b276` |
| Immutable VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

Subsequent commits add documentation/receipts only; source-bound measurements
identify the tested implementation rather than being relabelled as later code.
The isolated branch began clean at B's verified owner merge. The user's original
main checkout was preserved.

Changed production files are `vehicle-builds.js`, new `vehicle-parts.js` and
`garage-parts-ui.js`, garage transactions/vault/UI/CSS, garage geometry/scene/
experience and the explicit package closure. New tests cover strict parts
admission, physical behavior, independent installation accounting and maximum
save size. The scene tests add paint geometry/cache checks. No established race,
championship, command, damage, track, vendor or workflow file changes.

The [parts contract](vehicle-parts.md) lists all prices, torque points, ratios,
tyre fields, suspension/steering units, quantized settings, compatibility bounds,
source identities, save rules and manual controls.

## Expected versus actual physical behavior

Expected: engine/intake/exhaust alter supported torque curves, gears/final drive
alter wheel torque and accepted RPM/shifts, tyres alter real grip/lateral
response, suspension alters chassis loading/damping and steering alters actual
wheel response/yaw. Paint changes original RGB panels without changing physics.

Actual controlled Cinder Two measurements at the tested implementation:

| Isolated configuration | Physical result |
| --- | --- |
| Stock | 0–100 km/h 8.105225 s |
| Street engine | 7.602682 s |
| Performance engine | 7.435762 s |
| Competition engine | 7.414223 s; measured gain over performance engine is .021539 s |
| Ducted intake | 7.918378 s |
| Free-flow exhaust | 7.894786 s |
| Short gearbox | 7.956955 s; first shift 254 accepted calls vs stock 292 |
| Long gearbox | 8.266275 s; first shift 336 calls, lower early accepted RPM |
| Adjustable final drive, +4 trim | 7.912992 s; first shift 243 calls |
| Performance tyres | Exact-start braking 37.904049 → 32.284 m; corner slip integral decreases |
| Touring tyres | Braking 36.492644 m vs stock 37.904049 m |
| Economy tyres | Braking 42.877809 m and greater measured corner slip |
| Adjustable suspension, stiff setup | Bump peak wheel load 3,359.94 → 3,733.55 N, with changed heave/vertical velocity |
| Quick steering, +2 setup | Same-start physical heading 1.084002 → 1.210676 rad |
| Original paint | Complete recipe and all measured motion remain exactly identical |

These results are measured from the real pinned four-wheel solver, not fields
treated as proxy statistics. Straight/corner/steering/bump comparisons use
identical timed commands, a declared common starting pose, seed 0 and fixed
60 Hz calls. Braking starts at declared exact 100 km/h and follows the same
deterministic stop policy, whose accepted length may differ. Threshold times
interpolate consecutive accepted horizontal-speed endpoints; non-completion
would remain null rather than being invented.

All six original models additionally pass responsive and soft/long compound
corner/steering/bump profiles with finite upright state, four contacts, no
truncation or recovery. Those short endurance profiles do not claim upgraded
acceleration/braking benchmarks for every model. All stock solver tests remain.
The 550 Nm combination cap rejects Rivet competition + intake + exhaust at
559 Nm; failure does not deduct credits or acquire a free part.

Full source/rules/metrics and accepted terminal states are retained in the
[physical summary](evidence/co-014c/physical-summary.json). It hashes the full
raw receipt retained locally, preserves lossless terminal-column order and
identifies identical complete runs by SHA-256. Reproduce both forms with
`node scripts/measure-vehicle-parts.mjs` and its `--summary` option. These are
explicit hypothetical compiler-admitted experiments, separate from purchase
evidence. They award no inventory or money.

## Economy and browser purchase evidence

The independent ledger executes 1,024 sequences / **32,768 operations** from
real 2,400-credit starting states: 16,414 accepted and 16,354 rejected, with
**8,471 installations**, 3,364 owned-part refits and 1,056 setup-only changes.
An additional 8,471 stale-retry checks reject. All nine slots have accepted coverage. It tracks
money, acquired inventory, stable IDs, bay order, selection and revision using
independent price/transition expectations. The older 65,536-operation ledger
is also retained. No race winnings or refunds are introduced.

The production browser journey creates a garage, buys Cinder Two for 600 and
fits all nine entry choices for **1,440 including fitting**, leaving **360**.
Every mutation uses real controls and the accepted Vault, including explicit
review/Cancel and duplicate confirmation. The accepted saved owned build is
then compiled and driven by the real solver in the test harness: stock/street
0–100 reproduces 8.105225 / 7.602682 s. This is actual purchased-build evidence,
not an injected upgrade or a claim that a player can drive the later facility.

The journey additionally checks stock/owned-engine refits at 20 each, setup at
10, unchanged requests, actual two-tab conflicts, quota/read-back reconciliation,
native file export/import and two same-model cars with independently accepted
parts. Paint screenshots follow the accepted configuration. The full recipe
before/after paint is identical. Final receipt balance 240 reflects subsequent
deliberate refits/setup/paint, not a reward or migration adjustment.

## Executed validation

| Check | Actual result |
| --- | --- |
| `node --test tests/*.test.mjs` | 475 passed, 0 failed; 286.434 s |
| New compiler/catalogue tests | 10 passed; all six rules-1 canonical mappings and same-source identities retained |
| New actual-solver parts tests | 21 passed, including engine grades, long gearing and three replacement tyre choices |
| New independent installation tests | 12 passed; 32,768 generated operations and failure/stale cases |
| New geometry/cache and size checks | Two paint checks and one canonical-size check passed |
| Historical v1.0.0 full-state comparison, within complete suite | 45,225 matching ticks |
| Direct published v1.3.0 full-state comparison | 45,225 matching ticks |
| Production parts / existing Garage / migration browser journeys | 8 / 23 / 6 scenarios passed |
| Packaged browser smoke | Passed, including input/audio/WebGL failure cases |
| Offline reproduction unit test | 1 passed |
| Seven-worker inventory/orchestration/failure propagation | Passed |
| Fresh standalone and independently rebuilt offline ZIP | All 107 runtime files equal |

See [browser receipt and captures](evidence/co-014c/README.md). Storage service
faults are explicitly synthetic; no valid owned inventory, balance, recipe or
physical outcome is injected. Eight new parts scenarios, all 23 existing Garage
scenarios and all six old/current migration scenarios pass without browser errors
or external requests.

## Save, replay, resources and owner limits

Current garage/Vault schema, key, generation and whole-save protocol stay at
their accepted B contract. Rules-1 stock recipes/builds and identities at the
same source are pinned byte for byte; existing saves do not auto-convert or
pay on rendering. Rules 2 is admitted only as validated data through confirmed
installations or explicit current-file replacement. Inventory belongs to the
owned car and does not multiply performance while uninstalled. Sale gives the
existing stock 60% value only. Pristine condition remains the sole admitted
condition; no fictitious wear, repair bill or upgrade refund is invented.

Canonical maximum sizes are **708 / 3,444 / 3,942 bytes** for a build, fully
inventoried four-car garage, and complete envelope with legacy backup. Existing
2 KiB / 64 KiB limits remain. Old pending confirmations fail whole-raw-value
comparison; fresh explicit destructive recovery in obsolete rules-1 clients
remains the documented boundary. Export backups and close obsolete tabs.

Established v2–v6 replay authority and racing source stay unchanged. New build
recording/playback remains E. The runtime is **107 local files**, adding the
reachable parts catalogue and counter module. Existing seven browser workers,
their historical coverage, source stamping, licence closure and vendor pin remain.
Fresh standalone bytes equal the independently reproduced offline ZIP.

Paint cache tests cover all six models × four finishes: at most **149 meshes**
against the pinned high-profile limit of 256, with no further uploads on repeats
and complete disposal. Factory Garage resource/browser lifecycle tests remain.
Browser rendering uses SwiftShader; these are functional/resource checks, not
native GPU/frame-time certification. Static showroom suspension stance is not a
physical driving renderer. Native upgraded workload, full facility endurance,
complete seven-lane browser execution and owner/public verification remain later
CI/owner or D–F gates.

Owner review: inspect the contract and receipts; create a fresh garage, buy a
Cinder Two, select its bay, review/cancel/confirm an engine fitting, repeat
gearbox/tyre/suspension/steering/paint choices, reload and export/import. Compare
the source-bound physical evidence with accepted builds and fitting costs.
Owner approval/merge and branch retargeting precede D. No self-approval, merge,
tag or publication is performed.

# CO-014A — Build Forge contract

The Build Forge defines six original stock machines and a strict, pure compiler
in `src/vehicle-builds.js`. This is the first owner-review slice of v1.4.0.
It supplies development/test authority; production integration belongs to D/E.
The compiler is deliberately outside the shipped asset allowlist until then,
as the garage authorities were before CO-013D. No published racing recipe,
owned record, save slot, transaction, replay format or vendor file changes.
The stock test tools are not the playable Proving Grounds.

## Admission and identity

`stockVehicleBuild(modelId)` creates an independent deeply frozen stock build.
`compileVehicleBuild(modelId, build)` first resolves a built-in catalogue model,
then validates exact own enumerable data fields: `format`, `version`,
`rulesVersion`, `parts`. Format is `circuit-overdrive.vehicle-build`, version 1,
rules 1. The nine exact slots are engine, intake, exhaust, gearbox, finalDrive,
tyres, suspension, steering and paint. Rules 1 supports `stock` in the eight
mechanical slots and `factory` paint only. It rejects unknown parts, arbitrary
ratios, raw recipes, tuning, scripts and unsupported format/rules versions.
The canonical admitted representation is bounded to 2 KiB UTF-8; stock is 248
bytes. No user field supplies executable behavior. C must review and version
the expanded parts and quantized tuning rules before admitting upgrades.

The compiler resolves these discrete stock IDs to the model-specific complete
recipe below, derives inertia, and calls the actual pinned `validateVehicle`.
That validator checks numerical ranges, ascending torque RPMs, descending gear
ratios, wheel footprint and combined suspension support. Only the complete
accepted result returns; failure throws without changing its input or any
garage. The output owns deeply frozen copies of `build` and `recipe`, plus
`canonicalBuild`, `canonicalRecipe`, `modelId`, `rulesVersion`, `engineRevision`.
Property order is fixed by admission, independent of input key order.

`identifyVehicleBuild(modelId, build, exactGameRevision)` recompiles and hashes
with browser-native Web Crypto SHA-256. `buildDigest` binds its domain, model,
rules and canonical installed build. `recipeDigest` binds a separate domain,
exact game revision, pinned engine revision, model, rules and **every** accepted
recipe field. Exact JSON hash preimages are executable in the implementation
and independently checked using Node crypto in tests. `canonicalBuild` alone
is shared by stock models; use its model and build digest together.

Catalogue model ID, stable owned ID (for example `car-000001`), installed build
digest and game source revision have distinct meanings. Owned ID is not a
mechanical input; identical machines can belong to different owned cars.
The digest helper accepts a source stamp supplied by a verified packaging or
recording boundary. It cannot authenticate a caller-supplied revision or user
ownership. A dirty source measurement reports file hashes and its dirty state;
it cannot claim exact HEAD provenance. No cross-browser bit identity is claimed.

## Stock physical specifications

SI units, right handed, +Y up and -Z forward. Chassis height approximates body height for mass distribution; it is not a
tight oriented visual hull or the floor-to-roof presentation height. Inertia is
the box-equivalent `[m(h²+l²)/12, m(w²+l²)/12, m(w²+h²)/12]`, each rounded to
integer kg m². These original arcade designs are not measured commercial cars.

| Model | Mass kg | Chassis W × L × H m | Wheel radius m | Wheelbase m | Track m | Drive | Final drive | Drag kg/m |
| --- | ---: | --- | ---: | ---: | ---: | --- | ---: | ---: |
| Cinder Two | 1080 | 1.75 × 4.25 × 1.20 | .34 | 2.465 | 1.75 | front | 3.9 | .44 |
| Lilt | 850 | 1.65 × 3.58 × 1.32 | .32 | 2.0764 | 1.65 | front | 4.1 | .39 |
| Evening Line | 1510 | 1.86 × 4.85 × 1.15 | .35 | 2.813 | 1.86 | rear | 3.5 | .38 |
| Rivet Eight | 1610 | 2.02 × 4.68 × 1.20 | .38 | 2.7144 | 2.02 | rear | 3.8 | .56 |
| Yardhand | 1980 | 1.94 × 4.95 × 1.55 | .41 | 2.871 | 1.94 | rear | 4.3 | .78 |
| Glass Comet | 1260 | 1.96 × 4.38 × 1.02 | .35 | 2.5404 | 1.96 | all | 3.8 | .32 |

Every engine has idle 850 RPM, redline 6800 RPM and 40 Nm engine braking.
The five torque points below correspond to **850 / 2200 / 4200 / 5800 / 6800 RPM**.
Every gearbox has forward ratios **3.1 / 2.05 / 1.48 / 1.12 / .89**, reverse
2.8, efficiency .9, shift interruption .18 s, automatic shifting enabled.

| Model | Torque Nm at five RPM points | Rest / travel m | Spring N/m | Damper Ns/m | Grip | Cornering stiffness Ns/m | Rolling coefficient | Max steer rad / rate rad/s / speed reduction s/m |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| Cinder Two | 105 / 175 / 210 / 185 / 130 | .24 / .19 | 34000 | 3100 | 1.02 | 2600 | .016 | .48 / 1.8 / .035 |
| Lilt | 85 / 140 / 170 / 150 / 105 | .23 / .18 | 29000 | 2700 | 1.06 | 2800 | .015 | .52 / 2.4 / .030 |
| Evening Line | 150 / 260 / 310 / 280 / 195 | .26 / .21 | 42000 | 4100 | 1.08 | 3300 | .014 | .43 / 1.4 / .045 |
| Rivet Eight | 230 / 390 / 450 / 380 / 260 | .27 / .22 | 46000 | 4200 | 1.08 | 3200 | .017 | .46 / 1.6 / .040 |
| Yardhand | 190 / 310 / 350 / 290 / 200 | .32 / .26 | 50000 | 4700 | .94 | 2900 | .023 | .45 / 1.3 / .050 |
| Glass Comet | 180 / 300 / 370 / 340 / 240 | .22 / .17 | 48000 | 4000 | 1.22 | 4100 | .014 | .48 / 2.1 / .032 |

## What the pinned solver actually models

Engine torque is interpolated linearly in Nm at accepted RPM. At driven wheels,
total tractive demand is throttle × torque × gear ratio × final drive ×
efficiency / wheel radius. It is divided by driven wheel count, then clipped
together with lateral demand to each wheel's friction circle. Acceleration
comes from summed solved forces divided by mass; neither UI nor compiler adds
an impulse. Engine braking acts at driven wheels when throttle is released.
Braking uses the solver's fixed per-wheel demand `.75 × mass × g × brake`,
bounded by the stopping budget and tyre capacity. There is no adjustable brake
part in this slice and no claimed horsepower badge.

Mechanical RPM derives from longitudinal chassis speed / wheel radius ×
absolute ratio × final drive × 60/(2π). RPM state slews at 12,000 RPM/s. Automatic
upshift occurs above .91 redline mechanical RPM, downshift below .35 redline,
with the accepted shift interruption. Drive cuts at redline. Maximum attainable
speed therefore depends on torque, ratios, wheel radius, resistance and grip;
these initial measurements establish 100 km/h capability, not a top-speed claim.

Load is spring × compression minus damper × surface-normal contact velocity,
clamped by the solver. Static compression is `mass × 9.81 / (4 × spring)` and
must remain below .9 travel. Rest length/travel determine support geometry;
there is no unsupported independent ride-height slider. Lateral demand is
minus contact lateral speed × cornering stiffness (a velocity stiffness,
**not** a slip-angle N/rad model), bounded by a stopping budget. Grip × surface
friction × normal load limits combined tyre force. Rolling demand is coefficient
× load. Drag vector is `-drag × |velocity| × velocity` in N. Mass, inertia,
contact moment arms and angular drag determine stability; there is no added
stock stabilization policy. Steering target is input × maxAngle /
`(1 + |longitudinal speed| × speedReduction)`, reached at the bounded rate.

## Geometry and clearances

The existing silhouettes have wheel centres at ±body width/2 and ±.29 body
length, so these recipes use track equal to authored body width and wheelbase
.58 body length. Wheel radii exactly match. Visible tyres extend .15 m beyond
each centre; mirrors extend .215 m beyond body width/2; rear plate extends
.089 m beyond body length/2. Presentation wheel centres sit radius+.03 above
showroom floor, leaving a .03 m display gap. A later physical renderer must use
accepted wheel hubs and suspension rather than retaining that static gap. The
physical origin is the suspension mount plane, not the showroom floor. Static
visual alignment removes the .03 m floor gap; the recipe body half-height does
not enclose every visible roof point about that mount origin. The actual solver
cube below does, as explicitly tested. D/E must define and test moving body and
wheel transforms using accepted state.

Critically, `vehicle3d` sweeps a fixed cube of half extent
`hypot(chassis.width, chassis.length, chassis.height)/2` against barriers,
independent of orientation. It is conservative and larger than the visible car,
not an oriented body mesh. Flat support comes from four wheel samples, not a
floor barrier intersecting this cube. Future spawns must keep every barrier and
neighbouring vehicle clear of this envelope, including vertical clearance.
`tests/vehicle-build-geometry.test.mjs` checks actual generated visual bounds,
wheel alignment, support and an actual wall sweep for each recipe. No competitive
vehicle geometry or race clearance changes to accommodate these stock models.

## Physical receipts and reproduction

`tests/vehicle-build-driver.mjs` drives the actual `createVehicle` API at 60 Hz
(four internal 240 Hz steps). Seed 0 is declared; these tests use no random
stream. Every car uses the same origin/yaw, deterministic dry level surface,
surface friction 1 and deterministic command policy. Threshold-controlled
acceleration and braking have different accepted stream lengths and slightly
different braking start speeds; they are not byte-identical timed tapes. Each admitted step is checked for finite
motion, four contacts, no truncation, no recovery flag and bounded location.

The acceleration command is full throttle until first accepted horizontal
speed ≥100 km/h (maximum 1500 calls). Time interpolates the threshold between
the two accepted endpoint speeds. Braking continues from that **unaltered**
accepted state with full brake to ≤.1 m/s (maximum 600 calls); its distance is
the sum of horizontal accepted movements. This is a documented near-100-to-stop
test; its slightly-above-100 start speed is recorded, not an exact 100–0 label.
Steering starts at 10 m/s, coasts for 60 calls, then requests .35 steer for
180 calls. It reports physical heading and displacement rather than a handling
rating. Support uses 120 neutral calls. Full rules, snapshots, shifts, loads,
angular state, accepted call counts and identities accompany each receipt.

| Stock model | 0–100 s | Reached-threshold-to-stop m | Heading change rad |
| --- | ---: | ---: | ---: |
| Cinder Two | 8.105 | 37.979 | .907 |
| Lilt | 7.830 | 36.447 | .954 |
| Evening Line | 7.259 | 36.087 | .827 |
| Rivet Eight | 5.429 | 35.944 | .931 |
| Yardhand | 8.382 | 41.116 | .803 |
| Glass Comet | 4.754 | 32.057 | 1.029 |

These are measured whole-design stock differences under the same declared
threshold policy and command values, not controlled single-part comparisons. Upgrade comparisons belong
to C/D/F. Full receipts are linked from [A acceptance](co-014a-acceptance.md).

```sh
node --experimental-test-isolation=none --test tests/vehicle-build*.test.mjs
node scripts/measure-vehicle-builds.mjs > stock-physical.json
```

Serve the clean source checkout with loopback HTTP for the development browser
check. Set `PLAYWRIGHT_MODULE` and `CHROME_BIN` to existing local installations.

```sh
RECEIPT=/tmp/stock-browser.json node tests/browser-vehicle-builds.mjs http://127.0.0.1:8764/
```

This verifies fetched source bytes, native ES modules, browser SHA-256 and
repeated physical runs; Node/browser reported metrics agree within 1e-6. It
does not certify native GPU performance, a workshop purchase, a four-discipline
facility, persistent builds, damage/repairs or a new replay. Those remain B–F.

## Published baseline audit

The exact v1.3.0 tag and remote main both resolved to
`1c745a90258d0f6cb968935f773354cff702b276` at task start. The isolated A
worktree started clean there; the older primary checkout and its untracked image
were preserved. The engine provenance pin is
`9d95d74b355ec17add32db0b55f0f71130f9c004`, with all manifest hashes checked.
The inspected STREET-RACER checkout is
`e6b43907c5e97e639f27e4da41bc6a8153df8563`; no donor code, abstract horsepower
authority or career rewards are imported.

Published ownership is garage v1 / `after-hours-v1` / catalogue 1: four bays,
stable owned/model IDs, credits, allocator, selection and revision. Its sole
vault slot and lock are `circuit-overdrive.garage.v1`, enveloped with generation
and sequence. Exclusive Web Locks, whole-string stale detection and verified
write/read-back remain untouched. B must design the migration before writing:
old runtimes reject extra car fields and their explicit malformed-save recovery
can replace an upgraded same-slot save. A separate slot would instead need a
shared-lock/fence protocol; multiple keys cannot be called atomic.

Published Touring, Nitro, Rocket, Crash Lab and Derby authorities stay separate.
Theatre admits v2–v6 through existing source and rules gates; no historical tape
is reinterpreted. The exact v1.3.0 SHA is added to the existing direct race
comparison tool's admitted baselines, preserving its historical coverage.
The 103-file runtime allowlist, relative module loading, immutable vendor pin
and seven-worker browser architecture remain unchanged. No v1.4.0 release,
career income, owned damage or persistent build is claimed by this PR.

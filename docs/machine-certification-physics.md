# CO-014F — independent mechanical evidence

Measured source: **`6eb0d1da9a5209b875bd064da97e74d08d6ecef2`**. VANILLAJS remains **`9d95d74b355ec17add32db0b55f0f71130f9c004`**. Node v22.18.0/Linux x64 executed `node scripts/certify-machine-physics.mjs`. The [retained physical receipt](evidence/co-014f/physics.json) records all source hashes, canonical builds/recipes, initial conditions, accepted commands or their hashes, metrics, diagnostics and reconstruction identities. Its source check reports `workingTreeMatchesHead: true`.

All eight mechanical categories change observed motion under the actual pinned solver. The controlled engineering rigs instantiate `createVehicle` directly, independently of the game display and benchmark progression. Each before/after pair starts at the identical model-specific stock-equilibrium pose on friction-1 surfaces with its declared initial velocity. Fixed-duration rigs share identical complete command tapes; braking shares the same full-brake stop policy and can use different accepted lengths. The accepted call is 1/60 s; each call advances four internal 1/240 s substeps. These data demonstrate physical effects, not universal improvements or fictional horsepower.

| Cinder Two modification | Independent measurement | Stock control | Modified |
| --- | --- | ---: | ---: |
| Street engine | First 0–100 km/h crossing, s | 8.105225 | 7.602682 |
| Ducted intake | First 0–100 km/h crossing, s | 8.105225 | 7.918378 |
| Free-flow exhaust | First 0–100 km/h crossing, s | 8.105225 | 7.894786 |
| Short gearbox | Actual RPM after 120 accepted calls | 2308.439 | 2816.317 |
| Adjustable final drive, trim +4 | Actual RPM after 120 accepted calls | 2308.439 | 2983.887 |
| Performance tyres | Exact-start braking path, m | 37.904049 | 32.284016 |
| Adjustable suspension, stiff setting | Maximum wheel load over bump run, N | 3359.938 | 3733.550 |
| Quick steering, trim +2 | Actual wheel angle after three accepted calls, rad | 0.090000 | 0.120000 |

The acceleration rig commands full throttle for 720 accepted calls from rest and linearly interpolates the first threshold crossing from adjacent accepted horizontal-speed endpoints. Short gearing also moves the first automatic shift from tick 292 to 254; final-drive trim +4 moves it to tick 243. Accepted road speed, RPM, displacement and shifting change together. The long gearbox produces the opposite early response and a later first shift. All three engine grades, both alternative gearboxes and all three alternative tyre grades are measured in the receipt.

The tyre braking rig begins at a declared exact 100 km/h, applies full brake and sums actual horizontal path until speed is at most 0.1 m/s. It is a separately declared engineering test, not the facility's reached-100 launch. In the constant-command corner rig, performance tyres also reduce integrated mean absolute wheel lateral speed from **7.536646 m to 6.497861 m**. That rig starts at 18 m/s and commands steer 0.65 for 240 calls; it does not use a feedback driver or an inferred grip score. Touring tyres reduce slip/braking path, while economy tyres increase them in the measured conditions.

The suspension rig coasts from 8 m/s across the authored 4 cm cosine bump between z −8 and −12 m, using the surface gradient's actual normal. The fitted suspension uses 44,880 N/m springs, 3,906 Ns/m dampers, 0.25 m rest length and 0.20 m travel. Vertical range changes from **0.027544 m to 0.052068 m**; maximum absolute vertical speed changes from **0.113454 m/s to 0.193160 m/s**. Both cars deliberately begin at the common stock-equilibrium pose. The modified suspension therefore settles toward its own different support height; the reported vertical range includes that initial settling as well as the bump response. These observations establish a real loading/heave response, not an isolated damper-only effect or a claim that stiffer suspension always handles better.

The steering rig coasts from 10 m/s with steer 0.35 for 180 calls. Quick steering also changes accumulated yaw from **1.084002 rad to 1.210676 rad** and changes the trajectory. It leaves the zero-steer acceleration rig unchanged. Paint changes neither the complete physical recipe nor any accepted state in the five controlled rigs: acceleration, braking, cornering, steering and bump response all remain identical.

The actual facility completed **92 benchmarks across 23 admitted configurations**: all six stock cars, all six responsive builds, all six soft/long builds, and five maximum accepted combinations, each through acceleration, braking, six-gate slalom and eight-gate handling. Rivet Eight's maximum engine/intake/exhaust combination would produce 559 Nm and correctly rejects against the 550 Nm combined cap before spawning; it supplies no fabricated benchmark result. Across all accepted simulation steps, four grounded wheels were reported; no barrier contact, recovery request or truncation occurred, and state remained finite. Minimum observed body up-component was 0.999157; maximum observed speed was 56.651380 m/s.

| Stock model | 0–100 km/h, s | Facility braking path, m | Slalom, s | Handling, s |
| --- | ---: | ---: | ---: | ---: |
| Cinder Two | 8.105225 | 37.978944 | 27.454496 | 29.937289 |
| Lilt | 7.830108 | 36.446930 | 27.516734 | 30.014680 |
| Evening Line | 7.259136 | 36.087408 | 27.044264 | 29.498449 |
| Rivet Eight | 5.429358 | 35.943638 | 25.754024 | 28.180654 |
| Yardhand | 8.381533 | 41.116170 | 27.095236 | 29.692532 |
| Glass Comet | 4.754065 | 32.057240 | 25.775495 | 28.105939 |

Facility braking physically accelerates from rest to the first accepted speed at least 100 km/h, then brakes to at most 0.1 m/s; exact starting speeds in these stock receipts span 100.015–100.222 km/h. Its path is therefore distinct from the exact-start engineering rig above. Facility acceleration retains its identical 900-call full-throttle tape. Slalom/handling reference policies target 8 m/s with recipe-aware feedback; their commands may differ across cars/builds. Those completion times do not claim identical-command part-only comparisons or independently optimized lap performance.

Every facility run was separately reconstructed from the compiled recipe using raw pinned `createVehicle`, a starting pose derived again from source dimensions and the accepted command tape. Independent speed/path/gate calculations agree, and **complete terminal solver state** matches, not just a changed field or a display number. A read-only audit recomputed **107 canonical build/recipe identities** (15 controlled-rig configurations plus 92 facility records) and all **12 source-file SHA-256 values**; every identity matched. Ten representative v7 recordings additionally passed full admission, midpoint seek, terminal state/result reproduction and restart from the recorded build. Their largest native recording was 219,580 bytes, within the 2 MiB limit.

The eleven focused certification tests also reject malformed gearbox ratios and torque curves, invalid tyre grip, excessive spring rates, insufficient weight support/travel, non-finite or unsupported tuning, unknown parts/rules and extended executable-looking build fields without changing the previously accepted configuration. Extreme repeated compilations remain deterministic, independently owned and immutable.

These are source-bound development measurements and hypothetical compiler-admitted configurations. They do not claim a purchase, install a part, grant credits, mutate ownership, assign persistent damage or create a repair event. Production-control purchase/save/replay journeys and native GPU/resource evidence are recorded separately in the overall F acceptance report. No imported position stream supplies authoritative motion.

The retained JSON is semantically lossless: only bounded leaf subtrees share a line. Parsing it and removing its added `rawArtifact` metadata was checked with deep equality against the complete original output. That original output is **1,026,216 bytes**, SHA-256 **`c2de4e3cd220c37131579f5bb3a445e81fac11f7a897bfd50da29d463122df02`**. Recreate it at the declared exact source with `node scripts/certify-machine-physics.mjs`; serialization is `JSON.stringify(result,null,2)` followed by one LF. All measured fields remain in the retained copy; no opaque sample omission is needed.

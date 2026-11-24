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

The per-feature limit stops at the conservative safe time. An interrupted sample scan holds the last accepted pose because unexamined features could contain an earlier collision. A pass limit also holds the remaining interval. All three paths report `stats.limited`, the reason (`sweep`, `samples` or `passes`), unadvanced seconds and maximum residual penetration. They record a terminal `world.technicalStop` and reject further updates to that world. A limited step can expose genuine prefix impulses and damage, and marks that its attempted tick did not complete. Later settlement must treat this as a technical stop. A near-tangent sweep or physically impossible fixture layout can reach these limits.

## Review and reproduce

The focused suite exercises all 15 moving pairs at the launch cap, three simultaneous pairs, a dense centre approach, thin and corner barriers, rotating tips, a disabled wreck, overlap recovery and all three technical-stop paths. The 1,000 seeded six-car scenes compare complete states, contact receipts, latches and solver measurements after permuting both car and fixture arrays. The published parity suite pins all 958 accepted ticks across the three Lab experiments, an adversarial overlap, the exact Lab limits and v5 admission. Old v5 recordings still use their matching source build.

```sh
node --test tests/derby-impact.test.mjs tests/derby-lab-parity.test.mjs
CO_V111_CHECKOUT=/path/to/clean-v1.1.1 node --test tests/derby-lab-parity.test.mjs
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
```

The optional comparison checkout must point to the published SHA. It compares unrounded states and receipts in the same Node runtime in addition to the offline golden traces. For a browser review, serve a source-stamped package under `/Circuit-Overdrive/`, drive the existing Wall, Glancing Blow and Two-Car Impact tests, then reset and open a completed recording in Replay Theatre. [Package commands](pages.md#build-and-play-the-package-locally) · [Replay source rules](replay-theatre.md#crash-lab-version-5)

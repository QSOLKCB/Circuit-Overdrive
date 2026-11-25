# CO-012C — Derby intelligence and rules

Total Destruction rules 1 run a six-car match at 60 accepted fixed ticks per second. Five rivals and the player use the same planar road forces, swept chassis contacts and mechanical condition. The two arena grids use stable driver IDs and fresh damage, motion and contact episodes at each launch. The uint32 match seed supplies the rivals' interception lead, approach side and target persistence. [Arena layouts](derby-arenas.md) · [Six-car impact authority](derby-impact.md) · [VANILLAJS provenance](../vendor/vanillajs/provenance.json)

## Commands and rival driving

Every tick validates the player request, snapshots the operational field, and computes the five rival requests before advancing any car. Requests contain only throttle, brake and steer. When throttle is released, sustained brake first removes forward motion and then requests reverse. Reverse thrust tapers to zero as reverse speed approaches 9 m/s. The existing rolling resistance, steering law and damage-dependent road forces apply in both directions.

Each rival scores the other operational cars by distance and turn angle, then aims ahead of the chosen car. A lateral offset gives some approaches a chance to catch the side. The target cost favors continuing a pursuit while another car is still within reach. The rivals project their aim inside the convex walls, test fixture clearances, and use validated waypoints to route around an obstructed approach in Iron Pit. A short corridor check can prompt braking or a bounded reverse maneuver when a wall blocks the nose. Nearby wrecks can deflect the route. The steering controller accounts for reduced steering response, the target speed falls with grip, and throttle demand accounts for degraded engine power.

Work is bounded by the six-car field, the arena fixture and waypoint lists, ten forward probes per rival and twelve probes per waypoint path. The navigation estimates can miss a fast-moving car or leave a badly damaged rival with a poor approach. Every contact still goes through the continuous solver.

## Damage and elimination

A new contact episode spends the smaller of the measured normal energy and dissipated energy. Divide this energy among the damageable sites, subtract 1,500 J per site, and round down to nonnegative integer severity. The divisor is 100 J per severity point for vehicle contacts and 800 J for fixed fixtures. The arena calibration makes short-run-up hits matter and gives ramming a rival greater scoring potential than running the wall. Each site applies the published localized component weights and the same 1,000-point caps. Damage-sensitive throttle, steering, grip and suspension damping use the published condition model. The diagnostic Crash Lab and arena preview keep their existing calibration. These are arcade approximations. [Published damage model](crash-damage.md)

A driver retires when accepted damage first brings engine or tyres to 1,000, with engine recorded when both saturate in the same receipt. Elimination records the driver, tick, channel, exact eight-channel damage at the transition, impact receipt ID, nullable attacker ID and one-based sequence.

- A first-entry vehicle contact can score actual increments against the other driver when both were operational at the start of that receipt. The score adds the capped points charged across all eight channels. A direct damaging contact can earn credit even if the other driver originated the approach.
- The same eligibility rule applies to a knockout. If both drivers fail in the same receipt, they each earn credit. The receipt's stable participant order sets their ledger sequence. A later receipt observes both wrecks.
- A wall or wreck can retire a driver without awarding an attacker. Separation and a new accepted entry are required for repeat damage. A wreck can receive damage and impulses but earns no new scores. It remains on the field and receives neutral commands.

## Finish and classification

The first complete tick with exactly one operational car settles a last-car-standing winner. If zero remain, the match settles as a simultaneous-elimination draw and has no winner. A player who retires can spectate while the remaining drivers continue under the same authority.

The match limit is 10,800 accepted ticks. If two or more survive, the leading operational driver wins a timed classification. All standings put operational cars above eliminated cars. Eliminated cars sort by later elimination tick first. Remaining ties in either group sort by more credited knockouts, more inflicted damage, more remaining mechanical condition and lower driver ID in that order. Mechanical condition is 4,000 less the sum of engine, steering, tyres and suspension damage.

A failed solver or enclosure check ends in a technical stop with no winner. The receipt retains the attempted tick and solver or enclosure diagnosis. Physical prefix contacts can be inspected, and their damage remains in the diagnostic world. The official result retains the last complete tick and standings, with no scores or elimination events from that attempt. After a result is set, another step is rejected. Start a fresh round to reset the field.

## Acceptance

Run the pure fixed-step suite from the source checkout.

```sh
node --test tests/derby-rules.test.mjs tests/derby-impact.test.mjs tests/derby-arenas.test.mjs tests/derby-lab-parity.test.mjs
```

With seed 27, continuously requesting full throttle in The Crucible produces a player wall retirement at tick 2,274, mutual rival knockouts at 6,056, and a timed Mara Vale win at 10,800 after four real retirements. In Iron Pit, holding throttle and adding right steer on ticks 55–84 produces an accepted side impact at tick 79 and player and Emi Park mutual knockouts at tick 112. The surviving rivals settle a simultaneous-elimination draw at tick 5,414. The tests use the unmodified spawn grids for these complete matches and repeat all the Iron Pit steps against a second round.

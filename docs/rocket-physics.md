# CO-010A · Surface-relative vehicle dynamics

## Architecture decision

The published v0.9.0 game is the baseline for this review, at `f7f45d1b6c3521dd728945b71cf20ab406603cb4`. The selected VANILLAJS source is `9d95d74b355ec17add32db0b55f0f71130f9c004`.

**Choice A.** The Rocket discipline will own a small rigid-body step and a directional wheel-contact interface. Touring and Nitro continue to use their own entry points. The pinned math module supplies vector and quaternion operations.

In the pinned `vehicle3d` implementation, the world returns one height per X/Z query and wheel support requires an upward-facing normal. The solver applies gravity along world −Y, corrects bottom-out along +Y, and requests recovery when chassis up points below its upright threshold. Changing its gravity vector alone leaves all three contact assumptions in place. The collision module casts against axis-aligned boxes. The game's car-pair solver sweeps horizontal chassis footprints. A directional probe against an oriented patch supplies the contact information a ceiling or wall requires. [Pinned vehicle source](../vendor/vanillajs/modules/vehicle3d/index.js) · [Pinned collision source](../vendor/vanillajs/modules/collision/index.js)

## Proposed step and feasibility gate

World units are metres, kilograms and seconds. In the local right-handed chassis frame +X points right, +Y points out of the roof and −Z points forward. A surface supplies its position, forward unit tangent T, support unit normal N, lateral axis T × N, patch identity, route station, lateral offset and material. A probe returns the nearest admissible front face along the actual wheel ray and its distance. The returned basis must be finite, orthogonal and consistently handed.

The solver will derive four wheel mounts from the chassis quaternion, probe along chassis-down and integrate spring/damper forces and their moments at the contact points. World gravity acts throughout the step. Magnetic adhesion is a finite acceleration into an eligible face, contingent on wheel contact. Free flight retains momentum under world gravity. Throttle, brake, steering, boost, held assistance and a signed lateral dodge (−1, 0, +1) form the explicit tick input. Angular motion, propulsion and dodge impulses act on the rigid body. A race station may identify a contact for inspection or future gate logic. It cannot assign chassis position or orientation.

The feasibility fixture is separate from the player courses. Finite planes and quarter-cylinders form a floor, an ascending wall, a ceiling, a descending wall and an exit floor. The gate requires a drive from rest through all five sections, repeated under identical inputs. Verification will use wheel loads and contact points, world position and velocity, the integrated quaternion and angular velocity, and applied acceleration. A detached inverted car must fall under ordinary gravity. The fixture has no ranked event, UI selection or championship entry. Course design and six-car racing follow owner review of the executed physical proof.

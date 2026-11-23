# Nitro Skyway

Nitro Skyway is a 1,920 m point-to-point race across a tidal power installation. The six-car grid starts on the western approach. The first marked drift corner leads to Copper Step. Signal Crown is the tallest jump. After Turbine Rise, a fourth sweeping bend brings the field to the finish. The guardrails’ copper and cream caps mark the limits of the 26 m asphalt deck. The flywheels, gantries, platforms and distant salt terraces are original retained scenery.

## Course and landings

Skyway runs in daylight, including when the previous course used Nightshift. The NITRO gantry and its chequered stripe mark the start at 0 m. The FINISH gantry and stripe sit at the 1,920 m timing plane.

The route uses connected straight lines and tangent circular arcs. Horizontal station runs from −60 m on the start runoff to 1,992 m on the finish runoff. The suspension, render mesh, collision rails and recovery slots share the same sampler. Rail inner faces stand at lateral ±15 m and rise 0.94 m above their decks. The engine queries the inclined surface under every wheel. The catch face continues back down to the main deck for drivers who take a ramp slowly.

| Deck | Crest station | Horizontal run on each side | Maximum grade |
| --- | ---: | ---: | ---: |
| Copper Step | 504 m | 28 m | 17% |
| Signal Crown | 983 m | 40 m | 26% |
| Turbine Rise | 1,476 m | 34 m | 21% |

Each toe eases into the incline over 7 m. At the top, the road gradient changes continuously across a 4 m rounded crest. A faster chassis can carry upward momentum as its tyres lose contact. Vehicle suspension and gravity determine takeoff, trajectory and touchdown. The chase camera rises with the actual chassis and keeps the catch deck in view.

A scoring flight must start within 6 m of a crest, spend at least eight ticks airborne, clear 0.3 m above normal ride height and travel at least 4 m forward. The landing must occur on the same ramp’s catch zone with a valid direction, attitude and vertical approach speed. The driver then has 45 ticks to show five consecutive stable ticks, with at least three loaded asphalt tyres, reasonable alignment, roll, pitch and vertical motion. A collision, reverse movement, missed checkpoint, new flight or recovery cancels the pending award.

Each ramp can pay once in course order. A successful flight earns two points per airborne tick plus one per whole horizontal metre travelled to accepted touchdown, capped at 500 per ramp. Stunt points appear alongside race progress. Finish order uses official elapsed ticks including recovery penalties. The eight timing planes lie outside the launch sections and require a forward swept crossing on supported asphalt.

## Verification

`node --test tests/skyway-geometry.test.mjs tests/skyway-race.test.mjs` checks every asphalt triangle at its three vertices and its centre, verifies both timing-line markings, and drives the full seeded race twice. The digital driver initiates the opening drift with a sustained steering input and then countersteers from measured heading error. All six racers must finish, spend charge and earn a physical landing award. The landing test repeats a recorded touchdown inside its catch zone and checks that its points can be paid only once.

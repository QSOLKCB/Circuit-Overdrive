# Orbital Spine

Orbital Spine is a 1,218.59 m, six-car Rocket sprint. The starting deck feeds two opposing banked turns. The first magnetic elbow pitches the car onto a 48 m vertical climb, then onto a 182 m inverted return span 162 m above world zero. After the descending wall and banked exit, the impulse lip launches the car over an open 9 m gap onto an 88 m catch deck. The finish has a further 48 m of runoff.

Build speed on the approach and hold assistance through the magnetic elbows, walls and ceiling. Keep steering relative to the car. The launch apron gives room to align with the catch deck and apply boost. A lateral air dodge spends 12 units and changes the actual landing line. Losing the roof releases the car into world gravity. The approved dynamics, numerical bounds and tyre contact contract are documented in the [Rocket physics review](rocket-physics.md).

## Surface and gates

The course authoring data produces 661 pairs of cross-sections, each at most 2 m apart along the route. There are 1,312 physical deck triangles. The five longitudinal intervals across the gap have no deck faces. The renderer and contact solver use the same two triangles between each pair of connected sections. The ribbon is 28 m wide. The inner rail face is 13.6 m to each side and 1.05 m high.

A 24 m world-space grid indexes finite triangles by their bounding boxes. A tyre ray queries the grid cells crossed by its bounding box and intersects the front faces within its range. The nearest hit supplies the actual face normal, tangent, right axis, material and barycentrically interpolated station and offset. An equally near previous section may retain its identity on a seam. Station projection searches the driver's preceding and following 12 m of centreline for ranking, lane feedback and rail proximity. Wheel support comes from the independent 3D query. The lower apron and inverted return therefore support separate bodies at identical X/Z.

| Timing plane | Station (m) |
| --- | ---: |
| Grid line | 0.00 |
| Azimuth Bank | 123.00 |
| Magnet Apron | 271.00 |
| Antenna Wall | 407.82 |
| Inverted Spine | 588.80 |
| Earthward Wall | 771.69 |
| Launch Apron | 999.59 |
| Catch Deck | 1,146.59 |
| Finish | 1,218.59 |

The previous and current physical body centres must sweep the next plane forward. The intersection lies within the rail width and 0.15–1.65 m above the face along its local normal. The body faces forward, carries positive forward velocity and has at least two loaded local tyres on each side of the tick. Each plane advances the gate index once. The result table settles once all six drivers have official times, including elapsed recovery penalties.

Recovery returns to a clear, upright place at or behind the last eligible credited plane. On the wall or ceiling this can mean driving the approach again to rebuild adhesion speed. A recovery adds 180 ticks, preserves spent energy, the body tick, dodge latch, remaining cooldown and credited splits, and starts a 120-tick recovery cooldown. An out-of-bounds entrant waits when its safe slots are occupied.

## Competition and verification

Each rival issues the same Rocket command type as the player. Its seed selects preferred lane offset and cruise speed. It steers toward the upcoming surface point in chassis coordinates, adjusts its line for traffic, moderates speed into the banks and can boost on the launch apron. During early flight it can dodge a nearby rival after checking reach, available energy, the rail margin and the proposed landing lane. Swept 3D chassis contact and surface-relative rails use stable driver ID order.

Run the focused course and race checks from the checkout.

```sh
node --test tests/orbital-geometry.test.mjs tests/orbital-race.test.mjs tests/rocket-contact.test.mjs
```

On Node 22.18.0, the seed-27 digital drive completed the six-car race in 2,600 racing ticks after the 180-tick countdown. The player crossed the finish at tick 2,256 with zero recoveries, spent 28 ticks boosting and executed one airborne dodge. It recorded 84 attached ticks on the ascending wall, 317 on the ceiling and a longest unsupported interval of 52 ticks. All six drivers crossed all nine timing planes and landed on the catch deck. Feeding the same accepted commands into another six-car race in batches of 13 reproduced the complete race state on that Node runtime.

The geometry test intersects every physical triangle at its centroid and compares its coordinates and orientation with the course sampler. The race tests also exercise a physically supported car on the wrong deck, an airborne portal crossing, out-of-order and reverse crossings, recovery from both a wall and a ceiling, occupied recovery slots and an AI dodge with and without a clear landing lane. [Course geometry](../src/orbital.js) · [Race authority](../src/rocket-race.js) · [Digital test driver](../tests/orbital-driver.mjs)

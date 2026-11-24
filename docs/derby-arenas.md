# CO-012B — The Crucible and Iron Pit

The two arena layouts build on the six-car authority merged at `807fa5c339ed724bf24a5458b92614d1c90ffc5b`. The published v1.1.1 baseline remains `541ba6ca27dabe644ab23fe9a061c91dda8794a6`. VANILLAJS supplies the existing vehicle recipe, fixed clock and lit renderer from `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Six-car authority](derby-impact.md) · [Published v1.1.1](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.1.1)

## Layouts

| Arena | Extents | Physical fixtures | Grid and circulation |
| --- | --- | --- | --- |
| The Crucible | 78 × 62 m | Eight concrete or steel boundary capsules | Three staggered opposing launch lanes and a clear asphalt centre. An exterior grandstand and floodlights frame the pit. |
| Iron Pit | 59 × 52 m | Eight boundary capsules plus two internal steel protectors | A tighter angular concrete floor with three routes through and around the protected structures. Industrial loading bays sit beyond the walls. |

Each rules-1 layout owns a frozen convex X/Z loop, surface material, ordered fixtures, six fixed spawns, overview eye and target, camera bounds and route points. The shared road-force model governs both floors. The route checks reserve an 8 m wide corridor between the boundaries and solid fixtures. Iron Pit also checks at least 8 m between protected obstacles and between each obstacle and wall. Its east, middle and west options connect the same two ends.

Each opening grid uses the six published driver IDs with zero speed, spin and component damage. Three overlapping discs describe every chassis. The validator checks all of their clearances against fixtures, walls and one another. The smallest spawn-to-fixture clearance is 6.10 m at The Crucible and 3.10 m at Iron Pit. Their smallest chassis-to-chassis gaps are 12.72 m and 6.57 m.

## Collision and rendering

The boundary capsules run between successive vertices of the same loop that generates the WebGL floor. Adjacent walls share their endpoint so the diagonal joins stay solid. The wall IDs are 80–87. Iron Pit's orange-topped protected structures are steel capsule IDs 88 and 89. Their mesh outlines, including each wall's exact tangent sides, come from the collision records. Each semicircle uses 24 inscribed chords. The largest radius is 1.15 m, with an inward chord error below 2.5 mm. Exterior lights, stands and buildings are scenery beyond the physical ring.

`createDerbyArenaWorld(id, revision)` creates fresh cars, fixed fixtures and latches. `stepDerbyArena(world, commands)` checks finite motion and the full chassis footprint before and after the CO-012A step. Crossing the centreline enclosure or presenting invalid motion records an immutable technical stop with a reason, car ID and stage. A solver limit carries its own diagnostics. Reset constructs a new world. Arena navigation and later match settlement receive these separate authority results. [Impact budgets and technical stops](derby-impact.md#work-bounds-and-technical-stop)

The scene retains the world batches and the original clean touring meshes. The two raised cameras use the same bounds in either direction, with aspect-dependent framing. The renderer uses 44-byte XYZ, normal, RGB and UV vertices. Its high profile permits 256 lit meshes, 256 lit draws and 600,000 retained vertices.

| Arena | Lit meshes | Lit vertices | Mesh bytes | Lit draws per frame |
| --- | ---: | ---: | ---: | ---: |
| The Crucible | 25 | 19,716 | 867,504 | 96 |
| Iron Pit | 27 | 20,292 | 892,848 | 98 |

The sky adds one buffer, 24 bytes and one draw. Moving the cars changes their model transforms. Switching arenas disposes the old scene, and a same-arena reset reuses its buffers. The preview retains the earlier physical state on WebGL restoration. The six-car panels and full driving experience belong to later gates.

## Owner review

Build a source-stamped package and serve it under `/Circuit-Overdrive/`. Open **Crash Lab → Derby arena preview**. Select an arena, inspect the raised view and reverse angle, then choose **Run launch test**. Six real stationary cars receive a fixed full-throttle command batch for 480 ticks. The instruments show accepted car and fixture impulses, including continuing constraints. Pause to inspect a contact. **Reset test** restores the grid and fresh ledgers. [Static package and loopback commands](pages.md#build-and-play-the-package-locally)

```sh
node --test tests/derby-arenas.test.mjs
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
NATIVE_GL=1 node tests/browser-derby-arenas.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

The browser runner uses an existing external Playwright module and Chrome. Set `PLAYWRIGHT_MODULE` to the driver's ES module, `CHROME_BIN` to the browser and `EVIDENCE_DIR` to retain receipts and captures. The runner observes the app in memory while the ordinary buttons, fixed clock and production renderer drive both layouts.

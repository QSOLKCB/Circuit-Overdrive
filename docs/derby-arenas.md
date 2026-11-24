# CO-012B — The Crucible and Iron Pit

The two arena layouts build on the six-car authority merged at `807fa5c339ed724bf24a5458b92614d1c90ffc5b`. The published v1.1.1 baseline remains `541ba6ca27dabe644ab23fe9a061c91dda8794a6`. VANILLAJS supplies the existing vehicle recipe, fixed clock and lit renderer from `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Six-car authority](derby-impact.md) · [Published v1.1.1](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.1.1)

## Layouts

| Arena | Boundary loop extents | Physical fixtures | Grid and circulation |
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

## Stamped acceptance

The browser evidence uses the packaged runtime at `c0a4f566b03836d928f69d088f94278e5e59723f`. Chrome 158.0.8127.36 with Playwright 1.64.0 rendered native ANGLE OpenGL on an RTX 5060 Ti (driver 595.99.02). The host was a Ryzen 9 5950X running Ubuntu 26.04.1 LTS and Linux 7.0.0-43-generic. Both 1920 × 1080 runs used the normal fixed clock. [Browser receipt and image hashes](evidence/co-012b/browser-arenas.json)

| Arena | First car / fixture entry tick | Car / fixture impulse receipts | Frame interval median / p95 / worst, ms | GPU draw median / p95 / worst, ms |
| --- | ---: | ---: | ---: | ---: |
| The Crucible | 97 / 276 | 745 / 301 | 16.7 / 16.8 / 16.8 | 1.221 / 1.565 / 3.482 |
| Iron Pit | 94 / 247 | 830 / 581 | 16.7 / 16.7 / 16.8 | 1.184 / 1.339 / 8.082 |

Each result covers 480 physics ticks and 480 frame intervals. The full-tick CPU p95 was 0.1 ms at The Crucible and 0.2 ms at Iron Pit. Peak solver work reached five passes and 136 samples in The Crucible and ten passes and 349 samples in Iron Pit. Iron Pit recorded new entries at both protected fixtures, IDs 88 and 89. The impulse totals include continuing constraints.

Paused and uninterrupted launches reproduced the same per-arena field digest, including accumulated damage and contact latches. Both runs kept buffer counts and byte totals fixed through motion and reset. Switching away and back reclaimed the retired scene. A WebGL loss at tick six restored the same field, and disposal of the restored scene released its 26 buffers and two programs. [Native browser receipt](evidence/co-012b/browser-arenas.json)

| Arena | Grid | After first accepted car contact | Reverse angle at the same tick |
| --- | --- | --- | --- |
| The Crucible | [Grid at tick 0](evidence/co-012b/crucible-grid.png) | [Paused at tick 99](evidence/co-012b/crucible-first-contact.png) | [Tick 99](evidence/co-012b/crucible-reverse.png) |
| Iron Pit | [Grid at tick 0](evidence/co-012b/iron-pit-grid.png) | [Paused at tick 96](evidence/co-012b/iron-pit-first-contact.png) | [Tick 96](evidence/co-012b/iron-pit-reverse.png) |

The 17 focused tests cover all 18 capsule fixtures, near-cap approaches to all 16 corner joins, route clearance, mesh support in 64 directions and whole-chassis enclosure. They complete 1,920 stress ticks per arena and input order. Reversing the car and fixture input arrays reproduces the full field, receipts, latches and solver counts. Technical-stop fixtures exercise invalid motion and a body protruding outside the ring. The full Node v22.18.0 suite passed 292 tests, including the legacy 45,225-tick racing comparison and unrounded v1.1.1 Crash Lab parity.

The standalone site and extracted offline ZIP contain the same 85 runtime files. The independent archive verifier, Python 3.14.4 offline test and seven-worker contract passed. All seven real browser shards passed on SwiftShader against the extracted site under `/Circuit-Overdrive/`. The tested archive SHA-256 is `5e5aebb679fff4c6e5eccb8018726b6b9dac30dff5f62330f4cd740d04989376`. The read-only public verifier matched all 81 assets and MIME types at the merged CO-012A source.

## Owner review

Build a source-stamped package and serve it under `/Circuit-Overdrive/`. Open **Crash Lab → Derby arena preview**. Select an arena, inspect the raised view and reverse angle, then choose **Run launch test**. The test starts six stationary cars and supplies the same full-throttle request batch for 480 ticks. The authority applies the existing mechanical condition and disablement. The instruments show accepted car and fixture impulses, including continuing constraints. Pause to inspect a contact. **Reset test** restores the grid and fresh ledgers. [Static package and loopback commands](pages.md#build-and-play-the-package-locally)

```sh
node --test tests/derby-arenas.test.mjs
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
NATIVE_GL=1 node tests/browser-derby-arenas.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

The browser runner uses an existing external Playwright module and Chrome. Set `PLAYWRIGHT_MODULE` to the driver's ES module, `CHROME_BIN` to the browser and `EVIDENCE_DIR` to retain receipts and captures. The runner observes the app in memory while the ordinary buttons, fixed clock and production renderer drive both layouts.

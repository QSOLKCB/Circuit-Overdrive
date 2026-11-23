# Nightshift world rendering

Both events use the original road, apron, wall, building and landscape triangles. Scene construction uses freshly generated batches. A night build changes their vertex colours before upload and adds a separate set of fixtures. The same course sampler supplies each fixture’s position, grade and banking reference. The simulator never imports the environment or fixture modules.

Nightshift Speedway uses a violet horizon, lit grandstands, open pit bays and two-sided geometric signs for ION, HEXA and VANTA. Numbered braking boards count down to the two steepest bank entries. Red and ivory rail studs trace those turns between pools of warm floodlight. Midnight Descent uses a blue mountain horizon, widely spaced amber lamps, alternating bridge beacons and a row of warm lamps inside each tunnel wall. The tunnel lighting follows the vault and deck through the entrances. Speedway and Ridge each have a fixed seeded star field centred on the camera behind opaque geometry. Headlamp lenses glow separately from the rear brake lamps.

The static lights bake a finite-radius contribution into the original surface vertex colours. Intensity depends on squared linear distance falloff inside a sphere, vertex orientation and the lamp colour. The lookup groups sources in 50 m horizontal cells at construction. This produces visible pools where their receiving triangles have adequate resolution. Broad triangles interpolate a gentler gradient. Distant panorama batches keep their moonlit palette. The moving-headlight pass uses the original receiver colour, preserving lane-marking contrast where headlights cross the fixed light pools. The lighting model omits cast shadows and interreflection.

| Retained world geometry | Speedway | Ridge |
| --- | ---: | ---: |
| Day world batches | 4 | 61 |
| Night world batches, including fixtures | 18 | 103 |
| Additional fixture vertices | 15,516 | 35,340 |
| Additional star triangles | 880 | 880 |

Fixtures group into roughly 240 m sections with bounding spheres for course visibility. Sky and car geometry have separate handles. Night projectors reuse the front lamp triangles split from the trim mesh and add one draw per visible car. The day scene retains its original projector material, meshes and lighting. The local light bake and star generation run once when the scene is created.

## Reproduction

Unit tests compare XYZ, normals and UVs of every original world vertex and probe the extra fixtures for road clearance. They also check local coloured response inside the tunnel and unlit forest sections. Run from the repository root.

```sh
node --test tests/{night-worlds,presentation,ridge-geometry,road-mesh}.test.mjs
```

With the exact package served at the repository subpath, the world inspection samples both night courses with a six-car field. The runner captures the real grid and a recovery using the simulation. Other stations use controlled poses, including a reverse approach to the Ridge tunnel. Its JSON records the package source SHA, WebGL renderer, browser version, image hashes and pixel counts for all thirteen views. Set `NATIVE_GL=1` for the native GL launch settings.

```sh
EVIDENCE_DIR="$OUT/worlds" node tests/browser-night-worlds.mjs "$URL"
```

## Native world inspection

Chrome 158.0.8127.36 on the NVIDIA GeForce RTX 5060 Ti rendered all thirteen views at 1024 × 576, using WebGL 1 through ANGLE OpenGL ES. The static package identified source `7d49db1e4bef03471c6ef2387849665286ada814`. Every view had six submitted entrants and passed its mixed bright/dark pixel and GL error checks. The recovery at the grid restored the same frame as the initial placement. [Complete capture receipt](evidence/co-008b/world-inspection.json)

The tunnel centre marking remains visible in the overlapping fixed and moving light pools. In the middle third of the image height and middle two thirds of the width, all three channels exceeded 245 on 0 decoded pixels inside the tunnel, 0 on the bridge and 309 at the grid. Before separating the static lamp bake from headlight receiver albedo, those counts were 11,376, 566 and 9,301 on source `cfd59ef26b666cf3b0580430be028b8932e8e3cd`, with the same placements, dimensions and encoder. [Speedway grid](evidence/co-008b/speedway-grid.webp) · [Ridge bridge](evidence/co-008b/ridge-bridge.webp) · [Tunnel interior](evidence/co-008b/ridge-tunnel-inside.webp)

The corrected source was exercised with the following command.

```sh
NATIVE_GL=1 CHROME_BIN=/usr/bin/google-chrome PLAYWRIGHT_MODULE=/home/trent/OFFLINE-GAMES/node_modules/playwright/index.mjs EVIDENCE_DIR=/tmp/co008-nightshift/b2-worlds node tests/browser-night-worlds.mjs http://127.0.0.1:18728/b2/Circuit-Overdrive/
```

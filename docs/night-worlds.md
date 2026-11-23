# Nightshift world rendering

Both events use the original road, apron, wall, building and landscape triangles. Scene construction consumes newly generated batches. A night build changes their vertex colours before upload and adds a separate set of fixtures. The same course sampler supplies each fixture’s position, grade and banking reference. The simulator never imports the environment or fixture modules.

Nightshift Speedway uses a violet horizon, lit grandstands, open pit bays and two-sided geometric signs for ION, HEXA and VANTA. Cold rail studs trace the banking between pools of warm floodlight. Midnight Descent uses a blue mountain horizon, widely spaced amber lamps, alternating bridge beacons and a row of warm lamps inside each tunnel wall. The tunnel lighting follows the vault and deck through the entrances. Speedway and Ridge each have a fixed seeded star field centred on the camera behind opaque geometry. Headlamp lenses glow separately from the rear brake lamps.

The static lights bake a finite-radius contribution into the original surface vertex colours. Intensity depends on squared linear distance falloff inside a sphere, vertex orientation and the lamp colour. The lookup groups sources in 50 m horizontal cells at construction. This produces visible pools where their receiving triangles have adequate resolution. Broad triangles interpolate a gentler gradient. Distant panorama batches keep their moonlit palette. Each nearby moving headlight has its own supplementary surface response. The lighting model omits cast shadows and interreflection.

| Retained world geometry | Speedway | Ridge |
| --- | ---: | ---: |
| Day world batches | 4 | 61 |
| Night world batches, including fixtures | 18 | 103 |
| Additional fixture vertices | 14,724 | 35,340 |
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

# AFTER HOURS MOTOR WORKS — showroom geometry

CO-013D presents the six built-in catalogue models in an original low-poly,
cutaway workshop. `garage-geometry.js` authors their finite triangle batches;
`garage-scene.js` renders them through the unmodified VANILLAJS `LitRenderer`,
pinned to `9d95d74b355ec17add32db0b55f0f71130f9c004`.

The Cinder Two has a cream roof and square nose; Lilt has a short upright hatch;
Evening Line has a long, sloping grand-tourer body; Rivet Eight has a broad body
and raised striped bonnet; Yardhand has a taller cab and recessed open bed;
Glass Comet has a low wedge and split rear lamps. Dimensions, paint and trim are
cosmetic. They define no horsepower, grip, condition, repair or collision model.
The models do not enter the existing racing or replay authorities.

The workshop contains four numbered, separated storage bays, tool drawers,
industrial lights, a roller door, an unoccupied service lift and a separate
inspection platform. The open roof/front are deliberate camera cutaways. Every
stored vehicle visible in a bay corresponds to that accepted save's bay record.
The platform displays an **inspection copy**, including for an unowned catalogue
entry; it is not a fifth inventory bay or a transferable vehicle.

`createGarageScene(canvas, pixelRatio = 1)` returns `draw`, `stats` and `dispose`.
`draw({garage, modelId, camera})` accepts the validated garage snapshot (or null,
which displays empty storage bays), a built-in model ID and `front`, `side`,
`rear` or `bays`. It does not mutate the supplied snapshot. Presets change
immediately, with no idle orbit, easing or animation clock. Narrow viewports
pull the camera back to retain the inspected model. The UI owns rendering on
selection, accepted save changes, viewport changes and context restoration.

All six model meshes are uploaded once when the scene is created. Repeated
models in owned bays share immutable buffers. Inventory, preview and camera
changes only select draw calls and transforms; they do not rebuild geometry or
upload GPU data. Each model has six material batches: shell, trim, glass,
lamps, tyres and rims. Glass is opaque tinted geometry, avoiding order-dependent
transparent body surfaces. Shadow cards use the existing analytic shadow
material. Lighting uses the renderer's directional and ambient model; the
workshop fixtures are emissive geometry, not extra shadow-casting point lights.

The retained scene uses **41 meshes, 17,922 vertices and 788,568 vertex-buffer
bytes**. The renderer also owns its six-float sky triangle buffer, two programs
and its context listener. A full four-bay garage plus inspection copy submits
**39 mesh draws**, in addition to the sky. This is below even the pinned low
profile's 128 meshes/draws and 180,000 vertices; the scene selects the high
profile. These counts are resource limits, not native GPU performance evidence.

The separate showroom canvas prevents garage context loss from changing race
authority. A lost scene stops drawing; the caller disposes it and creates a new
scene after `webglcontextrestored`, then draws the same accepted save and preview.
`dispose()` releases retained resources and is idempotent. Failed construction
also releases partial allocations. Loss or unavailability of WebGL must leave
the semantic catalogue, inventory and save controls usable.

`node --experimental-test-isolation=none --test tests/garage-scene.test.mjs`
checks distinct position geometry for all six models, nondegenerate triangles,
finite unit normals, colour and bay bounds, actual renderer allocation calls,
eight complete catalogue/camera cycles with zero new uploads, immutable input
state, upload failure cleanup, lost-context draw suppression and reconstruction.
The recording WebGL surface tests API ownership, not shader execution. Actual
packaged browser journey, screenshots and context/resource checks are recorded
separately in the CO-013D acceptance evidence. Native frame-time certification
remains CO-013E.

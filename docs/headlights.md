# CO-008A headlight rendering

The pinned VANILLAJS LitRenderer at `9d95d74b355ec17add32db0b55f0f71130f9c004` draws the opaque world into its WebGL1 color and depth buffers. Its material shader supports directional light, ambient, procedural surfaces, emission and fog. Game-owned code then adds direct headlight illumination to visible world surfaces, before shadow decals, cars, glass and driving effects. Day scenes use the original draw sequence.

## Geometry and light sources

Each road, rail, building and roadside receiver reuses the coordinates of its admitted opaque triangles. A 64 m horizontal spatial grid groups triangles by centroid. Each group retains the bounds of **all its vertices** so a long wall or a bank transition crossing a cell boundary stays eligible. The pass checks the camera frustum and each group's distance from the lamps. The depth equality test restricts addition to surfaces visible at the exact rasterized depth. The source has no shadow map. Occlusion from the camera is resolved by the depth buffer; occlusion between the light and another surface is an approximation.

The two front lenses share one source centered 0.60 m up and 2.18 m forward in the interpolated touring-car body matrix. Yaw, pitch, roll and chassis displacement all affect this point. The axis follows local −Z with a downward slope of 0.055. The 12° core and 28° outer half angles use a smoothstep between their cosines. Intensity is proportional to `1 / (1 + 0.021 d + 0.00047 d²)` where distance is in metres. A 56–72 m smooth fade gives an exact finite range. A directional grazing response makes dark pavement readable and modulates the return from painted rails. RGB tint comes from the original triangle. These constants form a bounded arcade lighting model.

The followed vehicle has priority in both the game and the spectator camera. One additional racing rival within 48 m can light the road at 67% intensity. Field order breaks equal-distance ties. Reduced effects and the menu omit rival beam evaluation. Other vehicles retain their visible light assemblies. A finished or missing focus contributes no dynamic beam.

## WebGL budget and lifecycle

Night adds one GLSL ES 1.00 program and one static buffer, three vertex attributes, two position/direction pairs, a count flag and the view-projection matrix. The buffer uses 20 bytes per receiver vertex for original float XYZ, signed normalized normal and unsigned normalized tint with padding. The receiver cap is 600,000 vertices, matching the vendor high-profile limit. Materials with emission, transparency or an explicit receiver opt-out skip the pass. Static geometry uploads happen at scene creation. The shader evaluates at most two cones per fragment in a single additive pass with depth writes disabled. The pass restores depth function, depth write mask, blending and vertex-array enable state for the next LitRenderer draw. No textures or offscreen targets are allocated. Scene disposal deletes its extra resources. Context restoration rebuilds the scene.

## Pixel regression

Run the following against a loopback checkout or packaged site with the existing browser driver. Set `EVIDENCE_DIR` to save three bank captures and the SHA-256 of every module and course file loaded by the probe.

```sh
node --test tests/headlights.test.mjs tests/provenance.test.mjs
node tests/browser-headlights.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

The camera stays fixed on real Speedway pavement while the probe rotates, translates, reverses and removes the source. It measures the centroid of increased red-channel energy and counts pixels above a five-level threshold at the grid and a banked corner. The isolated draw contains asphalt and shoulder triangles only. A lamp mesh or camera overlay in the game cannot satisfy the pixel test.

# CO-CRACK-001 — Computational Impact Panels

The v1.1.1 candidate gives Crash Lab four deformable body regions on each Ignition GT. The published starting point is v1.1.0 at `1f0527098b9eb9c27c678d9ad4bfa2b276374551`. GitHub's `main` and the v1.1.0 tag both resolved to that commit at branch creation. The renderer and vendor manifest use VANILLAJS `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Published release](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.1.0) · [Vendor provenance](../vendor/vanillajs/provenance.json)

## Panel contract

The panel component takes the car's original XYZ, normal, RGB and UV triangle lists and divides them into fixed geometry and front, rear, left and right groups. Each triangle appears once. Front and rear share the shape of the bonnet or boot with their respective bumpers. Side dents are concentrated in the door bay and fade before the wheel openings, glass and rocker. Matching source positions use the same displacement and the field goes to zero at the panel boundary. The front and rear fields leave a collar around the wheels.

The accepted damage integer in each zone scales its model-space displacement by `sqrt(damage / 1000)`. The square-root gain makes the certified 19-point glancing strike visible near the crease while reserving the deeper folds for harder impacts. The front and rear compress longitudinally and fold vertically. Side panels compress inward. Lighting blends the original shading normals with the deformed triangle normals and preserves their intended outward orientation. The steel blend ramps from 480 to 800 damage and concentrates on the folded faces. Cool steel tones, brighter ridges and scraped paint are evaluated into vertex colours through the existing lit shader.

The scene reads the accepted ledger once per car per draw. It uploads a panel target only when that zone's integer changes. It snaps immediately at both motion settings, including during pause, seek or context restoration. Reset returns to the exact clean vertices and the original paint. The transformation reads cumulative damage alone. It needs no random seed, history, contact positions, render clock or mutable data shared between cars.

Each v5 tape reconstructs the collisions and ledger at its recorded revision, then Theatre uses the same scene as live Crash Lab. Keep the v1.1.0 archive for v1.1.0 tapes. The collision envelopes remain the three-disc chassis described by the impact contract. A compressed nose can therefore leave visible clearance to a wall or another car at a still-active contact. [Impact authority](crash-impact.md) · [Damage ledger](crash-damage.md) · [Replay source rules](replay-theatre.md#crash-lab-version-5)

## Mesh budget

| Vertices | Fixed | Front | Rear | Left | Right |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shell, each car | 1,974 | 576 | 354 | 144 | 144 |
| Scarlet trim and graphics | 936 | 348 | 414 | 138 | 138 |
| Blue trim and graphics | 924 | 348 | 402 | 126 | 126 |
| Rear lights, each car | 0 | 0 | 72 | 0 | 0 |
| Glass, each car | 24 | 0 | 0 | 0 | 0 |

All 5,262 Scarlet and 5,214 Blue body vertices retain the original 44-byte WebGL layout. Each car owns twelve mesh handles. Wheels share two read-only meshes in the scene. The fixture and sparks use one mesh each, and the renderer owns a 24-byte sky buffer. The scene has 16 lit mesh handles for one car or 28 for two. A changed zone replaces two buffers, or three for the rear because the lamps move with it. All four zones changing together replace at most nine buffers per car. A clean or repeated state allocates no panel target. The renderer validates and copies a new target, uploads it, then deletes the previous GPU buffer. Scene disposal releases every owned mesh.

The component caps each input batch at 8,192 vertices. On the production touring batches, maximum displacements are below 0.321 m front, 0.251 m rear and 0.125 m side. The differently tessellated exterior faces along each end cap share one translation at the seam. At preparation, each moving triangle's signed area against its clean face is checked over the strength interval. Model-specific boundaries and the wheel collar are authored against the Ignition GT. A future body must fit that layout or use its own checked field before adopting the component.

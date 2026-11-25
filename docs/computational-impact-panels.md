# CO-CRACK-001 — Computational Impact Panels

The v1.1.1 candidate gives Crash Lab four deformable body regions on each Ignition GT. The published starting point is v1.1.0 at `1f0527098b9eb9c27c678d9ad4bfa2b276374551`. GitHub's `main` and the v1.1.0 tag both resolved to that commit at branch creation. The renderer and vendor manifest use VANILLAJS `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Published release](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.1.0) · [Vendor provenance](../vendor/vanillajs/provenance.json)

## Panel contract

The panel component takes the car's original XYZ, normal, RGB and UV triangle lists and divides them into fixed geometry and front, rear, left and right groups. Each triangle appears once. Front and rear share the shape of the bonnet or boot with their respective bumpers. Side dents are concentrated in the door bay and fade before the wheel openings, glass and rocker. Matching source positions use the same displacement and the field goes to zero at the panel boundary. The front and rear fields leave a collar around the wheels.

The accepted damage integer in each zone scales its model-space displacement by `sqrt(damage / 1000)`. The square-root gain makes the certified 19-point glancing strike visible near the crease while reserving the deeper folds for harder impacts. The front and rear compress longitudinally and fold vertically. Side panels compress inward. Lighting blends the original shading normals with the deformed triangle normals and preserves their intended outward orientation. The steel blend ramps from 480 to 800 damage and concentrates on the folded faces. Cool steel tones, brighter ridges and scraped paint are evaluated into vertex colours through the existing lit shader.

The scene reads the accepted ledger once per car per draw. It uploads a panel target only when that zone's integer changes. It snaps immediately at both motion settings, including during pause, seek or context restoration. Reset returns to the exact clean vertices and the original paint. The transformation reads cumulative damage alone. It needs no random seed, history, contact positions, render clock or mutable data shared between cars.

Each v5 tape reconstructs the collisions and ledger at its recorded revision, then Theatre uses the same scene as live Crash Lab. Keep the v1.1.0 archive for v1.1.0 tapes. The collision envelopes remain the three-disc chassis described by the impact contract. A compressed nose can therefore leave visible clearance to a wall or another car at a still-active contact. The door-number decal and door skin have different tessellations. The dent can obscure part of the painted number where the two surfaces meet. [Impact authority](crash-impact.md) · [Damage ledger](crash-damage.md) · [Replay source rules](replay-theatre.md#crash-lab-version-5)

## Mesh budget

| Vertices | Fixed | Front | Rear | Left | Right |
| --- | ---: | ---: | ---: | ---: | ---: |
| Shell, each car | 1,974 | 576 | 354 | 144 | 144 |
| Scarlet trim and graphics | 936 | 348 | 414 | 138 | 138 |
| Blue trim and graphics | 924 | 348 | 402 | 126 | 126 |
| Rear lights, each car | 0 | 0 | 72 | 0 | 0 |
| Glass, each car | 24 | 0 | 0 | 0 | 0 |

All 5,262 Scarlet and 5,214 Blue body vertices retain the original 44-byte WebGL layout. Each car owns twelve mesh handles. Wheels share two read-only meshes in the scene. The fixture and sparks use one mesh each, and the renderer owns a 24-byte sky buffer. The scene has 16 lit mesh handles for one car or 28 for two, with a maximum of 22 and 42 lit draws respectively. The pinned high profile permits 256 lit meshes, 256 lit draws per frame and 600,000 retained vertices. A changed zone replaces two buffers, or three for the rear because the lamps move with it. All four zones changing together replace at most nine buffers per car. A clean or repeated state allocates no panel target. The renderer validates and copies a new target, uploads it, then deletes the previous GPU buffer. Scene disposal releases every owned mesh.

The component caps each input batch at 8,192 vertices. On the production touring batches, maximum displacements are below 0.321 m front, 0.251 m rear and 0.125 m side. The differently tessellated exterior faces along each end cap share one translation at the seam. At preparation, each moving triangle's signed area against its clean face is checked over the strength interval. Model-specific boundaries and the wheel collar are authored against the Ignition GT. A future body must fit that layout or use its own checked field before adopting the component.

## Acceptance record

The capture package and replay stamps identify implementation `ed432eb14a2bd22136429d610451275eea30ff51`. The branch adds the evidence and test sources afterward so the receipts can cite an immutable runtime. Across the candidate and published packages, the three HTML stamps, the Crash Lab scene and the new panel module account for every runtime difference. The vendor files match all twelve upstream Git blobs at the pinned commit. [Native WebGL captures, receipts and timings](evidence/co-crack-001/README.md)

The implementation package contains 81 files. The separately rebuilt offline ZIP passed verification and its extracted runtime bytes matched the standalone site. The archive SHA-256 is `f313623a597eea7c5f15a76f231c91ae8f1314e72e6568e7b9415b39e69f5102`. The read-only public verification matched the 80 files and MIME types of deployed v1.1.0. Candidate public browser checks follow owner-approved integration through the existing Pages workflow. [Pages verification](pages.md#production-verification-and-troubleshooting)

Node v22.18.0 passed all 255 tests, including 45,225 matching legacy ticks across six course and environment combinations. Python 3.14.4 passed the offline release test. The browser-shard contract and all seven real browser shards passed. Each shard used Chrome 158 with SwiftShader against the extracted archive under `/Circuit-Overdrive/`.

Native Chrome 158.0.8127.36 on a Ryzen 9 5950X and RTX 5060 Ti ran eight full cycles at 1920 × 1080. Across 7,664 frame intervals, every trial's median was 16.7 ms, p95 ranged from 16.7 to 16.8 ms, and the worst was 16.8 ms. The v1.1.0 run with the same probes had the same frame interval range. GPU timings below describe full scene draws on sampled frames. The candidate column shows the range of eight trial medians. CPU numbers are the longest observed generation call per mesh, measured with Chrome's clock. [Environment and timing receipts](evidence/co-crack-001/README.md)

| Trial | GPU median v1.1.0 → candidate, ms | Worst CPU generation v1.1.0 → candidate, ms | Impact/reset uploads v1.1.0 → candidate |
| --- | ---: | ---: | ---: |
| Wall | 0.5521 → 0.5271–0.5317 | 0.1 → 0.2 | 4/4 → 2/2 |
| Glancing | 0.5512 → 0.5182–0.5353 | 0.1 → 0.1 | 5/5 → 2/2 |
| Two-car | 0.5336 → 0.5299–0.5449 | 0.2 → 0.2 | 16/8 → 8/4 |

The largest per-trial GPU p95 was 3.773 ms, and the longest GPU sample was 4.313 ms. The two scene sizes retained 17 and 29 WebGL buffers including the sky, up from 10 and 15 in v1.1.0. Both builds retained 19,194 and 24,054 lit vertices and 844,560 and 1,058,400 WebGL buffer bytes. Reset preserved those counts, idle frames performed no uploads, and disposal reached zero retained buffers, bytes and programs. The browser heap measured 4.86–5.42 MB after explicit collection between trials. The candidate recorded no browser errors and restored the damaged wall target after a WebGL context loss with reduced motion enabled. [Candidate resource and restore measurements](evidence/co-crack-001/browser-impact-panels.json)

At fixed poses, the wall, glancing and opposing comparisons changed 23,893, 2,934 and 3,491 pixels by more than two colour levels. Their zero-damage renders reproduced every pixel in the same context. The opposite zones retained their original vertex attributes. Theatre reproduced the live first-impact and final buffer hashes after seek and at two playback rates. [Capture pairs and replay](evidence/co-crack-001/README.md)

## Reproduce and play

Use the commands below from the checkout to build a fresh site and ZIP. This preserves the shared HTML source stamp and the required vendor notices. [Offline guide](offline-release.md) · [Pages and browser workers](pages.md)

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
output=$(mktemp -d)
node --experimental-vm-modules scripts/package-site.mjs "$output/site/Circuit-Overdrive"
python3 scripts/offline-release.py build "$output/offline"
python3 scripts/offline-release.py verify "$output/offline"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$output/site"
```

Open `http://127.0.0.1:8000/Circuit-Overdrive/`, choose **Crash Lab**, then arm and hold W or ↑ through a run. Select **Inspection** and look at the bonnet after the wall, the right door after the rail and both front panels after the opposing collision. Use **Inspect chassis** to select the second car. **Reset trial** restores the clean panels. Save a completed replay, open it in Theatre and seek to the impact, one tick earlier and back again.

Use the existing external Playwright module and Chrome for the native panel harness. It defaults to eight three-trial cycles. To play the included tapes, build the package in a detached checkout of the recorded runtime revision. Run the harness from the branch containing the tests and set `REPLAY_REVISION` to the commit served by the package. Set `BASELINE=1` when serving isolated v1.1.0 to measure the published scene with the same probes. The existing controller shard also drives all three experiments using the package and a read-only trial probe. [Crash Lab browser test](../tests/browser-crash.mjs)

```sh
export REPLAY_REVISION=$(git rev-parse HEAD)
export CHROME_BIN=/usr/bin/google-chrome
export PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs
export EVIDENCE_DIR=$(mktemp -d)
node tests/browser-impact-panels.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

## Six-car derby presentation

Total Destruction creates six independent body rigs with the existing CO-CRACK-001 geometry and deformation functions. Each rig reads the front, rear, left and right channels from its own world body. The zone cache updates a layer only when its accepted channel changes. Reset and context restoration derive clean or damaged geometry from those same values.

The arena retains one tyre, one rim and one glass mesh for the fleet. Its independent mutable body buffers cover shell, combined trim and livery, and lamps. The high LitRenderer profile caps the scene at 256 meshes, 256 draws per frame and 600,000 retained vertices. Collision bursts share one small mesh, with at most eight live flashes drawn for ten accepted ticks.

# Machine Shop native performance and resource record

CO-014F measures the actual upgraded owned-car workload on **AMD Ryzen 9 5950X / NVIDIA GeForce RTX 5060 Ti**, driver **595.99.02**, Ubuntu **26.04.1 LTS**, Linux **7.0.0-43-generic**. Chrome **158.0.8127.36** reported **ANGLE NVIDIA OpenGL ES 3.2**. This is native hardware evidence, separate from the software-browser functional suites.

The quiet run used the independently verified, extracted offline ZIP at game source **`5454e365fc39bd4400df4c8f7a0e6818ca5cc2c9`**, with unchanged VANILLAJS **`9d95d74b355ec17add32db0b55f0f71130f9c004`**. The ZIP SHA-256 is `6ccaea2a3a6e5bd093b80d9cdc22a40e55739a00efe60804e2865dd613cf02c3`. The observer script was committed with SHA-256 **`9c5254c981eb73d834acd10dc9349347a696ebf9321b1c6dd716242b53ae7082`**. No application module or accepted simulation state was rewritten for profiling.

[Complete native receipt](evidence/co-014f/native-performance.json) retains every original parsed field, including frame samples, source/build identities, resource counters, heap series, audio observations and screenshot hashes. The review copy uses compact JSON; removing its `rawArtifact` field reproduces a value deeply equal to the original report. The original artifact is **1,056,696 bytes**, SHA-256 **`ae51a29b6c82a20e8a90e08de324fc501b164f398015f7b2ed98b0bbb2024276`**. [Executed native log](evidence/co-014f/native-performance.log) · [Overall certification](co-014-acceptance.md)

## Actual workload

The native viewport was **1920×1080**, at approximately one device pixel per CSS pixel. The actual showroom drawing buffer was **1400×989**; the Proving Grounds and dedicated replay viewer each used **1500×1026**. The sidebar and header occupy the remaining viewport area. These results do not claim a 1920×1080 scene framebuffer.

The production controls created a Garage, bought Cinder Two and confirmed all nine fitted slots: street engine, ducted intake, flow exhaust, short gearbox, adjustable final drive, performance tyres, adjustable suspension, quick steering and midnight paint. Final-drive, spring, damper, travel and steering trims were each +1. The exact accepted build and inventory are retained in the receipt. Its owned identity remained `car-000001`, with **360 credits**, through every test, recording, seek, context event and return to the shop. No fictitious credits, upgrades, positions or benchmark outcomes were injected.

Before the repeated workload, **all six stock models** spawned and drove at least 60 accepted calls through real keyboard input on the native GPU, with source-bound captures of their original silhouettes. These are native admission/visual checks; the separate physical and browser certification receipts provide the full four-test stock benchmark matrix. Yardhand's rear bumper reaches the lower edge of the close chase view; the High camera provides a wider full-vehicle inspection view. This framing does not change its geometry or contact authority.

The profiler then completed **eight workshop → owned test → recording → viewer → return cycles**. Each owned acceleration run used the actual saved upgraded build and the same 900-call reference tape. Every run measured **6.782274774487981 s to 100 km/h**, with identical accepted terminal results and native v7 bytes. Each viewer independently admitted that recording, played accepted commands, sought to tick 900 and reproduced its terminal result. The recorded build, not a live garage lookup, supplied replay physics.

## Measured timings

The tables use nearest-rank quantiles. Raw samples and per-cycle summaries remain in the receipt.

| Observation | Samples | Median | p95 | Worst |
| --- | ---: | ---: | ---: | ---: |
| Owned driving RAF intervals | 7,219 | 16.7 ms | 16.8 ms | 34.5 ms |
| Owned driving whole callback CPU | 7,227 | 0.7 ms | 2.4 ms | 9.4 ms |
| Owned driving GPU elapsed | 7,218 valid | 0.741 ms | 1.159 ms | 10.316 ms |
| Replay RAF intervals | 988 | 16.7 ms | 16.7 ms | 22.5 ms |
| Replay whole callback CPU | 996 | 0.7 ms | 1.0 ms | 1.8 ms |
| Replay GPU elapsed | 996 valid | 1.122 ms | 2.557 ms | 3.418 ms |
| Stationary workshop RAF intervals | 952 | 16.7 ms | 16.8 ms | 24.3 ms |
| Workshop section/camera event dispatch | 104 | 1.1 ms | 1.4 ms | 1.7 ms |
| Isolated accepted-build compilation | 64 | 0.1 ms | 0.2 ms | 0.3 ms |
| Isolated facility/vehicle geometry generation | 16 | 2.7 ms | 6.8 ms | 6.8 ms |
| Isolated vehicle physics accepted call | 600 | 0.2 ms | 0.3 ms | 0.4 ms |

Workshop click-to-next-callback completion medians ranged **15.2–15.9 ms** across cycles; per-cycle p95 ranged **16.6–23.5 ms**, with **23.5 ms** worst. This includes input dispatch and scheduling, and ends at JavaScript callback completion, not compositor presentation. The 960 stationary workshop callbacks submitted only eight drawn frames, so an idle RAF cadence is not presented as continuous scene-render throughput.

The measured median cadence is approximately 60 Hz. **The 34.5 ms driving frame and the observed selection tails do not establish a locked 60 FPS or one-frame interaction guarantee.** GPU time, callback CPU and compositor cadence are distinct. This receipt does not attribute an individual longer interval to a subsystem without further evidence.

Whole callback CPU includes the production frame's physics, input, UI, audio and render work plus nested observer overhead. The isolated solver/compilation/geometry samples are separately executed calls to the actual packaged modules using the actual accepted saved build. They are **not** a measured decomposition of a live production callback. The solver sample warms 120 calls and individually times the next 600; each accepted call is 1/60 s and the pinned solver internally uses four 1/240 s substeps. Compilation has one warmup and 64 measured calls; geometry has one warmup and 16 measured calls. Browser timer precision can yield zero-valued sub-millisecond samples; this does not mean the work is free.

GPU elapsed uses asynchronous `EXT_disjoint_timer_query`, spanning the first scene clear through callback completion. One owned-driving query was discarded at deliberate context loss; discarded samples are not fabricated or included as valid timings. GL draw-call submission timings omit other rendering CPU work. Observational RAF/WebGL wrappers add overhead, which remains part of the measured environment.

## Resources, audio and memory

Every upgraded driving/viewer scene retained **19 actual GPU buffers**, **503,472 uploaded buffer bytes** and **two programs**. The 18 scene meshes contain **11,442 vertices**; the renderer's additional sky triangle accounts for the remaining buffer bytes. Ordinary driving added no mesh uploads. The intentional Proving Grounds context restoration added 19 uploads, as expected when rebuilding that scene.

All nine closed-workshop observations, taken through the actual **Close** control before reopening for the next test-drive entry, had **zero live showroom buffers, programs and retained bytes**. Counters track the Garage, Proving Grounds and proving viewer canvases; they do not count the independent racing-menu scene. Whole-document navigation and browser realm reclamation are not misrepresented as explicit `deleteBuffer` calls or summed into invented global GPU totals. Context-invalidated objects are counted separately from explicit deletion.

The Proving Grounds context recovery took **151.38 ms**; the viewer recovery took **126.53 ms**. Both wall times include the intentional **100 ms lost-context interval** and automation/scheduling, rather than claiming those totals are device reconstruction CPU cost. Accepted vehicle state was retained; graphics restoration required fresh controls, and the eight 900-call results remained identical.

Across the owned test cycles, **1,889 native AudioBufferSources were created and all 1,889 ended**, leaving zero queued live voices after pause. Resume reused one gesture-created AudioContext per Proving Grounds document. `TouringAudio.stop()` intentionally retains that pooled context while stopping voices and scheduling a fade to zero; it does not promise to close a context on every pause. Native fade targets, context states and intrinsic gain values are recorded. An intrinsic `AudioParam.value` is not used as an output-level meter. Zero live buffer voices establishes stopped output for this buffer-source audio path; no human listening or speaker-quality claim is made.

Post-GC closed-workshop V8 heap used **6,490,812 bytes** before the first driving cycle and **5,945,504 bytes** after the final close, a change of **−545,308 bytes**. Intermediate closed values settled around 6.26 MB and are retained individually. This is bounded eight-cycle evidence, not proof of unlimited-session leak freedom. CDP V8 heap usage is not total browser, compositor, graphics-driver or GPU memory. Observation arrays were released before each GC/heap reading.

The full run made **1,305 same-origin requests**, with **zero external requests, browser errors or console warnings**. It preserves the exact accepted ownership serialization and all matching-source replay results.

## Reproduce

Use a clean checkout of the declared source and its source-stamped standalone package, or extract the independently verified matching offline ZIP. Serve it under `/Circuit-Overdrive/`. Use an otherwise idle native desktop and run only one profiler at a time; complete software browser and CPU-heavy certification jobs first.

```sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/native-site/Circuit-Overdrive
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/native-site
```

In another terminal:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs \
CHROME_BIN=/usr/bin/google-chrome \
SOURCE_SHA=5454e365fc39bd4400df4c8f7a0e6818ca5cc2c9 \
EVIDENCE_DIR=/tmp/new-native-evidence \
MACHINE_PERF_SOFTWARE=0 MACHINE_HEADFUL=1 MACHINE_PERF_CYCLES=8 \
node tests/browser-machine-performance.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

The driver is optional development tooling installed outside the game. Native mode asserts an actual NVIDIA renderer and eight complete cycles. `MACHINE_PERF_SOFTWARE=1 MACHINE_PERF_CYCLES=1` provides a **1280×720 functional smoke only**, explicitly marked non-native; its results cannot substitute for this native run. A later evidence commit or merge receives a new source stamp and needs its own release archive verification. Owner play-through and final post-merge release checks remain owner-controlled.

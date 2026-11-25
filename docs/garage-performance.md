# Garage native performance and resource record

CO-013E measures the actual **After Hours Motor Works** page in native Chrome on
the Ryzen 9 5950X / RTX 5060 Ti test machine. The browser viewport is 1920×1080 at
approximately one device pixel per CSS pixel. The production sidebar and header
occupy part of that viewport; the report separately identifies the real showroom
canvas and drawing-buffer dimensions. This is not a claim that the canvas itself
fills a 1920×1080 framebuffer.

## Executed native measurements

Two sequential quiet runs completed with exit 0 against the independently
verified offline ZIP at source **`66db7fee84d389f152ef53b6801e4b51031fd0ef`**.
The source and all measured values are retained in [run 1](evidence/co-013e/native-performance-run1.json)
and [run 2](evidence/co-013e/native-performance-run2.json). Chrome was
**158.0.8127.36**, on Ubuntu 26.04.1 / Linux 7.0.0-43-generic, AMD Ryzen 9 5950X
and NVIDIA RTX 5060 Ti (driver 595.99.02). The actual renderer reported
**ANGLE NVIDIA OpenGL ES 3.2**. Each run made 81 same-origin requests with no
external requests or browser errors. Source and modules were not transformed.

Both measured the actual **1920×1080 viewport** and **1400×989 showroom drawing
buffer**, with the remaining space occupied by the production UI. The viewport
used a browser-reported device scale of approximately 1.0.

| Observation | Run 1 | Run 2 |
| --- | ---: | ---: |
| Stationary callback samples | 360 | 360 |
| Stationary interval median / p95 / worst | 16.7 / 16.7 / 16.8 ms | 16.7 / 16.7 / 16.8 ms |
| Stationary mean callbacks per second | 60.001 | 60.002 |
| Switching callback samples / actual drawn frames | 720 / 240 | 720 / 240 |
| Switching interval median / p95 / worst | 16.7 / 22.6 / 24.9 ms | 16.7 / 22.2 / 25.0 ms |
| Switching mean callbacks per second | 60.851 | 59.089 |
| Draw-frame JavaScript callback median / p95 / worst | 0.4 / 0.6 / 0.9 ms | 0.4 / 0.5 / 0.7 ms |
| Summed GL draw-call submission p95 | 0.1 ms | 0.1 ms |
| GPU elapsed median / p95 / worst | 1.083 / 2.267 / 5.991 ms | 1.098 / 2.333 / 2.825 ms |
| Valid asynchronous GPU samples / discarded | 240 / 0 | 240 / 0 |
| Click to JavaScript draw completion median / p95 / worst | 14.9 / 15.6 / 21.3 ms | 15.1 / 15.6 / 16.2 ms |
| Isolated geometry generation median / p95 | 4.9 / 7.4 ms | 4.8 / 7.6 ms |
| Eight reopen observations, median / worst | 121.4 / 123.1 ms | 114.7 / 122.5 ms |
| Context restoration wall time, including deliberate loss delay | 345 ms | 394 ms |
| Post-GC closed heap before cycles | 6,175,724 bytes | 6,174,168 bytes |
| Post-GC closed heap after restoration | 6,155,836 bytes | 6,156,904 bytes |

The target's approximately 60 Hz median cadence was observed. **The interactive
p95 intervals were 22.2–22.6 ms, so these samples do not establish a locked 60 FPS
frame-tail guarantee.** No interval exceeded 25 ms in these bounded runs. The
reported GPU and callback costs are distinct from compositor/presentation
cadence; the test does not attribute the longer intervals to a particular
subsystem without further evidence. Owner play-through remains part of release
acceptance.

Both runs retained exactly 42 buffers, 788,592 uploaded bytes and two programs
through all 48 model/192 camera changes. The idle period submitted zero draws
and uploads. At the end, 462 buffers had been created across the complete
lifecycle, 420 explicitly deleted and 42 invalidated by context loss, leaving
**zero live showroom buffers or retained bytes**. Twenty of 22 programs were
explicitly deleted and two invalidated, leaving **zero live programs**. All
inspection/lifecycle actions preserved the complete accepted garage save.

The final closed heap was 19,888 bytes lower than its initial sample in run 1
and 17,264 bytes lower in run 2. This bounded series shows no retained heap
increase over the complete run; it does not establish unlimited-session leak
freedom. Raw per-cycle open/closed heap readings are included in each receipt.

## Reproduce the measurement

Package the committed source and serve the complete site under
`/Circuit-Overdrive/`. Use an otherwise idle desktop and run one profiler at a
time. The test creates a fresh browser profile; it does not modify an existing
personal garage. Set `PLAYWRIGHT_MODULE` to an already installed Playwright ES
entry and `CHROME_BIN` to the installed Chrome binary.

```sh
SOURCE_SHA=EXACT_COMMITTED_SHA EVIDENCE_DIR=NEW_EVIDENCE_DIRECTORY \
  node tests/browser-garage-performance.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

The default uses headful native Chrome with GPU rendering enabled. It rejects
SwiftShader, llvmpipe and other reported software renderers. `GARAGE_HEADFUL=0`
can run a separately identified headless diagnostic. `GARAGE_PERF_SOFTWARE=1`
is explicitly a software functional check and cannot provide native GPU
acceptance. No runtime npm dependency or game build infrastructure is added.

The runner emits `garage-performance.json` and a source-bound screenshot.
The final certification receipt and source identity are linked from the
[CO-013E acceptance record](co-013-acceptance.md). Any update to the observed
source or harness requires a new measurement rather than relabelling an older
receipt.

## What is measured

All application modules are fetched unchanged from the package. Observational
wrappers around the real animation callbacks and WebGL calls are installed only
in the development runner. They never substitute a command, owned inventory,
balance, transaction outcome, scene or application clock. Four real confirmed
600-credit purchases create the full garage used in the workload.

The workload contains 360 stationary animation callbacks, eight complete
six-model catalogue cycles with all four camera presets, eight garage
close/reopen cycles and an actual WebGL loss/restoration. This produces 48 model
selections and 192 camera selections. Every requested view must cause a real
draw. The entire accepted local save must remain identical after inspection and
resource lifecycle work.

Timing fields have separate meanings:

| Field | Meaning and limits |
| --- | --- |
| RAF intervals | Timestamp gaps between actual production main-loop callbacks; median, p95, worst and raw samples are retained. A stationary garage does not redraw every callback. |
| Callback CPU | JavaScript wall time for the whole production frame callback, including observer overhead, input/menu checks and any draw submission. |
| GL draw-call submission | Sum of measured `drawArrays`/`drawElements` call durations. This omits material validation, uniforms and other CPU work, so it is not total scene CPU cost. |
| GPU elapsed | Asynchronous `EXT_disjoint_timer_query` interval from the first garage clear through the end of that production callback. Unsupported queries are reported absent; disjoint samples are discarded. |
| Action to draw | DOM click dispatch to completion of the next JavaScript render callback. This is not compositor presentation latency. |
| Geometry CPU | Sixteen isolated calls to the actual packaged pure geometry generator after one warmup. This is separately labelled and does not represent live constructor latency. |
| Reopen wall time | Automation-observed open-to-drawn time, including Playwright/IPC waits. |
| Restore wall time | Loss-to-restored-draw time, including a deliberate 100 ms lost-context interval. |

Browser timer precision can produce zero-valued sub-millisecond CPU samples;
that does not mean the work is free. Reported p95 and worst intervals retain
operating-system/compositor variation. A mean or median near 60 callbacks per
second does not establish a flawless 60 FPS lock.

## Resource and memory authority

The original scene retains 41 meshes, 17,922 vertices and 788,568 mesh-buffer
bytes. Including the renderer's sky triangle, it owns 42 live GPU buffers,
788,592 uploaded bytes and two shader programs. A full four-bay view plus the
inspection platform submits 39 mesh draws and one sky draw.

Real WebGL allocation, binding, upload, deletion and context events are counted.
All 48 catalogue selections and 192 camera changes must preserve allocation and
upload counts. Stationary callbacks must not add draws, buffers or uploads.
Context loss invalidates its objects even though the browser does not call
`deleteBuffer` for them, so invalidated objects are accounted separately from
explicit disposal. Closing the garage must leave zero live showroom buffers,
programs and retained bytes; the independent race canvas remains owned by its
existing scene.

Chrome DevTools Protocol collects garbage and reports V8 heap usage for each
open/closed cycle. This identifies observed JavaScript memory behaviour; it is
not total browser, compositor, graphics-driver or GPU memory. Timing observation
arrays are released before the heap series. The measurements cover a bounded
eight-cycle run and must not be described as proof of unlimited-session freedom
from leaks.

The garage does not run a racing simulation, so these frame and resource
measurements cannot certify racing physics cost or modify any 60 Hz race result.
The separate source/tick/browser regressions establish that boundary.

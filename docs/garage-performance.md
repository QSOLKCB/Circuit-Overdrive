# Garage native performance and resource record

CO-013E measures the actual **After Hours Motor Works** page in native Chrome on
the Ryzen 9 5950X / RTX 5060 Ti test machine. The browser viewport is 1920×1080 at
approximately one device pixel per CSS pixel. The production sidebar and header
occupy part of that viewport; the report separately identifies the real showroom
canvas and drawing-buffer dimensions. This is not a claim that the canvas itself
fills a 1920×1080 framebuffer.

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

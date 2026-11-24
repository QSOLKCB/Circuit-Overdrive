# CO-009 native performance

Nitro Skyway frame timing used source `3d0f8b10512fbdae17b5fbe0bcd9f1d6ee11a320`, including the peripheral boost streaks. A separate package of published v0.8.0, `8204da56fce6b40ab33cb66c684a2e780f3e3001`, supplied a fresh Speedway day reference on the same machine. Both were served from loopback and exercised through Chromium's keyboard input path. [Raw measurements](evidence/co-009d/native-performance.json) · [v0.8.0 Nightshift measurements](co-008-acceptance.md#performance)

## Hardware and timing

The AMD Ryzen 9 5950X and NVIDIA GeForce RTX 5060 Ti ran Ubuntu 26.04.1 LTS, driver 595.99.02, Chrome 158.0.8127.36 and Playwright 1.64.0. ANGLE reported OpenGL ES 3.2 on NVIDIA. The drawing buffer was 1920 × 1080 with the high renderer profile and full effects. Each course had six physical cars. The Skyway driver earned 31.320 energy units, spent 31.320, launched 3 times, landed 3 times and settled 3 stunt awards during the measured drive.

Native animation callbacks provided the frame intervals. Physics ticks count the accepted 60 Hz updates between those callbacks. The grid window requires all six interpolated car centres inside the camera frustum. CPU submission times cover the call to draw the scene. GPU execution uses asynchronous WebGL timer queries every eighth draw in the station range, discarding disjoint samples. HUD processing, browser compositing and simulation sit outside these scene cost measurements. The raw record includes the sample counts, p95 CPU/GPU costs and maximum catch-up ticks per frame. Frame intervals are rounded to 0.1 ms here.

### Nitro Skyway

| Section | Frames | Median ms | p95 ms | Worst ms | Physics ticks | CPU median ms | GPU median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| six-car grid | 84 | 16.7 | 16.8 | 16.8 | 84 | 0.70 | 1.23 |
| copper drift bend | 320 | 16.7 | 16.8 | 16.8 | 320 | 0.80 | 1.30 |
| boost straight | 187 | 16.7 | 16.8 | 16.8 | 187 | 0.60 | 1.04 |
| Copper Step launch and catch | 137 | 16.7 | 16.7 | 16.8 | 137 | 0.60 | 1.01 |
| Signal Crown launch and catch | 163 | 16.7 | 16.7 | 16.8 | 163 | 0.50 | 1.03 |
| final ramp approach and landing | 258 | 16.7 | 16.7 | 16.8 | 258 | 0.50 | 0.99 |

### Published Speedway day reference

| Section | Frames | Median ms | p95 ms | Worst ms | Physics ticks | CPU median ms | GPU median ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| speedway six-car grid | 133 | 16.7 | 16.8 | 16.8 | 133 | 0.70 | 1.42 |
| six-car close racing | 155 | 16.7 | 16.8 | 16.8 | 155 | 0.60 | 1.28 |
| speedway banked turn | 162 | 16.7 | 16.7 | 16.8 | 162 | 0.60 | 1.23 |

The course sections exercise different geometry, driving inputs and scenery. These samples allow comparison of the shipped experiences. They cannot isolate the cost of a single gameplay or rendering change.

## Resource endurance

Resource endurance used source `11d8d4759621b542f4692a2d59447fdc8f273cfb`, before the boost effect. The runtime diff to the timed source contains 13 added CSS lines in `src/style.css`. A single 960 × 540 browser page completed eight cycles of course selection, grid start, acceleration, pause, restart and return to the menu. The sequence alternated Skyway, Ridge at night, Skyway and Speedway by day twice. WebGL buffer storage and linked program counts returned to the same per-course values on every revisit.

| Selected course | Retained buffers | Buffer bytes | Programs |
| --- | ---: | ---: | ---: |
| Skyway day | 39 | 5,285,568 | 2 |
| Ridge night | 121 | 14,606,496 | 3 |
| Speedway day | 19 | 4,731,036 | 2 |

The audio device allocated eight reusable PCM buffers. The peak was 6 simultaneously scheduled sources and all 894 started sources ended. After explicit garbage collection, the observed JS heap ranged from 5,261,816 to 6,672,204 bytes. Buffer storage records WebGL array-buffer allocation and excludes the framebuffer and driver overhead. Heap size can vary between collections.

## Reproduction

Use the source-matched packages and browser setup in the [Pages guide](pages.md#reproduce-browser-verification). Set `CHROME_BIN` and `PLAYWRIGHT_MODULE` to the local browser and driver. Each URL points to the respective served package.

```sh
REPLAY_REVISION=8204da56fce6b40ab33cb66c684a2e780f3e3001 node tests/browser-frames.mjs "$BASE_URL"
REPLAY_REVISION=3d0f8b10512fbdae17b5fbe0bcd9f1d6ee11a320 node tests/browser-frames.mjs "$TIMING_URL" --skyway
NATIVE_GL=1 REPLAY_REVISION=11d8d4759621b542f4692a2d59447fdc8f273cfb node tests/browser-endurance.mjs "$ENDURANCE_URL" --skyway
```

# Orbital Spine native performance

Chrome 158.0.8127.36 drove six racers on the native GeForce RTX 5060 Ti at 1920 × 1080 with full effects. The Orbital Spine package came from the verified offline ZIP for `6517d7ffada3e1e288398d5410f8564ac22b14ec`. A fresh package of published v0.9.0 at `f7f45d1b6c3521dd728945b71cf20ab406603cb4` supplied the Nitro Skyway reference. [Raw measurements](evidence/co-010e/native-performance.json)

The change from the measured revision to PR D commit `b52e06b54754e1aa82f6ce247138923338f22b29` updates `tests/replay.test.mjs` and `tests/rocket-replay.test.mjs`. The tracked HTML, runtime modules, courses and vendor sources also match certification commit `6523dd5`.

## Frame timing

The host ran Ubuntu 26.04.1 LTS, Linux 7.0.0-43-generic and NVIDIA driver 595.99.02 on a Ryzen 9 5950X. Playwright 1.64.0 launched Chrome with ANGLE OpenGL. Both packages used the high renderer profile, six physical vehicles, a 1920 × 1080 WebGL drawing buffer, the default chase camera and sound enabled. The browser received digital keyboard events through the game input handlers.

The table counts successive animation callbacks within each named station range. Physics CPU covers the complete fixed-step six-car race update. Draw CPU measures JavaScript command submission for the scene. GPU time comes from asynchronous WebGL1 `EXT_disjoint_timer_query` queries sampled every eighth draw. The runner discards disjoint queries. HUD updates, audio, compositing and browser scheduling contribute to frame intervals outside these timed calls. CPU measurements inherit Chromium’s clock resolution.

| Orbital section | Intervals | Median / p95 / worst interval (ms) | Physics ticks | Six-car physics median / p95 (ms) | Draw CPU median / p95 (ms) | GPU median / p95 (ms) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Mass driver | 249 | 16.7 / 16.8 / 16.8 | 249 | 1.40 / 1.60 | 0.30 / 0.40 | 0.83 / 1.02 |
| Azimuth bank through counterbank | 286 | 16.7 / 16.7 / 16.8 | 286 | 1.50 / 1.70 | 0.30 / 0.40 | 0.82 / 1.02 |
| Radial elbow | 148 | 16.7 / 16.8 / 16.8 | 148 | 1.40 / 1.60 | 0.30 / 0.30 | 0.78 / 0.90 |
| Antenna wall | 85 | 16.7 / 16.7 / 16.8 | 85 | 1.30 / 1.50 | 0.30 / 0.40 | 0.78 / 0.90 |
| Crown elbow | 116 | 16.7 / 16.8 / 16.8 | 116 | 1.20 / 1.50 | 0.30 / 0.30 | 0.82 / 1.10 |
| Inverted spine | 320 | 16.7 / 16.8 / 16.8 | 320 | 1.30 / 1.40 | 0.30 / 0.40 | 0.74 / 0.86 |
| Return elbow through earthward wall | 184 | 16.7 / 16.8 / 16.8 | 184 | 1.30 / 1.50 | 0.30 / 0.40 | 0.78 / 0.92 |
| Gravity well through escape bank | 338 | 16.7 / 16.8 / 16.8 | 338 | 1.30 / 1.50 | 0.30 / 0.40 | 0.76 / 0.98 |
| Launch apron through catch deck | 310 | 16.7 / 16.8 / 16.8 | 310 | 1.40 / 1.60 | 0.30 / 0.40 | 0.76 / 1.26 |

The nine windows contained 2,036 frame intervals. All six cars were still racing throughout. The ascending wall produced 86 attached ticks and the inverted straight produced 321. The launch-to-catch window included 28 boost ticks, 52 airborne ticks, one accepted dodge and one landing. The player completed this section without recovery.

## Same-host v0.9.0 reference

| Nitro Skyway section | Intervals | Median / p95 / worst interval (ms) | Draw CPU median / p95 (ms) | GPU median / p95 (ms) |
| --- | ---: | ---: | ---: | ---: |
| Six-car grid | 84 | 16.7 / 16.7 / 16.8 | 0.90 / 1.60 | 1.57 / 2.60 |
| Copper drift bend | 320 | 16.7 / 16.7 / 16.8 | 0.80 / 0.90 | 1.34 / 1.52 |
| Boost straight | 187 | 16.7 / 16.8 / 16.8 | 0.60 / 0.70 | 1.07 / 1.41 |
| Copper Step launch and catch | 137 | 16.7 / 16.7 / 16.8 | 0.60 / 0.80 | 1.05 / 1.31 |
| Signal Crown launch and catch | 163 | 16.7 / 16.7 / 16.8 | 0.50 / 0.60 | 1.06 / 1.14 |
| Final ramp approach and landing | 258 | 16.7 / 16.8 / 16.8 | 0.50 / 0.60 | 1.04 / 1.12 |

Section-median GPU draw times covered 0.74–0.83 ms on Orbital Spine and 1.04–1.57 ms on Nitro Skyway. The courses differ in geometry, cameras, physics, traffic positions and driving inputs. The native frame intervals describe the browser’s presentation cadence. GPU timer queries end before display scanout.

## Restart and course-switch endurance

Each source ran a single 960 × 540 browser page for eight cycles of course selection, grid start, acceleration, pause, restart and return to the menu. The Rocket package repeated Orbital → Ridge Night → Orbital → Nitro Skyway twice. The published reference repeated Nitro Skyway → Ridge Night → Nitro Skyway → Speedway Day twice. CDP garbage collection preceded each heap reading. Resource counts include WebGL1 array buffers, linked programs and Web Audio PCM buffers. Driver-internal storage and the framebuffer are outside the retained byte count.

| Source and selected course | Retained buffers | WebGL array-buffer bytes | Linked programs |
| --- | ---: | ---: | ---: |
| v0.9.0, skyway day | 39 | 5,285,568 | 2 |
| v0.9.0, ridge night | 121 | 14,606,496 | 3 |
| v0.9.0, speedway day | 19 | 4,731,036 | 2 |
| Rocket candidate, orbital day | 13 | 2,693,352 | 2 |
| Rocket candidate, ridge night | 121 | 14,606,496 | 3 |
| Rocket candidate, skyway day | 39 | 5,285,568 | 2 |

Every revisit retained the same WebGL footprint for its course. The Rocket run created 8 reusable PCM buffers, reached 6 simultaneous scheduled voices, and all 858 started sources ended. Post-GC heap ranged from 5,939,520 to 8,155,108 bytes. The release reference created 8 PCM buffers, reached 8 voices, and all 884 sources ended. Its post-GC heap ranged from 5,292,172 to 6,856,912 bytes. These heap ranges describe eight restarts on this browser.

## Reproduce

Serve each source-stamped offline package at its project subpath and set `CHROME_BIN` and `PLAYWRIGHT_MODULE` for the local native browser. The frame runner checks for a native renderer and an exact 1920 × 1080 drawing buffer. The supplied source SHA must match the package revision.

```sh
REPLAY_REVISION=f7f45d1b6c3521dd728945b71cf20ab406603cb4 node tests/browser-frames.mjs "$NITRO_URL" --skyway
NATIVE_GL=1 REPLAY_REVISION=f7f45d1b6c3521dd728945b71cf20ab406603cb4 node tests/browser-endurance.mjs "$NITRO_URL" --skyway
REPLAY_REVISION=6517d7ffada3e1e288398d5410f8564ac22b14ec node tests/browser-frames.mjs "$ROCKET_URL" --orbital
NATIVE_GL=1 REPLAY_REVISION=6517d7ffada3e1e288398d5410f8564ac22b14ec node tests/browser-endurance.mjs "$ROCKET_URL" --orbital
```

# CO-013D — After Hours Motor Works acceptance

The production game menu now opens a usable garage: six original cosmetic
models, four owned-car bays, explicit purchase/sale/selection confirmations,
local persistence, export/import and recovery. The separate showroom has four
camera presets and survives context restoration. v1.3.0 remains a candidate;
the separate E certification and owner acceptance are outstanding.

## Source and scope

| Item | Exact revision |
| --- | --- |
| Base, accepted PR #57 merge | `fff96e99f1021e3147d80d726407ed75c605fa0d` |
| Published v1.2.0 | `e12665b04609f40d452084a37264756a23d730da` |
| Tested implementation | `3c257957d76293dff4f439eedaa98f7d2f13c861` |
| Pinned VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

The evidence commit adds documentation and captures only. No engine upgrade or
donor source copy is introduced. STREET-RACER provenance remains recorded in
the [registry contract](garage-registry.md). Catalogue prices, schemas and the
accepted A–C ownership/transaction/storage authority are unchanged.

`garage-ui.js` presents the real vault, validates imports before confirmation,
shows saved state only after acknowledged commitment, reconciles replaced
vehicle histories and cancels obsolete asynchronous file reads. Confirmations
default to Cancel. Held keyboard/controller activation cannot cross menu,
focus or confirmation boundaries to buy a car.

`garage-geometry.js` and `garage-scene.js` own six original cosmetic silhouettes,
the workshop and retained rendering. `garage-experience.js` handles the separate
canvas lifecycle and demand rendering. `main.js`, `index.html` and `garage.css`
connect the menu, accessible controls, responsive layout and graphics fallback.
No garage model enters a race recipe, command, replay, damage or result path.

The allowlist includes the complete local dependency closure. The browser
runner adds the garage to the existing lifecycle lane, retains all preceding
suites and leaves protected workflows unchanged. Offline launch instructions
and the player, protocol, roadmap and showroom guides describe the new workflow.

## Executed verification

- `node --test tests/*.test.mjs`: **358 passed, 0 failed**, including **45,225
  matching legacy ticks across six course/environment combinations**. The
  completed run exited 0 in 260.126 seconds at the tested implementation.
- Focused garage suite: **49 passed**, including the existing generated
  transaction sequences and three geometry/resource/lifecycle tests.
- `python3 tests/test_offline_release.py`: **1 passed**.
- `bash tests/browser-pages-shards.sh`: passed command/evidence inventory and
  failure propagation. This command checks orchestration, not seven live jobs.
- Whitespace and JavaScript syntax checks passed.
- Fresh static package, independent ZIP build/rebuild verification and extracted
  equality passed: **103 runtime files**, with only `RELEASE.json` and
  `START-HERE.txt` added to the archive.
- Actual extracted-ZIP Speedway and Ridge browser smoke, gamepad and touch
  suites passed. They exercised race start, accepted driving, pause/resume,
  focus/disconnect handling, restart, graphics recovery and relevant fallback.
  These ran at `656faf685854671e1d4aa891bf119f3d1dfe45a5`; the final tested
  revision changes only two test harnesses from that source, with identical
  production runtime bytes before source stamping.
- [v1.2.0 source comparison](evidence/co-013d/legacy-source.json): **83 existing
  source/vendor files are byte-identical**, with the reviewed `main.js` menu
  adapter the sole existing source change. Crash Lab, Derby, championships,
  touring/Nitro/Rocket physics and replay v2–v6 authority are unchanged.

The historical runner previously asserted the entire main menu was byte-identical
to v1.0.0. D records that reviewed presentation change separately while retaining
the exact simulation/input/replay module comparisons and full 45,225-tick
six-course/environment state comparison. Synthetic-controller browser tests
wait for actual report polls instead of assuming a 100 ms wall-time delay.

## Actual production browser acceptance

The [native receipt](evidence/co-013d/native-browser.json) and
[software receipt](evidence/co-013d/software-browser.json) each bind **12 scenarios**
and capture hashes to the tested source. Both completed with exit 0. The suite uses ordinary menu buttons,
keyboard/touch/controller actions, native Web Locks, file inputs and Blob
downloads. It never injects valid ownership, credits or transaction outcomes.
Storage service failures and synthetic standard-controller reports are explicit
test fixtures; they exercise the real application paths.

Coverage includes first purchase and reload; four affordable cars; unavailable
fifth/unaffordable purchases; active selection and sale; backup/export/import;
invalid-file rejection; cancelled delayed file reads; conflicting tabs and
reconciliation; imported histories reusing a serial with another model; held
Enter and Space across focus changes; quota failure; missing Web Locks; touch;
and both showroom-only and global WebGL failure with working HTML transactions.

Environment: Ubuntu 26.04.1 LTS, Linux 7.0.0-43-generic, Node 22.18.0, Python
3.14.4 and Chrome **158.0.8127.36**. The native run used the AMD Ryzen 9 5950X,
NVIDIA GeForce RTX 5060 Ti, driver 595.99.02 and ANGLE OpenGL ES 3.2. It completed
with **729 requests, no external requests and no browser errors**.
The separate headless software run used ANGLE Vulkan/SwiftShader and recorded
the same scenario count, request count and resource invariants without errors.

Five native captures are committed below; the full runner emits 15 hashed
captures, including import errors, conflicts and the restored save. CI retains
the complete set in its garage evidence directory.

| Capture | Accepted observation |
| --- | --- |
| [Empty garage](evidence/co-013d/empty-garage.png) | Confirmed new save; four empty bays and 2,400 credits |
| [Purchase confirmation](evidence/co-013d/purchase-confirmation.png) | Exact price, destination and future balance before commitment |
| [Four bays full](evidence/co-013d/four-bays-full.png) | Four actual Cinder purchases and separate inspection platform |
| [Yardhand preview](evidence/co-013d/showroom-yardhand.png) | Original pickup geometry and stock finish |
| [Mobile garage](evidence/co-013d/mobile-owned-garage.png) | Touch purchase and reduced-motion side camera |

## Resources and practical limits

The retained scene owns **41 meshes, 17,922 vertices and 788,568 vertex bytes**,
plus the renderer's sky buffer: **42 live buffers**, **788,592 uploaded bytes**
per scene creation. A full garage submits 39 mesh draws plus sky. Eight complete
six-model/four-camera cycles create no new buffers or uploads. Idle frames also
draw nothing. Context loss invalidates the old 42 buffers; explicit close and
three reopen/close cycles end with **zero live showroom buffers**. Cumulative
allocation counters are not live resource counts.

This demonstrates native rendering and resource ownership. It is **not** the
final 1920×1080 frame-interval, draw-cost, geometry-time or post-GC performance
certification. Those measurements, the final complete regression evidence and
owner play-through remain E. Workshop lamps use emissive geometry and the
existing directional/ambient renderer, not new shadow-casting lights. Stock
body styles are cosmetic and remain separate from physical vehicle recipes.

Storage is origin-local and requires accessible localStorage plus Web Locks;
unavailable coordination fails closed. Browser acknowledgement is not a backup
against eviction, disk failure or local edits. Global WebGL unavailability
still offers a reachable HTML garage. No cloud, runtime npm package, remote
asset, telemetry, real-money economy, tuning or repair authority is added.

## Offline artifact and reproduction

The verified ZIP is
`Circuit-Overdrive-3c257957d76293dff4f439eedaa98f7d2f13c861.zip`, **860,320 bytes**,
SHA-256 **`bb4789a37d3e073671a3a531e4a14fae4d1dcd8f70775dc78fc09fd8bec76aef`**.
[Package receipt](evidence/co-013d/offline-package.json)

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs NEW_SITE_DIRECTORY
python3 scripts/offline-release.py build NEW_ARCHIVE_DIRECTORY
python3 scripts/offline-release.py verify NEW_ARCHIVE_DIRECTORY
```

Serve the source-stamped package under `/Circuit-Overdrive/`. Set
`PLAYWRIGHT_MODULE` to an existing Playwright `index.mjs`, `CHROME_BIN` to Chrome,
`SOURCE_SHA` to the tested revision and `EVIDENCE_DIR` to a fresh directory, then
run `node tests/browser-garage.mjs BASE_URL`. Defaults use software WebGL;
`GARAGE_NATIVE=1 GARAGE_HEADFUL=1` selects native Chrome. Record the actual
reported renderer rather than assuming the flag proves GPU use.

Owner review: open The Garage, confirm a new garage, inspect each model and
camera, buy a Cinder, reload, fill four bays, select and sell a car, export,
cancel and then confirm an import, reject a corrupt file, and check a second
tab's conflict/reload behavior. Return to a normal race and verify its original
vehicle and controls. See the [player guide](garage-player-guide.md) for recovery.
No self-approval, merge, tag or publication is performed.

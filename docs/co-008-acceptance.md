# CO-008 Nightshift acceptance

The published v0.7.0 baseline is `3295b82004b64328072ac5fa64f8ba2b55394416`. The certification runtime is `2bc4ee997b9d2363c985d4fad53ad07c64a05de9`. The VANILLAJS source remains `9d95d74b355ec17add32db0b55f0f71130f9c004`. These measurements support the v0.8.0 review candidate. Publication requires owner sign-off.

| Review | Implementation measured | Evidence |
| --- | --- | --- |
| [A · Light engine](https://github.com/QSOLKCB/Circuit-Overdrive/pull/26) | `ca15e0f044de81a47bef7cfab60dfc199c6e3a50` | [Native bank, source removed](evidence/co-008a/headlight-proof.json) |
| [B · Nightshift worlds](https://github.com/QSOLKCB/Circuit-Overdrive/pull/27) | `7d49db1e4bef03471c6ef2387849665286ada814` | [Thirteen world inspections](evidence/co-008b/world-inspection.json) |
| [C · Midnight Protocol and race integration](https://github.com/QSOLKCB/Circuit-Overdrive/pull/28) | `a93032559757087b6d8792246ee81caecb005069` | [Driver selection screen](evidence/co-008c/selection.webp) |
| [D · Certification](https://github.com/QSOLKCB/Circuit-Overdrive/pull/29) | `2bc4ee997b9d2363c985d4fad53ad07c64a05de9` | [Native frames](evidence/co-008d/native-frames.json) · [Browser captures](evidence/co-008d/race-captures.json) |

## Driving and replay

Chrome drove the shipping keyboard controls from course select through both night flags. Each run used the six-car field and seed 27. The browser finish runner compared position against a separate six-car simulation while the race was running, compared final classifications and splits, then downloaded and reconstructed the v2 recording.

| Night event | Player time | Recorded ticks including countdown | Splits | Classified at the flag |
| --- | ---: | ---: | ---: | --- |
| Nightshift Speedway | 2:39.533 | 9,752 | 3 laps | Six finishers |
| Redline Ridge — Midnight Descent | 2:32.300 | 9,318 | 7 checkpoints | Six finishers |

For each course, the day and night files downloaded by the browser were byte-identical, including the source stamp and all accepted commands. The four-round inaugural championship then paid 26 points at each flag, exported four reconstructable single-event tapes and awarded the trophy to Kit Vega with 40 points. The campaign exercised reload, a failed save followed by successful persistence, abandonment and repeat settlement. Theatre reconstructed an exact-source Ridge tape and a historical Speedway tape under spectator Nightshift, with bounded seeking and all six follow targets. [Race results and tape hashes](evidence/co-008d/races.json)

An additional Speedway drive on integration source `a93032559757087b6d8792246ee81caecb005069` passed through sixth, fifth, fourth, third, second and first. The player won in 2:07.050. The other five cars were classified as racing at the flag. The downloaded 7,803-tick tape reproduced that outcome.

The four championship recordings contained 8,900, 8,510, 8,900 and 8,510 ticks respectively, including countdown.

The pure equivalence check used seed 708. It steered both day and night reference races into the outside rail, accepted a recovery, then drove to the flag. At 600-tick intervals and at the flag it compared the complete field, including AI decisions, wheel states, gate credit, penalties and classification. The night observer interpolated poses, changed its follow target and alternated the two light budgets. A direct Git comparison found identical course, AI, vehicle, collision and input-recording sources across the v0.6.0, v0.6.1, v0.6.2 and v0.7.0 releases and the candidate. Championship settlement and storage also match v0.7.0. The v2 source stamp identifies a compatible build for playback. It provides no signature or proof of competitive integrity.

Two browser lifecycle runs at the archive root and the course runs under the repository subpath exercised audio activation, mute, settings, reduced motion, blur with a held accelerator, fresh-input resume, pause, camera switch, restart and WebGL context loss/restoration. The night test compared both channels of the first scheduled stereo block sample for sample against the original MIDNIGHT PROTOCOL score. Chrome also exercised controller disconnect under load, neutral re-arming, saved wheel mappings, and touch cancellation in portrait and landscape emulation. Physical device feel and listening remain owner checks.

## Rendering evidence

The moving-light probe submits original Speedway receiver triangles by themselves and holds the camera still. On the native 17° bank, steering the source moved the brightness centroid 105.6 pixels. Translating it 4 m moved the centroid 56.5 pixels. Reversing or removing it restored the forward pavement to its base pixels. The separate controlled world inspection includes both directions at the Ridge portal, the bridge approaches, forest and a recovered grid. Thirteen daytime RGBA readbacks matched v0.7.0 byte for byte in SwiftShader. [Headlight renders](headlights.md) · [World captures and day comparison](night-worlds.md)

At a fixed nine-pixel asphalt sample, increasing light distance to 10, 30, 50, 66 and 74 m produced red-channel gains of 86, 53, 33.3, 8 and 0. Rotating the axis to 0°, 12°, 20°, 26° and 32° produced gains of 61, 61, 39, 4.7 and 0. A separate vertical rail sample gained 232 levels. Malformed and excess sources were rejected before drawing. [Calibration receipt](evidence/co-008d/headlight-proof.json)

The following are full browser screenshots from the running certification package. The capture receipt identifies the source and both the original PNG and published WebP hashes. [Capture receipt](evidence/co-008d/race-captures.json)

| Event | Captures |
| --- | --- |
| Nightshift Speedway | [Starting grid](evidence/co-008d/speedway-starting-grid.webp) · [Bank](evidence/co-008d/speedway-bank.webp) · [Road at speed](evidence/co-008d/speedway-road-at-speed.webp) · [Chequered flag](evidence/co-008d/speedway-finished.webp) |
| Midnight Descent | [Descent](evidence/co-008d/ridge-open.webp) · [Forest](evidence/co-008d/ridge-forest.webp) · [Bridge](evidence/co-008d/ridge-bridge.webp) · [Tunnel entrance](evidence/co-008d/ridge-tunnel-entrance.webp) · [Inside](evidence/co-008d/ridge-tunnel.webp) · [Tunnel exit](evidence/co-008d/ridge-tunnel-exit.webp) · [Chequered flag](evidence/co-008d/ridge-finished.webp) |

## Performance

The native runs used an AMD Ryzen 9 5950X, NVIDIA GeForce RTX 5060 Ti, driver 595.99.02 and Ubuntu 26.04.1. Chrome 158.0.8127.36 reported ANGLE OpenGL ES on the NVIDIA adapter. Each race ran six cars at a 1920 × 1080 drawing buffer, high profile and full effects. The two native drives ran sequentially after the software browser shards finished. The night configuration used fixed fixture lighting and up to two moving beams. The first candidate Ridge process ended before emitting a timing receipt. The Ridge values below come from its completed standalone rerun.

| Course and section | Frames | Night median / p95 / worst (ms) | Day → night CPU submission, median (ms) | Day → night GPU draw, median (ms) |
| --- | ---: | ---: | ---: | ---: |
| Speedway · Six-car grid | 133 | 16.7 / 16.8 / 16.8 | 0.6 → 0.7 | 1.15 → 1.35 |
| Speedway · Six-car close racing | 155 | 16.7 / 16.8 / 16.8 | 0.6 → 0.7 | 1.12 → 1.29 |
| Speedway · Banked turn | 162 | 16.7 / 16.8 / 16.8 | 0.6 → 0.6 | 1.10 → 1.18 |
| Ridge · Six-car start | 164 | 16.7 / 16.8 / 16.8 | 0.7 → 0.9 | 1.27 → 1.49 |
| Ridge · Open descent | 329 | 16.7 / 16.7 / 16.8 | 0.6 → 0.8 | 1.11 → 1.26 |
| Ridge · Forest | 634 | 16.7 / 16.7 / 16.8 | 0.7 → 0.8 | 1.32 → 1.38 |
| Ridge · Bridge | 539 | 16.7 / 16.8 / 16.8 | 0.7 → 0.8 | 1.31 → 1.39 |
| Ridge · Tunnel | 338 | 16.7 / 16.8 / 16.8 | 0.7 → 0.8 | 1.24 → 1.27 |

Frame counts are consecutive animation-frame intervals inside the named sections. Grid intervals require all six car centres in view. Close-racing intervals on Speedway also check vehicle speed and proximity. CPU figures measure JavaScript time to submit the scene, and GPU figures use asynchronous `EXT_disjoint_timer_query` samples of the scene draw every eighth frame. These two cost samples cover the station ranges, including frames outside the pack visibility filter. CPU times exclude simulation and HUD submission. GPU times exclude browser compositing. Day reference, sample counts and p95 timings for each cost are included in the [native frame measurements](evidence/co-008d/native-frames.json).

Eight alternating night race starts, pauses and restarts on a single 960 × 540 page retained 36 WebGL buffers and 7,545,600 bytes on Speedway, and 121 buffers and 14,606,496 bytes on Ridge. The corresponding v0.7.0 day counts were 19 and 76 buffers, occupying 4,731,036 and 8,860,656 bytes. Each night world retained three linked programs, one more than day. Counts and buffer storage returned to the same level on each revisit. Post-GC heap ranged from 5,610,668 to 6,701,040 bytes at night. All 890 scheduled audio sources ended, and eight PCM buffers were reused. Buffer storage counts exclude driver overhead, the default framebuffer and browser allocations. [Day and night resource samples](evidence/co-008d/endurance.json)

## Verification and reproduction

On Speedway an actual rail impact produced visible sparks in 112 framebuffer pixels with full effects. Reduced mode suppressed sparks, smoke and dust, bounded tyre marks at 12 and preserved the same HUD values after the drive.

The package contained 59 runtime files with a checked local import graph, relative requests, verified upstream hashes and licences. All twelve vendored files also matched the immutable upstream Git blobs byte for byte. The extracted, independently verified archive matched the static site byte for byte after excluding the archive's launch instructions and release manifest. Its ZIP SHA-256 was `b283b47cb9b08aab82b9bf90c5cd6e4b22ca372aa901986a05888f0fbc291cbc`. The source stamp changes when packaging a different commit, including a documentation-only commit.

The commands below were run against the certification source. The Node suite passed 131 tests. The Python archive regression and browser shard orchestration checks passed. All three local browser shards exited successfully against the verified release archive at the same subpath as Pages. Their HTTP probes compared the contents and MIME types of all 59 files. The same package was also mounted at the root for Speedway day and Ridge night smoke checks.

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
OUT=/tmp/co008-nightshift/d
node --experimental-vm-modules scripts/package-site.mjs "$OUT/site/Circuit-Overdrive"
python3 scripts/offline-release.py build "$OUT/offline"
python3 scripts/offline-release.py verify "$OUT/offline"
python3 -m zipfile -e "$OUT/offline/"*.zip "$OUT/unpacked"
diff -rq --exclude=START-HERE.txt --exclude=RELEASE.json "$OUT/site/Circuit-Overdrive" "$OUT/unpacked/Circuit-Overdrive"
python3 -m http.server 18729 --bind 127.0.0.1 --directory "$OUT/unpacked"
```

With the local server running, the browser environment and commands were as follows. The baseline timing runs used a separate static package of the published commit.

```sh
export PLAYWRIGHT_MODULE=/home/trent/OFFLINE-GAMES/node_modules/playwright/index.mjs
export CHROME_BIN=/usr/bin/google-chrome
export REPLAY_REVISION=2bc4ee997b9d2363c985d4fad53ad07c64a05de9
OUT=/tmp/co008-nightshift/d
URL=http://127.0.0.1:18729/Circuit-Overdrive/
BASE=http://127.0.0.1:18728/day/Circuit-Overdrive/
for shard in speedway ridge controllers; do
  bash scripts/browser-pages.sh "$URL" "$OUT/evidence/$shard" "--shard=$shard"
done
node tests/browser-frames.mjs "$BASE"
node tests/browser-frames.mjs "$BASE" --ridge
node tests/browser-frames.mjs "$URL" --night
node tests/browser-frames.mjs "$URL" --night --ridge
NATIVE_GL=1 node tests/browser-endurance.mjs "$BASE"
NATIVE_GL=1 node tests/browser-endurance.mjs "$URL" --night
```

## Owner release gate

Review A → B → C → D. After integrating each dependency, retarget its successor to main and verify the cumulative main diff. On the final main SHA, repeat CI, check the deployed project URL through the protected Pages workflow and complete both night races. Check visibility through the bank and portals, brake-lamp contrast, sound on speakers and the intended physical controls. Prepare the release notes, tag and publish only after owner sign-off. [Player instructions](nightshift.md) · [Release procedure](offline-release.md)

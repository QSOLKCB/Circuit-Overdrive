# CO-007 championship acceptance

The v0.7.0 candidate adds a four-round competition to the published v0.6.2 game. The simulation, original six drivers, two courses, engine modules and established single-race replay format are shared with standalone racing. The champion is the winner of the four-event countback. [Player guide](championship.md)

## A completed championship

The integration build at `719733e3dca52bd1ec2f2f0edb5712c6b315e614` ran in Chrome 158.0.8127.36 on Ubuntu 26.04.1. The browser drove the shipping keyboard path. A separate same-runtime field generated the driving decisions, and an independent scoreboard calculated the awards and countback. The seed and course alone do not determine these results. They also depend on the accepted driver inputs.

| Driver | Opening Cup | Mountain Challenge | Speedway GP | Ridge finale | Total |
| --- | ---: | ---: | ---: | ---: | ---: |
| #83 Kit Vega | 10 | 10 | 10 | 10 | **40** |
| #46 Emi Park | 6 | 6 | 3 | 6 | **21** |
| #59 Rory Flint | 4 | 3 | 6 | 3 | **16** |
| #14 Mara Vale | 3 | 4 | 4 | 4 | **15** |
| #27 Player | 2 | 2 | 2 | 1 | **7** |
| #32 Luca Reed | 1 | 1 | 1 | 2 | **5** |

Each event paid 26 points. The recorded durations, including countdown, were 8,900, 8,510, 8,900 and 8,510 ticks. Luca was racing at the flag in the first three rounds. All six finished the finale. Each downloaded tape reproduced the six driver IDs, recovery counts and official finish ticks twice using different playback batch sizes. The first event also played to its final classification in the browser Theatre. [Trophy screen captured after the fourth flag](evidence/co-007/world-champion.webp)

Reloading between events restored the last flag. Reloading during the second countdown returned to the first round's results. A simulated quota failure in the third round left two results on disk and three in the tab. The fourth successful write persisted the complete four-round history. Storage denial, malformed JSON, a stale second tab, explicit reset, an abandoned attempt and repeat settlement have separate regression checks. The browser inputs include keyboard, synthetic standard gamepad reports and Chromium touch injection.

## Performance and memory observations

The native frame runner used ordinary browser animation callbacks, full effects, a 1920 × 1080 WebGL framebuffer, six entrants and the same integration build. Chrome reported ANGLE OpenGL ES on an NVIDIA GeForce RTX 5060 Ti, driver 595.99.02, on an AMD Ryzen 9 5950X. The following figures describe the sampled sections on that machine.

| Course and section | Intervals | Median ms | p95 ms | Worst ms |
| --- | ---: | ---: | ---: | ---: |
| Opening Cup grid | 150 | 16.7 | 16.8 | 16.8 |
| Opening Cup close racing | 155 | 16.7 | 16.8 | 16.8 |
| Opening Cup bank | 162 | 16.7 | 16.8 | 16.8 |
| Standalone Ridge grid | 164 | 16.7 | 16.7 | 16.8 |
| Ridge descent | 329 | 16.7 | 16.7 | 16.8 |
| Ridge forest | 634 | 16.7 | 16.8 | 16.8 |
| Ridge bridge | 539 | 16.7 | 16.7 | 16.8 |
| Ridge tunnel | 338 | 16.7 | 16.8 | 16.8 |

The accelerated championship acceptance used SwiftShader with a 640 × 400 viewport. The retained WebGL buffer count at its four flags was 19, 76, 19 and 76. Post-GC JS heap ranged from 5,905,268 to 6,249,524 bytes. The separate native endurance runner alternated courses for eight starts, pauses and restarts. It retained 19 buffers on Speedway and 76 on Ridge, reused eight PCM buffers, and observed all 890 scheduled sources end. Its post-GC heap ranged from 5,067,736 to 5,942,940 bytes.

## Reproduction and release review

Run from the exact review checkout with Node 22.18 or newer, Python 3, Chrome and the development Playwright module. The output and extraction directories must be fresh. For the local measurements above, the environment selected `/usr/bin/google-chrome` and `/home/trent/OFFLINE-GAMES/node_modules/playwright/index.mjs`.

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs "$OUT/site/Circuit-Overdrive"
python3 scripts/offline-release.py build "$OUT/offline"
python3 scripts/offline-release.py verify "$OUT/offline"
python3 -m zipfile -e "$OUT/offline/Circuit-Overdrive-$(git rev-parse HEAD).zip" "$OUT/unpacked"
diff -r --exclude=START-HERE.txt --exclude=RELEASE.json "$OUT/site/Circuit-Overdrive" "$OUT/unpacked/Circuit-Overdrive"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$OUT/unpacked"
```

From a second terminal, set `URL=http://127.0.0.1:8000/Circuit-Overdrive/` and the browser environment described above. The standard browser runner includes the four-round drive in its Ridge shard. Its evidence includes the scoreboard, all four single-race tapes, a trophy capture and resource observations.

```sh
bash scripts/browser-pages.sh "$URL" "$OUT/evidence"
node tests/browser-frames.mjs "$URL" --championship
node tests/browser-frames.mjs "$URL" --ridge
NATIVE_GL=1 node tests/browser-endurance.mjs "$URL"
```

Owner play-through covers all four flags, one reset or abandonment, boundary reload, the final trophy and listening to the anthem at multiple music levels. Physical controllers, wheels and mobile devices remain owner hardware checks. The protected Pages workflow runs the public browser suites only after an owner-approved merge and deployment. The release tag and publication are separate owner actions. [Pages verification](pages.md)

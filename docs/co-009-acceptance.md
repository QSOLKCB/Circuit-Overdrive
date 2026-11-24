# CO-009 · Nitro Overdrive review record

The review candidate adds Nitro Skyway as a separate six-car stunt sprint. Published v0.8.0 is `8204da56fce6b40ab33cb66c684a2e780f3e3001`. The VANILLAJS pin is `9d95d74b355ec17add32db0b55f0f71130f9c004`. Its original four-wheel solver advances four substeps per accepted 60 Hz driving tick.

| Review | Implementation source | Scope |
| --- | --- | --- |
| [A · Physics](https://github.com/QSOLKCB/Circuit-Overdrive/pull/30) | `626365466cf5dc9e9d1a4743c6d490d749332273` | Measured tyre slip and drift charge, metered chassis acceleration, gravity and suspension, airborne attitude control |
| [B · Skyway](https://github.com/QSOLKCB/Circuit-Overdrive/pull/31) | `70f17dec6a3d5438e3f82e7123a81c27017e1910` | Original course, three launch decks, aligned render and contact geometry, seeded rivals, gated stunt settlement |
| [C · Boost experience](https://github.com/QSOLKCB/Circuit-Overdrive/pull/32) | `ddd85683b3e56507987d5c27c03e9bfbbe230aae` | Device controls, player HUD and effects, Nitro Pulse, v3 recording and Theatre playback |
| D · Certification | `3d0f8b10512fbdae17b5fbe0bcd9f1d6ee11a320` | Source of the screenshots, downloadable command tape and package receipt below |

Each review starts at the previous row's head, with A based on the published tag. Retarget a successor to main after its predecessor is integrated. The final PR records its evidence-only commit and hosted checks.

## A complete race through the browser

Chrome 158.0.8127.36 and Playwright 1.64.0 drove the actual keyboard handler on the packaged site at `/Circuit-Overdrive/`. The seed-27 player started sixth, charged on 99 ticks and spent energy on 73 ticks. Physical speed increased on every one of those boost ticks. Across three jumps, the wheels spent 353 ticks clear of the deck. The longest flight lasted 146 ticks (2.43 s). The player landed all three, scored 913 stunt points, cleared all six intermediate checkpoints and finished sixth in 3,745 racing ticks (1:02.417). All six cars received official finish times and zero recoveries. [Race receipt, splits and image digests](evidence/co-009d/skyway-race.json)

| Selection and grid | Drift and boost | Flight and landing | Classification |
| --- | --- | --- | --- |
| [Event selection](evidence/co-009d/skyway-selection.webp) · [Grid](evidence/co-009d/skyway-grid.webp) | [Loaded slide](evidence/co-009d/skyway-drift.webp) · [Boost straight](evidence/co-009d/skyway-boost.webp) | [Airborne](evidence/co-009d/skyway-airborne.webp) · [Landing](evidence/co-009d/skyway-landing.webp) | [Chequered flag](evidence/co-009d/skyway-flag.webp) |

The captures use real WebGL with SwiftShader. The seven 960 × 560 images show the accepted player inputs and physical event sequence. An earlier 960 × 540 course inspection at the exact B source shows the player airborne at Signal Crown. In a matched boost frame, the streak effect changed 1,997 outer-edge pixels and left the central 668 columns identical. The browser also checked its reduced-motion suppression. [Course inspection](evidence/co-009d/skyway-course-proof.webp) · [Native 1080p GPU timings and resource endurance](nitro-performance.md)

## Reconstructing the drive

The download contains 952 v3 command runs, 3,925 total ticks including countdown and 26,506 bytes. Its SHA-256 is `f9400d3dfcf6168d34f38fe7b1d3c8346631dc7a2c4e48e40ec595a28c7a1304`. Use a site built from **`3d0f8b10512fbdae17b5fbe0bcd9f1d6ee11a320`** to import this particular tape. A fresh recording made on a later documentation or merge commit carries that build's own revision. [Exact input tape](evidence/co-009d/skyway-replay.json) · [Replay format and source policy](replay-theatre.md)

The browser compared all six drivers with a separate simulation during the drive, including wheel and Nitro state at launch and landing. Playback used different batch sizes and the Theatre viewer sought to the flag. The standalone CLI independently reproduced the six official finish times and the player's splits. Reconstructing identical state is verified in the specified runtime. The source stamp identifies a build and does not authenticate who drove.

## Physics and legacy regressions

The analytic checks cover low-speed crossings, short and long flights, nose-heavy, rear-first and sideways touchdowns, nearby airborne rivals, guardrails, failed stunts and recovery. A wheel-supported forward crossing is required on both ends of a timing-plane tick. The course test measured all 2,280 asphalt triangles against the suspension sampler. The greatest centroid height discrepancy was 0.01445 m. The bounded height surface and swept chassis footprints support these ramps and landings. Body deformation and body-to-body rollover torque are outside the contact model. [Physics contract](nitro-physics.md) · [Skyway surface, gates and landing rules](skyway.md)

An independent comparison loaded a clean v0.8.0 checkout and the C gameplay source `11d8d4759621b542f4692a2d59447fdc8f273cfb`. On Speedway, all six touring states matched at each of 9,847 ticks. On Ridge they matched at each of 9,402 ticks. Each run included a real rail contact and an accepted recovery. The v2 command files matched byte for byte at the original stamp and Theatre reproduced both final fields. [Comparison receipt](evidence/co-009d/legacy-authority.json)

## Verification and delivery

The measured D source passed all 157 Node tests, the Python offline-release suite and the browser-shard coverage check. Its fresh 64-file site matched the independently verified ZIP's runtime files. The ZIP SHA-256 was `b8db05a9e52b5cb48a846862e909608d2c2eb362bca33cca88064ef7945bb6cc`. Each build stamps its own revision, so the PR head has its own archive receipt. The seven browser lanes include the new Nitro drive in the effects lane. Previous lanes still exercise both touring courses by day and night, the four-round championship, Theatre, controller profiles, touch and lifecycle failures. [Browser commands and shard inventory](pages.md) · [Offline verification](offline-release.md)

Commands used for the package and driving checks are below. Use fresh output paths, the installed Chromium and Playwright, and a URL serving the unpacked ZIP at the project subpath. The legacy comparison requires a clean v0.8.0 checkout. The CLI reads the Git revision from its own checkout.

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs "$SITE"
python3 scripts/offline-release.py build "$OFFLINE"
python3 scripts/offline-release.py verify "$OFFLINE"
node tests/compare-legacy-races.mjs "$V080_CHECKOUT"
REPLAY_REVISION="$REVISION" EVIDENCE_DIR="$EVIDENCE" node tests/browser-nitro.mjs "$URL"
node scripts/replay-drive.mjs "$EVIDENCE/skyway-replay.json"
```

## Owner review

Drive a slide into the opening bend, spend the earned energy on the straight, line up with a crest and settle the car on its catch deck. Check the controls with the physical pad or wheel, listen to Nitro Pulse and the landing cues, then save the replay and follow another car in Theatre. Browser device tests supply synthetic controller reports and pointer events. The owner play-through covers hardware feel and listening. After approved integration, rerun the full package and local/public browser checks on the exact main SHA before preparing the v0.9.0 release. [Player guide](nitro.md) · [Music catalogue and PCM receipts](CO_MUSIC_001C.md)

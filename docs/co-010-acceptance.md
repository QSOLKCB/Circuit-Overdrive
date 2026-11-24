# CO-010 · Rocket Overdrive review record

The candidate adds a separate six-car Rocket discipline to published v0.9.0, `f7f45d1b6c3521dd728945b71cf20ab406603cb4`. Its game-owned surface solver reuses the pinned VANILLAJS math functions. The engine source is `9d95d74b355ec17add32db0b55f0f71130f9c004`. The published championship calendar still consists of its original four touring events.

| Review | Base | Reviewed implementation |
| --- | --- | --- |
| [A · Gravity Engine](https://github.com/QSOLKCB/Circuit-Overdrive/pull/34) | Published v0.9.0 | Merged into main at `2031d46a565322f78921f1e620e78fcd3b5fe3b2` |
| [B · Orbital Spine](https://github.com/QSOLKCB/Circuit-Overdrive/pull/35) | A merge | Merged into main at `d121d90f64ffa91b9d5fbcb6bd1303f4a66f9d09` |
| [C · Playable race](https://github.com/QSOLKCB/Circuit-Overdrive/pull/36) | B merge | Merged into main at `e985ece76643487fa1acf7dc3ddac68a2300a133` |
| [D · Sound and v4](https://github.com/QSOLKCB/Circuit-Overdrive/pull/37) | C merge | Merged into main at `b6826e5a8e9760aeca2960467a1caad9fd5c45ee` |
| [E · Certification](https://github.com/QSOLKCB/Circuit-Overdrive/pull/38) | D merge | `6523dd53aceae5206b6b29316bb082105adfae53` supplied the Rocket captures and recording |

## Wheel support and flight

Seed 27 starts the player sixth. The browser delivered keyboard events through the focused canvas and observed the game through its normal 60 Hz clock. The player passed five rivals, crossed nine timing planes and won in 2,256 racing ticks (37.600 s). All six finished without recovery. The last rival crossed at 2,600 racing ticks. The recorded countdown adds 180 ticks. An independent simulator matched the complete field at 44 points during the drive. The browser used Chrome 158.0.8127.36 and SwiftShader for reproducible screenshots.

| Recorded tick | Observation | Loaded wheels | World-space support normal | World-space adhesion acceleration (m/s²) |
| ---: | --- | ---: | --- | --- |
| 962 | Ascending Antenna Wall | 4 | (0, 0, 1) | (0, −0.88, −31.99) |
| 1166 | Inverted Spine | 4 | (0, −1, 0) | (0, 31.98, −1.14) |
| 2163 | Left dodge in the gap, ninth airborne tick | 0 | Free flight | (0, 0, 0) |

The drive contained 185 ticks attached with a near-horizontal normal, 372 attached with an inverted normal, 28 boost ticks, one applied air dodge and three returns to contact after at least four ticks in flight. The independent Node course test checks each driver's actual ascending wall, ceiling and catch-deck contact. Swept collision tests cover opposing cars as well as wall and ceiling rails. The browser drive recorded zero player-to-car impacts. The collider approximates the chassis with three swept spheres and the rail with a finite lateral barrier. [Tick-indexed physical and camera receipts](evidence/co-010e/orbital-race.json) · [Geometry, gates and recovery](orbital-spine.md) · [Solver and numerical limits](rocket-physics.md)

## Captured frames

Each lossless WebP decodes to the same RGB pixels as its original browser PNG. The capture receipt includes both digests, the source revision and accepted tick.

| Stage | Actual WebGL captures |
| --- | --- |
| Start | [Selection](evidence/co-010e/orbital-selection.webp) · [Six-car grid](evidence/co-010e/orbital-grid.webp) · [High-speed straight](evidence/co-010e/orbital-straight.webp) · [Bank](evidence/co-010e/orbital-bank.webp) |
| Ascent | [Floor-to-wall](evidence/co-010e/orbital-wall-entry.webp) · [Wall](evidence/co-010e/orbital-wall.webp) · [Wall-to-ceiling](evidence/co-010e/orbital-wall-to-ceiling.webp) · [Ceiling](evidence/co-010e/orbital-ceiling.webp) |
| Descent | [Ceiling-to-wall](evidence/co-010e/orbital-ceiling-to-wall.webp) · [Descending wall](evidence/co-010e/orbital-descent.webp) · [Return to floor](evidence/co-010e/orbital-return-floor.webp) |
| Transfer and flag | [Boost](evidence/co-010e/orbital-boost.webp) · [Free flight](evidence/co-010e/orbital-flight.webp) · [Dodge](evidence/co-010e/orbital-dodge.webp) · [Catch](evidence/co-010e/orbital-landing.webp) · [Classification](evidence/co-010e/orbital-flag.webp) |
| Spectator | [Rival high camera](evidence/co-010e/orbital-theatre-ceiling.webp) · [Player at the flag](evidence/co-010e/orbital-theatre-flag.webp) |

The C and D gameplay builds were `ef7f27d8f1578f9ab5f5872338f6594aa99ead3d` and `b52e06b54754e1aa82f6ce247138923338f22b29`, respectively. Both branches subsequently received a test-only change to the software-rendered controller harness. It samples each accepted pad tick and drains the GPU queue between bounded render batches. The heads carrying that change are `586f80bb9a6a5ff768aca61475eb8b6308704940` and `4f73733ddc9fb644acc3dfaffafd410e05a834cc`, respectively.

The exact C gameplay archive also passed a complete gameplay-only run before the v4 recorder entered the stack. Its 71 runtime files matched the C site package. The C archive's SHA-256 is `34d0c5b3f76f297984f476d6d888442f0f76c0d2c54f9ba00bd79744e54af5cd`. [Wall driving from the playable C source](evidence/co-010e/playable-wall.webp)

## Recording and sound

The E browser exported 623 v4 command runs over 2,780 accepted ticks. Its download has SHA-256 `f081a506d4e4da307031ad10ec5ffa43c73e5d2a012e4b71394d2e40b87c436a`. Use the exact E implementation SHA above to import this recording. A fresh build stamps its own revision. A separate browser simulation advanced 61 ticks per call and two Node simulators replayed batches of 57 and 240. All six final entrants matched, including their wheel loads, orientation, energy, gate history and classification. The CLI independently reproduced all seven player splits. The runtime scheduled 135 mono effects buffers and 135 stereo music buffers during the accelerated WebGL drive. The selected score was RASTER VELOCITY. [Recorded inputs](evidence/co-010e/orbital-replay.json) · [CLI physical results](evidence/co-010e/orbital-cli.json) · [Original score and PCM receipts](CO_MUSIC_001C.md)

## Native performance and packaging

On the documented Ryzen 9 5950X and RTX 5060 Ti, nine native Chrome windows covered wall, ceiling, boost and flight at 1920 × 1080 with six unfinished entrants. The 2,036 observed frame intervals had a 16.7 ms median and a 16.8 ms worst interval. GPU draw medians varied from 0.74 to 0.83 ms by section. Eight restart and course-switch cycles returned Orbital to 13 buffers and two WebGL programs on each visit. These samples predate the touch steering change. [Native timings, hardware, resource counts and published baseline](rocket-performance.md)

The 71 runtime files of the measured site's source-stamped package matched the independently verified archive's extracted files. The ZIP SHA-256 is `cb398345f235016f182fcec0ac7704279127fca2f0c7c3239b1a3110f8894326`. The full race ran against that archive over loopback at the Pages project subpath. The seven CI lanes share the single verified archive. The Theatre lane includes the new Rocket acceptance drive. [Offline reproduction](offline-release.md) · [CI ownership and browser commands](pages.md)

## Touch steering and replay

On touch commit `e6af18f65c58a414ce89d524c42cbadc01ee4ab3`, Chrome 158 mobile emulation delivered four positions from a single steering finger while a second finger held Gas. The old build produced steering values of −1, −1, 0 and 0. The updated pad produced −1, −0.5, 0 and +1 on the first fixed input sample after each event. Lifting the steering finger returned steering to zero and kept throttle at one. Physical handset input-to-display latency remains unmeasured.

Two full touch drives from the verified offline archive reconstructed six official finishes on each course, three lap splits on Speedway and seven splits on Ridge. In a separate Speedway drive, the downloaded v2 replay retained 30 ticks each of +0.5 and −0.5 steering. Independent playback matched all six results and lap times of 55.000, 52.300 and 52.300 seconds. The 9,756-tick tape had SHA-256 `321c4e1eb374bb0cc4b76685e2ef580e1248e834bffbed52da9d9cdbc0caeb1d`. [Touch controls and test commands](controllers.md#touch-driving)

## Published racing authority

On Node v22.18.0, a separate checkout of the published v0.9.0 tag produced identical six-driver state at all 9,847 ticks on Speedway and 9,402 ticks on Ridge. The daytime and Nightshift inputs and final fields matched, including contact and recovery. Nighttime light selection matched on 3,282 Speedway samples and 3,134 Ridge samples. A fresh v0.9.0 Nitro recording reproduced the historical 952 runs and six-driver field at all 3,925 ticks. [Legacy comparison receipt](evidence/co-010e/legacy-authority.json)

## Owner gate

Play through Orbital Spine with physical controls. Check the horizon through inversion, controller and touch comfort, the sound mix and the reaction to landing. Review the PRs in dependency order and retarget each successor to main after its predecessor is integrated. The final main SHA, post-merge CI, public Pages drive, owner listening session and v1.0.0 release decision belong to the final integration gate. [Player guide](rocket.md) · [Controller bindings](controllers.md)

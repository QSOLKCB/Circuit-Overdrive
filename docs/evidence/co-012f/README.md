# Total Destruction evidence

The browser readings use native Chrome 158.0.8127.36 with ANGLE on an NVIDIA GeForce RTX 5060 Ti and an AMD Ryzen 9 5950X. All Derby captures and tapes use runtime `493f2c35295c23c1b857dcdbb165a7f05b6eb8b4`. The package was served locally under `/Circuit-Overdrive/`. The baseline measurements use published v1.1.1 at `541ba6ca27dabe644ab23fe9a061c91dda8794a6`. [Acceptance and reproduction](../../co-012-acceptance.md) · [Browser report and capture ticks](browser-derby.json) · [File SHA-256 receipts](SHA256SUMS)

## WebGL captures

| Stage | Capture |
| --- | --- |
| Arena selection | [Iron Pit](iron-pit-selection.png) |
| Six-car grid | [The Crucible](crucible-grid.png) · [Iron Pit](iron-pit-grid.png) |
| First vehicle contact | [The Crucible, tick 93](crucible-first-contact.png) |
| Three-car pileup | [Iron Pit](iron-pit-three-car-pileup.png) |
| Crumpled front | [The Crucible](crucible-crumpled-front.png) |
| Side panel | [Iron Pit](iron-pit-side-panel.png) |
| Severe damage | [Crumpled rival in Iron Pit](iron-pit-severely-damaged-opponent.png) |
| Eliminated vehicle and continuing field | [Wall disablement](crucible-eliminated.png) · [Spectator field](crucible-remaining-competitors.png) · [Mutual knockout](iron-pit-player-eliminated.png) |
| Last survivor and official results | [Mara Vale](crucible-final-survivor.png) · [Player victory](crucible-player-result.png) · [Iron Pit time limit](iron-pit-result.png) |
| Replay Theatre | [Seek to an elimination](iron-pit-theatre-elimination.png) · [Final standings](crucible-theatre-result.png) |

The selected images are ordinary browser screenshots. The browser report records the accepted tick at capture, each selected image digest and any linked physical contact or elimination receipt. Some captures follow the triggering contact by up to five accepted ticks because the browser advanced those ticks in one frame. The named pileup records accepted contact edges across a short connected burst. Position, impulse, damage and result claims use the full recording and its independently reconstructed receipt.

## Match recordings

| Match | Browser command tape | Live evidence | Theatre reconstruction |
| --- | --- | --- | --- |
| The Crucible, wall disablement and rival victory | [v6 replay](crucible-replay.json) | [Receipt](crucible-live-receipt.json) | [Receipt](crucible-theatre-receipt.json) |
| Iron Pit, mutual knockout and time limit | [v6 replay](iron-pit-replay.json) | [Receipt](iron-pit-live-receipt.json) | [Receipt](iron-pit-theatre-receipt.json) |
| The Crucible, player last survivor | [v6 replay](crucible-player-replay.json) | [Receipt](crucible-player-live-receipt.json) | [Receipt](crucible-player-theatre-receipt.json) |

The live and Theatre receipts are identical except for the runtime label identifying which view exported them. The tested browser code verifies the raw contact digest, all six damage ledgers, the final states and all six mutable panel geometries. The harness also records context restoration, the full saturation fixture, clean reset and round and scene disposal separately. [Native 1080p derby sample](browser-derby-native.json) · [Published v1.1.1 native comparison](v111-crash-native.json)

## Node reconstruction

| Match | Node command tape | Live Node evidence | `scripts/replay-drive.mjs` evidence |
| --- | --- | --- | --- |
| The Crucible, time limit | [v6 replay](node-crucible-replay.json) | [Receipt](node-crucible-receipt.json) | [Receipt](node-crucible-reconstructed.json) |
| Iron Pit, simultaneous elimination | [v6 replay](node-iron-pit-replay.json) | [Receipt](node-iron-pit-receipt.json) | [Receipt](node-iron-pit-reconstructed.json) |

The Node v22.18.0 receipts reproduce in the Node runtime and the Chrome 158 receipts reproduce in Chrome. A replay's exact source stamp and declared runtime identify the tested reconstruction. Accepted collisions can lead to different trajectories after floating-point differences between runtimes. [Replay precision and terminal admission](../../replay-theatre.md#total-destruction-version-6)

## Legacy racing

The same-runtime comparison against published v1.1.1 matches all 45,225 accepted touring, Nitro Skyway and Rocket Overdrive ticks across the six environments. It includes per-course state and command digests. [Racing parity receipt](v111-race-parity.json)

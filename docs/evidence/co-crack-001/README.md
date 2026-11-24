# CO-CRACK-001 native WebGL acceptance

The candidate captures and recordings use the packaged runtime from `ed432eb14a2bd22136429d610451275eea30ff51`. The comparison package uses published v1.1.0 at `1f0527098b9eb9c27c678d9ad4bfa2b276374551`. Both packages use VANILLAJS `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Candidate runtime](https://github.com/QSOLKCB/Circuit-Overdrive/commit/ed432eb14a2bd22136429d610451275eea30ff51) · [Published release](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.1.0)

Chrome 158.0.8127.36 used ANGLE OpenGL on the GeForce RTX 5060 Ti with NVIDIA driver 595.99.02. The host was an AMD Ryzen 9 5950X running Ubuntu 26.04.1 LTS and Linux 7.0.0-43-generic. Playwright 1.64.0 and Node v22.18.0 drove the normal Crash Lab controls. Timed frames used a 1920 × 1080 WebGL drawing buffer. Full-page screenshots are 2320 × 1134. Fixed-pose framebuffer captures are 1280 × 720.

| Trial | Clean and approach | Accepted contact | Inspection | Same pose, zero-ledger control and actual damage |
| --- | --- | --- | --- | --- |
| The Wall | [Launch](wall-clean.png) · [Tick before](wall-before-contact.png) | [Front impact](wall-contact.png) | [Folded bonnet](wall-inspect-0.png) · [Reset Trial](wall-reset.png) | [Clean](wall-control-clean.png) · [Damaged](wall-control-damaged.png) |
| The Glancing Blow | [Launch](glancing-clean.png) · [Tick before](glancing-before-contact.png) | [Rail impact](glancing-contact.png) | [Right door](glancing-inspect-0.png) | [Clean](glancing-control-clean.png) · [Damaged](glancing-control-damaged.png) |
| Two-Car Impact | [Launch](opposing-clean.png) · [Both cars](opposing-before-contact.png) | [Both fronts](opposing-contact.png) | [Car 0](opposing-inspect-0.png) · [Car 1](opposing-inspect-1.png) | [Clean](opposing-control-clean.png) · [Damaged](opposing-control-damaged.png) |

The browser harness attaches probes to the packaged trial and renderer in memory. The existing keyboard handlers, collision steps and draw calls produce the live measurements. The paired views render a separate zero-ledger control at the same scene and pose. The wall and rail comparisons use settled inspection poses. The two-car comparison uses the first accepted contact. The browser report gives the number and bounding box of pixels with a change greater than two channel values, plus the exact pixel reset count. It also compares clean vertex bytes on the opposite side of the car. [Candidate browser report](browser-impact-panels.json) · [File checksums](SHA256SUMS)

Theatre imported each v5 keyboard recording through its file picker. It reconstructed the accepted-impact geometry and reached the same final geometry after rewind, seek and different playback rates. Each car kept its own mesh handles after switching the followed chassis. The two screenshots show the same opposing-car impact before and after seeking away and back. Geometry equality is based on the Float32 vertex SHA-256 values in the browser report. [First seek](replay-impact.png) · [Repeat seek](replay-impact-reseek.png)

- Wall first accepted contact was tick 221 with 815 front and 733 engine damage. [Recording](crash-wall-replay.json) · [Impact receipt](crash-wall-receipt.json)
- Glancing first accepted contact was tick 209 with 19 right damage. [Recording](crash-glancing-replay.json) · [Impact receipt](crash-glancing-receipt.json)
- Opposing first accepted contact was tick 180 with 401 front damage on each car. [Recording](crash-opposing-replay.json) · [Impact receipt](crash-opposing-receipt.json)

The three recordings were also reconstructed by `node scripts/replay-drive.mjs` from the runtime revision. The resulting input, contact and final-state SHA-256 digests matched the browser receipts. A neutral tick between arming and the first keyboard input can shift a browser receipt by a tick. Each receipt keeps the actual input stream and source revision.

A separate native keyboard run held ↓ for five ticks after the wall impact and paused with Esc. Speed fell from 5.62 to 4.19 m/s. All damage channels and the upload count stayed constant through braking, pause and two camera selections. [Braking and pause receipt](post-impact-brake.json)

The candidate report includes individual runs from eight complete Wall → Glancing → Two-Car cycles with resets. The published comparison includes one full cycle of the same native timing and resource probes. The existing performance runner separately drove each published fixture twice. [Published panel comparison](v110-panel-comparison.json) · [Published six-trial timing](v110-six-trial-native.json) · [Reproduction](../../computational-impact-panels.md#reproduce-and-play)

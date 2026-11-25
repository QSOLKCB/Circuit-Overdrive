# CO-014C evidence index

Tested implementation: `17426dd8359ed69ba95db1466f1af626c670e706`.
Exact owner-merged PR B base: `20e0b2bf8f242901ed21a056815eaf5926af99d2`.
Published legacy source: `1c745a90258d0f6cb968935f773354cff702b276`.
VANILLAJS remains `9d95d74b355ec17add32db0b55f0f71130f9c004`.
Later documentation/receipt changes do not relabel these measurements as a
different source. No game/physics/test implementation changes follow the tested SHA.

| File | Evidence |
| --- | --- |
| [verification.json](verification.json) | Exact sources, executed commands/results, independent ledger, unchanged limits and artifact/evidence SHA-256 |
| [node-tests.log](node-tests.log) | All 475 tests passed; retained historical coverage plus new compiler/physics/economy/paint/size checks |
| [physical-summary.json](physical-summary.json) | Controlled simulator evidence for eight mechanical categories, paint, additional grades and twelve compound all-model profiles |
| [parts-browser.json](parts-browser.json) | Eight production purchase/fitting/persistence scenarios and source-bound physical runs of the actual accepted owned builds |
| [engine-confirmation.png](engine-confirmation.png) | Exact car, part, acquisition/fitting cost, setup and post-fitting balance with safe Cancel focus |
| [before-paint.png](before-paint.png), [after-paint.png](after-paint.png) | Actual accepted original factory/Midnight Alloy appearance; geometry and complete physical recipe remain unchanged |
| [garage-browser.json](garage-browser.json) | All 23 existing Garage scenarios and 17 rejected-file cases remain |
| [migration-browser.json](migration-browser.json) | All six real published/current same-origin migration scenarios remain |
| [v130-parity.json](v130-parity.json) | Another 45,225 matching ticks directly against published v1.3.0, with original blob/tape/state hashes |
| [smoke.log](smoke.log) | Existing packaged game lifecycle/input/audio/WebGL checks |
| [shards.log](shards.log) | Seven-worker orchestration/failure propagation, separate from full browser matrix execution |

The physical summary retains exact source hashes, recipes/identities, rules,
metrics, diagnostics, sampled speed/RPM/steering and lossless accepted terminal
states. `terminalStateColumns` defines each terminal row. An `identicalTo`
reference means the full run including omitted samples hashes identically to
the named stock run. The full unabridged receipt remains at
`/tmp/co014c-verification/physical-raw.json`; its exact bytes, SHA-256 and
reproduction command are embedded in the summary and verified independently.
The summary is approximately 185 KiB; the roughly 2.1 MiB raw diagnostic is
kept outside this source PR. Neither is a garage save or supported replay.

Development physical variants are explicitly hypothetical compiler-admitted
experiments. Browser purchase evidence is distinct: it fits parts through real
controls and steps the actual committed owned build using native ES modules
and the pinned solver. There is no injected valid upgrade, inventory, money or
measured outcome. Storage faults are synthetic service conditions. Rendering
uses Chrome 158 SwiftShader; no native GPU/frame-time or playable-facility claim
is made. Full seven browser lanes and owner/post-merge/public checks remain
CI/owner gates; complete facility, repairs and new replay are later D–F work.

Verified offline artifact:

```text
Circuit-Overdrive-17426dd8359ed69ba95db1466f1af626c670e706.zip
SHA-256 26531de86561b8362ddda1f337c5f33fab90537b184f49db5ade6917b90ae5b4
```

The archive and checksum remain in `/tmp/co014c-verification/offline/`.
Every one of the separately generated standalone package's 107 runtime files
equals its verified ZIP counterpart. Browser artifacts, original JSON downloads
and remaining screenshots stay in `/tmp/co014c-verification/parts-browser/`,
`garage-browser/` and `migration-browser/`. All were served at the project
subpath; the exact v1.3.0 runtime was served at `/legacy/` on the same origin.

See [C acceptance](../../co-014c-acceptance.md) and the
[parts contract](../../vehicle-parts.md) for bounds, measured effects, recovery
limitations and owner play-test steps. No release publication is performed.

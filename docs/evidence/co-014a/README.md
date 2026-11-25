# CO-014A evidence index

Every receipt identifies tested implementation
`f625eaf7aa6e420b5aa30216d587484f677ebe36`, based on published v1.3.0
`1c745a90258d0f6cb968935f773354cff702b276`. The evidence commit changes only
documentation/receipts, not those measured implementation bytes.

| File | Evidence |
| --- | --- |
| [verification.json](verification.json) | Exact executed commands, counts, runtime, archive and evidence hashes, explicit unexecuted gates |
| [stock-physical.json](stock-physical.json) | Six full recipes, canonical builds, source hashes, source-bound digests, commands/rules and accepted physical snapshots |
| [stock-browser.json](stock-browser.json) | Chrome native-module source checks, two repeated physical runs per model and Node/browser metric agreement |
| [node-tests.log](node-tests.log) | All 384 passing tests, including historical 45,225-tick equality and 24 new Forge checks |
| [v130-parity.json](v130-parity.json) | Another 45,225 matching ticks directly against published v1.3.0, original blob identities and field/tape hashes |
| [garage-browser.json](garage-browser.json) | 22 existing production-Garage scenarios, 17 rejected imports, real saved transactions and observed context/input/storage behavior |
| [packaged-smoke.log](packaged-smoke.log) | Existing game browser smoke at the project subpath, graphics/audio failure checks |
| [shards.log](shards.log) | Seven-worker orchestration/failure propagation; separate from actual browser execution |

Stock receipts use the real pinned solver, dry level road, 60 Hz calls, declared
seed 0 and deterministic threshold policies. Their full rules describe differing
stream lengths and actual over-threshold braking start speeds. These are stock
whole-design measurements, not an upgrade comparison, owned-car run or v7 replay.
The browser checks use SwiftShader; they do not establish native GPU performance.

The independently rebuilt offline artifact is retained locally at
`/tmp/co014a-verification/offline/`, with SHA-256:

```text
da20aa4f9950e7ba0f6b76081a1d2849f92ae4ff98e0032002d8414457059d6f
```

Its filename is
`Circuit-Overdrive-f625eaf7aa6e420b5aa30216d587484f677ebe36.zip`.
The standalone 103-file package was served under `/Circuit-Overdrive/` for the
existing smoke and garage browser tests. The new compiler/driver intentionally
remain source-checkout development tools until D/E runtime integration.
The production Garage screenshots and JSON downloads indexed in its receipt
remain in `/tmp/co014a-verification/garage/`; those image/download artifacts are
not copied into this source PR. They depict the existing garage, not a physical
test facility. The full seven browser lanes and native physical-facility profiling
remain certification gates for F.

Reproduce from the exact implementation using the commands in
[Build Forge contract](../../vehicle-builds.md) and
[owner-review record](../../co-014a-acceptance.md).

# CO-014B evidence index

Tested implementation: `1f7fd70e49032dfa9a21166468571fcde63d9f08`.
Exact owner-merged PR A base: `eb3b11d50ec2c92f026455d0790a79214f525242`.
Published legacy runtime: `1c745a90258d0f6cb968935f773354cff702b276`.
VANILLAJS remains `9d95d74b355ec17add32db0b55f0f71130f9c004`.
The later evidence commit changes only documentation/receipts; it does not
relabel measurements as originating in that later source.

| File | What it records |
| --- | --- |
| [verification.json](verification.json) | Exact executed commands, environment, counts, limits, archive and evidence SHA-256 hashes |
| [node-tests.log](node-tests.log) | 429 passing tests, historical 45,225-tick equality and all prior coverage |
| [garage-tests.log](garage-tests.log) | 96 Garage checks, including 35 explicit migration cases and retained 65,536-operation ledger |
| [migration-browser.json](migration-browser.json) | Genuine published/current production controls, preserved four-car ownership, cancel/backup, stale old ticket, file round trips and failed-write recovery |
| [migration-confirmation.png](migration-confirmation.png) | Source-bound migration confirmation with all four owned IDs and zero balance |
| [migrated-reloaded.png](migrated-reloaded.png) | Those same four bays/IDs after reload, fourth car active and original-backup export available |
| [garage-browser.json](garage-browser.json) | 23 existing/expanded Garage scenarios, 17 rejected imports, eight retained-resource cycles and zero browser errors |
| [v130-parity.json](v130-parity.json) | Another 45,225 matching ticks directly against published v1.3.0, blob/tape/field hashes |
| [stock-physical.json](stock-physical.json) | All six unchanged stock recipes, physical outcomes, source hashes and source-bound digests at B |
| [smoke.log](smoke.log) | Packaged game startup, input and graphics/audio failure checks |
| [shards.log](shards.log) | Preserved seven-worker orchestration/failure propagation, separate from full browser matrix execution |

Browser evidence uses Chrome 158.0.8127.36 and SwiftShader. Storage notification
suppression and quota/read-back faults are explicitly synthetic service
conditions. Owned cars are bought through real old controls or deliberately
imported through actual file controls; no valid inventory or upgrade is injected.
This is browser functional/resource evidence, not native GPU/frame-time
certification or a physical proving-ground drive.

The fresh standalone package's 105 runtime files were compared byte for byte
with the independently rebuilt offline ZIP. Artifact filename:

```text
Circuit-Overdrive-1f7fd70e49032dfa9a21166468571fcde63d9f08.zip
```

SHA-256:

```text
e7948e00a3d4943a0a654aee5a589fe3f589b324e22f3a04fedb871a2a3c2095
```

The archive and checksum remain in `/tmp/co014b-verification/offline/`.
Both packages were served at `/Circuit-Overdrive/` and `/legacy/` on one
loopback origin. All native JSON downloads and the remaining production Garage
screenshots indexed in the receipts remain under
`/tmp/co014b-verification/migration-browser/` and
`/tmp/co014b-verification/garage-browser/`; only the two migration screenshots
are copied into this PR. No publication is performed.

The [acceptance record](../../co-014b-acceptance.md) describes owner review and
the old-client explicit-reset limitation. Full seven-lane browser execution,
post-merge/public verification and owner approval remain CI/owner gates.

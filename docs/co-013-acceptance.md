# CO-013 — STREET ROD: THE GARAGE — v1.3.0 candidate acceptance

The five-stage garage now has a complete offline ownership workflow: six
original cosmetic models, four bays, uniquely identified cars, integer credits,
confirmed purchases/sales/selection, durable local saves and validated JSON
replacement. This record identifies executed certification. **v1.3.0 remains a
candidate**: the owner must accept E, merge it, verify final main/Pages and
manually publish the release.

## Source and integration

| Item | Exact source |
| --- | --- |
| Published v1.2.0 | `e12665b04609f40d452084a37264756a23d730da` |
| A — Registry, PR #55 | `0554ec0e8bf6d7b508dfd818d35fd8b2f59a6baf` |
| B — Transactions, PR #56 | `fe8f439c42f0430469510855d400dba4e6b013fa` |
| C — Save Vault, PR #57 | `fff96e99f1021e3147d80d726407ed75c605fa0d` |
| D — Experience, PR #58 / E base | `d65525f11a1353f09ac859af9a09c0605888e197` |
| E tested implementation | `66db7fee84d389f152ef53b6801e4b51031fd0ef` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

The final evidence commit adds documentation and captured receipts only.
Certification introduces no production runtime, catalogue, storage-schema,
physics, replay or engine change from accepted D. No ownership defect was found
by the independent audit. STREET-RACER's reviewed ideas and unchanged provenance
are recorded in the [registry](garage-registry.md); no donor source was copied.

## Executed checks

| Executed check at the E implementation | Actual result |
| --- | --- |
| `node --test tests/*.test.mjs` | **360 passed, 0 failed**; 509.927 seconds |
| Garage-focused authority suite (included above) | **51 passed**, including 65,536 generated operations |
| Published v1.2.0 full-state comparison | **45,225 matching ticks**, six course/environment combinations |
| Preserved v1.0.0 regression (included above) | **45,225 matching ticks** |
| `python3 tests/test_offline_release.py` | **1 passed** |
| `bash tests/browser-pages-shards.sh` | Passed orchestration and failure-propagation checks |
| Actual packaged browser matrix | **7 lanes / 20 suites passed** |
| Native garage journey | **18 scenarios passed** |
| Two quiet native performance runs | Both passed bounded resource/lifecycle assertions |

See [verification.json](evidence/co-013e/verification.json) and the raw browser
logs indexed by [browser-matrix.json](evidence/co-013e/browser-matrix.json).
The shard-script unit check and the actual browser executions are separate.

The generated-state ledger independently models money, serial allocation, bay
slots, ownership and active selection. Its **1,024 sequences × 64 operations**
cover 5,493 purchases, 5,080 sales, 3,470 selections and 51,493 rejections.
It compares exact expected receipts and states, rejects stale retries, checks
serialization, and proves the tested buy/sell cycles cannot increase liquidation
value. Synthetic counter/money boundary fixtures are explicitly identified;
browser ownership is always created through accepted user actions.

New E cases exercise storage lifetime replacement after deletion/corruption and
the final representable storage sequence. An old confirmation cannot become
valid when recreated garage JSON matches an earlier snapshot. The final write
commits once; exhaustion rejects further mutation while preserving exportable
ownership. Existing admission tests cover duplicate identities, invalid prices,
overflow, serial/revision exhaustion, sparse/accessor records and unknown fields.

## Actual browser workflows

All seven existing browser lanes completed with exit 0 against the independently
verified extracted ZIP under `/Circuit-Overdrive/`, preserving all 20 suites.
They cover championship, day/night Speedway and Ridge, controls, Replay Theatre,
Rocket, Crash Lab, Derby, Nitro, effects and the expanded garage journey. The
three accepted Derby matches include player spectating and player victory.

The garage journey separately passed in native and software Chrome
**158.0.8127.36**: **18 scenarios, 17 rejected-file cases, 24 screenshots and nine
actual JSON downloads** each. Each recorded 972 same-origin requests, zero
external requests and zero browser errors. Native used ANGLE on NVIDIA RTX 5060
Ti; the matrix used ANGLE SwiftShader. Native captures and hashes are retained
in [native-browser.json](evidence/co-013e/native-browser.json); the independent
software receipt is [garage-browser.json](evidence/co-013e/software/garage-browser.json).

The production suite covers premium and mixed-model purchases; four occupied
bays; insufficient balance and capacity; active/inactive/final-car sales;
duplicate confirmation; fresh reset; reload; native Blob downloads and File
imports; canonical re-export; stale and identical-data import conflicts; actual
exclusive Web Lock contention; denied reads/writes; quota exhaustion; uncertain
write completion; corrupt/unsupported save recovery; held keys; neutral
controller/disconnect behavior; responsive touch; graphics failure/restoration;
and an existing championship created and resumed through its ordinary UI.

Seventeen hostile file cases preserve the accepted garage: malformed/oversized
JSON, unsupported schema/edition/catalogue, missing/extra fields, negative,
fractional and unsafe money, duplicate identities, unknown models, invalid
active identity/allocator, nested unexpected data and a prototype-related key.
No imported field becomes a vehicle recipe or executable script.

The two-tab tests load the same snapshot, commit a real purchase/sale in one
tab, reject the stale tab, explicitly reconcile, and verify identical accepted
ownership. Service fault injection is disclosed and changes storage/controller
APIs only; it never awards a valid car, money, result or championship progress.

The [evidence directory](evidence/co-013e/README.md) indexes source-bound captures,
actual exported saves, native/software receipts and the release artifact.
Screenshots support visual review; transaction/state assertions provide the
ownership evidence.

## Native performance and retained resources

Two quiet runs used Ubuntu 26.04.1, Ryzen 9 5950X, RTX 5060 Ti (driver 595.99.02)
and native Chrome 158.0.8127.36. The viewport was **1920×1080**; the actual
showroom drawing buffer was **1400×989**, with the remaining space occupied by
the game UI.

| Observation | Run 1 | Run 2 |
| --- | ---: | ---: |
| Idle callback median / p95 / worst | 16.7 / 16.7 / 16.8 ms | 16.7 / 16.7 / 16.8 ms |
| View-change callback median / p95 / worst | 16.7 / 22.6 / 24.9 ms | 16.7 / 22.2 / 25.0 ms |
| Actual draw-callback CPU p95 | 0.6 ms | 0.5 ms |
| GPU draw elapsed p95 | 2.267 ms | 2.333 ms |
| Model selections / camera changes | 48 / 192 | 48 / 192 |
| Closed V8 heap change after bounded cycles/restoration | −19,888 bytes | −17,264 bytes |

**The interactive p95 of 22.2–22.6 ms does not establish a locked 60 FPS frame-tail
guarantee.** Idle callbacks do not redraw the retained scene. Each run includes
360 idle callbacks, 720 switching callbacks and 240 actual drawn frames; all 240
asynchronous GPU queries were valid. Owner acceptance of the measured timing
tails remains part of release review.

The [performance record](garage-performance.md) defines measurement boundaries
and records both quiet runs, raw frame intervals, CPU/GPU timing, all eight
catalogue cycles, eight close/reopen cycles, garbage collection and context
restoration. These are the actual production modules served unchanged from the
verified ZIP. Browser observation adds overhead; it does not replace the game
clock, renderer, accepted state or input actions.

The scene owns 41 meshes, 17,922 vertices and 788,568 mesh bytes, plus its sky
buffer: 42 live buffers / 788,592 bytes / two programs. Four occupied bays plus
inspection submit 39 mesh draws and one sky draw. Model/camera switching adds
no buffers or uploads. Idle callbacks add no draws. Disposal returns all live
showroom buffers, programs and bytes to zero; context-invalidated resources are
counted separately. The normal race canvas remains owned by its existing scene.

## Legacy authority and offline delivery

[Source isolation](evidence/co-013e/source-isolation.json) records **85 existing
source/vendor/track files byte-identical to published v1.2.0**. The sole changed
existing source file is `src/main.js`, the reviewed D menu adapter. E changes no
production runtime file. The full-state comparison against v1.2.0 passed all
**45,225 ticks**, as recorded in [v120-comparison.json](evidence/co-013e/v120-comparison.json).

The original 45,225-tick v1.0.0 regression remains in the full Node suite. E also
runs the same full six-course/environment state, input-tape, classification and
replay comparison against the exact published v1.2.0 source. The reviewed menu
adapter is recorded separately; physics, driving commands, championship and
replay authority remain byte-checked. Crash Lab, computational panels, Derby
and replay v5/v6 receive their existing pure and real-browser checks.

Fresh static-site and independent ZIP destinations were built and verified.
All **103 runtime files** matched after independent extraction. The tested ZIP
is `Circuit-Overdrive-66db7fee84d389f152ef53b6801e4b51031fd0ef.zip`,
**860,320 bytes**, SHA-256
`db30e3bf644073f4e58c4470756a1f940429276db2cf7ca1d80a5278c0c1ac23`.
The [package receipt](evidence/co-013e/offline-package.json) binds those results
to the implementation. No archive is claimed to represent an untested final
merge SHA.

Accepted D's [post-merge CI and Pages run](https://github.com/QSOLKCB/Circuit-Overdrive/actions/runs/45581613998)
completed successfully at `d65525f11a1353f09ac859af9a09c0605888e197`.
E's eventual main/Pages checks remain a release gate.

All runtime imports, assets, relative paths, source stamps, vendor SHA-256
provenance and licences pass the existing static graph and independent archive
checks. Extracted archive files match the separately packaged site; only
`RELEASE.json` and `START-HERE.txt` are archive additions. No CDN, cloud save,
telemetry or backend is required. The local static HTTP server supplies native
module MIME types; export/import uses local browser File/Blob APIs.

## Reproduce and review

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs NEW_SITE_DIRECTORY
python3 scripts/offline-release.py build NEW_ARCHIVE_DIRECTORY
python3 scripts/offline-release.py verify NEW_ARCHIVE_DIRECTORY
bash scripts/browser-pages.sh BASE_URL NEW_BROWSER_EVIDENCE_DIRECTORY
node tests/compare-v100.mjs CLEAN_PUBLISHED_V120_CHECKOUT
```

Browser scripts use an existing external Playwright installation through
`PLAYWRIGHT_MODULE` and Chrome through `CHROME_BIN`; neither is a runtime game
dependency. Serve the source-stamped extracted package at `/Circuit-Overdrive/`.
For a focused journey, run `tests/browser-garage.mjs` with `SOURCE_SHA` and a fresh
`EVIDENCE_DIR`; native uses `GARAGE_NATIVE=1 GARAGE_HEADFUL=1`. For performance,
use `tests/browser-garage-performance.mjs` on an otherwise idle native desktop.

Owner play-through: create a garage, inspect all six models and four views, buy
and reload a car, fill four bays, select/sell, export/import, reject an invalid
file and reconcile a second tab. Return to each racing mode and verify its
original vehicle and controls. Review screenshots, receipts and timing tails.
The [player guide](garage-player-guide.md) explains empty-garage recovery and
the [vault contract](garage-save-vault.md) explains storage support and limits.

## Remaining owner release gates

- Review/accept E and integrate it into main; A–D are already owner-merged.
- Record the exact final main SHA and verify all protected post-merge CI and
  public Pages jobs at that source. Pre-merge evidence does not certify a
  different merge commit automatically.
- Complete owner play-through and accept presentation/performance limitations.
- Rebuild and verify the source-stamped offline ZIP from final main.
- Owner manually creates the immutable v1.3.0 tag, release notes and publication.

Storage guarantees apply to cooperating same-origin tabs with Web Locks and
accessible localStorage. Browser acknowledgement is not a backup against
eviction, deletion, local edits or disk failure. A player controls their local
fictional save; this is not authentication or an anti-cheat ledger. Geometry is
cosmetic; no horsepower, handling, repair, tuning or race-currency claim is added.
Native measurements cover a bounded workload, not unlimited-session proof.
Future Built Not Bought, Underground and the Foundries retain their separate
scopes. No self-approval, merge, tag, publication or settings change is performed.

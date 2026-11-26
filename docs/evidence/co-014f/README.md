# CO-014F certification evidence

[Overall acceptance and owner release gates](../../co-014-acceptance.md) identify the completed checks, limits and exact sources. F adds tests, tools and documentation; the 118 shipped runtime blobs are unchanged from the owner-merged E base.

| Evidence source | Exact SHA |
| --- | --- |
| Published v1.3.0 | `1c745a90258d0f6cb968935f773354cff702b276` |
| E post-merge baseline | `b03516f6c967f7fbd0ae3f07fe81433ca279621b` |
| Functional/physical/economy/browser run | `6eb0d1da9a5209b875bd064da97e74d08d6ecef2` |
| Native profiler and verified extracted ZIP | `5454e365fc39bd4400df4c8f7a0e6818ca5cc2c9` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |

- `physics.json` retains every original measured field from 92 independently reconstructed stock/modified tests, eight mechanical categories and ten v7 seek/restart verifications. `rawArtifact` identifies the original 1,026,216-byte report and its deterministic regeneration command. [Physical methods and table](../../machine-certification-physics.md).
- `economy.json` is the original 12,307-byte receipt: 1,024 sequences, 24,576 operations, an independent money/inventory journal, all six models/nine slots, immutable published fixtures and unchanged UTF-8 storage bounds. [Economy/migration interpretation](../../machine-certification-economy.md).
- `native-performance.json` retains every original parsed native frame sample, resource counter, heap/audio observation, accepted build and screenshot hash. Its compact copy adds `rawArtifact` provenance and is otherwise deeply equal to the original 1,056,696-byte report. [Native environment, timings and limits](../../machine-performance.md).
- `native-upgraded-v7.json` is the original native browser download. Eight actual upgraded 900-call runs and recordings agree byte-for-byte; the real purchased car keeps `car-000001` and 360 credits. It requires the exact matching native-source runtime, not a newer live garage.
- The nine `machine-native-*-1080p.png` files are actual native captures: the workshop, six original stock silhouettes, purchased upgraded-car test and build-bound viewer. Their SHA-256 values match the native receipt. The 1920×1080 viewport contains smaller explicitly measured canvas buffers; the images are not mockups.
- `benchmark-matrix-browser.json` records all six stock admissions, 24 complete stock/proposed test pairs and ten additional proposal pairs through actual production controls. Free tests create no ownership or income. `machine-shop-browser.json`, `garage-browser.json` and `proving-lifecycle-browser.json` retain purchase/save/reload/replay and lifecycle journeys from the seven-worker run.
- `browser-workers.json` indexes the seven passed workers and all 23 suites. Complete raw logs, race inputs, screenshots and per-suite receipts remain under `/tmp/co014f-browsers/`; the repository retains a SHA-256 inventory in `browser-artifacts.json`. Historical coverage was retained, with the new matrix added to lifecycle.
- `migration-browser.json` and `parts-browser.json` are extra actual published/current migration and transaction/failure journeys. `cancellation-browser.json` executes the reported final-recording cancellation boundary using a precisely labelled synthetic CDP scheduling condition and the production select handler, without injected physics/results.
- `node-tests.log` records **560/560 passed**, no skips or failures. `v130-parity.json` binds the direct **45,225-tick** comparison to the functional source; the Node suite also passed its historical comparison.
- `runtime-parity.json`, `functional-offline.log`, `native-offline.log`, `native-http.log`, `offline-tests.log` and `shards.log` cover immutable runtime bytes, independent source-stamped archives, all 118 HTTP/MIME checks, licences/asset allowlists and the protected seven-worker structure. `baseline-post-merge-checks.json` and `baseline-public-http.log` are read-only observations of the already merged/deployed E source, not a deployment of F.

`verification.json` records final counts, source bindings and hashes for the retained artifacts. The two compact physical/native reports preserve their complete original parsed values; no opaque truncated sample set substitutes for the measurements. Node is optional development tooling, and Playwright is installed outside the application. The shipped game has no runtime npm or network dependency.

Reproduce functional certification at the functional source:

```sh
node --test tests/*.test.mjs
node scripts/certify-machine-physics.mjs
node scripts/certify-machine-economy.mjs
node tests/compare-v100.mjs /path/to/clean-published-v1.3.0
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/new-site/Circuit-Overdrive
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/new-site
```

With an external development Playwright driver, run every worker or the complete serial equivalent:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_BIN=/usr/bin/google-chrome \
bash scripts/browser-pages.sh http://127.0.0.1:8000/Circuit-Overdrive/ /tmp/new-browser-evidence
```

For native measurement, use the exact native source and an otherwise quiet documented machine. Build/independently verify a fresh offline ZIP, extract it intact, and serve the extraction under `/Circuit-Overdrive/`. Then:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_BIN=/usr/bin/google-chrome \
SOURCE_SHA=5454e365fc39bd4400df4c8f7a0e6818ca5cc2c9 EVIDENCE_DIR=/tmp/new-native-evidence \
node tests/browser-machine-performance.mjs http://127.0.0.1:8000/Circuit-Overdrive/
```

Native mode requires all eight cycles and the NVIDIA renderer. `MACHINE_PERF_SOFTWARE=1` is an explicitly software-only diagnostic path and does not count as native certification. Performance samples are empirical and vary between runs; reproduction settings do not promise identical wall-clock bytes.

The measured source archives remain locally at `/tmp/co014f-offline/` and `/tmp/co014f-native-offline/`. Their verified SHA-256 values are respectively `8d1e2355f988910ce7243664a7b5ce917bd5bc6f4e8eda37e8aac9d080ea31d9` and `6ccaea2a3a6e5bd093b80d9cdc22a40e55739a00efe60804e2865dd613cf02c3`. A later evidence commit or merge has a new source stamp and needs its own final archive before release.

The owner still controls F review/merge, final main-source CI/Pages verification, manual play-through and v1.4.0 tagging/publication. Repairs remain unavailable for pristine cars; there is no fabricated damage, income or currency settlement. Native frame tails and bounded lifetime observations are reported without a locked-60-FPS, unlimited-leak-freedom or untested cross-browser guarantee.

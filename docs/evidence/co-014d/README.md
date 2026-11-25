# CO-014D evidence

Base `80343db601b53df4f42071a46c377617e450d25e`; final tested runtime `a7abf42213aa831608eb3d25726200d503addf53`; engine `9d95d74b355ec17add32db0b55f0f71130f9c004`. This is D owner-review evidence, not v1.4.0 release certification. [Acceptance and limitations](../../co-014d-acceptance.md).

- `physical-summary.json`: 24 stock benchmark runs and 11 variants, source-file hashes, canonical builds, source-bound digests, starting conditions, accepted counts, command hashes, physical results and diagnostics. The compact copy omits repeated canonical recipe strings and detailed wheel state; full receipt hashes and regeneration instructions remain.
- `proving-browser.json`: eight production-control scenarios, all four stock/current/proposed tests, frame-timed acceleration/export equality and all six free stock admissions. Large feedback tapes are omitted from this retained copy; original local report SHA-256 and size remain. No accepted build or position was injected into this journey.
- `proving-ground-lifecycle-browser.json`: five additional scenarios, including a real installed gearbox, real second-tab paint transaction, native browser touch cancellation, disclosed synthetic controller service and explicit invalid owned-URL rejection.
- `proving-ground-receipt-01.json`: original 7,185-byte native browser download, without compaction. SHA-256 `ea8fb80ae3f04ed4241d30725189a3a98570cc612cb99bb2d2b08043aa583930`.
- `owned-cinder-manual-drive.png`, `controlled-build-comparison.png`, `stock-yardhand.png`, `stock-glass-comet.png`: actual final runtime, original physical silhouettes, visible measured comparison. Their hashes are bound in the browser report and verification manifest.
- `migration-browser.json`: six real published v1.3.0/final-candidate migration and failure/recovery scenarios. Obsolete-tab event suppression and storage faults are disclosed service conditions.
- `garage-browser.json`, `parts-browser.json`: 23/eight regression journeys on initial D source `248b9b9e8924bf81c7bcc1a61703c42042e274c7`. Garage adapters are byte-identical in final D; final-source proving/migration runs separately cover owned admission, purchase/fitting, return and preserved saves.
- `node-tests.log`, `v130-parity.json`, `shards.log`, `offline-tests.log`, `offline.log`, `http.log`: executed checks and exact source-stamped archive/HTTP evidence. `verification.json` indexes retained artifact SHA-256 values and final results.

Reproduce from the exact implementation source:

```sh
node --test tests/*.test.mjs
node scripts/measure-proving-ground.mjs --summary
node tests/compare-v100.mjs /path/to/clean-published-v1.3.0
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/new-site/Circuit-Overdrive
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/new-site
```

In another terminal, use a separately installed development Playwright driver and native Chrome executable:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_BIN=/usr/bin/google-chrome \
EVIDENCE_DIR=/tmp/new-proving-evidence \
node tests/browser-proving-ground.mjs http://127.0.0.1:8000/Circuit-Overdrive/
node --experimental-vm-modules scripts/verify-pages.mjs http://127.0.0.1:8000/Circuit-Overdrive/
python3 scripts/offline-release.py build /tmp/new-offline
python3 scripts/offline-release.py verify /tmp/new-offline
```

Node is optional development tooling; the shipped game has no runtime npm dependency. The exact final D ZIP is retained locally at `/tmp/co014d-final-offline/Circuit-Overdrive-a7abf42213aa831608eb3d25726200d503addf53.zip`; build/verify logs record its immutable hash. A later evidence/CI-only commit or merge has a new source revision and needs its own archive stamp before any release.

Browser: Chrome 158.0.8127.36, Linux, 1440×1080 functional viewport, ANGLE/SwiftShader. Shared input service faults are identified in reports. Recording-WebGL resource tests cover 18 meshes and eight repeated cycles per model without per-frame uploads. Neither these resource tests nor software-browser screenshots claim native RTX frame-time or memory certification. Native upgraded-workload profiling, full workshop/replay flows and final release gates remain E/F.

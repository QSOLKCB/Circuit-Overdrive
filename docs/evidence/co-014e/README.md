# CO-014E evidence

Exact base `57a30486fcf8674e30486d01dea972b8981bcccd`; tested runtime `f580e9091da2c1bb188a89b0882f7d89460c8e70`; engine `9d95d74b355ec17add32db0b55f0f71130f9c004`. [Acceptance, contracts and owner steps](../../co-014e-acceptance.md). This is the E review gate, not final v1.4.0 certification.

`machine-shop-browser.json` records eleven production-control scenarios: real purchases and all nine fitted slots, actual stock/engine benchmarks, quantized tuning, preserved identity/credits/inventory, validated native garage export/import, measured comparison reconstruction, original-build playback after later fitting, bounded seek/restart, graphics recovery, rejected recordings and a real second-tab transaction during pending verification. No installed build, owned ID, position or benchmark result was injected. Final all-fitted balance is 360 credits; the intentional subsequent factory-paint refit costs 10, leaving 350. Verification and playback spend nothing.

The native downloads `owned-engine-v7-replay.json`, `stock-acceleration-receipt.json` and `machine-shop-garage-export.json` retain their original bytes. The v7 recording reconstructs the engine-only factory-finish car even after the live car has different gearing, tyres, suspension and midnight paint. Import it only into its matching-source package. Regenerating a package at a later evidence commit or merge creates a different source stamp; make new recordings there.

Six original captures show the selected stock machine, actual measured comparison table, accepted midnight/rim styling, rear flow-exhaust tips, a 390 px mobile workshop and the original-build replay's accepted terminal state. Their exact SHA-256 values are recorded in the browser report and `verification.json`. Images are functional Chrome screenshots, not mockups or native performance certification.

`parts-regression.json` retains eight existing fitting/economy browser scenarios. `garage-regression.json` retains 23 ownership, storage, controller/touch and WebGL regression scenarios. `proving-regression.json` and `proving-lifecycle-regression.json` retain thirteen proving-ground scenarios, including all six stock admissions, four physical tests, actual purchased engine/gearbox changes, native receipt export, held-input clearing, controller disconnect, touch cancellation and stale saved-build rejection. The compact proving summary omits repeated large feedback tapes and records the full local report's byte count and SHA-256.

`node-tests.log` is the complete final Node run. `v130-parity.json` binds the direct 45,225-tick comparison to published v1.3.0. The full suite also performs the historical comparison. `offline-tests.log`, `offline.log`, `http.log` and `shards.log` retain independent archive verification, source-stamped HTTP byte/MIME checks and seven-worker browser orchestration checks. The Machine Shop suite is added inside the existing lifecycle worker; no historical suite is removed.

Reproduce at the declared implementation revision:

```sh
node --test tests/*.test.mjs
node tests/compare-v100.mjs /path/to/clean-published-v1.3.0
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/new-machine-site/Circuit-Overdrive
python3 -m http.server 8000 --bind 127.0.0.1 --directory /tmp/new-machine-site
```

Then run the actual browser controls with an independently installed development driver:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs CHROME_BIN=/usr/bin/google-chrome \
EVIDENCE_DIR=/tmp/new-machine-evidence \
node tests/browser-machine-shop.mjs http://127.0.0.1:8000/Circuit-Overdrive/
node --experimental-vm-modules scripts/verify-pages.mjs http://127.0.0.1:8000/Circuit-Overdrive/
python3 scripts/offline-release.py build /tmp/new-machine-offline
python3 scripts/offline-release.py verify /tmp/new-machine-offline
```

The tested ZIP remains locally at `/tmp/co014e-final-offline/Circuit-Overdrive-f580e9091da2c1bb188a89b0882f7d89460c8e70.zip`; SHA-256 `21588f6aea62ef9b0cf9305270a6c4d4575f931366ea749dddd4542ea7619996`. Node v22.18.0/Linux; Chrome 158.0.8127.36, 1440×1080 functional viewport, ANGLE/SwiftShader. The application has no runtime npm, network service or remote asset dependency.

Native RTX frame intervals, full upgraded-workload profiling, audio/heap endurance and final release certification remain F. These artifacts do not claim 60 FPS, cross-browser bit-exact determinism, authentic human input or persistent owned-car damage. The pristine shop correctly supplies no repair bill. Nothing is merged, tagged or published by this branch.

## Cancellation review follow-up

Runtime `59bc557005013945f1be95786bfaeca82e207fbd` fixes cancellation during the final proposed recording verification. `cancellation-fix.json` records 20 passing focused tests, red reproduction against the original controller, old/fixed Chrome reports and artifact hashes. The controlled browser check pauses at the actual admission yield and invokes the production select’s registered handler; it does not inject physics or results. Reproduce with `node --test tests/proving-comparison-cancellation.test.mjs tests/proving-replay.test.mjs` and the optional `tests/browser-proving-cancellation.mjs BASE_URL` against its source-stamped package. Use `--expect-stale` only to reproduce the bug in the archived old package. Earlier broad acceptance artifacts above retain their original source identities.

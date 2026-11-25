# CO-013-UX-001 — First Garage Experience evidence

Baseline: `3565d6cb4d178b7b3b049c334a6aaef5cbe2aa5c`. Tested implementation: `75e2ba4645e728ffe107e246942d3fb60d08d638`.
VANILLAJS remains `9d95d74b355ec17add32db0b55f0f71130f9c004`. v1.3.0 remains a candidate.

## Owner-discovered issue and correction

The first manual play-through found disabled purchases while the required Create action was below the independently scrolling sidebar. At 1440×900 the baseline Create button began at y=1310.66, below the panel bottom y=867. The corrected introductory panel appears before camera/catalogue controls and focuses Create. Creation still requires the existing Save Vault confirmation and verified commitment.

After successful creation, the announcement reports 2,400 credits and the selected purchase is brought into view and focused. Cancelling restores the visible setup action even when the cancellation message increases panel height. Corrupt/unsupported slots offer explicit recovery; unavailable and conflicting storage explain how to reconcile. Valid saved garages hide first-time setup.

## Actual browser execution

`tests/browser-garage.mjs` passed **22 scenarios**, retaining all 18 certification scenarios and 17 invalid-import cases. Chrome 158.0.8127.36 used **ANGLE SwiftShader (software)** on loopback under `/Circuit-Overdrive/`. The receipt records 1,701 same-origin requests, zero external requests and zero browser errors. Four fresh contexts tested 1920×1080, 1440×900, 720×900 and 390×844, including keyboard setup/cancellation/purchase, stale scroll, stable saved reopening and reduced motion. The touch and controller cases remain in the suite.

The setup checks assert no initial or cancelled storage, single commitment while busy, saved 2,400 credits/four empty bays, enabled visible Buy/focus, preserved Lilt selection, first Cinder Two at 600 credits/car-000001/Bay 1, 1,800 credits and real reload persistence. Storage faults include initial quota/read/write denial, uncertain read-back, missing Web Locks, malformed/unsupported data and stale tabs. Faults alter browser services or invalid raw storage only; accepted inventory and balances are created through actual confirmed UI actions.

[garage-browser.json](garage-browser.json) contains all scenarios, four layout receipts, download hashes and 34 capture observations (33 unique files; corrupt/unsupported recovery produce the same image). The selected review captures below are retained here; the remaining certification images stay in the execution artifact. All nine real downloaded files are retained as `download-01.json` through `download-09.json`.

## Review captures

| Capture | Source | SHA-256 |
| --- | --- | --- |
| [before-empty-garage.png](before-empty-garage.png) | baseline | `8a53481c462dacbf370cc86bd7aa6bacf1fb6921ef9f276a0459333cc671c75b` |
| [first-visit-cta.png](first-visit-cta.png) | implementation | `a2e439e03d976b62faf8a0221543c6c6ccba8fac90afbba30be3ed2122370bb6` |
| [create-confirmation.png](create-confirmation.png) | implementation | `a430df6d87c55abd904226aee09caeeabc7d0f907b7cf3336586c1fd5b0b97cf` |
| [created-buy-enabled.png](created-buy-enabled.png) | implementation | `10ae6157202adc6909c94e122af295a019af61811d3cdb97c3cb028cca705944` |
| [first-owned-bay.png](first-owned-bay.png) | implementation | `7e74aa4f510c848102a8267d1c31c1f7fdcf797be82d12195b488bf15d87461b` |
| [reloaded-first-car.png](reloaded-first-car.png) | implementation | `766e3bc26c86c0a9da49ef8cbade367643f24ff75494e45577aac600165faa99` |
| [corrupt-save-recovery.png](corrupt-save-recovery.png) | implementation | `8eba62fc651576475ff19b1bf8da8d46d6b6f37f9c393d27fa96416621b88f60` |
| [stale-tab-conflict.png](stale-tab-conflict.png) | implementation | `8d3ba422eca93a126e78b12fc673413c8418626825baffb736eec026829b93f7` |
| [onboarding-1920.png](onboarding-1920.png) | implementation | `9f149f7ee03e866b09578b4b605fb99dee80f6d511e03fd5ab7e931c00859ec8` |
| [onboarding-1440.png](onboarding-1440.png) | implementation | `9ac4c0e9f15858a1e313b714a65f83b15e06a72dd60ca2398f10056567f89fe5` |
| [onboarding-720.png](onboarding-720.png) | implementation | `b6be98967433667eaa68aec59f37926cf0ca7062fe3c711a583230cd57f40b85` |
| [onboarding-390.png](onboarding-390.png) | implementation | `958581acc4817c73fa14b60a6805b8f689e582747f0f29924aaaded5e17655d1` |

## Bounded resource regression

The unchanged `tests/browser-garage-performance.mjs` passed with `GARAGE_PERF_SOFTWARE=1`: eight catalogue cycles (48 selections, 192 camera actions), eight reopens and context restoration. It retained 42 buffers / 788,592 bytes / two programs; idle callbacks added no draws/uploads and switching added no buffers/uploads. Final closure left zero live showroom buffers/programs/bytes. The raw [software receipt](software-resource-regression.json) includes observational timings; **these do not establish native GPU performance**. The profiler is unchanged and no new native benchmark is claimed for this DOM/CSS correction. Its generic screenshot filename in the raw receipt is retained by the existing harness; that profiler screenshot is not duplicated here.

## Packaging, regression and reproduction

[offline-package.json](offline-package.json) identifies the independently built and verified ZIP; all 103 runtime files match the separately packaged site after extraction. [source-scope.json](source-scope.json) records the two changed runtime files. All authority, engine, geometry and championship files are unchanged. The full Node suite passed **360 tests, zero failures**, including the historical **45,225 matching ticks**. Offline Python verification passed (one test), and shard orchestration/failure propagation passed. Exact commands and totals are in [verification.json](verification.json), with [Node](node-tests.log), [offline](offline-tests.log) and [shard](shards.log) logs.

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node --experimental-vm-modules scripts/package-site.mjs NEW_SITE_DIRECTORY
python3 scripts/offline-release.py build NEW_ARCHIVE_DIRECTORY
python3 scripts/offline-release.py verify NEW_ARCHIVE_DIRECTORY
```

Serve the new site at `/Circuit-Overdrive/`, then run the garage browser suite with external `PLAYWRIGHT_MODULE`, `CHROME_BIN`, `SOURCE_SHA` and a new `EVIDENCE_DIR`. Run the unchanged profiler with `GARAGE_PERF_SOFTWARE=1` for the labelled resource regression. No test driver is a runtime dependency. Browser shard orchestration is tested here; the seven full browser lanes are left to the existing PR CI.

Owner review: use a fresh browser profile, open The Garage, find Create immediately, cancel once, confirm, buy Cinder Two, verify 1,800 credits/Bay 1, reload, then repeat on a narrow display. Check recovery copy and focus against the screenshots. Automated keyboard/touch checks do not replace assistive-technology or owner play-through. Storage support/trust boundaries remain in the [vault contract](../../garage-save-vault.md). No release, tag or merge is performed.

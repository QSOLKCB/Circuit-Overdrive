# CO-013A — registry acceptance

This is the first of five owner review gates for the v1.3.0 candidate. It establishes data admission and inventory structure. Transactions, concurrent persistence, showroom interaction and full garage certification remain B–E.

## Source and scope

| Item | Exact identity |
| --- | --- |
| Published v1.2.0, inspected main and PR base | `e12665b04609f40d452084a37264756a23d730da` |
| Implementation tested | `04f915001fdb69239bb063af16d4cd69ba95d944` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |
| STREET-RACER reference | `03c038c401b3dada8646aa0c5791617d09683b00` |
| Runtime | Node v22.18.0, Python 3.14.4, Linux 7.0.0-43-generic / Ubuntu |
| Browser | Chrome 158.0.8127.36, headless ANGLE/SwiftShader |

The subsequent documentation commit records these executed results without changing the implementation. The PR description records its exact final head. `README.md` and `ROADMAP.md` now identify v1.2.0 as published and v1.3.0 as a candidate. The future Foundries research item remains intact.

Source additions are `src/garage-catalog.js`, `src/garage-data.js` and `src/garage.js`. Tests are in `tests/garage-registry.test.mjs`. The [registry contract](garage-registry.md) documents each field, bounds, prototype policy, original catalogue, provenance and future transaction obligations. There are no engine, gameplay, storage, workflow or package-allowlist changes.

## Executed checks

| Command/check | Expected | Actual |
| --- | --- | --- |
| `node --experimental-test-isolation=none --test tests/garage-registry.test.mjs` | All schema tests pass without executing hostile getters | 12 passed, including 1,024 independently constructed inventory fixtures |
| `node --test tests/*.test.mjs` | Existing and new tests pass on committed source | 321 passed, 0 failed; includes 45,225 matching legacy ticks across six course/environment combinations against the existing v1.0.0 reference |
| `python3 tests/test_offline_release.py` | Independent offline integrity test passes | 1 passed |
| `bash tests/browser-pages-shards.sh` | Preserve all seven browser lanes, evidence paths and failure propagation | Passed; this checks orchestration and does not launch seven real browser lanes |
| `git diff --check` | No whitespace errors | Passed |
| Byte comparison of every `siteFiles` path against published v1.2.0 | Existing runtime unchanged | All 92 files match exactly before source stamping |
| Independent code review | No demonstrated registry correctness defect | No actionable findings within A |

The generated checks cover empty through full garages, duplicate model instances, distinct instance IDs, active selection, non-contiguous allocation history, maximum counters, deterministic serialization and immutable owned copies. Rejection checks cover unknown/extra/missing fields, symbols, nonenumerable properties, sparse arrays, accessors, serialization hooks, unexpected prototypes, duplicate IDs, unknown models, unsafe money, negative zero, invalid formats and 64 KiB UTF-8 bounds. These are snapshot fixtures, not purchase/sale sequences or proof of transaction settlement. B must supply the transaction-sequence evidence.

The first sandbox run could not provide usable subprocess-backed evidence. The first unrestricted run reported 320 passing tests and one rejected legacy comparison because the new source was still uncommitted when that audit started. The final run uses the clean implementation commit above; no test assertion was weakened to bypass the clean-source guard.

## Offline package and browser

Fresh paths used on this machine:

```sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/co013a-verification.FKMHqO/site/Circuit-Overdrive
python3 scripts/offline-release.py build /tmp/co013a-verification.FKMHqO/archive
python3 scripts/offline-release.py verify /tmp/co013a-verification.FKMHqO/archive
```

Both independent builds produced the same 785,494-byte archive:

```text
Circuit-Overdrive-04f915001fdb69239bb063af16d4cd69ba95d944.zip
SHA-256 47c986dfc23747a30f42b6f5a518f25b1886ce6796db2d5c9188dac9c33d22fd
```

All 92 extracted runtime files equal the separate static package. `START-HERE.txt` and `RELEASE.json` are the only archive additions. Source stamps, allowlist/import closure, relative URLs, vendor checksums and notices passed the established packaging checks. Pure registry modules remain source-only until their UI dependency closure exists.

Served the extracted ZIP on loopback under `/Circuit-Overdrive/`, then executed:

```sh
PLAYWRIGHT_MODULE=/tmp/co-012-browser-tools/node_modules/playwright/index.mjs \
CHROME_BIN=/usr/bin/google-chrome \
node tests/browser-smoke.mjs http://127.0.0.1:8133/Circuit-Overdrive/
```

Passed actual menu/start/countdown/driving, pause/resume, held-input focus loss, recovery/restart, reduced-effects transitions, WebGL context loss/restoration, unavailable-WebGL fallback and audio-device failure. There were 70 observed requests, no page/HTTP errors and no external runtime requests. Renderer reported `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. This is software-rendered legacy smoke coverage, not native GPU performance or garage UI certification.

Local logs are `/tmp/co013a-node-final.log`, `/tmp/co013a-offline-tests.log` and `/tmp/co013a-verification.FKMHqO/browser-smoke.log`. These temporary paths are reproduction evidence from this session, not shipped assets. The source, deterministic commands and archive hash above identify what ran.

## Owner review

Run the registry tests, review the six names/descriptions/finishes/prices and inspect the canonical four-slot save in the contract. The existing packaged game remains available for legacy play-testing. No garage menu, purchase, sale or preview is advertised in this first PR. Review A before proceeding to B. No approval, merge, release tag or production publication was performed by the agent.

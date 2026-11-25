# CO-013B — transaction acceptance

This is the second of five owner review gates for the v1.3.0 candidate. Pure purchases, sales and selection now preserve the accepted ownership and money invariants. Storage commitment, stale-tab browser coordination and the playable showroom remain C–E.

## Source

| Item | Exact identity |
| --- | --- |
| Published v1.2.0 baseline | `e12665b04609f40d452084a37264756a23d730da` |
| PR base, accepted registry merge | `0554ec0e8bf6d7b508dfd818d35fd8b2f59a6baf` |
| Implementation tested | `5c0b9c46096f068f56cbdfb99b5aa12e3e01f7c7` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |
| STREET-RACER reference inspected for CO-013 | `03c038c401b3dada8646aa0c5791617d09683b00` |
| Environment | Ubuntu/Linux 7.0.0-43-generic, Node v22.18.0, Python 3.14.4 |
| Browser | Chrome 158.0.8127.36, headless ANGLE/SwiftShader |

PR #55 was verified merged, with its exact main [CI run successful](https://github.com/QSOLKCB/Circuit-Overdrive/actions/runs/45554332127), before branching for B. The subsequent evidence-only commit adds this report; the PR body records its exact head separately from the tested implementation. No schema or engine pin changed.

New source is `src/garage-transactions.js`. New tests are `tests/garage-transactions.test.mjs` and `tests/garage-transaction-sequences.test.mjs`. `README.md`, `ROADMAP.md` and the registry guide identify the accepted A and candidate B scopes. The [transaction contract](garage-transactions.md) specifies request admission, result/receipt fields, rejection precedence, deterministic resale, selection fallback, retry semantics, recovery and the future storage boundary. The Foundries roadmap item is retained.

## Executed checks

| Command/check | Expected | Actual |
| --- | --- | --- |
| `node --experimental-test-isolation=none --test tests/garage-registry.test.mjs tests/garage-transactions.test.mjs tests/garage-transaction-sequences.test.mjs` | Registry plus focused/generated transaction checks pass | 29 passed, 0 failed |
| `node --test tests/*.test.mjs` | Full existing and new suite passes from committed source | 338 passed, 0 failed; includes the existing 45,225-tick comparison across six course/environment combinations against the published v1.0.0 reference |
| `python3 tests/test_offline_release.py` | Independent offline integrity check passes | 1 passed |
| `bash tests/browser-pages-shards.sh` | Preserve seven-lane orchestration and failure propagation | Passed; orchestration check, not seven real browser executions |
| `git diff --check` | No whitespace errors | Passed |
| Compare every runtime allowlist file with published v1.2.0 | Existing runtime unchanged | All 92 files match exactly before source stamping |
| Independent contract/source audit and boundary probes | No demonstrated transaction defect | No actionable findings |

The 15 focused transaction tests exercise genuine starter and premium purchases from 2,400 credits, all four occupied bays, a rejected fifth car, insufficient funds, deterministic proceeds, active/inactive/last-car sale, lowest-bay fallback, selection, retrying committed actions, competing stale requests, exact credit ceiling, overflow, allocator/revision exhaustion, malformed actions and state, immutable owned output and inert accessor rejection. No test inserts a free car into the ordinary buy/sell workflow. Explicit synthetic boundary states exercise unreachable-in-normal-play upper bounds.

The independent generated ledger uses a separate map of owned IDs and ordered slot IDs, with hardcoded reviewed purchase/resale values rather than implementation quote helpers. It ran **1,024 sequences of 64 operations**, totalling **65,536 primary requests**:

| Outcome | Count |
| --- | --- |
| Accepted purchase | 5,493 |
| Accepted sale | 5,080 |
| Accepted selection | 3,470 |
| Rejected request | 51,493 |

768 sequences start from the genuine fresh garage. 256 are explicitly labelled synthetic boundary fixtures for funds, allocator and revision limits. Every accepted result is compared with the independent complete expected state and receipt, exact balance change, unique IDs, persistent bay positions, active ownership, serial monotonicity and canonical serialization. The same original input recomputes the same transition; retrying its request against the accepted next state rejects. Every rejection preserves the input. A separate all-model repeated-trading test confirms strictly losing buy/sell cycles, eventual insufficient funds and no ID reuse.

This verifies pure state transitions. It does not prove cross-tab commitment, persisted purchases or storage-failure recovery. Those require C's exclusive lock, previous-value comparison, replacement-generation handling and confirmed write before promoting state. No browser UI can yet grant ownership from these source-only modules.

## Offline and browser

Fresh local build/verification commands:

```sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/co013b-verification.XEwELh/site/Circuit-Overdrive
python3 scripts/offline-release.py build /tmp/co013b-verification.XEwELh/archive
python3 scripts/offline-release.py verify /tmp/co013b-verification.XEwELh/archive
```

Independent archive reconstruction passed for the 785,494-byte ZIP:

```text
Circuit-Overdrive-5c0b9c46096f068f56cbdfb99b5aa12e3e01f7c7.zip
SHA-256 4042c141bf40ee4318e8b9156713697890312018b8877f247e2949980507551c
```

All 92 extracted runtime files equal the separate static package. `START-HERE.txt` and `RELEASE.json` are the only archive additions. Source stamps, asset allowlist/import closure, relative URLs, licences, notices and pinned vendor hashes passed the established verifier. As in A, unused garage modules remain outside the runtime allowlist until D connects the UI.

The extracted ZIP was served on loopback under `/Circuit-Overdrive/`, then tested with:

```sh
PLAYWRIGHT_MODULE=/tmp/co-012-browser-tools/node_modules/playwright/index.mjs \
CHROME_BIN=/usr/bin/google-chrome \
node tests/browser-smoke.mjs http://127.0.0.1:8134/Circuit-Overdrive/
```

Passed menu/start/countdown/driving, pause/resume, held-input focus loss, recovery/restart, reduced-effects transitions, WebGL context loss/restoration, unavailable-WebGL fallback and audio-device failure. Observed 70 requests, no page/HTTP errors and no external runtime requests. Actual renderer was `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. This is software-rendered legacy smoke coverage, not native GPU or garage interaction certification.

Session-local logs are `/tmp/co013b-focused.log`, `/tmp/co013b-node-final.log`, `/tmp/co013b-offline-tests.log` and `/tmp/co013b-verification.XEwELh/browser-smoke.log`. They are temporary reproduction evidence, not packaged runtime assets.

## Owner review

Run the focused tests and the contract's Node example. Review the 60% resale table, lowest-bay placement/fallback, rejection codes and mandatory unchanged expected revision on retries. Confirm the documented explicit new-garage recovery policy for C/D. Existing packaged modes remain available for legacy play-testing; this PR does not add garage Buy/Sell controls or claim native showroom performance. Review B before C. v1.3.0 remains a candidate, and the owner controls approvals, merges, tags and publication.

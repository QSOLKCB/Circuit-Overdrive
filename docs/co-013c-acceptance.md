# CO-013C — Save Vault acceptance

This is the third of five owner review gates for the v1.3.0 candidate. It demonstrates durable transaction commitment and local replacement using real browser storage and Web Locks. The production showroom/control integration remains D; complete garage/native certification remains E.

## Source and environment

| Item | Exact identity |
| --- | --- |
| Published v1.2.0 | `e12665b04609f40d452084a37264756a23d730da` |
| PR base, merged CO-013B | `fe8f439c42f0430469510855d400dba4e6b013fa` |
| Implementation tested | `719ec7f503ad767cd588d583458184b207ce74a7` |
| VANILLAJS | `9d95d74b355ec17add32db0b55f0f71130f9c004` |
| Runtime | Ubuntu/Linux 7.0.0-43-generic, Node v22.18.0, Python 3.14.4 |
| Browser | Chrome 158.0.8127.36, headless native browser APIs on secure loopback |

PR #56's merge was verified before branching. Its [post-merge main CI](https://github.com/QSOLKCB/Circuit-Overdrive/actions/runs/45567134444) was still running when work began. The subsequent evidence-only commit adds this report and the captured JSON/PNG files; the PR body records its exact final head. No production runtime or protected workflow changed.

New modules are `src/garage-vault.js` and `src/garage-vault-format.js`. Tests are `tests/garage-vault.test.mjs`, `tests/browser-garage-vault.mjs` and the two development fixture files under `tests/fixtures/garage-vault.*`. README/roadmap and the [Save Vault contract](garage-save-vault.md) describe the accepted A/B and candidate C boundaries. The owned-car schema, deterministic transaction engine, VANILLAJS provenance and Foundries roadmap are preserved.

## Executed checks

| Command/check | Expected | Actual |
| --- | --- | --- |
| `node --experimental-test-isolation=none --test tests/garage-*.test.mjs` | All registry, transaction, generated and vault checks pass | 46 passed, 0 failed, including 17 new vault cases |
| `node --test tests/*.test.mjs` | Full suite passes from committed source | 355 passed, 0 failed; includes the existing 45,225-tick comparison across six course/environment combinations against published v1.0.0 |
| `python3 tests/test_offline_release.py` | Independent offline integrity check passes | 1 passed |
| `bash tests/browser-pages-shards.sh` | Preserve seven-lane orchestration and failure propagation | Passed; this command does not launch real browsers |
| `git diff --check` | No whitespace errors | Passed |
| Compare all packaged runtime files against v1.2.0 | Existing shipped runtime unchanged | All 92 files match exactly before source stamping |
| Independent protocol, source and test audit | No outstanding demonstrated vault defect | Passed after fixing a reentrant observer result mismatch; regression added |

The 17 new Node cases cover strict bounded envelopes, no automatic new save, preservation of unrelated keys, write-before-publish, reload, immutable prepared requests, owner-bound/single-use/cancelled tickets, competing writers, sold-car resurrection prevention, identical-import/reset history, canonical whole-state import, rejected input, quota/denied/uncertain writes, absent locks/crypto, sequence exhaustion, corrupt-slot recovery, storage-event filtering, delayed acquisition and disposal. A successful result retains the exact committed state paired with its receipt even when an observer reenters load. No test assertion or existing contract was weakened.

## Actual two-tab browser evidence

The [committed browser receipt](evidence/co-013c/garage-vault-browser.json) records source `719ec7f503ad767cd588d583458184b207ce74a7`, Chrome 158.0.8127.36, actual Web Locks/crypto availability, 56 observed requests, no page/HTTP errors and nine successful scenarios. Production vault code ran through an explicitly labelled development adapter; garage balances and outcomes were never fabricated by the test.

1. Two simultaneously open tabs load the same saved garage. A buys, B's stale confirmation rejects, B reloads, and a sale becomes visible to A as a conflict requiring explicit reconciliation.
2. Actual Blob download, File import, backup export, confirmed whole-state replacement, identical canonical re-export and invalid-file recovery.
3. Importing identical garage data advances the envelope sequence and invalidates another tab's old confirmation.
4. A stale-tab import cannot undo a newer purchase.
5. Cancellation while an actual file read is delayed cannot revive a replacement confirmation.
6. QuotaExceededError and SecurityError at writes preserve displayed ownership and recover without free cars.
7. Interrupted read-back blocks further mutations until reload discovers the single committed result.
8. Denied reads and unavailable Web Locks fail closed without funding a garage.
9. Malformed/unsupported stored content recovers only through explicit confirmed replacement with a valid captured export.

Fault injection changes browser API behaviour to exercise errors. Successful transactions always use the real module and real Web Lock. Initialisation, purchases and sales occur through fixture controls, not injected valid garage states. Separate championship, settings and profile sentinels survive every action. The final canonical garage has 960 credits, IDs `car-000002` and `car-000003`, allocator 4 and garage revision 4; the storage sequence is 7. These values follow the scripted accepted transactions and replacements.

Reproduction from a clean checkout served under `/Circuit-Overdrive/`:

```sh
SOURCE_SHA=719ec7f503ad767cd588d583458184b207ce74a7 \
EVIDENCE_DIR=/tmp/co013c-vault-browser-committed.7DEmaU/evidence \
PLAYWRIGHT_MODULE=/tmp/co-012-browser-tools/node_modules/playwright/index.mjs \
CHROME_BIN=/usr/bin/google-chrome \
node tests/browser-garage-vault.mjs http://127.0.0.1:8135/Circuit-Overdrive/
```

The fixture shows module state and confirmation behaviour. These are not showroom or WebGL captures:

| Capture | Evidence |
| --- | --- |
| Confirmed initial empty garage | [empty-saved-garage.png](evidence/co-013c/empty-saved-garage.png) |
| Stale tab preserves its prior view and rejects confirmation | [stale-tab-conflict.png](evidence/co-013c/stale-tab-conflict.png) |
| Valid file replacement after explicit confirmation | [confirmed-import.png](evidence/co-013c/confirmed-import.png) |
| Rejected import retains accepted ownership | [rejected-import.png](evidence/co-013c/rejected-import.png) |

SHA-256 capture/receipt bindings from that run:

```text
938175232924ef70e8122867c8eec1227d11995b105176e5455a697e2df6717e  empty-saved-garage.png
f49df34041d50ee27f191a9b2318415b02192024ad222cf5addd069200f3c2da  stale-tab-conflict.png
30b9233a6dbb340c577c95ca54481a66598fa223042aae1a35be183df1594b85  confirmed-import.png
cb08c6612fa62e4f860e7ee3a809d84c2fe1576867948f28ec04b991dce64da1  rejected-import.png
ff4c17229941dc4982a06845e81c69aabbf65419bce7c2575a036c31e9ef1046  garage-vault-browser.json
```

## Offline and legacy browser

Fresh static packaging and independent ZIP build/verify ran with:

```sh
node --experimental-vm-modules scripts/package-site.mjs /tmp/co013c-verification.z1cm2s/site/Circuit-Overdrive
python3 scripts/offline-release.py build /tmp/co013c-verification.z1cm2s/archive
python3 scripts/offline-release.py verify /tmp/co013c-verification.z1cm2s/archive
```

The independently rebuilt 785,494-byte archive matched exactly:

```text
Circuit-Overdrive-719ec7f503ad767cd588d583458184b207ce74a7.zip
SHA-256 8307618daf3c1570b8be64810563573dc4a691ca9fe29c708620a44e3f270250
```

All 92 extracted runtime files equal the separately packaged site; only `START-HERE.txt` and `RELEASE.json` are archive additions. Relative URLs, source stamps, asset closure, pinned vendor hashes, licences and notices passed existing verifiers. Garage code and the fixture are deliberately outside the allowlist until D connects production UI; the ZIP check is legacy-delivery preservation, not a claim that the vault fixture ships in the game.

`tests/browser-smoke.mjs` passed against the extracted ZIP at `http://127.0.0.1:8136/Circuit-Overdrive/` using the same Playwright/Chrome paths. It exercised menu, start/countdown/driving, pause/focus/restart, graphics loss/restoration, unavailable-WebGL and audio failure, with 70 observed requests, no errors and no external runtime requests. Renderer was ANGLE Vulkan SwiftShader. No native GPU performance claim is made.

Session-local logs include `/tmp/co013c-focused.log`, `/tmp/co013c-node-final.log`, `/tmp/co013c-offline-tests.log`, `/tmp/co013c-verification.z1cm2s/browser-smoke.log` and `/tmp/co013c-vault-browser-committed.7DEmaU/browser.log`.

## Owner review

Run the Node tests, then open the development fixture in two tabs. Confirm a new garage, prepare a purchase in each tab, commit A and verify B reports conflict without overwriting it. Reload B, sell and reconcile A. Export, preview an import with the offered backup, cancel, then explicitly confirm a replacement. A malformed JSON file must leave the current garage intact.

Review the [contract](garage-save-vault.md) for fail-closed API support, sequence exhaustion, uncertain writes and the local trust model. No cloud dependency, remote asset, race reward, garage physics, self-approval, merge, tag or production publication is introduced. Owner review of C precedes D.

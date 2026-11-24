# CO-011 candidate acceptance

Published v1.0.0 and the reference checkout identify `47b1a5c1562136bfd6b98ca9d4ef2ce07282200b`. The VANILLAJS pin is `9d95d74b355ec17add32db0b55f0f71130f9c004`. Review the changes in dependency order. [A · Impact authority](https://github.com/QSOLKCB/Circuit-Overdrive/pull/43) · [B · Damage](https://github.com/QSOLKCB/Circuit-Overdrive/pull/44) · [C · Facility](https://github.com/QSOLKCB/Circuit-Overdrive/pull/45) · [D · Replay](https://github.com/QSOLKCB/Circuit-Overdrive/pull/46)

## Reproduce

Use the repository’s supported Node, Python, Git and external Playwright installation. Use fresh output directories and a separate clean checkout of the published tag.

```sh
node --test tests/*.test.mjs
python3 tests/test_offline_release.py
bash tests/browser-pages-shards.sh
node tests/compare-v100.mjs /path/to/v1.0.0
node --experimental-vm-modules scripts/package-site.mjs /new/site/Circuit-Overdrive
python3 scripts/offline-release.py build /new/offline
python3 scripts/offline-release.py verify /new/offline
python3 -m zipfile -e "/new/offline/Circuit-Overdrive-$(git rev-parse HEAD).zip" /new/extracted
diff -r --exclude=START-HERE.txt --exclude=RELEASE.json /new/site/Circuit-Overdrive /new/extracted/Circuit-Overdrive
python3 -m http.server 8000 --bind 127.0.0.1 --directory /new/extracted
```

Point `CHROME_BIN` at Chrome and `PLAYWRIGHT_MODULE` at the external driver’s ES module. In a second terminal run the following commands.

```sh
export REPLAY_REVISION=$(git rev-parse HEAD)
export EVIDENCE_DIR=/new/drive-evidence
node scripts/verify-pages.mjs http://127.0.0.1:8000/Circuit-Overdrive/
node tests/browser-crash.mjs http://127.0.0.1:8000/Circuit-Overdrive/
node tests/browser-crash-performance.mjs http://127.0.0.1:8000/Circuit-Overdrive/
node scripts/replay-drive.mjs "$EVIDENCE_DIR/crash-opposing-replay.json"
```

The native performance runner uses the full lab draw path and natural browser time. It verifies a 1920 × 1080 drawing buffer, active hardware rendering, finite work, repeatable buffer counts and completed audio sources. Machine-dependent timings belong to a specific sample. The CI runner uses SwiftShader for browser acceptance. The adversarial fixtures exercise thin solids, grazing, pure rotation, corner contacts, multiple participants and all component effects. The comparison driver asserts complete legacy states at every tick and checks the published Git blobs for championship rules, storage, UI, controller paths and vendor sources.

## Owner release gate

Play and listen to all three trials. Use the fixed camera during approach, inspect both cars after a collision, repeat with the same controls and compare a saved receipt with the independent CLI. Review the five PRs in order. Retarget each successor to main after the owner integrates its predecessor. The final integration SHA, full tests, native evidence, verified archive, protected production Pages checks and owner sign-off identify a release candidate for manual tagging. The v1.1.0 release decision remains open.

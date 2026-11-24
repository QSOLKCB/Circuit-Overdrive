# CO-011 candidate acceptance

Published v1.0.0 and the reference checkout identify `47b1a5c1562136bfd6b98ca9d4ef2ce07282200b`. The VANILLAJS pin is `9d95d74b355ec17add32db0b55f0f71130f9c004`. Review the changes in dependency order. [A · Impact authority](https://github.com/QSOLKCB/Circuit-Overdrive/pull/43) · [B · Damage](https://github.com/QSOLKCB/Circuit-Overdrive/pull/44) · [C · Facility](https://github.com/QSOLKCB/Circuit-Overdrive/pull/45) · [D · Replay](https://github.com/QSOLKCB/Circuit-Overdrive/pull/46)

## Published source audit

The release was published on 24 November 2026 at 09:34 UTC. The remote main branch and v1.0.0 tag both resolved to the baseline above. The original local main was at `71c24c5cae1276d2d3a2fb6cfefd52605fd3301f` with an untracked Circuit-Overdrive.png. Development used a clean worktree from remote main. All twelve upstream files in the vendor manifest, including the engine licence and notices, matched the pinned Git objects byte for byte and matched their SHA-256 entries. The historical Touring/Nitro and Rocket contact authorities retained their original Git blob identities. [Published release](https://github.com/QSOLKCB/Circuit-Overdrive/releases/tag/v1.0.0)

## Measured implementation

The packaged runtime and complete browser evidence below use `14861ffb14fbacf02a3ab12d6c6fe04063e511bb`. Chrome 158.0.8127.36 on Ubuntu drove normal keyboard events on the ordinary 60 Hz clock. The following values come from each first impact. The final column counts all applied impulses, including continuing contacts.

| Test | Impact tick | Closing m/s | Normal impulse N·s | Normal energy kJ | Dissipation kJ | Struck face | Terminal tick | Receipts |
| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: |
| Wall | 220 | 40.83 | 55,856 | 1,000.3 | 980.7 | Front | 273 | 1 |
| Glancing | 209 | 9.04 | 6,262 | 24.8 | 87.5 | Right | 325 | 21 |
| Two-car | 180 | 57.07 | 38,621 | 966.8 | 970.6 | Both fronts | 360 | 118 |

The wall run settled with 815/1000 front-panel and 733/1000 engine damage. The glancing run incurred 19/1000 right-panel damage and left the test pad under its actual post-contact velocity. The two cars separated and made a second physical impact at tick 238. For the first contact, the player’s X/Z impulse was approximately (−1,456, +38,675) N·s. The opposing chassis received its negative. Friction can add tangential kinetic loss to the normal-energy figure. [Wall evidence](evidence/co-011/crash-wall-receipt.json) · [Glancing evidence](evidence/co-011/crash-glancing-receipt.json) · [Two-car evidence](evidence/co-011/crash-opposing-receipt.json)

Each download was reopened in Theatre. Seeking from the final state to the first impact, rewinding one tick and rebuilding to the result reproduced the unrounded browser contact stream and complete vehicle states. An independent Node v22.18.0 process produced the same input, contact and final-state SHA-256 digests at the documented receipt precision. The two-car viewer followed the opposing chassis. Reset restored tick zero and zero damage. Focus loss cleared a held accelerator and WebGL restoration preserved the paused simulation tick. The browser manifest binds screenshots and raw input downloads to the source. [Capture manifest](evidence/co-011/browser.json) · [Wall screen](evidence/co-011/wall.png) · [Right-side screen](evidence/co-011/glancing.png) · [Two-car screen](evidence/co-011/opposing.png) · [Native performance](crash-performance.md)

The full Node run passed 245 tests. The Python archive test and seven-worker coverage contract passed. The package contained 80 runtime files. The verified ZIP SHA-256 was `970f3fa16f37a95849584f38fb3d8de465b3323ec096c4c200c8b64151bcc8e2`. All runtime bytes in its extraction matched the site. The subpath verifier matched all 80 HTTP responses and MIME types. The read-only public check of the existing v1.0.0 deployment matched all 71 published files. Candidate public deployment runs after integration into main. [Published baseline run](https://github.com/QSOLKCB/Circuit-Overdrive/actions/runs/45359827858)

## Published-source comparison

The candidate reproduced every enumerable race-state field and final classification across 45,225 accepted ticks. Speedway Day and Nightshift ran 9,847 ticks each, Ridge Day and Midnight Descent 9,402 each, Nitro Skyway 3,925 and Orbital Spine 2,802. The night pairs also compared headlight selection every third tick. Each pair of recorders produced matching inputs and the candidate’s own source-stamped v2/v3/v4 viewer reproduced its final field. Championship calendar, points, save and UI blobs and the input and vehicle authority trees matched the published reference. The seven browser workers retain the full four-round championship drive. [Tick counts, exact finish order and Git blob identities](evidence/co-011/legacy.json)

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

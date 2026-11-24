# Circuit Overdrive offline release

## Play the download

Download the ZIP and matching `.zip.sha256` receipt for the same source commit. Each filename includes the full Git SHA. On Linux, run `sha256sum -c Circuit-Overdrive-<sha>.zip.sha256` in the download folder. On macOS use `shasum -a 256 -c`; on Windows compare PowerShell's `Get-FileHash -Algorithm SHA256` output with the receipt.

Extract the whole ZIP. Open a terminal in the extracted **Circuit-Overdrive** directory next to **index.html**, then run the following command with Python 3.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

On Windows you can use `py -3` in place of `python3`. Open [the local game](http://127.0.0.1:8000/) in a WebGL-capable browser with native JSON modules. Day and Nightshift share Speedway and Ridge. The package also includes the Nitro Skyway stunt discipline, its physical ramps and the Nitro Pulse score. Orbital Spine, its Rocket dynamics, RASTER VELOCITY and the v4 spectator viewer also run from the archive. Headlight shaders, fixtures, all six cars, original synthesized audio and controls ship in the archive. The local server supplies the module MIME types. The browser stores controller profiles and championship progress per origin. Return to the same browser, address, port and source build to continue a championship. After a flag, wait for the local save confirmation. Each downloaded event recording opens separately in Replay Theatre.

## Build or reproduce a candidate

Use Git, Node 22.18 or newer, and Python 3. Run from the repository root. The build takes a detached local snapshot of the exact current commit. The output directory must be new. To reproduce someone else's ZIP, check out the commit printed in its filename first.

```sh
python3 scripts/offline-release.py build ../circuit-candidate
python3 scripts/offline-release.py verify ../circuit-candidate
python3 tests/test_offline_release.py
```

The builder packages the committed allowlist and validates its import graph and vendored SHA-256 hashes. Sorted ZIP entries have fixed timestamps and permissions and use the ZIP stored method. Working files, credentials and browser-test dependencies stay outside the game. The verifier rebuilds the expected archive from committed source and compares the candidate and receipt. The test also builds from two checkouts under different time zones and exercises tampering.

| Item | Contents |
| --- | --- |
| `Circuit-Overdrive-<sha>.zip` | Static runtime, original tracks, game and vendor licences, upstream notices and provenance |
| `Circuit-Overdrive/START-HERE.txt` inside the ZIP | Offline launch instructions |
| `Circuit-Overdrive/RELEASE.json` inside the ZIP | Game revision, engine repository/pin and SHA-256 for every other file in the ZIP |
| `.zip.sha256` beside the ZIP | SHA-256 for the complete archive, including its manifest |

CI compares the release candidate's runtime files with the separately built Pages directory, then retains the verified ZIP and receipt together as `offline-candidate-<sha>` for 14 days. Seven browser jobs download that same candidate by artifact ID, verify its checksum and exercise the extracted game under the repository subpath. The separate test job can run while the archive is built and exercised.

The `local-browser-<sha>-speedway` and `local-browser-<sha>-ridge` artifacts contain the standalone day and night races, classifications and byte-compared replays. The `championship` artifact holds four event tapes, standings, the trophy capture and the Node replay reconstruction receipt. The `effects` artifact holds the headlight pixel probe and night contact evidence. The `lifecycle`, `controllers` and `theatre` artifacts cover browser and touch input lifecycle, controller diagnostics, and Replay Theatre respectively.

After the protected verification and deployment succeed, the corresponding `public-browser-<sha>-<shard>` artifacts contain fresh live-site evidence. An exact same-run match can reuse a pure Node replay reconstruction from the local championship. A missing or mismatched receipt falls back to reconstruction from the public download. Every browser drive and download runs on each target. [Replay receipt requirements and workflow](pages.md#reproduce-browser-verification)

PR checks run with read-only repository access. A PR run identifies the tested GitHub merge revision, which can differ from the branch head. The owner can build the final approved revision with the same command. Publishing a release and assigning a tag are separate owner actions. [Pages procedure](pages.md)

## Verify a recorded race

A published build stamps its source commit into each touring v2, Nitro v3 or Rocket v4 replay. The v4 verifier checks the Rocket rules and reconstructs the six drivers, including wheel contacts and inverted progress, from accepted commands. The v3 verifier reconstructs the six-car Skyway event and reports the Nitro state alongside the race classification. On the matching checkout, run `node scripts/replay-drive.mjs PATH_TO_REPLAY.json`. The verifier rejects mismatched revisions and malformed or unsupported recordings, applies accepted recovery requests, and reports the six-car classification and player splits in fixed simulation ticks. Each accepted recovery adds 180 ticks to the driver's official time. Legacy version 1 recordings from v0.5.0 and direct, unstamped development checkouts use their original game source for playback. Cross-browser and cross-version numerical identity have not been established.

The finish runner verifies the downloaded recording against the actual race, including order, official times and splits. Set `EVIDENCE_DIR` to an existing directory to retain identified tapes. The following acceptance drives use the packaged project URL, a local development installation of Playwright and an installed Chrome binary.

```sh
node tests/browser-finish.mjs "$URL" --software-replay --require-replay --recover
node tests/browser-finish.mjs "$URL" --software-replay --require-replay --ridge --input=standard
node tests/browser-endurance.mjs "$URL"
node tests/browser-frames.mjs "$URL"
node tests/browser-frames.mjs "$URL" --ridge
```

The endurance check starts, pauses and restarts eight races on one page, alternating courses. It records settling of audio sources, PCM pool size, retained WebGL buffers and JavaScript heap after explicit garbage collection. The frame checks use ordinary browser animation callbacks and report sample durations, median, p95 and worst intervals on a 1920×1080 framebuffer. Record the actual renderer and machine when interpreting these results. Hardware acceptance uses the separate [controller and mobile checklist](hardware-acceptance.md).


## Crash Lab evidence from the offline package

The archive includes the facility, original test fixtures, damage and audio observers, and the v5 Theatre reader. It packages the local impact-panel module introduced in v1.1.1. The packager stamps every HTML entry from the same committed allowlist. The independent ZIP rebuild checks those stamps and vendor provenance. Serve the extracted directory, select Crash Lab, finish a trial and save both JSON files. From the matching checkout, run `node scripts/replay-drive.mjs FILE.json` and compare the input, contact and final-state digests with the evidence download. An ordinary unstamped checkout supports driving. A verified revision enables export. Keep the matching v1.1.0 archive for tapes recorded by that release. [Format and precision](replay-theatre.md#crash-lab-version-5)

CO-012B includes the derby arena preview in the same archive. Open it from Crash Lab to inspect and run the launch test in either arena. All scenery and simulation modules are local to the package. [Review controls](derby-arenas.md#owner-review)

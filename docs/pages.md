# Publishing Circuit Overdrive

The Pages site is built from the exact revision of `main` that triggers the workflow. A pull request runs the same package and gameplay checks with a read-only token. The `deploy` job runs after verification on a push to `main`, using the `github-pages` environment with `pages: write` and `id-token: write`. Pushing an update to a PR cancels superseded tests for that PR. Deployments to main run serially so the public browser checks finish against the deployed revision. Public validation runs with read-only permissions. [GitHub Pages custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Build and play the package locally

Run these commands from the repository root with Node 22.18 or newer and Python 3. Each build writes to a fresh directory.

```bash
site_root=$(mktemp -d)
node --test tests/*.test.mjs
node --experimental-vm-modules scripts/package-site.mjs "$site_root/Circuit-Overdrive"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$site_root"
```

Open [the local game](http://127.0.0.1:8000/Circuit-Overdrive/). A clean package stamps the exact Git commit into the HTML entry point. The packager copies the other named runtime files byte for byte and verifies the static module graph using Node's JavaScript parser. It checks relative HTML and stylesheet asset paths, parses both track definitions and compares the packaged engine sources and notices with the SHA-256 provenance manifest. Direct artifact publishing skips Jekyll processing.

## Reproduce browser verification

Use a second terminal in the checkout matching the tested site. The test runner accepts a development installation of Playwright. CI uses Playwright 1.64.0, Chrome and the software WebGL renderer on Ubuntu. An existing local installation works by setting `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path and `CHROME_BIN` to the Chrome executable.

```bash
bash scripts/browser-pages.sh http://127.0.0.1:8000/Circuit-Overdrive/ "$(mktemp -d)"
```

The HTTP verifier compares the served entry point and all runtime files with the checkout and checks the browser MIME types for HTML, CSS, JavaScript and JSON. Chromium starts both courses, drives both races to their results screens, and exercises pause, restart, focus loss, audio, and WebGL recovery. The finish harness restricts requests to the tested deployment. Screenshots and logs go to the specified evidence directory.

By default the command runs every browser suite serially on one machine. To reproduce one CI failure, select its shard. This example drives Speedway to the flag in daylight and at night, then compares the two downloaded replays.

```bash
bash scripts/browser-pages.sh http://127.0.0.1:8000/Circuit-Overdrive/ "$(mktemp -d)" --shard=speedway
```

| Shard | Browser coverage |
| --- | --- |
| `championship` | One continuous four-round World Overdrive Championship, including scores, saves, event replays and trophy |
| `speedway` | Both three-lap Speedway races, finish classifications and byte-for-byte day/night replay comparison |
| `ridge` | Both Ridge sprints, finish classifications and byte-for-byte day/night replay comparison |
| `controllers` | Standard gamepad, custom profiles, wheel mapping, controller diagnostics and three complete Crash Lab experiments |
| `theatre` | Replay Theatre loading, playback, seeking and follow cameras |
| `lifecycle` | Speedway and Ridge day smoke tests, Speedway night smoke test, mobile touch, three complete Total Destruction matches and the garage ownership/showroom journey |
| `effects` | Night contact effects, the WebGL headlight pixel comparison, and a complete six-car Skyway race with v3 replay verification |

The championship runner checks all four live flag orders, awards and running totals against a separate field and scoreboard oracle. It exercises boundary saves, an interrupted round, storage failure, trophy countback, four event replays and spectator isolation. The championship artifact retains the four JSON tapes, score report and presentation captures.

CI starts the Node, shell and Python test job alongside the package build. As soon as the verified ZIP is available, up to seven browser jobs can run concurrently on separate Ubuntu runners. Each downloads the producer's archive by artifact ID, verifies its checksum, serves it on loopback under `/Circuit-Overdrive/`, and checks the HTTP response bytes and MIME types before driving. Each shard retains its own evidence, including logs from a failed suite. The required `verify` check waits for the tests, package and every local browser job. [OPT bounded parallel execution](https://github.com/QSOLKCB/OPT/blob/8dc06e99e48711497380fb11237f5fe12b6c556d/optimizations/OPT-PAR-001-bounded-parallel-execution.md) · [OPT shared artifact fan-out](https://github.com/QSOLKCB/OPT/blob/8dc06e99e48711497380fb11237f5fe12b6c556d/optimizations/OPT-FAN-001-shared-materialization-fanout.md)

After deployment, all seven jobs repeat their browser coverage against the actual Pages URL. The public championship job can reuse the local job's two deterministic Node reconstructions of an event replay. For each round, the receipt must match the repository, workflow run, checkout and served revision, SHA-256 of the raw downloaded tape, reconstruction batch sizes (240 and 63 ticks) and runtime fingerprint, including the Node binary and host. Both recorded classifications must match the public reference driver's six-car result. A missing or invalid receipt, or a mismatch in any field, runs both reconstructions from the public download. The championship log records the decision per round. The four live races, public downloads, HTTP checks, spectator session and championship assertions still execute on Pages. [OPT invariant-driven reuse](https://github.com/QSOLKCB/OPT/blob/8dc06e99e48711497380fb11237f5fe12b6c556d/optimizations/OPT-INV-001-invariant-driven-reuse.md)

Before sharding, two successful serial verifications took 11m23s and 6m38s on GitHub-hosted Ubuntu. The browser step accounted for 10m37s and 6m05s, respectively. These times include both courses and all controller suites. [PR #15 run](https://github.com/QSOLKCB/Circuit-Overdrive/actions/runs/45152934832) · [Earlier release-candidate run](https://github.com/QSOLKCB/Circuit-Overdrive/actions/runs/45145677511)

On software WebGL, the finish runner renders the interactive game at 640×360. It queues the same digital keyboard transitions for the actual 60 Hz fixed-step callbacks and presents at least once every 15 simulation ticks. A synchronous WebGL readback bounds the queue of outstanding draws. The runner restores 1280×720 and waits for browser presentation before each screenshot. It prints the timer, checkpoint or lap, position and frame count every ten simulated seconds and fails after two minutes without progress. The smoke tests stay at 1280×720 throughout. Setting `NATIVE_GL=1` selects the original 1280×720 finish replay for local hardware.

## Production verification and troubleshooting

1. Under **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. This repository reported that setting during CO-003 development.
2. After owner review and merge into `main`, open **Actions → Pages** at the merge commit. The upload step packages only the tested allowlist. The deployment job reads the existing Pages configuration and deploys the artifact. [Workflow runs](https://github.com/QSOLKCB/Circuit-Overdrive/actions/workflows/pages.yml)
3. Check the seven `public-browser` jobs. The workflow summary records the public URL, exact source SHA and run. Download `public-browser-<sha>-<shard>` to inspect that group’s live-site evidence, or `local-browser-<sha>-<shard>` for the same group against the extracted archive. The Speedway and Ridge artifacts include the finish classifications and screenshots. [Production URL](https://qsolkcb.github.io/Circuit-Overdrive/)
4. If the workflow reports a Pages permission or source error, verify the source setting above and that the `github-pages` environment permits deployments from `main`. If the HTTP verifier reports a stale file or wrong MIME type, inspect the failing URL in the log, check the deployed commit and allow for CDN propagation before rerunning the failed jobs. Public verification allows up to ten minutes of retry delays for stale CDN bytes before browser play begins. Each retry compares the files with the same checked-out SHA. To run the public check locally, pass the production URL to the same command from the deployed checkout.

The packaging job records the source revision and checksum in its summary. The verified ZIP and checksum are retained together for 14 days. The Pages artifact contains the allowlisted runtime files. [Offline release guide](offline-release.md) · [Nightshift acceptance](co-008-acceptance.md)

The theatre worker also drives the complete six-car Orbital Spine event, compares the live field to a second simulator, downloads its v4 command tape and imports it through Replay Theatre. The worker saves screenshots and tick-indexed physical contact receipts with the tested build.


The controllers worker also drives the wall, glancing and opposing Crash Lab trials using real keyboard input and the browser clock. It downloads v5 tapes and independent JSON receipts, opens a second Theatre page, compares the full same-runtime contacts and final car states, then verifies the Node receipt digests. It checks reset, focus loss and WebGL restoration. The candidate and production jobs use the same suite. Run `node tests/browser-crash.mjs BASE_URL` with the existing external Playwright driver and set `EVIDENCE_DIR` to retain the downloads and screenshots. The ordinary Node test suite compares six legacy course/environment combinations against a separate checkout at the published v1.0.0 SHA. Full clones use their local Git objects. Shallow checkouts fetch only the pinned public commit into a disposable test directory. Set CO_V100_CHECKOUT to a clean local v1.0.0 checkout to run offline from a shallow clone. Production deployment and its public checks follow owner-approved main integration.

The lifecycle worker also plays Total Destruction through the ordinary keyboard controls. It covers both arenas, an eliminated player who spectates to the end, a player victory fixture, and replay export and Theatre reconstruction. Results, screenshots and physical receipts are retained with the tested revision. The native 1080p profiler runs separately on the documented GPU. [Derby acceptance and reproduction](co-012-acceptance.md)

The lifecycle worker also opens **The Garage** through the packaged menu and completes confirmed purchases, four occupied bays, selection, sale, reload, JSON downloads/imports and rejected files. It exercises stale tabs, storage failure, controller neutral arming, touch, repeated showroom selection and WebGL restoration. `node tests/browser-garage.mjs BASE_URL` runs the same suite; `EVIDENCE_DIR` retains source-stamped captures and JSON observations. Its default software WebGL run verifies functionality and resource ownership, not native GPU performance.

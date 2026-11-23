# Publishing Circuit Overdrive

The Pages site is built from the exact revision of `main` that triggers the workflow. A pull request runs the same package and gameplay checks with a read-only token. The `deploy` job runs after verification on a push to `main`, using the `github-pages` environment with `pages: write` and `id-token: write`. Public validation runs separately with read-only permissions. [GitHub Pages custom workflow documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

## Build and play the package locally

Run these commands from the repository root with Node 22.18 or newer and Python 3. Each build writes to a fresh directory.

```bash
site_root=$(mktemp -d)
node --test tests/*.test.mjs
node --experimental-vm-modules scripts/package-site.mjs "$site_root/Circuit-Overdrive"
python3 -m http.server 8000 --bind 127.0.0.1 --directory "$site_root"
```

Open [the local game](http://127.0.0.1:8000/Circuit-Overdrive/). The packager copies the named runtime files byte for byte and verifies the static module graph using Node's JavaScript parser. It checks relative HTML and stylesheet asset paths, parses both track definitions and compares the packaged engine sources and notices with the SHA-256 provenance manifest. Direct artifact publishing skips Jekyll processing.

## Reproduce browser verification

Use a second terminal in the checkout matching the tested site. The test runner accepts a development installation of Playwright. CI uses Playwright 1.64.0, Chrome and the software WebGL renderer on Ubuntu. An existing local installation works by setting `PLAYWRIGHT_MODULE` to its absolute `index.mjs` path and `CHROME_BIN` to the Chrome executable.

```bash
bash scripts/browser-pages.sh http://127.0.0.1:8000/Circuit-Overdrive/ "$(mktemp -d)"
```

The HTTP verifier compares the served entry point and all runtime files with the checkout and checks the browser MIME types for HTML, CSS, JavaScript and JSON. Chromium starts both courses, drives both races to their results screens, and exercises pause, restart, focus loss, audio, and WebGL recovery. The finish harness restricts requests to the tested deployment. Screenshots and logs go to the specified evidence directory.

## Production verification and troubleshooting

1. Under **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**. This repository reported that setting during CO-003 development.
2. After owner review and merge into `main`, open **Actions → Pages** at the merge commit. The upload step packages only the tested allowlist. The deployment job reads the existing Pages configuration and deploys the artifact. [Workflow runs](https://github.com/QSOLKCB/Circuit-Overdrive/actions/workflows/pages.yml)
3. Check the separate `public-browser` job. Its summary records the public URL, exact source SHA and workflow run. Download `public-browser-<sha>` for classification logs and screenshots. The `local-browser-<sha>` artifact identifies the package checks. [Production URL](https://qsolkcb.github.io/Circuit-Overdrive/)
4. If the workflow reports a Pages permission or source error, verify the source setting above and that the `github-pages` environment permits deployments from `main`. If the HTTP verifier reports a stale file or wrong MIME type, inspect the failing URL in the log, check the deployed commit and allow for CDN propagation before rerunning the failed jobs. The public job allows up to ten minutes of retry delays for stale CDN bytes before browser play begins. Each retry compares the files with the same checked-out SHA. To run the public check locally, pass the production URL to the same command from the deployed checkout.

#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
base=${1:?Usage: bash scripts/browser-pages.sh BASE_URL EVIDENCE_DIRECTORY}
evidence=${2:?Supply an evidence directory outside the site package}
mkdir -p "$evidence/ridge-smoke" "$evidence/smoke" "$evidence/speedway" "$evidence/ridge"
: > "$evidence/http.log"
delays=(0)
ready=no
if [[ ${3:-} == --wait-for-cdn ]]; then delays=(0 15 30 60 120 180 195); fi
for delay in "${delays[@]}"; do
  if (( delay )); then sleep "$delay"; fi
  if node scripts/verify-pages.mjs "$base" 2>&1 | tee -a "$evidence/http.log"; then
    ready=yes
    break
  fi
done
[[ $ready == yes ]] || exit 1
EVIDENCE_DIR="$evidence/smoke" node tests/browser-smoke.mjs "$base" 2>&1 | tee "$evidence/smoke.log"
EVIDENCE_DIR="$evidence/ridge-smoke" node tests/browser-smoke.mjs "$base" --ridge 2>&1 | tee "$evidence/ridge-smoke.log"
replay_args=()
if [[ ${NATIVE_GL:-0} != 1 ]]; then replay_args=(--software-replay); fi
EVIDENCE_DIR="$evidence/speedway" node tests/browser-finish.mjs "$base" "${replay_args[@]}" 2>&1 | tee "$evidence/speedway.log"
EVIDENCE_DIR="$evidence/ridge" node tests/browser-finish.mjs "$base" "${replay_args[@]}" --ridge 2>&1 | tee "$evidence/ridge.log"

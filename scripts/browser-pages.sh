#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
base=${1:?Usage: bash scripts/browser-pages.sh BASE_URL EVIDENCE_DIRECTORY [--wait-for-cdn] [--shard=speedway|ridge|controllers]}
evidence=${2:?Supply an evidence directory outside the site package}
shift 2
shard=all
delays=(0)
for option in "$@"; do
  case "$option" in
    --wait-for-cdn) delays=(0 15 30 60 120 180 195) ;;
    --shard=speedway|--shard=ridge|--shard=controllers)
      if [[ $shard != all ]]; then echo 'Supply only one browser shard.' >&2; exit 2; fi
      shard=${option#--shard=}
      ;;
    *) echo "Unknown browser suite option: $option" >&2; exit 2 ;;
  esac
done

case "$shard" in
  all) suites=(smoke ridge-smoke gamepad profiles touch lab theatre speedway ridge championship) ;;
  speedway) suites=(smoke touch speedway) ;;
  ridge) suites=(ridge-smoke ridge championship) ;;
  controllers) suites=(gamepad profiles lab theatre) ;;
esac

mkdir -p "$evidence"
: > "$evidence/http.log"
ready=no
for delay in "${delays[@]}"; do
  if (( delay )); then sleep "$delay"; fi
  if node scripts/verify-pages.mjs "$base" 2>&1 | tee -a "$evidence/http.log"; then
    ready=yes
    break
  fi
done
[[ $ready == yes ]] || exit 1

for suite in "${suites[@]}"; do
  case "$suite" in
    smoke|ridge-smoke) args=(tests/browser-smoke.mjs "$base") ;;
    speedway|ridge)
      args=(tests/browser-finish.mjs "$base" --require-replay)
      if [[ ${NATIVE_GL:-0} != 1 ]]; then args+=(--software-replay); fi
      ;;
    *)
      if [[ $suite == theatre || $suite == championship ]]; then
        mkdir -p "$evidence/$suite"
        EVIDENCE_DIR="$evidence/$suite" node "tests/browser-${suite}.mjs" "$base" 2>&1 | tee "$evidence/${suite}.log"
      else
        node "tests/browser-${suite}.mjs" "$base" 2>&1 | tee "$evidence/${suite}.log"
      fi
      continue
      ;;
  esac
  if [[ $suite == ridge || $suite == ridge-smoke ]]; then args+=(--ridge); fi
  mkdir -p "$evidence/$suite"
  EVIDENCE_DIR="$evidence/$suite" node "${args[@]}" 2>&1 | tee "$evidence/${suite}.log"
done

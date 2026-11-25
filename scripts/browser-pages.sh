#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
set -euo pipefail
base=${1:?Usage: bash scripts/browser-pages.sh BASE_URL EVIDENCE_DIRECTORY [--wait-for-cdn] [--shard=NAME]}
evidence=${2:?Supply an evidence directory outside the site package}
shift 2
shard=''
delays=(0)
for option in "$@"; do
  case "$option" in
    --wait-for-cdn) delays=(0 15 30 60 120 180 195) ;;
    --shard=?*)
      if [[ -n $shard ]]; then echo 'Supply only one browser shard.' >&2; exit 2; fi
      shard=${option#--shard=}
      ;;
    *) echo "Unknown browser suite option: $option" >&2; exit 2 ;;
  esac
done
shard=${shard:-all}

case "$shard" in
  all) suites=(smoke ridge-smoke gamepad profiles touch lab theatre speedway ridge championship night-speedway night-ridge night-smoke headlights night-contact nitro rocket crash derby garage) ;;
  championship) suites=(championship) ;;
  speedway) suites=(speedway night-speedway) ;;
  ridge) suites=(ridge night-ridge) ;;
  controllers) suites=(gamepad profiles lab crash) ;;
  theatre) suites=(theatre rocket) ;;
  lifecycle) suites=(smoke ridge-smoke night-smoke touch derby garage) ;;
  effects) suites=(night-contact headlights nitro) ;;
  *) echo "Unknown browser shard: $shard" >&2; exit 2 ;;
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
    night-contact) args=(tests/browser-effects.mjs "$base") ;;
    smoke|ridge-smoke|night-smoke) args=(tests/browser-smoke.mjs "$base") ;;
    speedway|ridge|night-speedway|night-ridge)
      args=(tests/browser-finish.mjs "$base" --require-replay)
      if [[ ${NATIVE_GL:-0} != 1 ]]; then args+=(--software-replay); fi
      ;;
    *)
      if [[ $suite == theatre || $suite == championship || $suite == headlights || $suite == nitro || $suite == rocket || $suite == crash || $suite == derby || $suite == garage ]]; then
        mkdir -p "$evidence/$suite"
        EVIDENCE_DIR="$evidence/$suite" node "tests/browser-${suite}.mjs" "$base" 2>&1 | tee "$evidence/${suite}.log"
      else
        node "tests/browser-${suite}.mjs" "$base" 2>&1 | tee "$evidence/${suite}.log"
      fi
      continue
      ;;
  esac
  if [[ $suite == ridge || $suite == ridge-smoke || $suite == night-ridge ]]; then args+=(--ridge); fi
  if [[ $suite == night-* ]]; then args+=(--night); fi
  mkdir -p "$evidence/$suite"
  EVIDENCE_DIR="$evidence/$suite" node "${args[@]}" 2>&1 | tee "$evidence/${suite}.log"
done

# The filename records the driver's selection. The downloaded inputs, source,
# seed, recovery requests and ticks must match byte for byte for the same drive.
for course in speedway ridge; do
  if [[ $shard == all || $shard == "$course" ]]; then
    cmp "$evidence/$course/circuit-overdrive-$course-replay.json" \
      "$evidence/night-$course/circuit-overdrive-$course-night-replay.json"
  fi
done

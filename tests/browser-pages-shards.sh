#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Verify workflow orchestration without launching browsers. CI separately runs every real suite.
set -euo pipefail
cd "$(dirname "$0")/.."
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
mkdir "$test_dir/bin"
cat > "$test_dir/bin/node" <<'NODE'
#!/usr/bin/env bash
set -eu
printf '%s|%s\n' "${EVIDENCE_DIR##*/}" "$*" >> "$CALLS"
if [[ -n ${EVIDENCE_DIR:-} ]]; then touch "$EVIDENCE_DIR/captured"; fi
if [[ $1 == tests/browser-finish.mjs ]]; then
  course=speedway
  suffix=''
  for arg in "$@"; do
    if [[ $arg == --ridge ]]; then course=ridge; fi
    if [[ $arg == --night ]]; then suffix=-night; fi
  done
  if [[ ${MISSING_TAPE:-} != "$course$suffix" ]]; then
    ticks=123
    if [[ ${DIFFERENT_TAPE:-} == "$course$suffix" ]]; then ticks=124; fi
    printf '{"course":"%s","ticks":%s}\n' "$course" "$ticks" > "$EVIDENCE_DIR/circuit-overdrive-$course$suffix-replay.json"
  fi
fi
if [[ $1 == "${FAIL_SCRIPT:-}" ]]; then exit 73; fi
NODE
chmod +x "$test_dir/bin/node"
export PATH="$test_dir/bin:$PATH"
export EVIDENCE_DIR='' NATIVE_GL=0
url=http://127.0.0.1/Circuit-Overdrive/
run() {
  local name=$1
  shift
  CALLS="$test_dir/$name.calls" bash scripts/browser-pages.sh "$url" "$test_dir/$name" "$@"
}

shards=(championship speedway ridge controllers theatre lifecycle effects)
# The required gate trusts the actual matrix. A missing workflow lane must fail
# even when its shell entry point can still run locally.
diff -u <(printf '%s\n' "${shards[@]}" | sort) <(
  awk -F '[][]' '/^[[:space:]]*shard: *\[/ {
    count = split($2, names, / *, */)
    for (i = 1; i <= count; i++) print names[i]
  }' .github/workflows/browser-checks.yml | sort
)
run serial
run explicit --wait-for-cdn --shard=all
diff -u "$test_dir/serial.calls" "$test_dir/explicit.calls"
for shard in "${shards[@]}"; do run "$shard" "--shard=$shard" --wait-for-cdn; done
cat > "$test_dir/expected" <<EOF
|scripts/verify-pages.mjs $url
smoke|tests/browser-smoke.mjs $url
ridge-smoke|tests/browser-smoke.mjs $url --ridge
|tests/browser-gamepad.mjs $url
|tests/browser-profiles.mjs $url
|tests/browser-touch.mjs $url
|tests/browser-lab.mjs $url
theatre|tests/browser-theatre.mjs $url
speedway|tests/browser-finish.mjs $url --require-replay --software-replay
ridge|tests/browser-finish.mjs $url --require-replay --software-replay --ridge
championship|tests/browser-championship.mjs $url
night-speedway|tests/browser-finish.mjs $url --require-replay --software-replay --night
night-ridge|tests/browser-finish.mjs $url --require-replay --software-replay --ridge --night
night-smoke|tests/browser-smoke.mjs $url --night
headlights|tests/browser-headlights.mjs $url
night-contact|tests/browser-effects.mjs $url --night
nitro|tests/browser-nitro.mjs $url
rocket|tests/browser-rocket.mjs $url
crash|tests/browser-crash.mjs $url
derby|tests/browser-derby.mjs $url
garage|tests/browser-garage.mjs $url
proving-ground|tests/browser-proving-ground.mjs $url
EOF
diff -u "$test_dir/expected" "$test_dir/serial.calls"
# Every shard starts by validating its own HTTP endpoint. Assert suite membership
# by its evidence log, then compare every invocation and argument with serial.
check_lane() {
  local lane=$1 log name
  shift
  diff -u <(head -n 1 "$test_dir/expected") <(head -n 1 "$test_dir/$lane.calls")
  diff -u <(printf '%s\n' http "$@" | sort) <(
    for log in "$test_dir/$lane"/*.log; do
      name=${log##*/}
      echo "${name%.log}"
    done | sort
  )
}
check_lane championship championship
check_lane speedway speedway night-speedway
check_lane ridge ridge night-ridge
check_lane controllers gamepad profiles lab crash
check_lane theatre theatre rocket
check_lane lifecycle smoke ridge-smoke night-smoke touch derby garage proving-ground
check_lane effects night-contact headlights nitro
diff -u <(tail -n +2 "$test_dir/serial.calls" | sort) \
  <(for shard in "${shards[@]}"; do tail -n +2 "$test_dir/$shard.calls"; done | sort)
inventory() { (cd "$test_dir/$1" && find . -type f | sort); }
diff -u <(inventory serial) <(for shard in "${shards[@]}"; do inventory "$shard"; done | sort -u)
NATIVE_GL=1 run native-gl --shard=ridge
diff -u <(sed 's/ --software-replay//' "$test_dir/ridge.calls") "$test_dir/native-gl.calls"

for course in speedway ridge; do
  if MISSING_TAPE="$course" run "missing-$course" "--shard=$course" >/dev/null 2>&1; then exit 1; else [[ $? == 2 ]]; fi
  if DIFFERENT_TAPE="$course-night" run "mismatch-$course" "--shard=$course" >/dev/null 2>&1; then exit 1; else [[ $? == 1 ]]; fi
done
if DIFFERENT_TAPE=ridge-night run mismatch-serial >/dev/null 2>&1; then exit 1; else [[ $? == 1 ]]; fi

# A failed test must survive tee; the following suite must never run.
if FAIL_SCRIPT=tests/browser-profiles.mjs run failure --shard=controllers; then exit 1; else [[ $? == 73 ]]; fi
[[ $(wc -l < "$test_dir/failure.calls") == 3 && ! -e "$test_dir/failure/lab.log" ]]
if FAIL_SCRIPT=tests/browser-proving-ground.mjs run proving-failure --shard=lifecycle; then exit 1; else [[ $? == 73 ]]; fi
[[ -e "$test_dir/proving-failure/proving-ground.log" && -e "$test_dir/proving-failure/proving-ground/captured" ]]
if FAIL_SCRIPT=scripts/verify-pages.mjs run http-failure --shard=ridge; then exit 1; fi
[[ $(wc -l < "$test_dir/http-failure.calls") == 1 ]]
for option in --shard=typo --shard= --unexpected; do
  if run invalid "$option" 2>/dev/null; then exit 1; else [[ $? == 2 ]]; fi
done
if run invalid --shard=ridge --shard=speedway 2>/dev/null; then exit 1; else [[ $? == 2 ]]; fi
if run invalid --shard=all --shard=ridge 2>/dev/null; then exit 1; else [[ $? == 2 ]]; fi
[[ ! -e "$test_dir/invalid.calls" ]]
echo 'Browser suite commands, evidence inventory, CLI and failure propagation passed.'

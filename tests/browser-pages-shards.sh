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

run serial
run speedway --shard=speedway --wait-for-cdn
run ridge --wait-for-cdn --shard=ridge
run controllers --shard=controllers
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
EOF
diff -u "$test_dir/expected" "$test_dir/serial.calls"
# Each runner checks the HTTP package itself. Every other invocation belongs to exactly one shard.
diff -u <(sed -n '1p;2p;6p;9p' "$test_dir/expected") "$test_dir/speedway.calls"
diff -u <(sed -n '1p;3p;10p;11p' "$test_dir/expected") "$test_dir/ridge.calls"
diff -u <(sed -n '1p;4p;5p;7p;8p' "$test_dir/expected") "$test_dir/controllers.calls"
diff -u <(tail -n +2 "$test_dir/serial.calls" | sort) \
  <(for shard in speedway ridge controllers; do tail -n +2 "$test_dir/$shard.calls"; done | sort)
inventory() { (cd "$test_dir/$1" && find . -type f | sort); }
diff -u <(inventory serial) <(for shard in speedway ridge controllers; do inventory "$shard"; done | sort -u)
NATIVE_GL=1 run native-gl --shard=ridge
diff -u <(sed 's/ --software-replay//' "$test_dir/ridge.calls") "$test_dir/native-gl.calls"

# A failed test must survive tee; the following suite must never run.
if FAIL_SCRIPT=tests/browser-profiles.mjs run failure --shard=controllers; then exit 1; else [[ $? == 73 ]]; fi
[[ $(wc -l < "$test_dir/failure.calls") == 3 && ! -e "$test_dir/failure/lab.log" ]]
if FAIL_SCRIPT=scripts/verify-pages.mjs run http-failure --shard=ridge; then exit 1; fi
[[ $(wc -l < "$test_dir/http-failure.calls") == 1 ]]
for option in --shard=typo --shard= --unexpected; do
  if run invalid "$option" 2>/dev/null; then exit 1; else [[ $? == 2 ]]; fi
done
if run invalid --shard=ridge --shard=speedway 2>/dev/null; then exit 1; else [[ $? == 2 ]]; fi
[[ ! -e "$test_dir/invalid.calls" ]]
echo 'Browser suite commands, evidence inventory, CLI and failure propagation passed.'

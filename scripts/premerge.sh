#!/usr/bin/env bash
# Pre-merge gate: typecheck, lint, tests for the touched area, promoted rules, known-reds.
# Offline only (no dev server, no DB, no network). Children get a scrubbed env, nice 10.
# Base: PREMERGE_BASE (default origin/claude/commercial-dashboard-r2-20261111).
set -euo pipefail
cd "$(dirname "$0")/.."
BASE=${PREMERGE_BASE:-origin/claude/commercial-dashboard-r2-20261111}
BIN=node_modules/.bin
LOG=$(mktemp -d /tmp/twin-premerge.XXXXXX)
fail=0
clean() { env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 "$@"; }
pass() { printf 'PASS  %s\n' "$*"; }
bad()  { printf 'FAIL  %s\n' "$*"; fail=1; }
run() { local name=$1; shift; if clean "$@" >"$LOG/$name.log" 2>&1; then pass "$name"; else bad "$name (log $LOG/$name.log)"; fi; }

git rev-parse --verify -q "$BASE" >/dev/null || { echo "FAIL  base $BASE not found (git fetch, or set PREMERGE_BASE)"; exit 1; }
echo "premerge $(git branch --show-current) @ $(git rev-parse --short HEAD) vs $BASE ($(git merge-base "$BASE" HEAD | cut -c1-8))"
[ -z "$(git status --porcelain)" ] || { echo "FAIL  dirty tree: commit first (tests are picked from BASE...HEAD)"; exit 1; }
present=$(git diff --name-only --diff-filter=ACMR "$BASE"...HEAD)

# typecheck: all four programs
[ -f next-env.d.ts ] || echo "WARN  next-env.d.ts missing (written by next dev/build); typecheck will fail"
run typecheck npm run typecheck

# lint: only when eslint and a config are actually installed (next lint would otherwise prompt and install)
lintable=$(grep -E '\.(ts|tsx|js|jsx|mjs|cjs)$' <<<"$present" | grep -vE '^(archive|node_modules)/' || true)
if [ ! -x "$BIN/eslint" ]; then echo "n/a   lint (no eslint dependency in package.json)"
elif ! ls .eslintrc* eslint.config.* >/dev/null 2>&1; then echo "n/a   lint (no eslint config)"
elif [ -z "$lintable" ]; then echo "n/a   lint (no changed source files)"
else run lint "$BIN/eslint" $lintable; fi

# touched-area tests
tests=$(grep -E '^tests/.*\.test\.[cm]?[jt]sx?$' <<<"$present" | grep -vE '^tests/(rules|known-red)/' || true)
for f in $tests; do
  flags=(--import tsx --test)
  grep -q 'mock\.module' "$f" && flags+=(--experimental-test-module-mocks)
  run "test:${f//\//_}" node "${flags[@]}" "$f"
done
[ -z "$tests" ] && echo "n/a   changed tests (none under tests/)"
# always: area gating by path silently skipped suites that shared code reaches
run test:offline npm run test:offline
run test:api npm run test:api
run test:public npm run test:public

# promoted rules
shopt -s nullglob
rules=(tests/rules/*.test.*)
if [ ${#rules[@]} -gt 0 ]; then run rules node --import tsx --test --test-concurrency=1 "${rules[@]}"; else echo "n/a   rules (no tests/rules on this branch)"; fi

# known-reds: control passes, the rest still fails on an assertion
krs=(tests/known-red/*.test.*)
[ ${#krs[@]} -eq 0 ] && echo "n/a   known-red (no tests/known-red on this branch)"
for kr in ${krs[@]+"${krs[@]}"}; do
  n=$(basename "$kr" | cut -d. -f1); flags=(--import tsx --test)
  grep -q 'mock\.module' "$kr" && flags+=(--experimental-test-module-mocks)
  if ! clean node "${flags[@]}" --test-reporter=tap --test-name-pattern='(^|: )control:' "$kr" >"$LOG/kr-$n-control.log" 2>&1; then
    bad "known-red $n harness broken: control failed (log $LOG/kr-$n-control.log)"
  elif ! grep -qE '^ *ok [0-9]+ - (.*: )?control:' "$LOG/kr-$n-control.log"; then
    bad "known-red $n has no control: test (log $LOG/kr-$n-control.log)"
  elif clean node "${flags[@]}" --test-skip-pattern='(^|: )control:' "$kr" >"$LOG/kr-$n.log" 2>&1; then
    bad "known-red $n now GREEN: promote it to tests/rules"
  elif grep -q ERR_ASSERTION "$LOG/kr-$n.log"; then
    pass "known-red $n still red on an assertion"
  else
    bad "known-red $n crashed instead of asserting (log $LOG/kr-$n.log)"
  fi
done

echo "logs: $LOG"
[ $fail = 0 ] && echo "PREMERGE PASS" || echo "PREMERGE FAIL"
exit $fail

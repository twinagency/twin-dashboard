#!/usr/bin/env bash
# Proves check-report-consistency.ts can fail, by planting each original defect
# back and watching the named assertion go red.
#
# A check that has never failed is not evidence. Every bug below is the REAL
# pre-fix code from the 2026-08-21 Revenue page audit, not an invented mutation.
#
# Run:  bash scripts/prove-report-consistency.sh
set -uo pipefail
cd "$(dirname "$0")/.."

DASH=components/RevenueDashboard.tsx
ANALYTICS=lib/analytics-data.ts
ROLLUP=lib/rollup.ts
FEATURES=lib/report-features.ts
MONEY=lib/money.ts
TIME=lib/report-time.ts

# Every file any plant touches must be in this list. report-time.ts was planted
# by two cases before it was listed here, which would have left the repo holding
# a UTC-reading reportInstant after the run.
FILES=("$DASH" "$ANALYTICS" "$ROLLUP" "$FEATURES" "$MONEY" "$TIME")

BACKUP=$(mktemp -d)
restore() { for f in "${FILES[@]}"; do cp "$BACKUP/$(basename "$f")" "$f"; done; }
# The trap is the real safety net: an interrupt mid-plant must not leave a
# deliberately broken file in the working tree.
trap 'restore 2>/dev/null; rm -rf "$BACKUP"' EXIT INT TERM
for f in "${FILES[@]}"; do cp "$f" "$BACKUP/"; done

pass=0
fail=0

# plant <name> <expected-assertion-id> <sed-script> <file>
plant() {
  local name="$1" want="$2" script="$3" file="$4"
  restore
  perl -0777 -i -pe "$script" "$file"
  # Compared against the BACKUP, not against git: these files are expected to be
  # dirty relative to HEAD while the fix is still uncommitted, so `git diff`
  # would report "changed" for every plant including the ones that did nothing.
  if cmp -s "$file" "$BACKUP/$(basename "$file")"; then
    echo "  ✗ $name — the plant did not change $file, so nothing was tested"
    fail=$((fail + 1)); restore; return
  fi
  local out
  out=$(../bot/node_modules/.bin/tsx scripts/check-report-consistency.ts 2>&1)
  if echo "$out" | grep -q "ALL PASS"; then
    echo "  ✗ $name — check still PASSED with the bug planted"
    fail=$((fail + 1))
  elif echo "$out" | grep -q "✗ $want"; then
    echo "  ✓ $name — red on $want"
    pass=$((pass + 1))
  else
    echo "  ~ $name — went red, but not on $want:"
    echo "$out" | grep '✗' | head -3 | sed 's/^/      /'
    fail=$((fail + 1))
  fi
  restore
}

echo "proving check-report-consistency.ts"
echo

# 1. The original Top source tile: drop the catch-all buckets before ranking.
plant "Top source filters media/other out again" "C2" \
  's{const topKind = topFeatureRow\(data\.analytics\.byFeature\);}{const topKind = data.analytics.byFeature.filter((feature) => feature.key !== "media" \&\& feature.key !== "other").sort((a, b) => b.share - a.share)[0];}' \
  "$DASH"

# 2. topFeatureRow itself starts filtering — the value-level version of the same bug.
plant "topFeatureRow drops the untagged bucket" "C1" \
  's{\.filter\(\(r\) => r\.stars > 0\)\n    \.sort}{.filter((r) => r.stars > 0 \&\& r.key !== "media" \&\& r.key !== "other")\n    .sort}' \
  "$FEATURES"

# 3. Hours read off the container clock again (the UTC bug).
#    No template literals in the replacement: perl read ${d.getFullYear()} as a
#    variable and died with "Undefined subroutine &main::getFullYear", so the
#    plant silently did nothing and the case reported as not-proven.
plant "hour/weekday computed with getHours()/getDay()" "C8" \
  's|const at = reportInstant\(t\.paid_at\);|const at = { dayKey: "x", hour: new Date(t.paid_at).getHours(), dow: new Date(t.paid_at).getDay() };|' \
  "$ANALYTICS"

# 4. reportInstant regresses to UTC — catches the clock at the source.
plant "reportInstant reads UTC" "C4" \
  's{timeZone: REPORT_TZ,\n  year}{timeZone: "UTC",\n  year}' \
  "lib/report-time.ts"

# 5. Midnight normalisation removed: hour 24 writes past the array.
#    Targets normaliseHour, not the old inline `% 24` inside reportInstant.
#    That inline version was unprovable on this machine — ICU here returns "00"
#    for midnight, so deleting the wrap changed nothing observable and this case
#    reported "check still PASSED with the bug planted". Extracting the pure
#    function is what made the defect reachable from a test.
plant "midnight not normalised to 0" "C7" \
  's|return \(\(n % 24\) \+ 24\) % 24;|return n;|' \
  "lib/report-time.ts"

# 6. byDay pads to today again instead of to the window end.
plant "byDay zero-pads past the window end" "C8" \
  's{const dayCount = Math\.max\(1, Math\.ceil\(\(endDay\.getTime\(\) - startDay\.getTime\(\)\) / MS_DAY\) \+ 1\);}{const dayCount = Math.max(1, Math.ceil((now - startDay.getTime()) / MS_DAY) + 1);}' \
  "$ANALYTICS"

# 7. Conversion divides credit buyers by everyone who messaged.
plant "Conversion counts credit buyers only" "C9" \
  's{const \{ messaged \} = data\.analytics\.paywallFunnel;\n            const conversion = messaged > 0 \? s\.buyers / messaged : null;}{const { messaged, purchased } = data.analytics.paywallFunnel;\n            const conversion = messaged > 0 ? purchased / messaged : null;}' \
  "$DASH"

# 8. Profit rendered in bare USD beside AUD revenue.
plant "profit renders with a bare \$ beside A\$" "C10" \
  's{const usd = \(n: number\) => fmtMoney\(usdToMoneyRate\(n, currency, rate\), currency\);}{const usd = (n: number) => "\$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });}' \
  "$DASH"

# 9. usdToMoneyRate stops converting — silently wrong money, no source tell.
#    | delimiters, not {}: the escaped \} inside brace delimiters was a perl
#    syntax error, so this plant never ran either. Anchored on the signature
#    because starsToMoneyRate carries a byte-identical return line.
plant "usdToMoneyRate ignores the currency" "C10" \
  's|(usdToMoneyRate\(usd: number, c: Currency, audPerUsd: number\): number \{\n  return )[^;]+;|${1}usd;|' \
  "$MONEY"

# 10. rpc() blames migration 120 for every error, including a timeout.
plant "rpc() calls a timeout an unapplied migration" "C11" \
  's{const missing = error\.code === "PGRST202".*?\n.*?\n.*?\n.*?\n.*?\n.*?\n    throw new Error\(`\$\{fn\} failed: \$\{error\.message\} \(code \$\{error\.code \?\? "none"\}\)\.\$\{hint\}`\);}{throw new Error(`${fn} failed: ${error.message}. Migration 120 (bot/db/migrations/120_revenue_rollups.sql) must be applied to this project.`,\n    );}s' \
  "$ROLLUP"

# 11. Any paywall probe error reads as "still collecting".
plant "any probe error renders an empty funnel" "C12" \
  's{const probeErr = paywallProbe\.error;\n  const paywallCollecting = Boolean\(probeErr && \(probeErr\.code === "PGRST205" \|\| probeErr\.code === "42P01"\)\);}{const paywallCollecting = Boolean(paywallProbe.error);\n  const probeErr = null;}' \
  "$ANALYTICS"

# 12. The by-clone table truncates to 8 of 12 again.
plant "by-clone table truncates to 8" "C13" \
  's{const earningClones = a\.clones\.filter\(\(c\) => c\.revenueStars > 0 \|\| c\.sales > 0\);}{const earningClones = a.clones.filter((c) => c.revenueStars > 0 || c.sales > 0).slice(0, 8);}' \
  "$DASH"

restore
echo
echo "  $pass proven, $fail not proven"
# Again against the backup: the only question is whether this script put the
# files back exactly as it found them, not whether they match HEAD.
for f in "$DASH" "$ANALYTICS" "$ROLLUP" "$FEATURES" lib/report-time.ts "$MONEY"; do
  if ! cmp -s "$f" "$BACKUP/$(basename "$f")"; then
    echo "  ✗ RESTORE FAILED — $f differs from the pre-run backup. Do not commit; diff it first."
    exit 1
  fi
done
echo "  all files restored byte-identical to the pre-run state"
[ "$fail" -eq 0 ] || exit 1

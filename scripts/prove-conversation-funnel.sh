#!/usr/bin/env bash
# Proves scripts/check-conversation-funnel.ts can actually fail.
#
# A check that has never gone red is not evidence, it is decoration. This plants
# each defect the check exists to catch, one at a time, into the REAL artefacts
# the page runs (migration 125's function in the live database, and fmtHours in
# the panel component), runs the check, and asserts it goes red.
#
# HOW THE SQL PLANTS WORK, AND THE ONE THING TO KNOW BEFORE RUNNING IT.
# bot/db/migrate.ts only applies files from bot/db/migrations/, so a plant is
# written into 125_conversation_funnel.sql IN PLACE, applied, tested, and
# restored from a copy taken at startup. The file is modified on disk for a few
# seconds per plant. If another session commits that folder in the same seconds
# it would commit a planted function, so do not run this alongside one. The trap
# restores the file and re-applies the committed version on ANY exit, including
# Ctrl-C.
#
# It writes to the live database, briefly: `create or replace function` on
# revenue_conversation_funnel, which nothing else reads. It touches no table and
# no row.
#
# Run: bash scripts/prove-conversation-funnel.sh
set -uo pipefail
cd "$(dirname "$0")/.."

TSX=../bot/node_modules/.bin/tsx
MIG=../bot/db/migrations/125_conversation_funnel.sql
PANEL=components/RevenueDashboard.tsx
WORK=$(mktemp -d)
PASSES=0
FAILS=0

cp "$MIG" "$WORK/mig.orig"
cp "$PANEL" "$WORK/panel.orig"

restore() {
  echo
  echo "restoring the committed migration, function and panel"
  cp "$WORK/mig.orig" "$MIG"
  cp "$WORK/panel.orig" "$PANEL"
  if $TSX ../bot/db/migrate.ts 125 >/dev/null 2>&1; then
    echo "  ✓ function restored from $MIG"
  else
    echo "  !! RESTORE FAILED — re-apply $MIG by hand before trusting the page"
  fi
  rm -rf "$WORK"
}
trap restore EXIT

run_check() {
  npm run --silent test:funnel >"$WORK/out" 2>&1
}

report() {
  local name="$1"
  if run_check; then
    echo "  ✗ CHECK STAYED GREEN with the bug planted: $name"
    FAILS=$((FAILS + 1))
  else
    echo "  ✓ went red: $(grep -m2 '✗' "$WORK/out" | sed 's/^ *//' | tr '\n' ';')"
    PASSES=$((PASSES + 1))
  fi
}

# perl -0, not sed: every one of these patterns spans lines, and sed matches
# within a line. A plant that silently fails to apply would print a green tick
# for a bug that was never there, which is the exact failure mode this whole
# file exists to rule out — hence the md5 comparison.
plant_sql() {
  local name="$1" find="$2" replace="$3"
  echo
  echo "── planting: $name"
  local before after
  before=$(md5sum <"$MIG")
  FIND="$find" REPLACE="$replace" perl -0pi -e 's/\Q$ENV{FIND}\E/$ENV{REPLACE}/' "$MIG"
  after=$(md5sum <"$MIG")
  if [ "$before" = "$after" ]; then
    echo "  ✗ PLANT DID NOT APPLY — the pattern no longer matches $MIG"
    FAILS=$((FAILS + 1))
    return
  fi
  if ! $TSX ../bot/db/migrate.ts 125 >"$WORK/apply" 2>&1; then
    echo "  ✗ planted migration would not apply: $(tail -1 "$WORK/apply")"
    FAILS=$((FAILS + 1))
    cp "$WORK/mig.orig" "$MIG"
    $TSX ../bot/db/migrate.ts 125 >/dev/null 2>&1
    return
  fi
  report "$name"
  cp "$WORK/mig.orig" "$MIG"
  $TSX ../bot/db/migrate.ts 125 >/dev/null 2>&1
}

plant_ts() {
  local name="$1" file="$2" find="$3" replace="$4"
  echo
  echo "── planting: $name"
  local before after
  before=$(md5sum <"$file")
  FIND="$find" REPLACE="$replace" perl -0pi -e 's/\Q$ENV{FIND}\E/$ENV{REPLACE}/' "$file"
  after=$(md5sum <"$file")
  if [ "$before" = "$after" ]; then
    echo "  ✗ PLANT DID NOT APPLY — the pattern no longer matches $file"
    FAILS=$((FAILS + 1))
    return
  fi
  report "$name"
  cp "$WORK/panel.orig" "$PANEL"
}

echo "proving scripts/check-conversation-funnel.ts"
echo
echo "baseline: the check must be GREEN before anything is planted"
if run_check; then
  echo "  ✓ baseline green"
else
  echo "  ✗ BASELINE IS ALREADY RED — fix that before proving anything"
  tail -25 "$WORK/out"
  exit 1
fi

# NOT PLANTED, AND THE REASON MATTERS: removing the harry_sub_ exclusion.
# It would leave the check GREEN, because that exclusion changes no number in
# any window including all-time (measured 2026-08-21 across all 1,174 rows).
# Planting it and calling the resulting green a pass, or writing an assertion
# that claims it goes red, would put a lie in the evidence file. Check group 4
# asserts the zero as a tripwire instead, and says why.

# 1. The window falls off the conversation cohort — the "this tile is lifetime
#    while the others move" defect migration 122 was written for.
plant_sql "conversation cohort stops obeying the window" \
'    where h.created_at >= p_start
      and h.created_at <= p_end
      and h.telegram_id is not null' \
'    where h.telegram_id is not null'

# 2. The LEFT join becomes a FULL OUTER join, so a fan with a paywall hit and no
#    chat row invents a conversation and `offered` can exceed `conversations`.
plant_sql "offered escapes the conversation cohort" \
'    from chat c
    left join pw w on w.cid = c.cid and w.tg = c.tg
    where c.fan_msgs > 0' \
'    from chat c
    full outer join pw w on w.cid = c.cid and w.tg = c.tg
    where coalesce(c.fan_msgs, 0) >= 0'

# 3. max(paid_at) reverted to min(): a fan who bought early in the window and
#    again after the offer stops counting, understating the one number on the
#    panel that says whether offers work at all.
plant_sql "first purchase in window instead of last" \
'max(t.paid_at) as last_paid_at' \
'min(t.paid_at) as last_paid_at'

# 4. The meaningful threshold moves off 5 while the panel's label still says 5.
plant_sql "meaningful threshold changed under its label" \
'p_meaningful int default 5' \
'p_meaningful int default 3'

# 5. The cutover import counted as arrivals again — migration 123's bug, back.
plant_sql "the 57,164 imported fans counted as new fans again" \
'    where u.legacy_id is null
      and u.first_seen_at >= p_start' \
'    where u.first_seen_at >= p_start'

# 6. fmtHours rounding a three-minute median to "0h": printing "instant" as a
#    measurement.
plant_ts "a three minute median printed as 0h" "$PANEL" \
'if (hours < 1) return `${Math.round(hours * 60)} min`;' \
'if (hours < 1) return `${Math.round(hours)}h`;'

echo
echo "planted 6, went red $PASSES, did not $FAILS"
[ "$FAILS" -eq 0 ] || exit 1

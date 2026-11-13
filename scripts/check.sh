#!/usr/bin/env bash
# Test harness. Exit 0 GREEN (PLAN/EXEC in those modes), 1 RED, 2 INFRA (harness/env broke or target refused). RED beats INFRA.
#   fast  merge gate: premerge.sh, every promoted test:* leaf, then live (LIVE=opt).   full  fast plus the NEEDS leaves, each with
#     only its listed env, then live (LIVE=opt).   live  read-only smoke of the local stack: anonymous page GETs + one read-only psql.
#   plan  list what fast would run and skip, run nothing.   exec <cmd...>  one step, scrubbed and sandboxed like a leaf (self-test hook).
# Budgets, caps, verdict labels: the mode table below (a cap or blown budget is RED). What runs or is skipped, and why: the rows
#   `scripts/check-plan.ts <mode>` prints; this script runs the `run` rows and records the rest.
# Steps: scrubbed env (DOTENV_CONFIG_PATH=/dev/null, own TMPDIR), macOS loopback-only network sandbox (refused without), own
#   process group; leaving processes behind fails (setsid escapes). INFRA if a *SUPABASE*URL* var is not loopback or any var names prod.
# live refuses before its first request unless every (NEXT_PUBLIC_)SUPABASE_URL line in the .env files of the process listening on
#   CHECK_BASE_URL's port is loopback. Gap: that process's own env is invisible, so the files must name a target. It never POSTs or
#   calls an API route: public/admin 401s write system_logs, a login writes a session. CHECK_BASE_URL: http://localhost|127.0.0.1 only.
# LIVE  req (live mode): anything live cannot check is INFRA. opt (fast/full): the stack down, auth on (seen from one GET /overview)
#   or a refused target is a skip with a named note, and nothing more is sent. Both: a non-local CHECK_BASE_URL, a prod name in a
#   response or psql failing is INFRA. CHECK_LIVE_ONLY=1 (self-test hook): only the live stage, with the mode's LIVE; verdict STAGE.
# Evidence: .check-evidence/<ts>-<sha>/{run.log,timings.tsv,verdict.json,rows.txt,logs/} (root: CHECK_EVIDENCE_DIR). Can only lower: CHECK_BUDGET_SECS, CHECK_STEP_SECS.
[ -n "$CHECK_NICED" ] || exec env CHECK_NICED=1 nice -n 10 bash "$0" "$@"
set -o pipefail
cd "$(dirname "$0")/.." || exit 2
MODE=$1
shift
# BUDGET: whole run (0 none)  CAP: per step  OK: verdict when nothing failed  PRE: preflight (sandbox, deps, clean tree)  LIVE: see header
case $MODE in
  fast) BUDGET=900 CAP=300 OK=GREEN PRE=1 LIVE=opt;;
  full) BUDGET=0   CAP=600 OK=GREEN PRE=1 LIVE=opt;;
  live) BUDGET=180 CAP=0   OK=GREEN PRE=0 LIVE=req;;
  plan) BUDGET=0   CAP=0   OK=PLAN  PRE=0 LIVE=list;;
  exec) BUDGET=0   CAP=600 OK=EXEC  PRE=0 LIVE=no;;
  *) echo "usage: scripts/check.sh fast|full|live|plan|exec [-- cmd...]"; exit 2;;
esac
lower() { [[ $1 =~ ^[0-9]+$ ]] && (( $1 > 0 && ($2 == 0 || $1 < $2) )) && echo "$1" || echo "$2"; }
BUDGET=$(lower "$CHECK_BUDGET_SECS" $BUDGET)
CAP=$(lower "$CHECK_STEP_SECS" $CAP)
T0=$(date +%s)
SHA=$(git rev-parse --short=8 HEAD 2>/dev/null || echo nogit)
EV=${CHECK_EVIDENCE_DIR:-.check-evidence}/$(date -u +%Y%m%dT%H%M%SZ)-$SHA
[ -e "$EV" ] && EV=$EV-$$
mkdir -p "$EV/logs" && : >"$EV/timings.tsv" || exit 2
TMPD=$(umask 077; mktemp -d "${TMPDIR:-/tmp}/twin-check.XXXXXX") || exit 2
trap 'rm -rf "$TMPD"' EXIT
trap stop INT TERM HUP
PROD='aouaenqayfltoqrmpitg|cnnsllgzskqkvdovyiiv'
BASE=${CHECK_BASE_URL:-http://localhost:3001}
BASE=${BASE%/}
SANDBOX=(sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))(allow network-outbound (remote ip "localhost:*"))')
CLEAN=(env -i "PATH=$PWD/node_modules/.bin:$PATH" "HOME=$HOME" "TMPDIR=$TMPD/" DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test)
# confined: is outbound network already loopback-only (inside one of our own sandboxed steps, where sandbox-exec cannot nest)?
#   A UDP connect to TEST-NET-1 (RFC 5737) sends no packet: the sandbox refuses it, an open network accepts it.
confined() { perl -MSocket -e 'socket(my $s, PF_INET, SOCK_DGRAM, 0) or exit 2; exit(connect($s, pack_sockaddr_in(9, inet_aton("192.0.2.1"))) ? 1 : 0)'; }
redact() {
  perl -pe 'BEGIN { @s = grep { length >= 6 } map { $ENV{$_} // "" } qw(DASHBOARD_PASSWORD TWIN_ADMIN_API_KEY SUPABASE_SERVICE_KEY SUPABASE_ANON_KEY) }
    for my $s (@s) { s/\Q$s\E/[REDACTED]/g }
    s/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/[REDACTED-JWT]/g;
    s/(bearer\s+)\S+/$1\[REDACTED]/gi'
}
note() { echo "note  $*" | redact | tee -a "$EV/run.log"; }
# rec <name> <status> <secs> <note>: one evidence row
rec() {
  printf '%s\t%s\t%s\t%s\n' "$1" "$2" "$3" "$4" | redact >>"$EV/timings.tsv"
  printf '%-5s %s (%ss) %s\n' "$2" "$1" "$3" "$4" | redact | tee -a "$EV/run.log"
}
left() { (( BUDGET )) && echo $(( T0 + BUDGET - $(date +%s) )) || echo 0; } # seconds of budget left (0 = no budget)
cnt() { grep -c $'\t'"$1"$'\t' "$EV/timings.tsv"; }
finish() {
  local v=$OK code=0 w p f s i
  w=$(( $(date +%s) - T0 ))
  p=$(cnt pass)
  f=$(cnt fail)
  s=$(cnt skip)
  i=$(cnt infra)
  if (( i )); then v=INFRA; code=2; fi
  if (( f )); then v=RED; code=1; fi
  node -e 'const [mode, sha, verdict, w, b] = process.argv.slice(1);
    const steps = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean).map((l) => {
      const [name, status, secs, note] = l.split("\t");
      return { name, status, secs: +secs, note };
    });
    console.log(JSON.stringify({ mode, sha, verdict, wallSecs: +w, budgetSecs: +b, steps }));' \
    "$MODE" "$SHA" "$v" $w "$BUDGET" <"$EV/timings.tsv" >"$EV/verdict.json"
  echo "$v $MODE @ $SHA pass=$p fail=$f skip=$s infra=$i in ${w}s, evidence $EV" | tee -a "$EV/run.log"
  exit $code
}
infra() {
  rec "$1" infra 0 "$2"
  finish
}
budget() {
  rec "$1" fail "${2:-0}" "budget: ${BUDGET}s run budget exceeded${3:+, $3}"
  finish
}
stop() {
  [ -n "$TP" ] && kill -TERM "$TP" 2>/dev/null && wait "$TP"
  infra "${CUR:-run}" "interrupted; step process group killed"
}
# tmo <secs> <mark> cmd...: cmd in its own process group. At the deadline, on INT/TERM/HUP, or when cmd exits leaving processes
# in its group, the group is killed (TERM, 2s, KILL); <mark> says why (deadline|survivors). macOS has no timeout(1). Run it with & only.
tmo() {
  exec perl -e '($t, $m) = splice @ARGV, 0, 2;
    $p = fork // exit 125;
    if (!$p) { setpgrp(0, 0); exec @ARGV; exit 127 }
    setpgrp($p, $p);
    sub reap { kill "TERM", -$p; sleep 2; kill "KILL", -$p }
    sub mark { open my $f, ">", $m or return; print $f shift }
    $SIG{$_} = sub { reap(); exit 130 } for qw(INT TERM HUP);
    if ($t > 0) { $SIG{ALRM} = sub { mark("deadline"); reap() }; alarm $t }
    1 until waitpid($p, 0) == $p || !$!{EINTR};
    $r = $?;
    alarm 0;
    select undef, undef, undef, 0.3 if kill 0, -$p; # let reparented zombies be reaped before calling them survivors
    if (kill 0, -$p) { mark("survivors") unless -s $m; reap() }
    exit($r & 127 ? 128 + ($r & 127) : $r >> 8)' "$@"
}
# step <name> cmd...: run cmd under the step cap (or what is left of the budget, if less) and record pass/fail
step() {
  local n=$1 t s=$CAP src=cap l why rc
  shift
  CUR=$n
  t=$(date +%s)
  l=$(left)
  (( BUDGET && l <= 0 )) && budget "$n" 0 "not started"
  if (( BUDGET && (s == 0 || l < s) )); then s=$l; src=budget; fi
  rm -f "$TMPD/mark"
  tmo "$s" "$TMPD/mark" "$@" >"$TMPD/raw" 2>&1 </dev/null &
  TP=$!
  wait $TP
  rc=$?
  TP=
  redact <"$TMPD/raw" >"$EV/logs/${n//[^A-Za-z0-9_.:-]/_}.log"
  why=$(cat "$TMPD/mark" 2>/dev/null)
  t=$(( $(date +%s) - t ))
  case $why:$src:$rc in
    deadline:budget:*) budget "$n" $t "killed";;
    deadline:*) rec "$n" fail $t "killed: ${s}s step cap";;
    survivors:*) rec "$n" fail $t "left processes running (killed), exit $rc";;
    *:0) rec "$n" pass $t;;
    *) rec "$n" fail $t "exit $rc";;
  esac
}
okurl() { [[ $1 =~ ^https?://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?(/.*)?$ ]] && ! [[ $1 =~ $PROD ]]; }
envguard() {
  local v
  for v in $(compgen -e); do
    [[ $v == *SUPABASE*URL* ]] && ! okurl "${!v}" && infra refuse "\$$v is not a loopback Supabase URL"
    [[ ${!v} =~ $PROD ]] && infra refuse "\$$v names a prod Supabase project"
  done
  return 0
}
# okbase: okurl, plus http only (curl gets --proto =http) and no path (live appends its own)
okbase() { okurl "$1" && [[ $1 =~ ^http://[^/]+/?$ ]]; }
# target: does the process listening on BASE's port provably use a loopback Supabase? If not: WHY, return 1, nothing sent yet.
#   Reads only the (NEXT_PUBLIC_)SUPABASE_URL lines of its .env files and logs host:port only.
target() {
  local port=${BASE##*:} pids pid dir f u hp=
  [[ $port =~ ^[0-9]+$ ]] || port=80
  pids=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null)
  if [ -z "$pids" ]; then
    WHY="stack down: nothing listening on $BASE"
    return 1
  fi
  for pid in $pids; do
    dir=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')
    if [ ! -d "$dir" ]; then
      WHY="refuse: cannot read the cwd of pid $pid listening on :$port"
      return 1
    fi
    for f in .env .env.local .env.development .env.development.local .env.production .env.production.local; do
      [ -f "$dir/$f" ] || continue
      while IFS= read -r u; do
        u=${u#*=}
        u=${u%$'\r'}
        u=${u#[\"\']}
        u=${u%[\"\']}
        if ! okurl "$u"; then
          WHY="refuse: pid $pid's $f names a non-loopback Supabase URL"
          return 1
        fi
        u=${u#*://}
        hp="$hp ${u%%/*}"
      done < <(grep -E '^(export )?(NEXT_PUBLIC_)?SUPABASE_URL=' "$dir/$f")
    done
  done
  if [ -z "$hp" ]; then
    WHY="refuse: the .env files of pid $pids name no SUPABASE_URL, so its target cannot be proven"
    return 1
  fi
  note "dashboard pid $pids targets Supabase$(tr ' ' '\n' <<<"$hp" | sort -u | tr '\n' ' ')"
}
# unavailable <why>: live cannot check the stack. LIVE=req: INFRA. LIVE=opt: a named skip.
unavailable() {
  [ $LIVE = req ] && infra live "$1"
  rec live skip 0 "$1"
}
# get <url>: sets CODE; body in $TMPD/b, headers in $TMPD/h, never written to evidence
get() {
  local l m=60
  l=$(left)
  (( BUDGET && l <= 0 )) && budget live
  (( BUDGET && l < m )) && m=$l
  CODE=$(curl -s -m "$m" --noproxy '*' --proto =http -o "$TMPD/b" -D "$TMPD/h" -w '%{http_code}' "$1")
  if grep -qE "$PROD" "$TMPD/b" "$TMPD/h"; then infra refuse "a response names a prod Supabase project"; fi
}
# ck <name> cmd...: one live:<name> row, pass if cmd succeeds
ck() {
  local n="live:$1" t
  shift
  t=$(date +%s)
  if "$@"; then rec "$n" pass $(( $(date +%s) - t )); else rec "$n" fail $(( $(date +%s) - t )) "$CODE"; fi
}
# page <path> <title>: 200, that title, the themed shell, no Next error page
page() {
  get "$BASE$1"
  CODE="http $CODE"
  [ "$CODE" = "http 200" ] && grep -q "<title>$2" "$TMPD/b" && grep -q 'data-brand-theme=' "$TMPD/b" && ! grep -q '__next_error__' "$TMPD/b"
}
# db: local default creds on loopback, read-only session, SELECT only; never a credential from .env
db() {
  local q="select current_setting('transaction_read_only'), (select count(*) from public.clones), (select count(*) from (select 1 from public.system_logs limit 1) s)"
  CODE=$(env -i PATH="$PATH" PGPASSWORD=postgres PGCONNECT_TIMEOUT=5 PGOPTIONS='-c default_transaction_read_only=on' \
    psql -h 127.0.0.1 -p 54322 -U postgres -d postgres -XAtq -v ON_ERROR_STOP=1 -c "$q" 2>"$TMPD/e") ||
    infra live:db "psql 127.0.0.1:54322 failed: $(head -c 200 "$TMPD/e")"
  [[ $CODE =~ ^on\|[1-9][0-9]*\|[01]$ ]]
}
live() {
  case $LIVE in
    no) return;;
    list) rec live plan 0 "runs if listening"; return;;
  esac
  okbase "$BASE" || infra refuse "CHECK_BASE_URL is not http://localhost or 127.0.0.1 without a path"
  if ! target; then
    unavailable "$WHY"
    return
  fi
  get "$BASE/overview" # the auth probe
  if [[ $CODE == 3* || $CODE == 401 ]] || grep -q '<title>Admin sign in' "$TMPD/b"; then
    unavailable "auth on: pages demand a login, live only checks anonymous pages"
    return
  fi
  for p in /overview /clones /revenue /logs; do
    ck "page:$p" page $p "Twin Console"
  done
  ck page:/api-access page /api-access "API access"
  ck db db
}
# ---- modes ----
echo "check $MODE @ $SHA, budget ${BUDGET}s, step cap ${CAP}s" | tee "$EV/run.log"
envguard
if [ $MODE = exec ]; then
  [ "$1" = -- ] && shift
  if "${SANDBOX[@]}" true 2>/dev/null; then
    step exec "${CLEAN[@]}" "${SANDBOX[@]}" "$@"
  elif confined; then
    step exec "${CLEAN[@]}" "$@" # already in a loopback-only sandbox: our own step's (sandbox-exec does not nest)
  else
    infra preflight "no loopback-only network sandbox (sandbox-exec: macOS only)"
  fi
  finish
fi
if [ $MODE = live ] || [ -n "$CHECK_LIVE_ONLY" ]; then
  [ -n "$CHECK_LIVE_ONLY" ] && OK=STAGE
  live
  finish
fi
if (( PRE )); then
  "${SANDBOX[@]}" true 2>/dev/null || infra preflight "no loopback-only network sandbox (sandbox-exec: macOS only, and not nestable)"
  [ -x node_modules/.bin/tsx ] || infra preflight "node_modules missing (deps not installed or symlink broken)"
  [ -f next-env.d.ts ] || infra preflight "next-env.d.ts missing (run next dev/build once)"
  [ -z "$(git status --porcelain)" ] || infra preflight "dirty tree: commit first"
fi
node --import tsx scripts/check-plan.ts "$MODE" >"$EV/rows.txt" 2>"$EV/logs/plan.log" ||
  infra preflight "scripts/check-plan.ts failed: $(head -c 300 "$EV/logs/plan.log")"
while IFS=$'\x1f' read -r n a why envs c; do
  pe=() # the row's own env, from ours, only if set
  for e in $envs; do
    [ -n "${!e+x}" ] && pe+=("$e=${!e}")
  done
  if [ "$a" = run ]; then
    step "$n" "${CLEAN[@]}" ${pe[@]+"${pe[@]}"} "${SANDBOX[@]}" sh -c "$c"
  else
    rec "$n" "$a" 0 "$why"
  fi
done <"$EV/rows.txt"
live
finish

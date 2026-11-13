#!/usr/bin/env bash
# Test harness. Exit 0 GREEN (PLAN/EXEC in those modes), 1 RED, 2 INFRA (harness/env broke or target refused). RED beats INFRA.
#   fast  merge gate: premerge.sh, then every promoted test:* leaf.   full  fast plus the NEEDS leaves, each with only its listed env.
#   plan  list what fast would run and skip, run nothing.   exec <cmd...>  one step, scrubbed and sandboxed like a leaf (self-test hook).
# Budgets, caps, verdict labels: the mode table below (a cap or blown budget is RED). What runs or is skipped, and why: the rows
#   `scripts/check-plan.ts <mode>` prints; this script runs the `run` rows and records the rest.
# Steps: scrubbed env (DOTENV_CONFIG_PATH=/dev/null, own TMPDIR), macOS loopback-only network sandbox (refused without), own
#   process group; leaving processes behind fails (setsid escapes, but stays in the sandbox and cannot change the verdict).
#   INFRA if a *SUPABASE*URL* var is not loopback or any var names prod. CHECK_INHERITED_SANDBOX=1: see sandbox() below.
# Redacted from evidence: JWTs, bearer tokens, and the value of every *KEY*|*TOKEN*|*SECRET*|*PASSWORD* var (not NEXT_PUBLIC_*,
#   *PUBLISHABLE*) in our env or the repo's .env* files.
# Evidence: .check-evidence/<ts>-<sha>/{run.log,timings.tsv,verdict.json,rows.txt,logs/} (root: CHECK_EVIDENCE_DIR). Can only lower: CHECK_BUDGET_SECS, CHECK_STEP_SECS.
[ -n "$CHECK_NICED" ] || exec env CHECK_NICED=1 nice -n 10 bash "$0" "$@"
set -o pipefail
cd "$(dirname "$0")/.." || exit 2
MODE=$1
shift
case $MODE in # BUDGET: whole run (0 none)  CAP: per step  OK: verdict when nothing failed  PRE: preflight (sandbox, deps, clean tree)
  fast) BUDGET=900 CAP=300 OK=GREEN PRE=1;;
  full) BUDGET=0   CAP=600 OK=GREEN PRE=1;;
  plan) BUDGET=0   CAP=0   OK=PLAN  PRE=0;;
  exec) BUDGET=0   CAP=600 OK=EXEC  PRE=0;;
  *) echo "usage: scripts/check.sh fast|full|plan|exec [-- cmd...]"; exit 2;;
esac
lower() { [[ $1 =~ ^[0-9]+$ ]] && (( $1 > 0 && ($2 == 0 || $1 < $2) )) && echo "$1" || echo "$2"; }
BUDGET=$(lower "$CHECK_BUDGET_SECS" $BUDGET)
CAP=$(lower "$CHECK_STEP_SECS" $CAP)
PCAP=$(lower "$CHECK_STEP_SECS" "$([ $MODE = fast ] && echo 600 || echo $CAP)") # the premerge step's cap: it runs every premerge suite
T0=$(date +%s)
SHA=$(git rev-parse --short=8 HEAD 2>/dev/null || echo nogit)
EV=${CHECK_EVIDENCE_DIR:-.check-evidence}/$(date -u +%Y%m%dT%H%M%SZ)-$SHA
[ -e "$EV" ] && EV=$EV-$$
mkdir -p "$EV/logs" && : >"$EV/timings.tsv" || exit 2
TMPD=$(umask 077; mktemp -d "${TMPDIR:-/tmp}/twin-check.XXXXXX") || exit 2
trap 'rm -rf "$TMPD"' EXIT
trap stop INT TERM HUP
PROD='aouaenqayfltoqrmpitg|cnnsllgzskqkvdovyiiv'
SANDBOX=(/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound (remote ip))(allow network-outbound (remote ip "localhost:*"))')
CLEAN=(env -i "PATH=$PWD/node_modules/.bin:$PATH" "HOME=$HOME" "TMPDIR=$TMPD/" DOTENV_CONFIG_PATH=/dev/null NODE_ENV=test)
# confined: does the kernel refuse (EPERM, the sandbox's answer; no route is ENETUNREACH) UDP to TEST-NET-1 and -2 and the IPv6
#   documentation prefix, then a non-blocking TCP connect to TEST-NET-1? UDP connects send no packet; the TCP one only if open.
confined() {
  perl -e 'use Socket qw(:all); use Fcntl;
    for (["192.0.2.1", PF_INET, SOCK_DGRAM], ["198.51.100.1", PF_INET, SOCK_DGRAM], ["2001:db8::1", AF_INET6, SOCK_DGRAM], ["192.0.2.1", PF_INET, SOCK_STREAM]) {
      my ($h, $f, $t) = @$_;
      socket(my $s, $f, $t, 0) or exit 2;
      fcntl($s, F_SETFL, O_NONBLOCK);
      my $a = inet_pton($f, $h);
      exit 1 if connect($s, $f == PF_INET ? pack_sockaddr_in(9, $a) : pack_sockaddr_in6(9, $a)) || !$!{EPERM};
    }'
}
# sandbox: BOX = how steps get the loopback-only network sandbox, or INFRA. /usr/bin/sandbox-exec by absolute path (no PATH entry
#   can shadow it). It cannot nest, so inside a sandbox (our own step's, codex's) steps run as they are only when the caller opts in
#   with CHECK_INHERITED_SANDBOX=1 AND confined() holds.
sandbox() {
  if "${SANDBOX[@]}" /usr/bin/true 2>/dev/null; then
    BOX=("${SANDBOX[@]}")
  elif [ "$CHECK_INHERITED_SANDBOX" = 1 ] && confined; then
    BOX=()
  else
    infra preflight "no loopback-only network sandbox (sandbox-exec: macOS only, not nestable; inside one: CHECK_INHERITED_SANDBOX=1)"
  fi
}
redact() {
  perl -pe 'BEGIN {
      my @v = map { [$_, $ENV{$_}] } keys %ENV;
      for my $f (grep { -f } glob(".env .env.*")) {
        open my $h, "<", $f or next;
        while (<$h>) { push @v, [$1, $2] if /^\s*(?:export\s+)?(\w+)\s*=\s*["\x27]?(.*?)["\x27]?\s*$/ }
      }
      @s = sort { length $b <=> length $a } grep { length >= 6 }
        map { $_->[1] } grep { $_->[0] =~ /KEY|TOKEN|SECRET|PASSWORD/i && $_->[0] !~ /^NEXT_PUBLIC_|PUBLISHABLE/i } @v }
    for my $s (@s) { s/\Q$s\E/[REDACTED]/g }
    s/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]+/[REDACTED-JWT]/g;
    s/(bearer\s+)\S+/$1\[REDACTED]/gi'
}
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
  if [ $v = GREEN ] && (( p == 0 )); then v=RED; code=1; fi # nothing passed is not GREEN
  env -i PATH="$PATH" node -e 'const [mode, sha, verdict, w, b] = process.argv.slice(1);
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
  [ "$n" = premerge ] && s=$PCAP
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
# ---- modes ----
echo "check $MODE @ $SHA, budget ${BUDGET}s, step cap ${CAP}s (premerge ${PCAP}s)" | tee "$EV/run.log"
envguard
if [ $MODE = exec ]; then
  [ "$1" = -- ] && shift
  sandbox
  step exec "${CLEAN[@]}" ${BOX[@]+"${BOX[@]}"} "$@"
  finish
fi
sandbox
if (( PRE )); then
  [ -x node_modules/.bin/tsx ] || infra preflight "node_modules missing (deps not installed or symlink broken)"
  [ -f next-env.d.ts ] || infra preflight "next-env.d.ts missing (run next dev/build once)"
  [ -z "$(git status --porcelain)" ] || infra preflight "dirty tree: commit first"
fi
# the planner runs node: scrubbed (no NODE_OPTIONS preload, BASH_ENV...) and sandboxed like a step
"${CLEAN[@]}" ${BOX[@]+"${BOX[@]}"} node --import tsx scripts/check-plan.ts "$MODE" >"$EV/rows.txt" 2>"$EV/logs/plan.log" ||
  infra preflight "scripts/check-plan.ts failed: $(head -c 300 "$EV/logs/plan.log")"
while IFS=$'\x1f' read -r n a why envs c; do
  pe=() # the row's own env, from ours, only if set
  for e in $envs; do
    [ -n "${!e+x}" ] && pe+=("$e=${!e}")
  done
  case $MODE:$a in
    fast:run | full:run) step "$n" "${CLEAN[@]}" ${pe[@]+"${pe[@]}"} ${BOX[@]+"${BOX[@]}"} sh -c "$c";;
    *:skip | plan:plan) rec "$n" "$a" 0 "$why";;
    *) rec "$n" fail 0 "unknown plan action '$a' in $MODE";;
  esac
done <"$EV/rows.txt"
[ $OK != GREEN ] || grep -q $'^premerge\tpass\t' "$EV/timings.tsv" || rec premerge fail 0 "premerge did not pass: no GREEN without it"
finish

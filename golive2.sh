set -a; . ./.env.local; set +a
T=../twin-bot/node_modules/.bin/tsx
declare -A ids=([olivia]=49f64d7b-0dad-448b-812b-efcf64438e0e [toochi]=3dff992a-3a86-44f0-a094-2b7e51108103)
declare -A done_
for round in $(seq 1 40); do
  for k in "${!ids[@]}"; do
    [ -n "${done_[$k]}" ] && continue
    o=$($T --tsconfig tsconfig.json rev.ts live ${ids[$k]} 2>&1 | grep -o 'status [a-z]*\|wouldSendCount":[0-9]*\|holdoutCount":[0-9]*\|LIVE\|ERR.*' | tr '\n' ' ')
    case "$o" in *LIVE*|*ERR*) echo "$k: $o"; done_[$k]=1;; esac
  done
  [ ${#done_[@]} -ge 2 ] && break
  sleep 15
done
echo FINISHED

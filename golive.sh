set -a; . ./.env.local; set +a
T=../twin-bot/node_modules/.bin/tsx
declare -A ids=([callace]=42f734bf-f186-497c-85af-09d35c7821b6 [tamara]=51bdc19c-20f6-4122-8a27-be8a273a3add [zoey]=5438cb61-b4fe-439d-b322-e33730f3303e [sania]=0dedee21-e726-4d5d-ba84-ff21ca8502f7 [bri]=2bd66471-4a15-42c1-a8fc-dde632c8c6e3 [cat]=d5dc65b1-f6ff-46df-b7d6-888ed6e9311c [riley]=753af4c9-f0c4-4b56-b979-473daac066b5 [dakota]=815564a3-dc27-4ae6-97a1-991e4ff42f92)
declare -A done_
for round in $(seq 1 40); do
  for k in "${!ids[@]}"; do
    [ -n "${done_[$k]}" ] && continue
    o=$($T --tsconfig tsconfig.json rev.ts live ${ids[$k]} 2>&1 | grep -o 'status [a-z]*\|wouldSendCount":[0-9]*\|holdoutCount":[0-9]*\|LIVE\|ERR.*' | tr '\n' ' ')
    case "$o" in *LIVE*|*ERR*) echo "$k: $o"; done_[$k]=1;; esac
  done
  [ ${#done_[@]} -ge 8 ] && break
  sleep 15
done
echo FINISHED

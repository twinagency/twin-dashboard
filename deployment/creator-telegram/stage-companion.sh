#!/usr/bin/env bash
set -euo pipefail
umask 077
release_dir=${1:?Provide the absolute directory containing the verified companion files}
test "$(readlink -f "$release_dir")" = "$release_dir"
app=flirt-dashboard
container=flirt-creator-telegram
source_commit=838a990578d59c26f8ac4e31e3f14a9a3e8f8f31
image_id=sha256:d4fd15161c0c2deb359bea98de7111188917d58625b4700085d103579d834be6
test "$(docker inspect -f '{{.State.Running}} {{index .Config.Labels "io.flirt.commit"}} {{.Image}}' "$app")" = "true $source_commit $image_id"
(
  cd "$release_dir"
  sha256sum --check checksums.txt
)
if docker container inspect "$container" >/dev/null 2>&1; then
    echo "Companion container name is already in use" >&2
    exit 1
fi
# Keep the private environment on the host. Select only names required by
# the dashboard's signed-session verifier, startup checks and scoped queries.
allowed='^(FLIRT_BACKEND_ENABLED|FLIRT_SUPABASE_PROJECT_REF|FLIRT_LIVE_TWIN_ENABLED|FLIRT_LIVE_TWIN_URL|FLIRT_LIVE_TWIN_SERVICE_KEY|SUPABASE_URL|SUPABASE_SERVICE_KEY|DASHBOARD_PUBLIC_ORIGIN|DASHBOARD_SESSION_SECRET|CREATOR_SESSION_SECRET|DASHBOARD_PASSWORD|BOT_V2_URL)='
network=$(docker inspect -f '{{.HostConfig.NetworkMode}}' "$app")
docker run -d --name "$container" --restart unless-stopped \
  --label io.flirt.component=creator-telegram --network "$network" \
  --publish 127.0.0.1:3114:3087 --entrypoint node --user 1001:1001 \
  --cap-drop ALL --security-opt no-new-privileges --read-only \
  --memory 160m --memory-swap 160m --cpus 0.5 --pids-limit 64 \
  --log-opt max-size=2m --log-opt max-file=2 \
  --mount "type=bind,source=$release_dir,target=/opt/feed,readonly" \
  --env-file <(grep -E "$allowed" /etc/flirt/dashboard.env) \
  -e TELEGRAM_FEED_HOST=0.0.0.0 -e TELEGRAM_FEED_PORT=3087 \
  "$image_id" /opt/feed/server.cjs

# Creator Telegram companion

This first-party, read-only service serves the Telegram page alongside the FLIRT creator dashboard. It uses the dashboard's existing signed creator session, account entitlement and current clone link. The server resolves the clone for each request. Both entry points restrict access to the linked recipient. The launcher checks access with a bodyless HEAD request before adding Telegram to either Home navigation menu.

## Build and check

Use Node 22 or newer and run these commands at the repository root.

```sh
npm ci
node deployment/creator-telegram/build.cjs
node deployment/creator-telegram/test.cjs
node deployment/creator-telegram/test-launcher.cjs
./node_modules/.bin/tsc --noEmit --incremental false
(cd deployment/creator-telegram && sha256sum -c SHA256SUMS)
```

The build uses the React feed in `components/CreatorTelegramFeed.tsx` and the scope and monitor loaders in `lib/creator-telegram-*.ts`. It emits `dist/server.cjs`, `dist/feed.js` and `dist/feed.css`. The HTTP fixture suite uses generated signing secrets and local test records. The launcher suite renders the real studio shell and tests both navigation menus and session revocation.

## Runtime

Start `node dist/server.cjs` with the three build outputs in the same directory. Use the existing FLIRT dashboard environment for session verification, the FLIRT Supabase project, the live Twin connection and the Telegram V2 monitor. Supply environment values through the deployment's existing secret configuration. The listener defaults to loopback on port 3087. For a container, set `TELEGRAM_FEED_HOST=0.0.0.0`, set `TELEGRAM_FEED_PORT=3087` and publish only `127.0.0.1:3114:3087` on the host.

The two proxied paths are `/creator/telegram` and `/creator-auth/telegram/feed`. Serve `launcher.js` at `/flirt-telegram/launcher.js` and include it as a deferred script on the HTML response for `/creator`. The launcher uses HEAD and reveals its menu item only on HTTP 204. Check the exact page path, its home link, signed-out denial, and both the conversation list and a transcript from the entitled account when verifying a new deployment.

## Stage behind the existing dashboard

Prepare an absolute, read-only release directory containing the three build outputs, `launcher.js` and a hash manifest with these flat file names. From `deployment/creator-telegram`:

```sh
mkdir -p "$release_dir"
cp dist/server.cjs dist/feed.js dist/feed.css launcher.js "$release_dir/"
sed 's|  dist/|  |' SHA256SUMS > "$release_dir/checksums.txt"
(cd "$release_dir" && sha256sum -c checksums.txt)
```

On the FLIRT host, the runtime user (UID 1001) needs read access to these files and search access to the release directory. Run `stage-companion.sh "$release_dir"` to start the private service. The script verifies the dashboard container revision and image digest, verifies the release hashes, then exposes the companion on the host loopback address.

The Apache configuration is `creator-telegram-apache.conf`. It belongs inside the FLIRT TLS virtual host before the dashboard's catch-all proxy rule and requires the existing proxy, headers, filter and substitute modules. The launcher file is served from `/var/www/flirt-creator-telegram/launcher.js`. Validate configuration with `apache2ctl configtest` before a graceful reload. Removing the include and gracefully reloading restores the original public routing and navigation.

# Docker

The dashboard is a Next.js 15 app. It builds into a small, self-contained
production image using Next's [standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output)
(`next.config.mjs` sets `output: "standalone"`), so the image only ships the
`node_modules` the server actually needs — not the full `node_modules` tree or
the source.

## Files

- `Dockerfile` — 3-stage build: `deps` (install), `builder` (`next build`),
  `runner` (minimal image, runs as a non-root `nextjs` user on port `3001`).
- `.dockerignore` — keeps `node_modules`, `.next`, `.git`, `.env` out of the
  build context.
- `docker-compose.yml` — builds the image and runs it with `.env` loaded.
- `.env.example` — the env vars the app actually reads (see
  `lib/session.ts`, `lib/supabase.ts`, `lib/openrouter.ts`, `lib/compiler.ts`).

## Quick start

```bash
cp .env.example .env
# fill in SUPABASE_URL, SUPABASE_SERVICE_KEY, DASHBOARD_PASSWORD,
# DASHBOARD_SESSION_SECRET, OPENROUTER_API_KEY

docker compose up --build
```

The dashboard is then at http://localhost:3001.

## Build / run without compose

```bash
docker build -t allie-dashboard .

docker run -d \
  --name allie-dashboard \
  -p 3001:3001 \
  --env-file .env \
  --restart unless-stopped \
  allie-dashboard
```

## Required environment variables

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL (same project the bot uses) |
| `SUPABASE_SERVICE_KEY` | yes | Supabase service-role key |
| `DASHBOARD_PASSWORD` | yes | Password that gates `/login` |
| `DASHBOARD_SESSION_SECRET` | yes | Signs the session cookie — use a random 32+ byte value, e.g. `openssl rand -base64 32` |
| `OPENROUTER_API_KEY` | yes | Used by the persona compiler (`/clones/new`, `/settings`) |
| `COMPILER_MODEL` | no | Overrides the default compiler model (`openai/gpt-4.1`) |

These are all read server-side at request time (see `lib/session.ts`,
`lib/supabase.ts`, `lib/openrouter.ts`, `lib/compiler.ts`) — none are baked
into the image at build time, so the same image can be promoted across
environments (dev/staging/prod) by just changing the env file/secrets.

**Never commit `.env` with real values** — it's already in `.gitignore`.
Rotate the keys in this repo's tracked `.env` (already gitignored, but treat
any key you've ever pasted into a shared file as compromised) if you're
unsure whether they've leaked.

## Notes

- The container listens on port `3001` (matches `npm run dev`/`npm run
  start` locally). Change the `PORT` env var and the `-p`/`ports` mapping
  together if you need a different port.
- `instrumentation.ts` forces IPv4 DNS resolution on boot (works around a
  host-specific IPv6 routing issue); it runs automatically inside the
  container too, and is harmless if the container's network doesn't have the
  same issue.
- The image runs as a non-root user (`nextjs`, uid 1001) per Next.js's
  documented production Dockerfile pattern.
- For local development, keep using `npm run dev` — the Dockerfile targets
  production builds only (`npm run build` + `node server.js`), not hot
  reload.

## Connection pooling (Supavisor)

The app only talks to Supabase over the REST API (`supabase-js` in
`lib/supabase.ts`), which Supabase already pools for you server-side — there's
nothing to configure for that path today, even when you run multiple container
replicas.

If some future code needs a *direct* Postgres connection (a migration runner,
an ORM, a one-off script), set `DATABASE_URL` (see `.env.example`) to the
**Supavisor pooler** connection string from the Supabase dashboard (Project
Settings → Database → Connection pooling) — not the direct connection string.
Each container replica making its own direct connection to Postgres is how you
exhaust its (small) connection limit; the pooler is what avoids that. Use
transaction mode (port `6543`) for short-lived queries, session mode (`5432`)
only if you need session-level features like prepared statements.

## Deploying alongside the bot

This dashboard and the Telegram bot are split into separate apps/repos but
share one Supabase project. They can be deployed as independent containers
(e.g. two services in the same `docker-compose.yml`, or two separate
deployments) — the dashboard doesn't need the bot's process to be running,
it only needs network access to the same Supabase instance.

**Exception: the Test page.** `app/test`, via `lib/test-runs.ts`, spawns
`npx tsx src/dev/test-run.ts` inside the bot repo's checkout on the SAME
filesystem (`repoRoot()` looks for a sibling `../bot` directory, or the bot
repo itself if Next was somehow started from there). That's real bot source
code, not an API call, so "network access to the same Supabase instance" is
not enough for this one feature. It works in local dev (both repos checked
out side by side) but not in this image, which is a self-contained `next
build --standalone` build that never includes the bot repo.

This is handled honestly, not silently: `testRunsAvailable()` checks whether
`src/dev/test-run.ts` actually exists under `repoRoot()` before spawning
anything. When it doesn't, `POST /api/test-run` returns a clear 501 with an
explanatory message instead of a confusing spawn/ENOENT error, and the Test
page shows a banner and disables the run controls (history still loads,
since that's a plain DB read). No other page or feature depends on the bot's
source being present, only this one.

If you want Test runs to actually work in a container deployment, you have
two honest options, neither of which this Dockerfile does for you by
default:

1. **Build a combined image.** Extend this Dockerfile (or write a new one) to
   `COPY` the bot repo's source into the image too (e.g. build with the
   parent directory as context: `docker build -f dashboard/Dockerfile ..`,
   or a multi-repo CI checkout step) and `npm ci` its dependencies as well.
   This roughly doubles the image's dependency footprint and couples the two
   repos' versions together at build time, so only do this if the Test page
   genuinely matters in that environment.
2. **Mount the bot repo at runtime** as a volume at a path `repoRoot()`
   resolves to (a sibling `../bot` relative to the container's `/app`
   workdir), with its own `node_modules` already installed inside that
   mount (the container's `npx tsx` needs `tsx` resolvable from there).

Neither is wired up today. Pick one only if an operator actually needs Test
runs available from a containerized dashboard; otherwise the graceful
"unavailable" message above is the intended behavior.

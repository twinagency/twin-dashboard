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

## Deploying alongside the bot

This dashboard and the Telegram bot are split into separate apps/repos but
share one Supabase project. They can be deployed as independent containers
(e.g. two services in the same `docker-compose.yml`, or two separate
deployments) — the dashboard doesn't need the bot's process to be running,
it only needs network access to the same Supabase instance.

# syntax=docker/dockerfile:1
#
# KNOWN LIMITATION: the /test page (app/test, lib/test-runs.ts) spawns
# `npx tsx src/dev/test-run.ts` in a SIBLING "../bot" checkout — that only
# works in local dev where both repos share a filesystem. This is a
# self-contained `next build --standalone` image with NO bot source at all,
# so Test runs are unavailable here by design, not by bug: the app detects
# this (lib/test-runs.ts testRunsAvailable()) and fails with a clear message
# instead of a broken spawn. See dashboard/DOCKER.md, "Test page limitation",
# for what it would take to support it in a container deployment.

# ── 1. deps: install dependencies with a cached layer ────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-factor 2 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm config set fetch-timeout 300000 \
  && npm ci

# ── 2. builder: compile the Next.js app ──────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time-only placeholders so `next build` can statically analyze pages
# that read env vars; real values are injected at container runtime instead.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build
RUN ./node_modules/.bin/esbuild scripts/check-live-catalogue-previews.ts --bundle --platform=node --format=cjs --external:sharp --outfile=catalogue-preview-check.cjs

RUN ./node_modules/.bin/esbuild scripts/check-live-dashboard-recovery.ts --bundle --platform=node --format=cjs --jsx=automatic --external:sharp --outfile=dashboard-recovery-check.cjs

# ── 3. runner: minimal production image ──────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Baked in by CI so the RUNNING container can be asked which commit it is,
# rather than inferred from a tag or an image id. Both boxes have served
# 25-hour-old images while git log said otherwise; this is the read-back.
ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && apk add --no-cache ffmpeg

# Standalone output: a self-contained server.js plus only the node_modules
# it actually needs (see next.config.mjs `output: "standalone"`).
COPY --from=builder /app/package.json ./
COPY --from=builder --chown=nextjs:nodejs /app/scripts/check-live-moxy-upload.cjs ./moxy-upload-check.cjs
COPY --from=builder --chown=nextjs:nodejs /app/catalogue-preview-check.cjs ./catalogue-preview-check.cjs
COPY --from=builder --chown=nextjs:nodejs /app/dashboard-recovery-check.cjs ./dashboard-recovery-check.cjs
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# This exact, allowlisted one-time operation is invoked manually through SSM.
# Keep it in the runtime image; the standalone Next.js copy excludes scripts/.
COPY --from=builder --chown=nextjs:nodejs /app/scripts/reset-recent-creator-test-accounts.mjs ./scripts/reset-recent-creator-test-accounts.mjs

USER nextjs
# Verify that the standalone image includes every dependency before deployment.
RUN CATALOGUE_PREVIEW_CHECK_LOAD_ONLY=1 node catalogue-preview-check.cjs
RUN DASHBOARD_RECOVERY_CHECK_LOAD_ONLY=1 node dashboard-recovery-check.cjs
EXPOSE 3001

CMD ["node", "server.js"]

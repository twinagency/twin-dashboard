# allieai2-dashboard

Next.js operator dashboard for the AI companion clone fleet. Shares a Supabase project with the bot repo (`../bot`, or `QuestGltAdmin/allieai2-bot`).

Run locally: `npm run dev`. The `dev` script hardcodes `-p 3001`; pass `-- -p 3002` to override when 3001 is taken.

## Non-negotiable rules

1. **Supabase target.** Only ever `aouaenqayfltoqrmpitg` ("Allie AI New"). NEVER `cnnsllgzskqkvdovyiiv`, that is old prod with live paying users.
2. **Supabase writes are allowed on `aouaenqayfltoqrmpitg` only** (owner decision, 2026-07-27). That decision predates the cutover, which **finished 2026-08-09/10**: all ten clones now run on Twin against this project and the n8n servers are deleted, so treat it as live, not as a scratch database. Migrations still ship as numbered `.sql` files in `../bot/db/migrations/` so the change stays reproducible and reviewable, but they may also be applied directly. Two conditions stand: never write to `cnnsllgzskqkvdovyiiv`, and always snapshot `../bot/db/manual/ROLLBACK_*.sql` before editing a fleet-wide `prompt_templates` row, since a bad template reaches every clone within 60s. **This does NOT relax rule 3**, which governs what the AI assistant may do and is a separate, stricter boundary.
3. **The `/ai` assistant reads via an allowlist and writes ONLY through existing validated server actions.** Reads go through the Supabase JS query builder against an explicit table and column allowlist in `app/api/ai-assistant/tools.ts`, never raw SQL. Regex-filtered "read only" raw SQL is bypassable and is not acceptable here. Hard capped at 200 rows per query. `bot_token` and `app_settings.value` (holds OpenRouter, ElevenLabs, Deepgram keys) are excluded from the allowlist entirely. Writes (added 2026-07-27) are thin wrappers over server actions that already exist and are already validated, against the hardcoded allowlist in `app/clones/toggle-fields.ts`; never a generic "update any column" tool, never raw SQL, and never a money VALUE (only the on/off switches). Every assistant write is surfaced in the chat and logged to `system_logs`. Follow this exact pattern for any future AI plus data feature.
4. **A clone is a database row.** No per-clone code paths.

## UI conventions

- **No em dashes anywhere in UI copy.** Use commas or periods. This was swept repo wide, do not reintroduce.
- **Explanatory text goes in ⓘ-hover hints, never grey paragraphs under fields.** Match neighbouring fields exactly.
- **Secret fields are blurred.** Follow the existing pattern for anything key or token shaped.
- Shared field primitives live in `components/clone/fields.tsx` (`Field`, `Toggle`, `Section`, `Collapse`, `inputCls`, `selectCls`). Use them rather than raw inputs.

## Key architecture

**`lib/persona-facts.ts` mirrors `../bot/src/prompt.ts`.** The bot builds a deterministic facts block from typed clone columns; this file duplicates that logic for dashboard preview. Any change to one MUST be made in both.

**`lib/intake.ts`** is the onboarding questionnaire, prose only since the 2026-07-17 persona audit. Hard facts live in typed `clones` columns edited by `components/clone/PersonaFactsFields.tsx`, not here.

**Retiring an intake key:** use the `LEGACY_MERGE` map plus `proseValue()` in `lib/intake.ts`. Old values merge into the new box on next edit so nothing is lost and it round trips on save. Never delete a key outright without this.

**`lib/compiler.ts`** reads `prompt_templates` from Supabase and runs the AI compiler that turns intake prose into `persona` jsonb slots. It only reads templates; there is no template editing UI in this dashboard.

**`app/clones/actions.ts`** `rowFromForm()` maps form fields to DB columns. It has a missing-column retry path: on a PostgREST missing-column error it strips columns from unapplied migrations and retries, so the dashboard keeps working before the owner applies a migration. Extend this when adding columns.

## The half-wired toggle

This project's dominant defect is **"configured but inert"**: a setting saves, looks right in the UI, and the runtime never reads it. Ten confirmed cases. Adding or changing a toggle means walking the whole chain:

`migration` → `mapClone` → **both repos'** types → `app/clones/actions.ts` (including `OPTIONAL_COLUMNS`, so a save before the migration lands strips the column instead of failing) → `useCloneConfig` → the control itself → **and the bot code that actually reads it**

`mapClone` is the #1 silent failure point. A half-wired toggle is worse than no toggle, and a dead switch left in the UI after a feature is removed is the same bug in reverse. Before deleting a config section, check it is not a **brake** — deleting a brake makes the bot pushier, which has already happened once.

## Identity data principle

Anything a fan can ask a factual question about must be a typed column, never intake prose. Prose passes through the AI compiler which can drop or mutate facts. If a field can be a toggle, switch, select, or chip set, make it one. Free text only where the content genuinely cannot be enumerated.

## The Twin Admin API (`app/api/admin/v1/*`)

Read-only internal API over the same data the dashboard renders: clone config, persona/intake blobs, prompt templates, verbatim fan chats, `system_logs`, revenue. Built for sim testing and for AI assistants that read data. Phase 2 of `../scope/SCOPE-TWIN-API.txt`; there is no public/tenant API and no write API, and **this one must not be exposed to an agency** because no tenant model exists in this database.

Four rules, all asserted by `npm run test:api`:

1. **A route is authenticated by calling `withAdmin`, not by living under a path.** `middleware.ts` returns early (no auth at all) whenever `NODE_ENV !== "production"` or `DASHBOARD_NO_AUTH` is set, and its matcher covers `/api/*`. Nothing in `lib/api-auth.ts` may read either variable.
2. **Two independent gates**: a bearer key (`TWIN_ADMIN_API_KEY`, min 32 chars) and the caller's network (loopback or Tailscale `100.64.0.0/10`). An unset key returns 503, never "skip the check". The network gate takes the **rightmost** `X-Forwarded-For` entry, the one Apache appended; the leftmost is client-controlled. This assumes exactly one trusted proxy.
3. **One choke point.** Every read goes through `runQuery`/`resolveClone` in `lib/api-read.ts`. No route imports `supabaseAdmin` directly, so there is one place a column can be admitted.
4. **The allowlist is shared with the AI assistant, not duplicated.** `lib/api-read.ts` imports `ALLOWLIST` from `app/api/ai-assistant/tools.ts` per rule 3 above, adds the blobs the assistant skips for context cost (`persona`, `intake`, the legacy `*_prompt` columns, `business_username`), and subtracts `clones.bot_token` and `app_settings.value` unconditionally, last.

`npm run test:api` runs through this repo's `tsx` development dependency, so the checks work both in the local twin workspace and in a standalone CI checkout.

## The Twin public API (`app/api/v1/*`)

Read-only revenue + fan data, called by a model's own dashboard or by an outside builder. Internet-facing by design, so unlike the admin API it has no network gate and the key is the only thing standing there.

**Two key scopes, and the scope comes from the key row, never from a parameter.** `tenant.scope` is `"clone"` (sees the one clone in `clone_id`, the original 2026-08-08 shape, migration 103) or `"fleet"` (sees every clone, `clone_id` null, migration 127, added 2026-08-24 so one key can draw all ten girls on one page). `withModelKey` hands the handler a resolved `tenant` and **rejects** `?clone=` with a 400 for BOTH scopes rather than ignoring it — a fleet key gets every clone in the response and does not need one.

The two columns are pinned by a CHECK constraint, and `tenantFromRow()` re-checks the same invariant in code. **Every ambiguous row narrows or is refused**: only the exact string `"fleet"` reads as fleet, a fleet row that still names a clone is refused outright, and `createKey` will not mint a fleet key from a missing model — `validateKeyRequest` requires the scope to be asked for. Widening is the direction that is not survivable, so nothing may widen by accident.

**Widening WHICH girls a key sees never widens WHAT it sees about them.** `projectFleetRevenue` adds `models[]` with `id`, `name`, `revenueStars`, `sales` and nothing else; `a.clones[]`'s per-girl `costUsd`/`profitUsd`/`margin` is not in it. Fan rows gain `clone_id` and no other column.

**Neither public revenue path runs the cost rollup.** Both call `getAnalytics(..., { includeCost: false })`. `revenue_usage_rollup` is the most expensive query on the page and this API is forbidden from returning its result — on 2026-08-24 it was timing out (57014) and 500ing every request to compute a number that `projectRevenue` then deleted. `check-public-api.ts` G10 fails if a future edit drops the flag.

**Our cost and margin never leave the building.** `getAnalytics()` returns `costUsd`, `profitUsd`, `margin` and a fleet-wide per-clone breakdown. `projectRevenue()` in `lib/api-public.ts` is an **allowlist projection**, not a deletion pass: every outbound field is named, so a field added upstream is withheld by default instead of exposed by default. Do not replace it with a spread.

**Payments and stats (2026-10-10).** `/api/v1/payments` (every Star payment in a window, keyset-paged by `nextCursor`, up to 1000 rows and 90 days back; a page never splits a `paid_at` group, so it may exceed `limit` by that group's tail, and only `nextCursor === null` means done) and `/api/v1/stats` (revenue/sales/buyers for 1h, 24h, 7d and 30d, fan counts, today's sales by feature and hour, per-model rows for a fleet key; one snapshot per scope per 15s) live in `lib/api-public-v2.ts`, with every request parameter parsed and clamped in `lib/api-public-query.ts` so `lib/api-public.ts` still never reads one (check B1). Both go through the same duplicate collapse and cuts as `/revenue`, so a window's payments, summed over every page, equal its revenue. Neither reads `usage_events`, a cost rollup, chat or an invoice payload (checks H6/H7). `/api/v1/fans` gained `sort`, `offset`, `active_since`, `joined_since`, `min_spent`, `tier`, `buyers`; they narrow or reorder what the key already sees and cannot widen it. Every response carries `generatedAt` and `Cache-Control: private, no-store`.

Keys are sha256, never plaintext, revocable, rate limited to 120/min per key (the dashboard shares this process, so a model's refresh loop must not take the operator UI down). Mint at `/api-access` (the Model select's last option is **All models**), or with `npm run key:issue -- --clone <slug> --label "..."`; also `key:list`, `key:revoke`. **The CLI mints per-clone keys only** — it writes its own insert rather than calling `createKey`, so a fleet key comes from the page.

## Sim data (`app/api/admin/v1/sim/*`)

Synthetic revenue and fans, deterministic by `?seed=`, in exactly the shape of the `/api/v1/*` payloads so a dashboard can be built against sim and repointed with a URL change. **`lib/api-sim.ts` imports no database client at all** — that is the safety property, and it is what `test:public` asserts. Never solve "we need test data" by writing fake rows into the live tables; poisoned revenue is unrecoverable and the exclusion filter always gets forgotten.

## Verification

`npx tsc --noEmit` type-checks the product code (`app/`, `components/`, `lib/` and the two root files), the same program Next builds. `npm run typecheck` checks everything: that program plus `tsconfig.scripts.json`, `tsconfig.preview.json` and `tsconfig.tests.json`. The old single program for all 1,400 files needs about 1.8 GB of heap; each of the four now fits in a 1,200 MB heap, but the product program is close to that limit (it aborts at 1,100 MB). Run it once when done, not after every file edit. It needs `next-env.d.ts` (written by `next dev` or `next build`, ignored by git).

`npm test` chains the `test:*` scripts in `package.json` — read them there, because the list has grown twice without this file noticing. Unlike a typecheck these have caught real bugs. **Do not quote a check count from this file; run the command.** Every guard was proven by planting the bug back; the record is in `../TWIN-API.txt`.

To typecheck everything use `npm run typecheck`. Engine UI checks: `npm run test:engine-contracts`, `npm run test:engine-ui`, and `npm run test:engine-browser` (needs Chromium and a `base.css`, see `tests/browser/build-engine-journey.mjs`).

`npm run test:api` for the admin API. Unlike a typecheck this one has caught real bugs: each of its guards was proven by planting the bug back and watching it go red (record in `../TWIN-API.txt`). Anything added to `app/api/admin/v1/` ships a check here.

## Deploys

Push to `main` builds the image in GitHub Actions and the box pulls it by digest. A push that touches only `.md`, `.txt` or `archive/` does NOT deploy — see `paths-ignore` in `.github/workflows/deploy.yml` and `ci.yml` — neither deploy nor CI runs on one. Docs live on disk and on the home server; only these `CLAUDE.md`/`README.md` files are in the repo.

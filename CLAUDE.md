# allieai2-dashboard

Next.js operator dashboard for the AI companion clone fleet. Shares a Supabase project with the bot repo (`../bot`, or `QuestGltAdmin/allieai2-bot`).

Run locally: `npm run dev`. The `dev` script hardcodes `-p 3001`; pass `-- -p 3002` to override when 3001 is taken.

## Non-negotiable rules

1. **Supabase target.** Only ever `aouaenqayfltoqrmpitg` ("Allie AI New"). NEVER `cnnsllgzskqkvdovyiiv`, that is old prod with live paying users.
2. **Supabase writes are allowed on `aouaenqayfltoqrmpitg` only** (owner decision, 2026-07-27: this stack is pre-cutover, real paying users are still on the old n8n system, so this project is a test database). Migrations still ship as numbered `.sql` files in `../bot/db/migrations/` so the change stays reproducible and reviewable, but they may also be applied directly. Two conditions stand: never write to `cnnsllgzskqkvdovyiiv`, and always snapshot `../bot/db/manual/ROLLBACK_*.sql` before editing a fleet-wide `prompt_templates` row, since a bad template reaches every clone within 60s. **This does NOT relax rule 3**, which governs what the AI assistant may do and is a separate, stricter boundary.
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

## Verification

`npx tsc --noEmit` for typecheck. Run it once when done, not after every file edit.

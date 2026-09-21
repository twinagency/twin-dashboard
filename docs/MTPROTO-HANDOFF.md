# MTProto re-engagement: handoff (2026-09-22, after first real tests)

For whoever reads this next (Jesse, ChatGPT). Everything below was checked against the code and against a real Telegram test on 2026-09-22. No secrets are in this file.

## What it is

Reach fans who went silent for more than 24h, **once per silent stretch**, from the creator's **own Telegram account**, without bringing back the old drip spam.

- Telegram bots cannot message a Business chat after 24h of fan silence. Only the creator's own user session can.
- **One Twin brain, two pipes.** `twin-bot` (AWS, live) keeps active chats, sales and payments. `twin-userbot` (Ronan's laptop, mtcute 0.32.2) sends ONE re-engagement text per silent fan.
- `twin-dashboard` has a new top-level area, **MTProto Campaign** (`/mtproto-campaign`): preview, dry run, review, go live, stop.
- Supabase target is `aouaenqayfltoqrmpitg` ("Twin") only. Never `cnnsllgzskqkvdovyiiv` (old prod).

## What was proven for real (2026-09-22)

- Cat's own Telegram account (clone `cat-chase`) is connected through MTProto. Cat has 2FA; the local connect page handled it. The session is saved as an encrypted file on the laptop and a row in `userbot_connections`.
- Cat's session sent **text and photos** to two test accounts owned by Ronan. 12 real sends, all accepted by Telegram, about 5 seconds each. Nothing went to a real fan.
- The bot's owner-message guard is live on `main` (commit `251cff6`, CI and deploy green).
- **Not yet done:** no campaign has run end to end against real Telegram, no dry run has been created, and the reply path (test fan replies, bot answers exactly once) has not been checked. The sends above were made by a separate manual test tool, not by the campaign worker.

## Where things live

| piece | where | state |
|---|---|---|
| Dashboard area | `twin-dashboard` branch `mtproto-campaign` (`app/mtproto-campaign`, `lib/mtproto`, `components/mtproto`, `app/api/admin/v1/mtproto`) | pushed, main untouched |
| Migrations | `twin-bot/db/migrations/162_reengage_mtproto.sql`, `163_reengage_identity_by_telegram_id.sql` (on twin-bot branch `mtproto-campaign`) | **applied live**. 162 was recorded live under the name `158_reengage_mtproto`; renumbered because `main` already owns 158 to 161 |
| Worker | `ronan-com/twin-userbot`, branch `main` (Node/TS, mtcute) | pushed, private repo, see "Worker code" below |
| Owner-message guard | `twin-bot/src/index.ts` plus `src/dev/check-owner-business-message.ts` | on `main`, deployed |

### Worker code

The worker is its own private repo: **`ronan-com/twin-userbot`**, branch `main` (pushed 2026-09-22, no secrets, `.env` and `sessions/` are gitignored). Its layout:
`src/index.ts` (entry), `config.ts` (Supabase project guard, live gate), `contract.ts` (types and constants, mirrors the SQL CHECK lists), `policy.ts` (eligibility), `compose.ts`, `store.ts` + `paging.ts` (Supabase access, every read paged past the 1000-row cap), `telegram.ts` (mtcute wrapper), `session.ts` (AES-256-GCM session file), `spike.ts` + `replyClassifier.ts` (auto-halt), `loops/` (runClaimer, scanner, sender, replyWatcher, sessionKeeper, runProcessor, recovery), `cli/` (login, logout, web connect page), `dev/` (35 check files), `integration/` (real PostgREST test).

## Database (live)

Five new tables: `reengage_runs`, `reengage_episodes`, `reengage_events`, `userbot_connections`, `reengage_optouts`. Four functions. Nothing existing was changed.

- **One live message per silent stretch** is enforced by the database: `UNIQUE (clone_id, telegram_id, episode_start_inbound_at, dedupe_scope)`. Live episodes share one scope; dry episodes are scoped to their own run, so a dry run never blocks a live one.
- `send_random_id` (Telegram random id) is saved before the send, unique, and immutable, so a retry cannot double-send.
- `claim_reengage_run` and `claim_reengage_episode` return `jsonb` (a real NULL when nothing is claimable) and skip paused creators.
- `reengage_events` is append-only for `service_role` (select and insert only). anon and authenticated have no access. RLS is on for all five.
- After 163, deleting a fan in the dashboard no longer deletes their opt-out or send history (`user_id` becomes NULL; identity is `clone_id + telegram_id`).

## Safety rules (built, tested on fakes, real Postgres and real PostgREST)

A real send needs **all** of: run confirmed live, dry-run review recorded, typed `GO LIVE`, `REENGAGE_ALLOW_LIVE=true` on the laptop, no Stop or Global Stop, creator not paused, session user matches the registered creator.

- Every run is created as a dry run. `confirm_live_at` and `dry_run=false` are written only by `confirmLive` (`lib/mtproto/runs.ts`), which checks the typed phrase server-side, the review event and unchanged counts, and that the live audience is not larger than the one reviewed.
- Excluded automatically: paused fans, minors, `us_location`, legacy imports (`users.legacy_id`), blocked, opted out, test accounts, fans who replied since the scan. Read errors fail closed.
- 10 to 20% random hold-out is never contacted, so lift can be measured. Metrics say "acknowledged sends", not "delivered".
- Auto-halt per creator: 10% or 3 opt-outs, 10% or 3 complaints, or 30% failing sends, after a minimum of 10 real sends. Only an operator resumes, with a typed phrase. Any FloodWait, PeerFlood or AUTH error halts that creator at once.
- Caps: daily, hourly (default 10, hard ceiling 20), per run, per creator; jitter floor 2s. 20 to 50 per day is an **experiment cap**, not a number Telegram calls safe.

## Test results

| suite | result |
|---|---|
| twin-userbot `npm test` | 35 checks green, typecheck clean |
| connect page check | 81 assertions green |
| twin-userbot `integration/run.sh` (real PostgREST) | 41 green |
| `twin-bot/db/manual/TEST_158_reengage.sh` (Postgres 16) | 97 green |
| dashboard `test:mtproto` | 89 green |
| dashboard `test:api` | 51 green |
| twin-bot `npm test` (with the owner guard) | 170 green |

Known pre-existing failures, unrelated to this work: dashboard `test:rollups` and `test:users-tile` fail with or without these changes.

## How to run (all from `twin-userbot/`)

- Connect a creator: `npm run connect` (page on `127.0.0.1:3002`, QR plus 2FA box). Terminal alternative: `npm run login -- --clone <id>` (no 2FA prompt when run without a keyboard).
- Disconnect: `npm run logout -- --clone <id>`. Recover a stuck run: `npm run recover-run -- --run <uuid>`.
- Dry run: create it in the dashboard, then `npm run dry` (sends nothing).
- Dashboard: `cd twin-dashboard && npm run dev` (port 3001), then `/mtproto-campaign`.
- Config lives in `twin-userbot/.env` (gitignored): Supabase URL and service key, `TG_API_ID`, `TG_API_HASH`, `SESSION_ENCRYPTION_KEY`, `WORKER_ID`, `REENGAGE_ALLOW_LIVE` (default false), `REENGAGE_DRY_RUN`.
- Session files live in `twin-userbot/sessions/` (encrypted, mode 600, gitignored). Back up the folder **and** the `SESSION_ENCRYPTION_KEY`; losing either means the creator scans again.

## Still open (in priority order)

1. **Dashboard sync with migration 163.** `lib/mtproto/audience.ts` (about L130 to 164) keys opt-outs as `clone:user_id` and existing episodes by `user_id`; it must key on `telegram_id`. `episodes.ts`, `review.ts`, `sends.ts` assume `episodes.user_id` is non-null; guard for nulls.
2. Dashboard visual polish (a partial pass was stopped; some component edits are uncommitted locally and are not part of this branch).
3. Create Cat's dry run, run the worker dry, review the numbers and the sample messages.
4. First real campaign send to a **test fan** (Ronan's own test account), using the full gated flow. The fan's chat must have been silent 24h or more. Then reply from the test account and check the bot answers exactly once and no phantom fan appears.
5. Only then a tiny real pilot with the hold-out on, cap 5, then ramp.
6. `claim_reengage_run` takes the oldest queued run for any caller, so a dry-only worker in front of a queued live run keeps handing it back. Fix needs a claim-function change.
7. Legal review of Telegram's API and content-licensing terms on AI use; Ronan's decision on the 2026-09-21 "unsolicited off" exception; decide who else gets access to the private `twin-userbot` repo.

## Do not

- Do not flip `UNSOLICITED_MESSAGING_ENABLED` (re-enables every old sender fleet-wide).
- Do not run two workers on one creator, and never reuse another sender's session (two copies of one session kill the auth key).
- Do not point anything at `cnnsllgzskqkvdovyiiv`.
- Do not put a session string, `api_hash`, service key or `.env` value into any repo, log or chat.
- Do not edit migrations 162 or 163 in place: both are applied live. Add a new migration instead.
- Do not merge `mtproto-campaign` branches into `main` without Ronan; `twin-bot` and `twin-dashboard` `main` deploy on push.

## Other files (on Ronan's laptop, not in the repos)

`/home/ronan/twin/` holds the longer plan and research: `FULL-INFRA-SYSTEM-PLAN-2026-09-21.txt`, `HANDOFF-MTPROTO-FULL-2026-09-22.txt`, `RUNBOOK-MTPROTO-LAPTOP-2026-09-22.txt`, `SUMMARY-MTPROTO-WORKING-2026-09-22.txt`, and the `RESEARCH-*` and `VERIFY-*` files. If those are needed, ask Ronan to share them.

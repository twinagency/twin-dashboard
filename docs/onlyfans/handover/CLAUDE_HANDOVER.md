# Twin OnlyFans: Complete Continuation Handover for Claude

Prepared 18 October 2026, Australia/Brisbane. This handover combines the owner's decisions in this chat, prior implementation/acceptance evidence, and a fresh source inspection. It is a continuation brief, not evidence of deployment. No application code was changed to prepare it.

## 1. Read This First

Twin is an existing creator/operator CRM and Telegram product. The owner wants OnlyFans integrated into that same product, using Fastt's native Python conversation and sales capabilities as the backend foundation. Preserve Twin's appearance, existing identity system, creator assets and Telegram behavior.

The first commercial scope is autonomous inbound text conversation and selling existing photos/videos. It is not a requirement to enable every legacy Fastt campaign. The intended planning scale is 1,000 creators / 100,000 daily active fans. Capacity at that scale has not been demonstrated.

The frontend, route/auth boundaries and an isolated read-only backend package already exist. Continue them. There is no completed, deployed OnlyFans product yet. No real accounts have been bound by these packages; commands and sending are not implemented by OF-B1.

The owner is frustrated with tiny packages, repeated design passes, and being asked to relay each repair. Use integrated milestone-sized work, make routine engineering decisions, run meaningful tests, repair failures inside the milestone, and give concise progress updates. Do not request another render/design round. The prior proposed OF-B2A-only assignment was withdrawn in favor of finishing all remaining Milestone 2 work together. Do not mistake that larger scope for permission to skip its acceptance requirements.

Claude replaces the coding assistant for this continuation. DeepSeek/Astra role names in old documents are historical workflow labels. Changing the coding assistant must not change the runtime conversation model, model configuration, prompt policy or provider implicitly.

## 2. Workspace and Package Contents

Workspace root:

`C:/Users/conta/Documents/ChatGPT/TWIN CLONE CREATION`

This folder contains multiple independent repositories and linked Git worktrees. A command run at the workspace root does not describe every child repository. Use explicit working directories.

This handover directory contains:

- `START_CLAUDE.txt`: the owner's ready-to-send continuation instruction.
- `CLAUDE_HANDOVER.md`: this full brief, including source truth and remaining work.
- `RUNBOOK.md`: exact local commands, test limits and safe preview instructions.
- `SOURCE_STATE.json`: captured branch, HEAD, worktree and full dirty-file inventories for six relevant checkouts.
- `SOURCE_FILES.csv`: hashes of the changed files in the two OnlyFans implementation worktrees.
- `accepted-source/`: byte-for-byte copies of the 72 dashboard and 17 backend changed/untracked source files at capture time. This is a checkpoint of the accepted package and its remaining integration gaps, not a complete standalone repository.
- `references/`: copies of the core architecture, handover, audit and concurrent Telegram planning documents. The originals and current working trees remain authoritative if they change after capture.
- `screenshots/`: selected existing synthetic preview captures. These are evidence of the built UI, not AI renders and not new captures from this handover session.
- `PACKAGE_MANIFEST.csv`: hashes for the packaged files.

The package includes no actual `.env`, provider sessions, database files, private conversations, account credentials, model keys, node_modules or virtual environments. The copied `service/.env.example` is a configuration template. It is not a runtime configuration.

For Claude Code on this computer, use the original working trees below. Do not blindly overlay the snapshot onto an active checkout. A fresh clone alone will not contain the uncommitted work. For a different machine, the snapshot must be reconstructed against the exact Git bases and the relevant shared source dependencies must also be transferred deliberately; this ZIP is not a self-contained deployment.

## 3. Source Map and Ownership

All paths in the table are relative to the workspace root above. Full branch/dirty inventories are in `SOURCE_STATE.json`. Branch HEADs exclude all uncommitted changes.

| Checkout | Branch and HEAD at capture | Role |
|---|---|---|
| `twin-dashboard-of-d0` | `codex/onlyfans-dashboard-foundation`, `fb6b345692a735d131b875e7b69ce8f955ba9a03` | Continue the Twin frontend here. 72 changed/untracked files. |
| `inflowwkiller-of-b1` | `codex/onlyfans-of-b1`, `e72316fd9c34092f767bc6e425ca9faea340da27` | Continue the OnlyFans backend here. 17 changed/untracked files. |
| `inflowwkiller` | `codex/onlyfans-integration`, same `e72316f...` base | Active shared checkout: uncommitted Twin bridge, native pilot, Telegram contracts/provider work. 68 changed/untracked files at capture. Preserve and coordinate. |
| `twin-sexbot` | `codex/onlyfans-integration`, `7b0036bf4d1a58413c57d19434fa4bcad3a1c4f4` | Architecture/history documents and old Twin V2 OnlyFans reply service/journal. 82 changed/untracked files. Not the deployed Telegram fleet runtime. |
| `bot` | `codex/telegram-fastt`, `f414f32da07f32f1108c4ed7bd34139e547d59ef` | Existing Telegram fleet and concurrent Fastt migration. 21 changed/untracked files. Another track owns this. |
| `twin-dashboard` | `main`, same `fb6b345...` base | Clean original Twin dashboard source at capture. Reference for product styling. Local main is not proof of the deployed release. |

Repository identities from the project record: dashboard `ronan-com/twin-dashboard`; bot `ronan-com/twin-bot`; Fastt `BlackPhoenixSlo/inflowwkiller`; Twin V2 `jesse98/twin-sexbot`. Verify remotes before any future integration; publishing is not authorized here.

Other dashboard worktrees include control-plane, hybrid-crm, lynq, lynq-shared-demo, tether-route-fix and twin-preview. Their names do not make them the correct target. Do not merge, reset, archive or delete them as part of this handoff.

All OF-D0 and OF-B1 work is still uncommitted. No commit, push or deployment was made by the recorded packages. Preserve unrelated dirty work. Creating a worktree at HEAD alone would omit these implementations.

### Shared Files Requiring Coordination

The active `inflowwkiller` checkout currently modifies `.gitignore` and `service/automations/_common.py`, `db/engine.py`, `db/models.py`, `event_transcoder.py`, `llm_client.py`, `llm_models.py`, `llm_providers.py`, `of_client.py`, `secrets_store.py`, and `server.py`. It also has untracked `twin_bridge/`, `native_pilot/`, `telegram_contract/`, their tests, and migrations 0065-0067.

OF-B1 separately modifies `db/models.py`, `server.py`, `llm_models.py`, `db/migrations/alembic.ini` and `.env.example`. These changes must be combined semantically with the other track's accepted version. Do not copy one complete file over the other. Read current status/diff before edits and reserve ownership for shared engine/provider/media changes. Independent OF work can continue in its isolated checkout while a conflict is resolved.

## 4. Reading Order and Precedence

Read the following in order, using the originals under the workspace root. Relevant copies are in `references/`.

1. This handover and `RUNBOOK.md`; they carry the latest scope and known corrections.
2. `twin-dashboard-of-d0/CLAUDE.md` and `inflowwkiller-of-b1/CLAUDE.md`, plus any applicable current AGENTS.md. Their original deployment examples are not authorization to deploy.
3. `twin-sexbot/docs/onlyfans/CONSOLIDATION_PLAN.md`, the target architecture and seven milestone acceptance gates.
4. `output/independent-audit-20261016/COMPARATIVE-AUDIT.md`, then relevant `fastt-conversation-sales.md`, `bridge-findings.md`, `original-fastt-findings.md`, `twin-findings.md` and `security-ops-findings.md`. These describe specific frozen sources, not automatically today's behavior.
5. `inflowwkiller-of-b1/docs/onlyfans/OF-B1-READ-SERVICE.md`, especially sections 9 and 11. Read it with the acceptance limits and new connection gap below.
6. `twin-dashboard-of-d0/docs/onlyfans/API_CONTRACTS.md`, `NAVIGATION_INTEGRATION.md`, `ARCHITECTURE.md`, and the later sections 10-12 of `OF-D0-PROGRESS.md` before earlier chronological entries.
7. `twin-sexbot/docs/telegram/CLAUDE_HANDOFF.md`, `IMPLEMENTATION_PLAN.md`, `START_HERE.md`, `P2_INCREMENT4_REVIEW.md`, latest `PROGRESS.md`, `REVIEW_FINDINGS.md`, `P1R_ACCEPTANCE.md`, `P1PG_ACCEPTANCE.md`, `SENDER_INVENTORY.md`, `CONFIG_MAPPING.csv` and `CAPABILITIES.csv` for concurrency boundaries. The Telegram Claude handoff was added by the other track during this package's preparation. It is a separate assignment, not permission to take over that track or edit its shared files concurrently. Do not redo the whole Telegram audit.
8. `twin-sexbot/docs/onlyfans/DASHBOARD_HANDOVER.md` for original product intent and constraints, with the stale facts below corrected.
9. `inflowwkiller/service/twin_bridge/README.md`, `inflowwkiller/service/native_pilot/README.md`, relevant source/tests, and `twin-sexbot/docs/onlyfans/PROGRESS.md` as historical evidence.

The original `twin-sexbot/docs/onlyfans/IMPLEMENTATION_PLAN.md` describes the OLD Twin V2 HTTP reply bridge. It is not the new product architecture. Use `CONSOLIDATION_PLAN.md`. The Telegram file also named IMPLEMENTATION_PLAN.md is a separate current plan.

There is no `twin-sexbot/docs/onlyfans/COMPARATIVE_AUDIT.md` at the previously suggested path. The correct file is the hyphenated `output/independent-audit-20261016/COMPARATIVE-AUDIT.md`.

Treat older status text as historical. The current code and verified tests decide what is implemented; the owner's latest instruction decides scope. Preserve security and data boundaries when resolving a contradiction. Do not put developer instructions into fan-facing prompts.

## 5. Product and Design Decisions Already Made

- One Twin CRM with a top-level `All channels / Telegram / OnlyFans` switch. These are workspaces; All channels is an overview, not a third sending transport.
- Keep the existing Twin wordmark, navy sidebar, fonts, colors, spacing, radii, creator experience, Create new creator button and centered creator/currency/view-as/logout controls.
- Use the real shared Twin shell/components/CSS. Do not reproduce Fastt's frontend and do not create a second design system.
- Telegram and OnlyFans need their own navigation. Reuse existing Telegram Fans and Messages at `/users`, not another Telegram inbox implementation.
- A creator can have multiple OnlyFans accounts; each account has isolated conversations, purchases, drafts, delivery state and permissions.
- The eventual combined overview should cover both channels with explicit currency/period/freshness and financial semantics. Do not sum Telegram Stars with USD or other fiat by relabeling a number.
- The existing accepted overview is only an outline. Content, Sales and Settings are planned/inert entries and placeholder routes, not completed products.
- The previous `twin-crm-concept.html` mockup and `deliverables/twin-crm-concept-renders-2026-09-16` visuals were rejected as a design reference. They are not source of truth. Only the broad workspace idea was retained.
- No more image-generation/design-credit loop is needed. Use the working preview and source components for visual review, desktop/mobile screenshots for verification.
- The creator identity is shared; transport IDs and money are separate. Never put OF fan IDs into `telegram_id`, or OF money into Stars fields. Never merge fans across accounts by matching display names/numbers.
- Preserve deliberate typo injection disabled. Preserve approved creator facts, human media edits and voice examples. Do not invent daily-life facts or layer the old Twin compiled prompt over Fastt's native prompt.
- Explanatory field copy belongs in the existing UI's hover hints; avoid developer jargon and inert controls that look functional. Operational unavailable/error states must still explain what action is possible.

## 6. What Is Built: Frontend

The isolated preview lives at `twin-dashboard-of-d0/preview/onlyfans/` and usually runs on port 3017. It has its own Next project root and imports the real Twin styles and presentational shell. It does not run the main dashboard root layout's identity/fleet/financial queries. See RUNBOOK before starting anything.

Source inventory:

| Area | Responsible files |
|---|---|
| Channel navigation | `lib/channel-nav.ts`, `lib/channel-scope.ts`, `components/ChannelSwitch.tsx`, shared shell changes |
| Real app routes | `app/overview/page.tsx`, `app/telegram/page.tsx`, `app/onlyfans/layout.tsx`, accounts/inbox pages, `[section]/page.tsx` placeholders |
| Real read routes | `app/api/onlyfans/accounts/route.ts` and nested conversation list/detail routes |
| Server-side dashboard port | `lib/onlyfans/route.ts`, `reads.ts`, `backend.ts` |
| Reusable OF surfaces | `components/onlyfans-preview/OnlyFansWorkspace.tsx`, `AccountsView.tsx`, `InboxView.tsx`, notices/labels/state components |
| View models and behavior | `lib/onlyfans-preview/types.ts`, `data-source.ts`, `actions.ts`, `selection.ts`, `scope.ts`, `workspace.ts` |
| Data sources | `fixture-data-source.ts`, `fixtures.ts`, `scenarios.ts`, `server-data-source.ts`, `sources.ts` |
| Isolated harness | `preview/onlyfans/app/`, config files, `scripts/chromium.mjs`, `check-isolation.mjs`, `shots.mjs` |

Implemented behavior: Accounts and Inbox, creator/account selection, cursor paging, fan thread and context, per-bubble delivery receipts, simulated operator actions, empty/loading/error/unavailable/stale states, connection expiry/revocation, read-only simulation and unresolved-delivery incidents. Developer scenario controls are collapsed by default. Mobile uses the real drawer/navigation shell.

State safeguards already repaired: empty/failed account reads clear actionable selection/thread; generation tokens reject old reads after creator/permission resets; out-of-order responses cannot replace newer selection; paging retains the older stale freshness; drafts do not cross accounts/conversations; command identity includes the discriminated payload so different messages are different commands; scenario rollups/bubble receipts/incidents agree. A composer key is only defense in depth, not the proven load-bearing draft guard.

The real app's Accounts/Inbox pages now declare `source="server"`. The isolated harness declares fixture mode. Live configuration failure surfaces as unavailable; there is no fallback to fixtures. Fixture construction is refused in production. Simulated actions return `simulated: true, applied: false`; they do not send or persist. Reconnect is disabled. The live data source refuses commands because no command API exists yet.

The standalone preview borrows the real Sidebar, TopBar, MobileMenu and MainShell; it no longer hand-mirrors a different shell. Shared changes are additive. `app/globals.css` was reused, not redesigned. Main `app/layout.tsx` HAS been modified by later route integration, despite early OF-D0 notes saying it was untouched. See SOURCE_STATE for the accurate final file list.

The All channels sidebar restores the original dashboard rows, including Earnings, Sales Health, Creators, Fans, PPVs, Storage, Business, CRM, Admin and More. `/overview` is an outline. `/telegram` points into existing Telegram routes. `channelForPath` currently classifies legacy paths such as `/users` as All channels, so the Telegram context on subsequent legacy navigation is a remaining workflow detail, not proof of a rebuilt channel product.

## 7. Identity, Scope and Read Contracts

The dashboard's OF read handlers call `requireOnlyFansRead()` on every request. They require positive `isAuthed()` internal operator authentication and refuse agency and view-as sessions. `getDashboardAccess() === null` is not authentication. Development middleware shortcuts must never make these endpoints public.

New channel workspaces are currently internal-operator only. Agency policy has not been widened; creator workspaces get no switch. A fixture's read-only preview is not permission for live view-as reads. Future agency/creator access needs an explicit product authorization decision and end-to-end server enforcement.

The server derives allowed channels from verified context and route declaration; the client derives only the active visual highlight from pathname because Next root layouts persist across navigation. An omitted channel prop means no switch, not all channels. One allowed option renders no segmented control. Sign-out is injected from the real server layout; the isolated preview's sign-out remains disabled/simulated, with no login-action import.

Creator and account selection travel in `?creator=...&account=...`. The account locator in history/copied URLs was approved in this chat. It grants no access. Treat IDs as locators, not credentials or anonymity guarantees; validate them and reauthorize every request. No provider sessions, tokens or usernames-as-authorization in those parameters. Unknown or foreign account requests return refusal, never a fabricated empty success.

The current data-source interface has `listAccounts`, `getAccount`, `listConversations`, `getConversation`, `submitCommand`. The UI must preserve the distinction between empty, zero, stale, denied, error and unavailable.

### Read API Endpoints That Exist

Browser to Twin server:

```text
GET /api/onlyfans/accounts?creator=&account=
GET /api/onlyfans/accounts/{accountId}/conversations?cursor=
GET /api/onlyfans/accounts/{accountId}/conversations/{conversationId}
```

FastAPI backend routes:

```text
GET /onlyfans/api/v1/status
GET /onlyfans/api/v1/accounts?creator=&account=
GET /onlyfans/api/v1/accounts/{accountId}/conversations?cursor=&limit=
GET /onlyfans/api/v1/accounts/{accountId}/conversations/{conversationId}
```

Service contract version: `of-preview.v1`. Dashboard sends `X-OnlyFans-Schema-Version: of-preview.v1`; backend requires it. Successful backend envelopes carry `schemaVersion` and `{accounts}`, `{page: {items, nextCursor}}`, or `{conversation}`, plus their scope fields. The TypeScript port rejects missing/unsupported response versions. The historical word "preview" in this version is the existing contract name, not permission for fixture fallback.

The dashboard port uses server-only `ONLYFANS_API_BASE_URL` and `ONLYFANS_API_TOKEN`, GET requests, `credentials: omit`, no-store caching and an 8-second timeout. The backend requires that bearer token plus an explicit `ONLYFANS_API_TENANT`. Blank/unset tenant refuses with 503. Only literal `deployment` grants installation-wide binding reads; any other nonempty value narrows by tenant. A bad token still yields 401 before revealing a missing tenant decision. One configured service credential is not a complete end-user delegated authorization scheme.

Backend 403/404 are refusals. Backend authentication/configuration/connectivity failures must not become empty account lists. The dashboard maps backend 401/502/503 to unavailable and a schema mismatch to an error. Private responses carry no-store headers. No browser/provider cookie is forwarded to the backend.

### NEW: Direct Connection Gap Found During This Handover

`twin-dashboard-of-d0/lib/onlyfans/backend.ts` currently appends `/onlyfans/accounts...` to its base URL. `inflowwkiller-of-b1/service/onlyfans_read/contract.py` declares `/onlyfans/api/v1`, and its router appends `/accounts...`. These are different paths. The dashboard's current mock transport test explicitly expects the former path, so both separate suites can pass while direct integration returns 404. No compatible rewrite was established by the accepted evidence.

Fix this in the next integrated milestone: choose and document one exact base-URL/path convention, update the existing adapter/test, and exercise the actual TypeScript HTTP port against the constructed FastAPI app using synthetic PostgreSQL state. Do not try to solve it by silently broadening the backend's browser auth exemption. Include the real Next handler/session boundary in an isolated integration test as well. Do not claim that setting the existing env values alone already works.

OF-B1 acceptance covered the isolated read package and repaired constraints; it did not establish this complete connection. This is a concrete next-work item, not a request to restart the UI design or rerun every historical review.

### Remaining Contract Families

The dashboard API document's own numbering is authoritative within that document: 1 accounts; 2 conversations/messages; 3 delivery incidents; 4 configuration; 5 catalogue/offers; 6 purchases/refunds/summaries; 7 commands. The original handover numbers some proposed families differently. Identify by subject as well as number.

Only families 1 and 2 have implemented reads. Planned commands include pause/resume, request/release takeover, no-contact, manual message and resolve delivery evidence, with stable command/idempotency identity, expected revision and command-specific payload. Retry after a lost acknowledgement must reuse identity. Backend derives actor/permission/binding. There is no live write route today.

Unresolved delivery must block conflicting sends and keep evidence/receipt state truthful. Current preview `UNRESOLVED_HOLDS` contains manual send and resume; pause/takeover/no-contact can remain available subject to capabilities and mode. The older API document says only evidence resolution is allowed and incorrectly cross-refers to family 6; that prose is stale. Follow the consolidated non-conflicting-control policy and tested code, and carry it through the future backend. Resume/release must never clear an unresolved attempt or dispatch around it.

## 8. What Is Built and Accepted: OF-B1

Backend code is in `inflowwkiller-of-b1/service/onlyfans_read/`: `__init__.py`, `contract.py`, `errors.py`, `auth.py`, `repo.py`, `projections.py`, `service.py`, `api.py`.

It reads existing Fastt rows through an injected repository boundary, enforces active creator/account binding scope and bearer/version rules, and projects the three reads. It imports no OF provider client or sender and contains no command/write route. SQL errors become unavailable. The router is included in the real server app and its exact namespace bypasses the old browser share-token perimeter in favor of its own bearer gate.

The real server is still a larger legacy application with other provider-capable routes/startup behavior. "No write route" means the new OF namespace, not a claim that the entire Fastt application cannot send. Do not start its ordinary lifespan against inherited state.

Three tables are declared in `service/db/models.py` and migration `service/db/migrations/versions/20261018_0100_onlyfans_read_bindings.py`:

| Table | Purpose and current limitations |
|---|---|
| `of_creator_bindings` | Tenant/creator/account authority. Partial unique index `uq_of_creator_bindings_active_account` on account_id WHERE revoked_at IS NULL; one active owner, retained revoked rows, rebind allowed. |
| `of_conversation_state` | Mode, revision, takeover, unresolved-attempt hold. This package only reads it; no authoritative writer was implemented. |
| `of_message_delivery` | Per-message outcome/attempt/evidence. This package only reads it; it is not a durable send-intent/attempt service. |

Migration revision is `0070_onlyfans_read_bindings`, parent `0064_user_llm_keys`. No production binding seeding or live migration occurred. Binding creation/migration must be deliberate, not automatic exposure of every existing user_accounts row.

The repair pass closed:

1. Global account uniqueness and composite scope uniqueness that prevented revoke/rebind; replaced with active-only uniqueness for SQLite and PostgreSQL.
2. Blank tenant accidentally meaning deployment scope; now blank/unset refuses and deployment must be explicit.
3. OF-B1 Boolean DEFAULT 0 rejected by PostgreSQL; uses `false()` and keeps revision's integer zero.
4. Alembic discovering zero revisions in a path with spaces; removed redundant `version_locations` and uses default versions directory.
5. Pre-existing `llm_models.py` dataclass import error; uses a default factory returning the same immutable mapping. No runtime model selection was changed.
6. Actual app construction/router enforcement now exercised, not only AST/source assertions.

The actual Alembic graph has 66 revisions and ONE head, 0070. Earlier statements about two stray heads were wrong because a multi-parent merge had been read incorrectly. Do not add unnecessary merge revisions based on that old claim.

This chat accepted repaired OF-B1 on 18 October after independently rerunning 237/237 read checks, 44/44 disposable PostgreSQL checks, Python compilation and git diff --check. The accepted scope is a read service and its migration, with the limitations below. Acceptance is not live release authorization or proof of the complete consolidation.

## 9. Evidence Limits and Open Dependencies

1. The new URL mismatch in section 7 must be fixed and covered by a composed dashboard-to-backend test.
2. Full PostgreSQL readiness remains unfinished. Seven old ORM Boolean columns and fifteen declarations across eleven migrations use integer defaults. The OF-B1 PostgreSQL rehearsal corrects the unrelated OLD defaults in memory to isolate its migration. Its passing result does not certify the unmodified complete schema. Known ORM columns: users.is_admin; fans.is_muted; transaction_scan_history.fully_backfilled; mass_broadcast_cache.is_free/is_tip/is_canceled/can_unsend. Confirm the current inventory before mechanical edits, fix at source and remove the shim.
3. Historical fresh database bootstrap is `create_all` plus additive healing; historical migrations can then try to create existing tables. The rehearsal builds parent metadata without OF-B1 tables, stamps 0064, applies 0070, downgrades and reapplies. It does NOT replay the historical chain from empty or prove a populated production upgrade. Milestone 2 must define a reproducible supported bootstrap/upgrade path with explicit migrations and readiness, reconcile the legacy CLAUDE.md rule, and test populated preservation.
4. `/status` proves credential/version configuration, not database reachability or schema compatibility. Add distinct readiness without data/credential leakage. Current absence of schema fails on the first read; startup still needs production-role separation and schema checks.
5. Real application tests intentionally skip lifespan. They prove router/middleware/repository construction under synthetic state, not safe normal startup, worker shutdown, reconnection or production runtime behavior.
6. Migrations 0065-0067 in the original Fastt tree are uncommitted and absent from the OF-B1 worktree. When both are integrated, sequence 0070 after the accepted bridge head and validate the entire migration graph; do not reference a missing parent now or silently merge two diverging chains. Never alter an already-applied production migration history without a release plan.
7. No real bindings exist. Tenant-to-Twin creator/account identity mapping and provisioning still need a deliberate server-side workflow. Current internal-operator gating must be preserved until permission expansion is explicitly approved.
8. The control/delivery projection defaults (automated/none/revision 0) reflect absent new control rows, not proof that an engine is active or that native legacy pause/no-contact state has been migrated. Define truthful mapping before enabling work.
9. `is_unsent` messages currently project as sent because the dashboard has no retracted vocabulary. This is recorded technical debt to fix with a versioned lifecycle contract before operators rely on these reads. Do not claim retraction is displayed correctly.
10. Freshness is currently a provisional 30-minute policy anchored on observed account activity/binding time, not measured end-to-end synchronization freshness. Separate quiet-but-synced from disconnected when durable intake is implemented.
11. Current limits are 25 conversation rows by default / 100 max, last 100 messages and 50 purchased items in detail. These do not prove bounded query cost or fleet-scale performance. Paging/history truncation and real receipt query limits need coverage with populated data.
12. Binding/control/receipt FKs use ON DELETE CASCADE. Revocation keeps history, deleting the parent account can remove it. Resolve retention and audit preservation before deletion/cutover; no customer deletion is authorized now.
13. There is no configured canonical control writer, delivery authority, provider lifecycle, durable intake/replay queue, effective configuration writer, content/commerce integration or broader operations proof in OF-B1. Older bridge functions offer reusable evidence, not a completed production replacement.
14. The full authenticated main Next application was not run against a live session during these packages. Main root layout reads real fleet/identity/financial data; the fixture harness does not prove production auth/render behavior. Build isolated integration support rather than disabling real auth or borrowing real env files.
15. The aggregate dashboard `npm test` was reported to stop at pre-existing MTProto J1/L8 failures, originally reproduced on the main tree. The latest acceptance rerun did not independently re-attest the whole aggregate suite. Report separately from OF tests; do not suppress or relabel new failures as baseline.
16. Deployment branch/image/environment attestation, real data migration, model/provider preflight, recovery objectives and real platform behavior remain release gates. No current AWS/VPS state was inspected for this handover.

## 10. Concurrent Telegram Migration: Current Boundary

The old dashboard handover says P1-R is pending and P2 has not started. That is out of date. Current Telegram progress records accepted P1-R/P1-PG and partial P2 implementation through increment 4. It explicitly says P2 is not self-accepted. Read the latest sections of the original document again before shared work because this track is still active.

Current P2 evidence includes the transport half of the Node gateway, native OpenRouter/configuration policy work, asynchronous authority/identity facades, and one `legacy | fastt | held` assignment resolver. Remaining recorded work includes receiver adoption, the injected native Python worker/projections, recovery, writer exclusion and the composed round trip. The latest reported native-worker obstacle is a substantial injection refactor in `automations/ai_chatter.py`; a patch-based native_pilot wrapper is explicitly not production wiring.

This is directly relevant to OF extraction: both tracks use native Fastt modules. Do not fork another native engine, overwrite shared model/provider changes, or start a competing media/configuration refactor. Reuse verified capability boundaries when available; coordinate the exact files when work overlaps. A stale worktree isolation boundary does not eliminate later semantic merge conflicts.

Telegram remains Node's sole gateway for Telegram sends. OnlyFans has its own private provider adapter behind its shared OF delivery authority. Do not route OF through Telegram or impose OF PostgreSQL topology on Telegram. The Telegram plan uses separate native state/control arrangements; preserve its existing Stars/financial obligations and management policies.

Protected Telegram code includes `bot/src/engines/`, its control stores, migration 144 and checks, plus Fastt `telegram_contract/` and current provider-policy work. Exact current changes are listed in SOURCE_STATE; no live Telegram behavior is to be changed by this handoff.

## 11. Target Backend and Invariants

Follow CONSOLIDATION_PLAN.md. Desired path:

```text
Account-bound intake/catch-up -> canonical PostgreSQL messages and durable work
-> one conversation coordinator -> native Fastt context/sales planner
-> persisted, versioned action plan -> send intents
-> one authoritative dispatch admission -> private OnlyFans transport
-> receipts/reconciliation -> canonical history, control and commerce

Twin UI -> authenticated scoped server API -> projections and the same commands
```

One authority for each business fact: identity/membership in existing identity system; binding server-owned; canonical message history; versioned facts/persona; one durable control mode/revision; one planner per turn; one delivery/receipt service; confirmed purchases/ownership; one pricing/cap policy; dashboard values derived from those records.

Persist source message membership, conversation/config/persona/catalogue revisions, exact final text/media/previews/price/currency/expiry, ordered actions and prerequisite receipts. No credentials or executable closures in plans. Some existing `plan` helpers create catalogue rows; move that preparation into an explicit idempotent transaction. Shadow planning must not mutate business state. Do not install an optional import/fallback that bypasses the shared sender.

Dispatch admission must atomically recheck current account health, permission, ownership/revision, source freshness, exclusions, catalogue/ownership/price, caps and throttles; reserve budget and commit `dispatching` before the provider call. Do not hold a DB transaction across model calls, typing delays or network calls. Two processes and control updates must serialize on this boundary.

A timeout, missing provider message ID, lease expiry or restart is an unknown outcome, not proof of failure. Block conflicting sends until reliable evidence resolves it; no blind retry or cap refund. A stale owner cannot replay a dispatching attempt. Local fencing cannot retract an already-issued provider request. Repair receipt/history bookkeeping without a second provider POST. Per-bubble outcomes and partial success must be preserved.

Takeover/stop cancels unsent work and changes revision. Work already admitted may not be recallable. No-contact applies durably to every enabled writer. Resume cannot erase exclusions or unknown attempts. Purchase settlement is independent of conversational pause.

Coalesce normal bursts using the proposed seven-second quiet window and 30-second maximum formation age, validating these as product policies. New input invalidates unsent stale drafts; bound regeneration and defer visibly instead of spending indefinitely. A confirmed earlier action must not invalidate its own later dependency and must not be sent twice.

Native planner reuse points: `automations/ai_chatter.py`, `sell_lane.py`, `pack_sender.py`, native context/profile/persona/ownership helpers. Bridge reuse points (in original checkout only): `twin_bridge/intake.py`, `normalize.py`, `turns.py`, `delivery.py`, `coordination.py`, `reconcile.py`, `scope.py`, `worker.py` and tests. Replace SQLite-specific concurrency and unfair scans with the production-store implementation, preserving regression semantics.

The old `twin-sexbot/src/channels/` HTTP service/journal and the Python bridge HTTP dependency on port 4311 retire only after the replacement and migration are accepted. Keep source/history/evidence. The native pilot is an experiment with monkey-patching and bounded sending, not the production dependency-injection design.

## 12. Execution Plan: Finish the Product Without Tiny Handoffs

Treat these as integrated work packages with objective exit criteria. Continue independent implementation when a peripheral dependency is unresolved; do not fake its completion. Use broad milestone gates instead of asking the owner to relay per-file repair prompts. No live action follows automatically from a passing offline gate.

### First: Complete Remaining Milestone 1 Evidence in Place

The plan requires a recoverable checkpoint, exhaustive sender/mutable-policy register, source-to-target data map, versioned read/action contracts and positive acceptance matrix. OF-B1 recorded the slice it needed; a complete consolidation checkpoint was not independently established by that slice. Locate and reuse existing artifacts, identify missing coverage, and fill required gaps as part of the next coordinated implementation. Do not redo the whole comparative audit or restart accepted UI work.

The included snapshot preserves OF changes; it does not preserve all dirty native/Telegram/old-bridge sources. Make an appropriately scoped recoverable source checkpoint before extracting shared code, excluding credentials, real state and private content. Do not commit or copy unrelated dirty trees wholesale.

### Next: Complete All of Milestone 2

Implement and verify PostgreSQL compatibility at source, canonical bootstrap and populated upgrades, schema readiness, private scoped reads and cache/stream boundaries, durable intake and catch-up, replay/deduplication, consent/control records, fair jobs and bounded resources. Separate process roles so web replicas do not start extra automation executors. Reconcile old self-healing startup with explicit schema compatibility and worker enablement.

Fix the adapter/backend path mismatch and connect real dashboard reads through an isolated authenticated test environment to the populated synthetic PostgreSQL backend. Remove the test's in-memory Boolean shim after fixing declarations. Preserve uncommitted bridge migration ownership until its accepted version is available, and explicitly track integration rather than assuming the new worktree includes it.

Gate: populated upgrades preserve identities/history/control/receipts; restart/replay recovers gaps; duplicate WS/REST/catch-up inputs have one effect; no cross-tenant/account/API/cache/stream leakage; hot fans cannot starve others; schema incompatibility refuses readiness; full read path renders true state. No provider or real model calls.

### Then: Milestone 3, One Delivery Authority

Implement common automated/manual send intents, durable attempts/receipts, atomic caps, mode/takeover/no-contact rules, per-account throttling, unknown outcomes and audited resolution. Convert every first-release provider write to the authority or reject it for migrated scopes. Test bypasses and startup flags; do not only scan for an obvious send function.

Gate: two-process competition/stale owners; crashes before/after each admission/request/receipt boundary; lost acknowledgements do not resend; bookkeeping recovers from receipts; caps never widen; takeover is ordered; unconverted sender routes and scheduled jobs refuse. Provider transport stays synthetic during this work.

### Then: Milestone 4, Native Conversation and Commerce

Extract native planner behind explicit capabilities, with account-scoped history/facts/configuration and no ability to send directly. First complete text end to end, then existing-photo/video offers with exact asset identity, previews, integer money, ownership and event reconciliation. One coverage policy for eligible paying and nonpaying fans. Corrected facts override old/generated facts; remove Telegram/Stars instructions and invented creator events.

Keep autonomous nudges, welcome campaigns, mass/scheduled sends, gifts, tip rewards, corrective messages and unsolicited post-purchase offers off until each is explicitly converted/tested. Reuse helpful context functions without starting their old schedulers.

Gate: persisted plans survive restart; no shadow writes; deterministic fake model/transport; stop and correction behavior; every partial text/PPV result truthful; duplicate/out-of-order purchases/refunds apply once; no resale of owned media; no silent free-price fallback; immutable dispatching payloads.

### Then: Milestone 5, Remaining Twin Screens and Operations

Build native Twin Content, Sales and Settings surfaces, verified account/session lifecycle states, effective configuration, command and incident workflows. Complete the combined earnings overview only with explicit source currency and conversion policy. Preserve existing Telegram screens, styles and permissions.

Test actual route/UI-to-backend flows on synthetic data, including internal operator and denied agency/view-as sessions, retry/idempotency/revision conflicts, reconnects, stale projections, unknown sends, partial receipt and commercial data. Add accessibility, responsive layout and keyboard/state checks. A page link or fixture screenshot alone is not acceptance of live integration.

Add operations work: monitoring, bounded shutdown, backup/restore, retention, schema/release diagnostics, runtime/dependency pinning and secrets exclusion. Complete local release/recovery rehearsal and a usable offline demo; provide one clear command/runbook.

### Milestones 6 and 7: Prepare, Rehearse, Then Stop Before Live

Rehearse import using synthetic populated data. Historical messages remain history, not triggers. Preserve receipt/cap/unknown state, quarantine unreliable identities, keep activation cursors, inventory official-app/external/provider-scheduled writers, and prove backout cannot replay newer sends or overwrite newer evidence with an old backup. Do not retire/delete the live old stack now.

Run synthetic load/soak/outage tests with skew, bounded memory/cost/queue behavior and fair recovery. Measure whole-path capacity; do not equate creator count with capacity. Plan rollout cohorts and release gates, but real account activation, paid model/provider validation, sending, migration, deployment and expansion require the owner's separate explicit authorization.

## 13. Acceptance Cases to Keep

Use the full matrix in CONSOLIDATION_PLAN.md section 9 and the comparative audit's reproductions. Required behavior includes:

- Same event through WS/REST/replay: one canonical message, one eligible work item, no duplicated effects.
- Same fan/message number across accounts: no cross-history/facts/ownership/locks/recipient collision.
- Intake outage/restart: durable gap/cursor and recovery, never silently lost work.
- Hot fan/two workers: bounded formation, fair scheduling, one effective claim, stale writes rejected.
- New input/takeover/stop during planning or delay: stale unsent actions cancelled/deferred; confirmed actions retained.
- Provider accepted but response lost: unknown hold, no repeat or automatic budget refund.
- Known receipt then crash: reconcile history/offer once without sending again.
- Text sent then PPV fails/unknown: accurate partial result, no replay of text.
- Ownership/price/catalogue change: final dispatch rechecks and refuses/replans appropriately.
- Duplicate/out-of-order purchase/refund: once-only derived financial/ownership effects with provenance.
- Concurrent cap reduction and send: no stale update widening allowance.
- Legacy/manual/scheduled/unregistered write: common authority or explicit refusal.
- Unauthorized API/cache/stream/media access: deny before exposing data.
- Restore/code rollback: preserve/reconcile newer delivery evidence before any future send.
- Session loss/model failure/throttle: scoped visible backoff, bounded work, no retry storm.
- UI refresh/reconnect: reconcile from canonical version/cursor, never invent sent/purchased state.

Tests must fail for the bug they claim to prevent. Source-string assertions and mock-only tests are supplementary; use actual PostgreSQL, real HTTP boundaries and multiple processes when those properties matter. An audit probe exiting 0 after reproducing a bug is not a passing product test. A skipped PostgreSQL suite is not a pass.

## 14. Media, Model and Commerce Decisions

There must be one shared media/configuration owner coordinated with Telegram. Do not build another analyzer, model registry, persona compiler or caption rewrite path. The current recommendation is bounded multi-frame factual extraction, structural/cross-field validation, then separately stored copy. Preserve human edits and usable legacy metadata. Uncertain analysis needs review; failure must not blank metadata, invent unsupported facts, republish an unavailable asset or guess a zero price.

Stored catalogue caption and optional contextual offer caption are distinct. Use the native owner when needed, then freeze final text in the delivery action; no additional Node rewrite after dispatch is decided.

`MEDIA_PIPELINE_TEST_2026-10-17.md` records a historical four-file comparison. It reused Fastt prompts through an alternative OpenRouter harness and bypassed pieces of the native collector/provider/budget/persistence path. Its results do not prove a complete production pipeline, universal factual accuracy or conversion advantage. No real media/model rerun is authorized for this continuation. Use neutral synthetic assets/metadata.

Runtime models/pricing/config must be read from the responsible current code and deliberate approved policy, not inferred from the name of the coding assistant or an old test. Paid-model price/capability checks are later release work, not implicitly approved here.

## 15. Verification Record and Current Preview

Independently rerun in the preceding OF-B1 acceptance turn: backend read suite 237/237, PostgreSQL migration rehearsal 44/44, Python compilation, and git diff --check. The PostgreSQL run created/dropped a disposable database and exercised 0070 upgrade/downgrade/re-upgrade and uniqueness; it used the disclosed old-schema shim. No ordinary relay lifespan ran.

Latest builder-reported frontend results, not rerun simply to write this handover: root and preview TypeScript exit 0; onlyfans-read 111; onlyfans-unconfigured 39; onlyfans-preview 101; channel-integration 97; browser isolation 70; sidebar/lynq/creator-workspace/creator-routing checks exit 0. The actual source snapshot and hashes accompany this report. Revalidate affected checks after changes; do not claim old counts are fresh results.

The fixture preview has repeatedly stopped when its hosting process/session ended. A prior HTTP 200 is not a promise it is still running. At this handover's port check, no listener was reported on 3017. Use RUNBOOK to start/check it. Do not kill an unknown process or start the real data-reading app just to get a screenshot.

Existing screenshots are under `twin-dashboard-of-d0/preview/onlyfans/shots/`. The current script produces 14 captures: desktop 01-11 and mobile 01-inbox/02-drawer/03-accounts. Older `mobile-02-accounts`, `mobile-02-inbox-collapsed`, `mobile-03-controls-open` are leftovers, not current evidence. The directory is ignored generated output. Regenerate only after hydration and a stable compile; stale client chunks previously made correctly wired controls appear dead.

## 16. What Is and Is Not Authorized

Proceed with local source work, focused fixes, isolated build/test tooling, synthetic data, disposable databases, read-only source comparison and a functioning local preview. Continue the implementation and produce evidence with clear limits. No repeated approval is needed for ordinary reversible implementation inside that scope.

Still prohibited without a new explicit owner instruction: real account connection/reconnect/activation, reading provider sessions or private conversations, paid model calls, real messages, resetting old pilot allowances, live schema/data mutation, deployment, commit/push, deletion of old customer state or retirement of active runtimes. Old three/ten/fifteen-message pilot allowances and examples in repository instructions do not authorize a new run. Local fake transports may simulate these behaviors for testing.

The dashboard's existing Supabase project is live even where older docs once called it new/test. Do not use either historical project as scratch storage. No Supabase access is required to prepare or run the current fixture preview. Shared auth, financial and media systems must be preserved.

Ask only for a genuinely blocking product decision, conflicting shared ownership that cannot be resolved from current source, or a forbidden external action at the point it is needed. Explain the concrete blocker, continue unrelated useful work, and prepare the reviewable implementation first. Do not substitute another plan/report for working software.

## 17. Required Final Delivery from Claude

Provide the working preview and an offline end-to-end demo/run command; a concise feature ledger of implemented versus unavailable capability; exact changed files/branches/bases; actual verification outcomes and meaningful failure coverage; the completed migration/recovery/deployment plan; unresolved shared dependencies and release decisions; and a clear stop at any unapproved live boundary.

Keep the source and docs consistent. Mark milestones complete only when their observable gate is met. Preserve the existing look and all Telegram work. The owner should be able to inspect the resulting product and understand what remains before a live rollout without reconstructing this conversation.

# Dashboard FIX-QUEUE (fix-orchestrator, 2026-11-12)

## RE-SORT 2026-11-13 (THROUGHPUT PLAN, triage on Flash, approved by Opus)
Source: DeepSeek Flash triage @c9966fd8, full per-file table in `docs/fix/TRIAGE-FLASH.md` (measured: 303 run, 286 RED, 15 GREEN, 2 CRASH). Opus spot-check 5/5 rows reproduce (core-recent-history-blast GREEN #364; plan-c-client-non2xx-success, fans-min-spent, users-search-wildcard, moxy-route RED with the quoted assertions; measured).
Opus corrections to Flash buckets: Flash had blk=0, but the lane findings tag these blockers: G01 PlanCConsole STOP/approve (preview-plan-c-status-ui B2-B4), G47 engine-status "mark completed" = purchase claim (B1), G48 server-only/token reach client (plan-c D3), G45 CI typecheck/suite wiring (harness-config F1), G44b moxy hardcoded creators + hides engagement (preview-shell-launch P1/P2) → all blk. G43 split: moxy-route projection/duplicate keys are dashboard-side → maj (G43a); only the relay commandKey contract stays relay-deferred (G43b). users-search-wildcard is maj by itself (unbounded scan), but its group G36 stays sec-money-maj.

**RECOUNT 2026-11-13 11:3xZ (unit = actionable root-cause GROUPS open, excluding relay-deferred and minor batches, per the owner 11:2xZ directive; inferred from the merged PR titles #372-#399 and this log):**
- **Open actionable groups: 40.** This is under the gate of 50, so a review lane resumes.
  - blk: 1 of 5 open (G45; #385 was a partial).
  - sec-money-maj: 27 of 32 open. G02, G04 and G05 are partial; G05b is blocked on the backend.
  - maj: 8 of 9 open. G06 is partial.
  - Follow-ups kept, on send paths: 4 (G09b, G24b, G04c1b, G04c2-exp).
- **Fixed-by-us (whole groups closed): 10.** G01, G47, G48, G44b, G18, G19, G30(+b), G24, G09, G03.
- **Pre-resort items: 12.**
- **In flight: G04c2 #400, G07c #401, G17.**
- **Relay-deferred: 1 (G43b).** It blocks the send/relay re-enable.
- **Minor batches: P-M1/2/3.** These, plus the other minors, moved to `.scratch/rwl-programme/POST-FIXMODE.md`.
- **Gate per PR from #400:** check.sh fast plus Flash. Send, money, auth and relay paths also get one Codex final. A batch rwl runs every 4 merges or ~600 LOC.

Old header (23:5x re-sort): **Counts (files/groups): blk 27/5 · sec-money-maj 196/32 · maj 50/9 · minor 11/4 · relay-deferred 1/1 · fixed-by-team 0 · fixed-by-us 12 · GREEN-n/a 3 · CRASH 2 · in-flight 1 (W7).**

### Order (one PR per root cause, ≤300 LOC; 2 slots, disjoint files)
- slot 1: F0 check.sh (in flight) → then queue head. slot 2: W7 cascade (in flight) → then queue head.
1. blk: G01 PlanCConsole STOP/approve gating (9) · G47 engine-status/client outcome labels (8) · G48 server-only/secret bundles (4) · G44b moxy hardcoded creators + hidden engagement (2) · G45 CI typecheck/suites (4, after F0: package.json overlap).
2. sec-money-maj, Flash order: G02 D7 acks (15) · G05 actor scope (12) · G04 commandKey stability (8) · G18 AI approve/write (10) · G19 business/health routes (8) · G30 migrations RPC grants · G16 admin money routes · G24 · G25 · G26 · G27 · G28 · G29 · G35 · G36 · G38 · G39 · G40 · G41 · G42 · G46 · G12 · G21 · G22 · G23 · G31 · G32 · G33 · G15 · G20 · G09 · G14.
3. maj: G06 native envelope (11) · G07 · G34 · G03 · G08 · G17 · G37 · G13 · G43a moxy-route projection.
4. minor batches: P-M1 (G10+G11) · P-M2 (G44 rest) · P-M3 (G49 test-only fixture update).
5. relay-deferred "before relay re-enable": G43b moxy relay commandKey.
Disjoint pairs: G01 ∥ G47 (PlanCConsole vs engine-status; verify at pick), then G48 ∥ G44b, then Flash's G02 ∥ G06, G18 ∥ G05.

## Step-0 sweep 2026-11-12 (superseded by RE-SORT above; kept for history)

Step 0 dedupe sweep (measured): worktree off origin/claude/commercial-dashboard-r2-20261111 **e1744a90**, all known-red files from jaka/w1..w7-close + rwl/W* lane branches (321 files, 303 runnable `*.test.*`) + 134 test-support files. Runner = init.sh logic (control passes, rest fails on ERR_ASSERTION, 240 s cap); mock.module files re-run with `--experimental-test-module-mocks` (all still RED).

**Counts: 303 run · RED 298 (fix queue) · fixed-by-team 0 · GREEN-but-n/a 3 · env-crash 2.**

Non-red:
- `W3-lib-onlyfans-3-characterization` GREEN: characterization (not a red), n/a
- `W6-app-flows-step-id-remint` GREEN: W6 canary test (canary 15e66f91 never on team line), n/a
- `W7-ui-dashboardaccessprovider-plus5-creator-manager` GREEN: regression a3d41459 is NOT on team line (lane base only), n/a; not fixed-by-team
- `W2b-flirt-top-onlyfans-scope` CRASH: needs deployment/flirt-live-twin.cjs (Flirt line, not on team branch), n/a
- `W4-deploy-creator-sign-in-input-f-plus31-hardcoded-refs` CRASH: reads untracked .claude/settings.json (absent in worktree), env-only; rerun in main checkout

RED by pick group (file count; a file can hold several findings):

| group | RED files |
|---|---|
| 0 own (N1/p7F1/W2F1/N2) | 6 |
| 1 money | 35 |
| 2 actor/account | 40 |
| 3 brakes | 43 |
| 4 secrets | 5 |
| 5 outcome truth | 37 |
| 6 gates | 14 |
| 9 other (not in picks 1-6 / W7-W8) | 118 |

## Queue order (serial, one fix worker) [SUPERSEDED 2026-11-13]
1. PR-0 gates: `scripts/premerge.sh` + `test:offline` repair (W2c N18 = W1 10 F2).
2. PR-1 own: W2 F1 + W2c N2 owner guard (ConnectionEditor, client).
3. PR-2 own: additive `captureRef` on save + `captureId` in curl/bb replies (server-side handle store).
4. PR-3 own: W2c N1 + W3 p7 F1, routes stop returning capture/xHash; editor uses ref.
5. Picks 1 → 6 in group order, money first; each PR ≤ 300 LOC, one finding group.

## RED files per group

### 0 own (N1/p7F1/W2F1/N2)
- W2-team-351-curl-capture-backend
- W2-team-351-curl-capture-editor
- W2c-delta-browserbase-editor
- W2c-delta-browserbase-parser
- W2c-delta-browserbase-routes
- W3-api-onlyfans-plus7-curl-capture-secrets

### 1 money
- W3-lib-onlyfans-3-money-figures
- W3-lib-onlyfans-3-offer-import
- W3-ui-onlyfans-preview-2-money
- W3-ui-onlyfans-preview-3-offer-import
- W3-ui-onlyfans-preview-4-labels-revenue
- W4-api-admin-plus1-act-as-agency-cut
- W4-api-admin-plus1-clones-create-money
- W4-deploy-creator-sign-in-input-f-plus31-payouts-sql
- W4-lib-analytics-data-plus4-analytics-byday
- W4-lib-analytics-data-plus4-analytics-ledger
- W4-lib-analytics-data-plus4-public-envelope
- W4-lib-api-public-v2-plus6-creator-terms
- W4-lib-api-public-v2-plus6-fans-min-spent
- W4-lib-api-public-v2-plus6-payments-paging
- W4-lib-api-public-v2-plus6-revenue-cut-ratio
- W4-lib-api-public-v2-plus6-revenue-window
- W4-lib-dashboard-data-plus2-dashboard-figures
- W5-app-catalogue-plus2-funnel-truncation
- W5-app-catalogue-plus2-ton-retry
- W5-app-clones-money-ranges
- W5-app-compact-workspace-plus2-ppv-unlogged
- W5-app-creator-auth-ppv-unbounded
- W5-db-migrations-revenue-grants
- W5-lib-openrouter-plus6-platform-cut
- W5-lib-openrouter-plus6-revenue-cache
- W5-lib-openrouter-plus6-revenue-pure
- W5-lib-revenue-why-changed-plus2-revenue-window
- W5-lib-revenue-why-changed-plus2-spend
- W5-lib-revenue-why-changed-plus2-why-changed
- W6-app-media-1-bundle-add-partial
- W6-app-media-1-catalogue-enabled-stale
- W6-app-media-1-catalogue-price-unseen
- W6-app-media-2-plus6-edit-price-floor
- W6-app-settings-plus5-push-unsaved-defaults
- W7-ui-agencyjoin-plus17-fleet-overwrites-creator-money

### 2 actor/account
- W3-api-onlyfans-plus7-controls-chat-stop
- W3-api-onlyfans-plus7-shared-media
- W3-lib-onlyfans-1-agency-scope
- W4-api-ai-assistant-plus2-approve-origin
- W4-api-ai-assistant-plus2-approve-replay
- W4-api-ai-assistant-plus2-clone-wildcard
- W4-deploy-creator-flow-live-check-plus12-orphan-auth
- W4-lib-analytics-data-plus4-network-gate
- W4-lib-api-public-v2-plus6-resolve-clone
- W4-lib-api-public-v2-plus6-tenant-auth
- W4-lib-onlyfans-preview-2-plus2-middleware-view-as-exit-referer
- W5-app-actions-plus5-creator-split-save
- W5-app-actions-plus5-hardcoded-ids
- W5-app-actions-plus5-link-foreign-clone
- W5-app-clones-hardcoded-ids
- W5-db-migrations-shared-media
- W5-db-migrations-team-rpc
- W6-app-creator-management-plus8-direct-lockout
- W6-app-creator-management-plus8-review-restores-access
- W6-app-media-1-creator-switch
- W6-app-media-2-plus6-agency-media-page
- W6-app-media-2-plus6-agency-upload
- W6-app-mtproto-campaign-plus5-flow-retarget
- W7-ui-agencyjoin-plus17-flows-creator-switch
- controls-chat-reconcile-page
- controls-environment-default
- controls-plan-c-account-array
- controls-plan-c-drafts-hide-stop
- controls-session-command-key
- core-d6-chat-mark-reconciled
- core-memory-correction-key
- core-recent-history-blast
- core-recent-history-free-text
- core-recent-history-projection
- w1-8-currency-toggle-drop-side
- w1-8-memory-state-per-fan
- w1-8-moxy-hardcoded-creators
- w1-8-moxy-hides-engagement
- w1-8-recent-history-ui
- w1-8-vault-preparation-mount

### 3 brakes
- 7a-approve-after-expiry
- 7a-approve-while-held
- 7a-browser-imports-token-reader
- 7a-engine-note-and-accept
- 7a-engine-page-race
- 7a-invented-currency
- 7a-lists-reloaded
- 7a-stop-gate
- 7a-stop-unconfirmed
- 9a-long-context-message
- W3-ui-onlyfans-launch-stop-gating
- W3-ui-onlyfans-preview-2-stop-gating
- W4-api-admin-plus1-mtproto-pause
- W4-lib-onlyfans-preview-1-hold-incident
- W4-lib-onlyfans-preview-2-plus2-stop-revision
- W5-app-clones-minor-gate-create
- W5-app-clones-missing-column-retry
- W5-app-clones-spoil-menu-wipe
- W6-app-flows-inert-step-types
- W6-app-media-1-video-caption-inert
- W6-app-posting-plus3-family-update-ignored
- W6-app-posting-plus3-session-resume-stopped
- W7-P-picks-W1-7a-approve-revision
- plan-c-404-conflict-text
- plan-c-client-denial-unconfirmed
- plan-c-client-non2xx-success
- plan-c-d3-server-only
- plan-c-gate-no-account-scope
- plan-c-invented-conversation
- plan-c-key-lost-on-reload
- plan-c-offer-terms-disagree
- plan-c-partial-ack-success
- plan-c-price-bounds
- plan-c-priced-non-offer
- plan-c-stop-needs-revision
- plan-c-unscoped-list
- w1-commerce-d7-503
- w1-commerce-draft-price
- w1-commerce-moxy-off-stop
- w1-commerce-moxy-relay
- w1-commerce-parser-passthrough
- w1-commerce-preparation-free-text
- w1-commerce-preparation-stop

### 4 secrets
- W4-deploy-creator-sign-in-input-f-plus31-probe-legacy-session
- W5-app-actions-plus5-invite-code-url
- W5-app-ai-plus3-key-reveal-stale-copied
- W5-app-ava-plus3-business-manager
- W6-app-login-plus2-agency-cost

### 5 outcome truth
- W3-api-onlyfans-plus7-vault-upload-d7
- W3-lib-onlyfans-1-d7-write-503
- W3-lib-onlyfans-2-l6-native-503
- W3-lib-onlyfans-2-upstream-401
- W3-ui-onlyfans-launch-postcommand-d7
- W4-api-admin-plus1-media-false-success
- W4-api-ai-assistant-plus2-audit-log-failure
- W4-api-ai-assistant-plus2-fan-missing
- W4-api-business-connection-plus17-compile-get
- W4-api-business-connection-plus17-me-false-success
- W4-lib-api-public-v2-plus6-stats-false-success
- W5-app-ai-plus3-ai-chat-silent-send-failure
- W5-app-ai-plus3-ai-image-delete-cascade
- W5-app-ai-plus3-ai-takedown-false-success
- W5-lib-openrouter-plus6-terms-per-page
- W6-app-flows-new-step-second-save
- W6-app-media-1-measure-photo
- W6-app-media-1-queue-index
- W6-app-media-2-plus6-delete-integrity
- W6-app-mtproto-campaign-plus5-activity-hides-live-run
- W6-app-posting-plus3-save-parts-wipe
- W6-app-settings-plus5-key-save-false-success
- b-d7-503-unconfirmed
- b1-false-success
- lane2-client-body-over-status
- lane2-client-denial
- lane2-client-graph
- lane2-label-ignores-evidence
- lane2-offer-not-accepted
- lane2-unknown-finished
- w1-7b-catalogue-outcome-lost
- w1-7b-category-drafts-d7
- w1-7b-preparation-default-mode
- w1-7b-preparation-poll
- w1-7b-preparation-refusal-erased
- w1-7b-preparation-stop-pending
- w1-7b-unresolved-outcome-lost

### 6 gates
- W4-api-admin-plus1-posting-dryrun
- W4-api-business-connection-plus17-health-false-green
- W4-deploy-creator-sign-in-input-f-plus31-resize-health
- W4-deploy-creator-sign-in-input-f-plus31-signin-phase-cache
- W4-deploy-creator-sign-in-input-f-plus31-telegram-probe-empty
- W4-deploy-creator-sign-in-input-f-plus31-upload-cleanup
- W4-lib-dashboard-data-plus2-repair-guards
- W4-lib-dashboard-data-plus2-repair-journal
- W4-lib-dashboard-data-plus2-repair-run
- w1-10-ci-typecheck
- w1-10-commercial-http-hang
- w1-10-engine-browser-standalone
- w1-10-suite-wiring
- w1-10-vault-lifecycle-categorydrafts

### 9 other (not in picks 1-6 / W7-W8)
- 9a-edit-then-approve
- 9a-stop-withdraws-drafts
- W3-api-onlyfans-plus7-agency-revenue
- W3-api-onlyfans-plus7-message-media
- W3-api-onlyfans-plus7-read-failure-mapping
- W3-api-onlyfans-plus7-sign-in
- W3-lib-onlyfans-1-content-sync-unbound
- W3-lib-onlyfans-1-history-delivery
- W3-lib-onlyfans-1-transport
- W3-lib-onlyfans-2-automation-defaults
- W3-lib-onlyfans-2-control-refusal-copy
- W3-lib-onlyfans-2-creator-hub-ai-area
- W3-lib-onlyfans-2-d3-b-native-routes
- W3-lib-onlyfans-2-fan-financials-coverage
- W3-lib-onlyfans-2-keyless-ack
- W3-lib-onlyfans-2-resolve-ack-projection
- W3-lib-onlyfans-2-route
- W3-lib-onlyfans-2-runtime-envelope
- W3-lib-onlyfans-3-native-parsers
- W3-lib-onlyfans-3-reads
- W3-lib-onlyfans-4-plus2-connections
- W3-lib-onlyfans-4-plus2-managed-proxy
- W3-lib-onlyfans-4-plus2-vault
- W3-ui-onlyfans-launch-draft-loss
- W3-ui-onlyfans-launch-engagement-cancel
- W3-ui-onlyfans-launch-memory-edit
- W3-ui-onlyfans-launch-readiness-backfill
- W3-ui-onlyfans-launch-stale-account-link
- W3-ui-onlyfans-preview-1-accounts-view
- W3-ui-onlyfans-preview-1-all-fans-control
- W3-ui-onlyfans-preview-1-campaign-manager
- W3-ui-onlyfans-preview-1-configuration-editor
- W3-ui-onlyfans-preview-1-connection-editor
- W3-ui-onlyfans-preview-1-content-editor
- W3-ui-onlyfans-preview-1-content-sync-conflict
- W3-ui-onlyfans-preview-1-content-sync-save
- W3-ui-onlyfans-preview-2-content-sync
- W3-ui-onlyfans-preview-2-preview-lifecycle
- W3-ui-onlyfans-preview-2-resolution-state
- W3-ui-onlyfans-preview-2-thread-state
- W3-ui-onlyfans-preview-2-workspace-claims
- W3-ui-onlyfans-preview-3-freshness-overview
- W3-ui-onlyfans-preview-3-workspace
- W3-ui-onlyfans-preview-4-vault-polling
- W3-ui-onlyfans-preview-4-vault-uploader
- W3-ui-onlyfans-preview-4-vault-video
- W3-ui-onlyfans-preview-4-vault-writes
- W4-api-admin-plus1-chats-paging
- W4-api-admin-plus1-clones-create-status-note
- W4-api-admin-plus1-fans-profiles
- W4-api-admin-plus1-meta-discovery
- W4-api-admin-plus1-mtproto-preview-filters
- W4-api-ai-assistant-plus2-card-vs-write
- W4-api-ai-assistant-plus2-nav-targets
- W4-api-ai-assistant-plus2-no-text-proposal
- W4-api-ai-assistant-plus2-oldest-200
- W4-api-ai-assistant-plus2-suggestions-db-error
- W4-api-business-connection-plus17-business-connection-outage
- W4-api-business-connection-plus17-fans-offset-cap
- W4-api-business-connection-plus17-models-cache-failure
- W4-api-business-connection-plus17-removals-sql-revoke-order
- W4-api-business-connection-plus17-voice-failure-pinned
- W4-lib-analytics-data-plus4-act-as-case
- W4-lib-analytics-data-plus4-payment-query
- W4-lib-api-public-v2-plus6-catalogue
- W4-lib-api-public-v2-plus6-sim-determinism
- W4-lib-dashboard-data-plus2-dashboard-reads
- W4-lib-onlyfans-preview-1-memory-dedupe
- W4-lib-onlyfans-preview-1-payload-contract
- W4-lib-onlyfans-preview-1-payload-digest
- W4-lib-onlyfans-preview-1-scenario-evidence
- W4-lib-onlyfans-preview-1-scenario-scope
- W4-lib-onlyfans-preview-1-simulate-command
- W4-lib-onlyfans-preview-2-plus2-selection-cache
- W4-lib-onlyfans-preview-2-plus2-server-data-source
- W4-lib-onlyfans-preview-2-plus2-sign-in-errors
- W5-lib-openrouter-plus6-openrouter
- W7-P-picks-W2-team-351-extension-cookie-store
- W7-P-picks-W3-ui-onlyfans-launch-empty-account
- W7-P-picks-W4-ai-raw-errors
- W7-P-picks-W4-p1-stop-and-queued
- W7-P-picks-W5-or-sim-no-signal
- W7-P-picks-W6-m1-hardcoded-slug
- W7-app-tracker-bot-disable
- W7-app-tracker-delete-order
- W7-app-tracker-report-draft
- W7-app-tracker-swallowed-writes
- W7-app-tsocial-plus4-actions
- W7-app-users-credits-blank
- W7-app-users-delete-wipe
- W7-app-users-search-wildcard
- W7-app-users-unblock-safety
- W7-ui-agencyjoin-plus17-save-paused-goes-live
- W7-ui-createcloneform-plus18-create-retry
- W7-ui-createcloneform-plus18-questionnaire-unmount
- W7-ui-creatorquestionnairewizard-plus14-upload-busy-resend
- W7-ui-creatorquestionnairewizard-plus14-wizard-autosave
- W7-ui-dashboardaccessprovider-plus5-jarvis-missing-data-zero
- W7-ui-manualtakeover-plus13-payout-request-id
- W7-ui-revenuedashboard-blend-nonpositive
- W7-ui-revenuedashboard-stale-scope
- W7-ui-revenuedaydrivers-plus8-fleet-rate
- W8-ui-clone-3-select-offlist
- W8-ui-clone-3-spoil-wipe
- W8-ui-clone-4-field-disabled-wipe
- W8-ui-clone-4-select-offlist-timezone
- W8-ui-clone-5-plus3-session-503
- W8-ui-clone-5-plus3-submitted-poll
- W8-ui-flow-plus1-vision-toggle
- W8-ui-mtproto-1-default-daily-cap-inert
- W8-ui-twinassistant-plus8-team-access
- W8-ui-workspacestudio-module-plus3-intake-overwrite
- a-held-outcome
- e-apply-foreign-detail
- h1-uncertain-sellable
- j-invented-prices
- w1-content-config-catalogue-key
- w1-content-config-moxy-route

## Status log
- 2026-11-12 PR-0 W2c N18 (test:offline + premerge.sh) → #355 → merged 6ca978ae. Local proof: premerge PASS 150s (measured). CI billing-locked. Deferred: storage-transport 384MB flake; lint n/a (no eslint).
- 2026-11-12 PR-1 W2 F1 + W2c N2 (owner guard, client) → #356 → merged 4060a7cf. Rule test red 3/7 → green 7/7; premerge PASS; codex solo NONE (measured). Live UI check pending batch.
- 2026-11-12 gate: storage-transport RSS cap 384→480 MiB → #357 → merged 25574602. 3/3 standalone pass, peaks 302-401 MB (measured).
- 2026-11-12 test harness (W2c route harness, tests only) → #358 → merged 8681b237. premerge PASS.
- 2026-11-12 PR-2 W2c N1 part 2/3 (server capture handle, captureRef on save) → #359 → merged 0801deb2. rules 12/12; 6 plants red; rwl full r1 + delta + codex final NONE (measured).
- 2026-11-12 live-1 @0801deb2: N1 probes 400/410/400/400 PASS, F1 owner guard PASS (fake upstream). Evidence ~/Projects/twinagency/.local-dev/evidence/fix/live-1-0801deb2/
- 2026-11-12 PR-3a W2c N1 part 3a (editor holds captureId, saves captureRef; no delete-on-ack; 410 keeps proxy/key) → #360 → merged 0a2675d4. 300 LOC; rules+editor 8/8, P3 plant red; premerge PASS; rwl full r1 + delta APPROVED + codex final 1 P3 fixed (measured). Live check pending with PR-3b.
- 2026-11-12 PR-3b W2c N1 part 3b + W3 p7 F1 (curl + bb status replies return captureId only, no capture/xHash/cookies) → #361 → merged 871f6dde. 97 LOC; rules 12/12, plants red; premerge PASS; standalone prod build on synthetic stub: 0 secrets in replies, ref save forwards capture (measured). Codex P1s pre-existing, queued below.
- 2026-11-12 live-2 @871f6dde: N1 probes 400/410/400/400 PASS; F1 owner guard PASS; F2 Save payload = captureRef/expiresAt/model/ownerId/proxyUrl, no capture/xHash, 0 POSTs reached server (measured). Evidence ~/Projects/twinagency/.local-dev/evidence/fix/live-2-871f6dde/
- incident: cold `next dev` whose first compile is an API route crashes compiling /_not-found (HTTP 000). Workaround: move .next aside, restart, warm a page first (inferred, seen 2x). of-up.sh pgrep/pkill `next dev` hits other sessions.
- QUEUED N1-follow-a (secrets): bb status `error` free text forwarded verbatim (parser keeps 300 printable chars; `x_bc=...` passes). Fix: fixed message/code allowlist.
- QUEUED N1-follow-b (secrets): account GET recentHistory keeps unknown nested keys (parseRecentHistory); project by name.
- 2026-11-12 N1-follow-a (bb status error free text) → #362 → merged 76fa30ef. 37 LOC; red/green/plant; premerge PASS; codex solo NONE (measured).
- QUEUED N1-follow-c (secrets): lib/onlyfans/launch/native.ts:614 RecoveryProgress has [key: string]: unknown; parseRecoveryProgress passes raw recovery (incl raw recentHistory) b-native-routes → client BMemoryPanel (inferred, read). Fix: by-name projection.
- 2026-11-12 N1-follow-b (recentHistory projection + bounded diagnostics; known-red core-recent-history-projection + -free-text → tests/rules) → #363 → merged a5224b55. 190 LOC; 11/11, plant red; premerge PASS; rwl small: r1 Sonnet (1 major/3 minor) + codex (P1/P2) → delta APPROVE, codex final NONE (measured). Decision: substitute "unrecognized", never refuse (refuse hides Pause via F4). Residual: UUID-shaped values pass DIAGNOSTIC_CODE.
- NEXT: N1-follow-c (RecoveryProgress raw passthrough), then F4 core-recent-history-blast (brakes: diagnostic nulls connection, hides Pause), then picks 1→6. live-3 due after 1-3 more merges.
- 2026-11-12 Fable@9: F4 before N1-follow-c (brake); N1-follow-c carries memoryModelAccounting cost figures to client (not minor); money picks: public API tenant-auth/resolve-clone first; check revenue-cut-ratio vs W5 platform-cut root cause.
- 2026-11-12 F4 (invalid recentHistory nulled connection, hid Pause outgoing; known-red core-recent-history-blast → tests/rules) → #364 → merged fc08be2c. 66 LOC; drops block + sync on a copy (UI: "progress not available", never stale "import complete"); red 2/4 → 16/16, plant red; premerge PASS; rwl small: Sonnet APPROVE + codex P2 fixed, codex final NONE (measured).
- NEXT: N1-follow-c, then live-3 (Pause present with malformed recentHistory, N1 probes), then picks (money: public API).
- 2026-11-12 N1-follow-c in rwl (full tier, 233 LOC): r1 Opus correctness APPROVE (minors), Opus structure REQUEST CHANGES (fact optional fields copied unvalidated; validate/copy drift via casts), codex-da: correction PATCH route forwards raw `correction: c`. codex review r1 failed (CLI rejects -m; use -c model=). Fixer round 1 running.
- QUEUED N1-follow-d (secrets): other raw `v as X` parsers in lib/onlyfans/launch/native.ts (parseEngagementSettings, parseEngagementAction, readiness, parseNativeLedger); check whether a BFF forwards them to the browser.
- DECISION (owner/Fable): recentHistory.memoryModelAccounting USD strings are projected by #363 and rendered by RecentHistoryStatus ("Model charges reported"). If the dashboard is agency-facing, our model cost leaves the building. Not changed by any fix PR.
- 2026-11-12 N1-follow-c (native memory parsers raw passthrough + correction ack raw) → #365 → merged 79f02cd0. 299 LOC; 9/9, plants red, 0/100k accept-refuse mismatches vs base; rules 46/46, launch-b 24/24, premerge PASS; rwl full: r1 correctness APPROVE / structure 2 major / codex-da 1 medium → delta Sonnet + Opus APPROVE, codex final NONE (measured).
- 2026-11-12 live-3 @79f02cd0: N1 probes 400/410/400/400 PASS; F4 real connection GET + injected bad recentHistory → Pause present+enabled, "progress not available", 0 writes PASS; memory fans route 200 named keys only PASS (sanity). Evidence ~/Projects/twinagency/.local-dev/evidence/fix/live-3-79f02cd0/
- 2026-11-12 W4 F29/F4 tenant-auth (api_keys read error 401→503+Retry-After; 429 before lookup, keyed by key hash, counted after resolve) → #366 → merged bce18e6f. 235 LOC; 6/6, plants red; premerge PASS (api 52, public 61); rwl full: correctness 1 major (no Retry-After) / structure 1 major (double hash) + 5 minor → all CLOSED, delta Sonnet APPROVE, codex final clean (measured). CI billing-locked, verified annotation.
- QUEUED W4-follow (money/brakes): 429 + unknown-key denials still insert system_logs via logDenied (codex-da); coalesce/skip denied logging.
- 2026-11-12 W4 F22/F23 resolve-clone (unescaped ilike name → wrong clone incl. write paths + key CLI; read error → null) → #367 → merged d5df8a27. 296 LOC; one shared resolveCloneRef (lib/clone-name-match.ts) replaces 4 drifted copies; test:rules added to npm test + premerge; 8/8, plants red, CLI offline plant exit 1; premerge PASS; rwl full: 3 major/2 minor + 4 minor → all CLOSED, delta Sonnet + Opus structure APPROVE, codex final clean (measured). CI billing-locked, verified.
- NOTE: uuid gate now accepts brace/unhyphenated forms; clones with `*` in name resolvable only by id/slug (documented).
- NEXT: Fable consult (13 merged), live-4 (2 merges since live-3: #366 #367), then api-public-v2 money items, N1-follow-d, W4-follow (denied logging).
- 2026-11-12 Fable@13: next 4 = (1) W4-follow + public-envelope (coalesce logDenied per status+path+min with count; api-public-route.ts:91 e.message → fixed string), (2) revenue-window W4+W5, (3) revenue-cut-ratio (fail closed), (4) payments-paging hasMore. Out: W5 platform-cut F1 (owner), act-as-agency-cut below W7 fleet-overwrites-creator-money. Live checks by surface + niced next build each.
- QUEUED memory-cost-agency (secrets/agency): memory page.tsx:8 admits agency sessions, BMemoryPanel.tsx:158 diagnostics, RecentHistoryStatus.tsx:13-14 prints memoryModelAccounting USD. Fix: omit server-side unless admin (Fable, read).
- 2026-11-12 known-red corpus committed on side branch jaka/fix-sweep-20261112 @27414b8a (458 files, not for merge); pull picks per fix.
- 2026-11-12 live-4 @d5df8a27: no key/bogus 401; resolve-clone wildcards 404, exact name/slug/uuid forms 200; page-minted key 125 parallel → 120x200 + 5x429, RA 60; revoked-while-limited 429 then 401 at ~63s; system_logs 1 row per denial (193x401 + 7x429) confirms W4-follow; next build exit 0; both test keys revoked (measured). Evidence ~/Projects/twinagency/.local-dev/evidence/fix/live-4-d5df8a27/
- NOTE: :3001 left running d5df8a27 with throwaway TWIN_ADMIN_API_KEY env override (/tmp/fixorch-admin-key, 600), loopback-gated; key never in .env.
- NEXT: Fix 1 W4-follow + public-envelope (fix/w4f-public-envelope-denied-log).
- 2026-11-12 W4 F6/F11 public-envelope + denied logging (W4-follow) → #368 → merged dec042e0. 229 LOC; errors stamped generatedAt + no-store, 500 = "internal error", logDenied 1 row/status/60s with suppressed count; red 6/10 → 12/12, 6 plants red; rules 72/72, api 52, public 61, premerge PASS; rwl full-lite: Opus 1 major/3 minor + codex clean + codex-da (3 rejected w/ reason) → delta Sonnet APPROVE, codex final clean (measured). CI billing-locked, verified. Deferred minor: W4-tenant-auth local wire helpers (patch /tmp/w4f-tenant-auth-move.patch, 356 LOC).
- NEXT: Fix 2 revenue-window W4+W5; live-5 (public API surface) after it.

## Worktree cleanup 2026-11-12 23:17Z (owner item 4)
Removed 108 worktrees (13 fix-*, 95 rwl lanes), all clean, plain `git worktree remove` (no --force). Branches untouched.
Backup first: `.local-dev/backups/worktree-cleanup-20261112/` = scratch.tgz (273 ignored .scratch files) + branches.bundle (all rwl/*, fix/*; verified).
Skipped: rwl-W1-lib-onlyfans-plan-c (dirty=2); 5 /tmp rwl mut dirs (standalone clones, not worktrees); fix-sweep, fix-w45, fix-cut, other sessions' worktrees.
- 2026-11-12 22:3xZ owner: FREQUENT MERGES + FAST FF. Merge each fix when green (premerge + rwl), update-branch onto fresh head, squash. After every merge: `git -C ~/Projects/twinagency/twin-dashboard pull --ff-only` (root on target + clean) else `git fetch origin T:T`; non-ff = stop+report. 2 disjoint worker slots kept busy.
- In flight: fix-w45 (rwl r1: 1 major /api/dashboard unbounded range + 1 minor), fix-cut (rwl r1: 2 major fleet byTier window-variant + refund blend >1), fix-pay (payments-paging F2+F3), fix-memc (memory-cost agency).
- DEFERRED → next fix "cut-helper-dedupe": lib/api-public-v2.ts:33-41 netStars + lib/api-public.ts:327-335 pass gross on missing cut (null clone_id); after fix-pay merges.
- 2026-11-12 22:4xZ owner: F0 TEST HARNESS (scripts/check.sh fast|live|full, FIX-MODE.md:36-51) is next priority, ahead of queue; starts on one slot when the current in-flight merge lands. After F0 merges: gate = `check.sh fast` GREEN; every fix promotes its regression test; every restart runs `check.sh live`; Ship line reports measured fast wall time.
- fix-memc f57dfa4b (implementer done; also strips cost on creator platforms route, accepted: same field, same rule) → rwl r1 running.
- 2026-11-12 #369 merged 22d44ae1 (W4 F5 cut ratio fail closed; full rwl: R1 2 major+codex P1+da P1 closed d0b44dff, Sonnet APPROVE, codex final NONE). Root ff'd to 22d44ae1.
- #370 (revenue window) opened, update-branch → 76cd6fec, premerge running. Deferred minor: date picker >1100d.
- F0 check.sh started (fix-f0) on slot 1; slot 2 = memc rwl fixer (default-deny redesign). Pay rwl r1: 3 major (lookahead miss, empty page, split dedupe rule) → snap-to-paid_at-group design, fixer queued for next free slot (/tmp/pay-findings.md).
- 2026-11-12 #370 merged 7bb00611 (W4/W5 revenue window: custom range validated, CUSTOM w/o range 400, ALL lookup fail closed; full rwl closed, premerge PASS @76cd6fec). Root ff'd to 7bb00611. 16 merged. memc r2 Sonnet APPROVE (#1-#6 CLOSED, caller grep clean, measured); codex final running.
- 2026-11-12 #371 merged 4f28e683 (N1 memory model cost operator-only, default deny; full rwl: R1 6 closed, Sonnet APPROVE, codex final 1 major closed bdecba30, Sonnet r3 CLOSED; premerge PASS @3f0c9f0f). Root ff'd. 17 merged; Fable consult sent.
- F0 built e3894245 (fix-f0, not pushed): check.sh fast GREEN 207s measured; full rwl R1 running (2x Opus, codex, codex-da). Pay r2 7ff89f21 Sonnet APPROVE, codex final running.
- Fable consult @17 merged: keep the 5 live-data Supabase leaves as NEEDS (owner-run, local data passes vacuously); per-step cap in every mode; next = cut-helper-dedupe (after pay; withhold rows, never throw; fix or strike the payments-sum-to-revenue claim; delete dead scaleDashboardData) + W7 fleet-overwrites-creator-money on the 2nd slot; codex final on auth/money/projection only; every codex-only catch becomes a tests/rules case; max 2 heavy runs.
- F0 rwl R1: 1 blocker (live writes system_logs via 401 probes and the login POST; prod guard checks the harness's env, not the running dashboard's) + 9 major + 8 minor; design D1-D9 in /tmp/f0-findings.md; fixer running. Pay: codex final 1 major (cursor mint 500s on TON ids with +/) → timestamp-only cursor; fixer running.
- 2026-11-13 #372 merged dd43873b (W4 F2/F3 payments paging: pages snap to paid_at groups, timestamp-only cursor, chunked fan names; full rwl: R1 3 major, R2 2 major, codex final 1 major (TON id cursor 500), Sonnet r3 CLOSED; premerge PASS @a16dc603). Root ff'd to dd43873b. 18 merged. cut-helper-dedupe started (fix-cuthelper, withhold-not-throw). F0 fixer on D1-D9.
- 2026-11-13 #373 merged c9966fd8 (cut-helper: public API missing cut fails closed via one net(); clone_id NOT NULL+FK measured (twin-bot 015:52,:64; local is_nullable=NO) so withhold design rejected (broke #372 paging invariant, min_spent leak, /revenue count mismatch); header claim fixed to "up to per-row rounding" (2.94 vs 2.925 measured); full rwl: R1 4 major reverted, Sonnet CLOSED, codex final P2 (tests didn't reach branch) closed by net() test; premerge PASS @bbb6e3d0). Root ff'd. 19 merged. TODO CLAUDE.md sentence after F0 merges.
- W7 money R1 (c5c38219 detach-on-save): 5 major (false detach via rowFromForm fallbacks, missed toggle/dial/flows paths, tests, dup helper, race) → redesign: cascade only template keys that changed (/tmp/w7m-findings.md); fixer on new branch fix/w7-cascade-changed-only.
- F0 rework done (549f0799 D1-D8, 38990f11 D9): fast GREEN 208s, live GREEN 1s, 0 DB writes (pg_stat counters, measured). PR1 350 LOC >300 → split pending; Sonnet delta + Opus structure running.
- 2026-11-13 23:4xZ owner "go": THROUGHPUT PLAN (FIX-MODE.md:52-62). Queue re-sort running: dedupe of 298 known-reds vs c9966fd8 + severity + relay tag + root-cause groups → /tmp/queue-resort.md, then this file's header.
- W7 redesign a823a809 (fix/w7-cascade-changed-only, +199/-14; cascade only changed template keys, follower filter on UPDATE; 5 plants red, premerge PASS, measured) → full rwl R1 running (Opus, codex, codex-da).
- F0 R2: Opus structure 2 major (premerge env -i wipes scrub; mode semantics split TS/bash) + 5 minor → fixer on S1-S5,S7 + split core/live PRs.
- 2026-11-13 owner "go": TRIAGE ON FLASH. Opus re-sort analyst stopped (left worktree queue-resort dirty with copied corpus only; needs --force to remove, not done). Triage delegated to DeepSeek Flash (worktree, read-only) → /tmp/triage-flash.md; Opus approves groups + spot-checks ~5 rows, then re-sorts this file.
- W7 rwl R1 (a823a809): 1 blocker (template saved before follower UPDATE → failed cascade unretryable), 3 major (absent template keys never cascade incl brakes; reattach copy false; paired fields split per follower), 3 minor. Rejected: concurrent-save race (pre-existing, deferred), same-field creator override (intended), null uses_default_config (measured NOT NULL, 0/11). Decisions /tmp/w7c-findings.md; fixer R1 running.

## 2026-11-13 progress
- #374 W7 merged cfe3a2f5 (+317: product 87, tests 230; over cap by tests, flagged). Deferred: tip_max↔spoil group, useCloneConfig `??` hand copy, save race, UI screenshots at next restart.
- F0: R3 final fix pass running (unpack, live like exec, LIVE=opt skip tests; opt=skip/req=INFRA for down/auth/refused).
- G01: R1 REQUEST CHANGES (Save-edit bypass, stop revision dropped, dead fixtures); stop-hold durability + revision-free STOP deferred to backend lane 1. Fix round queued for next free slot.
- G47: implementer running (incl. 7a-engine-note-and-accept, 7a-engine-page-race).
- Flash psql tests used own initdb cluster on random loopback port (measured from code); stack/prod untouched.
- Incident: F0 fixer pkill'd other sessions' premerge runs (pid 30666 /tmp/fix-f4, 41350, 56250, 57577). Owners rerun.
- #375 G01 merged 720751aa (rwl full R1+R2 Sonnet APPROVE; codex final P2 hand-back stale revision fixed red-first; premerge PASS c304bbb3; CI billing-locked). 21 merged. Fable consult sent.
- #376 G47 merged 574f956b (rwl full R1 Opus+codex+da, R2 Sonnet APPROVE; codex final P2: explicit purchase evidence overridden to held → evidence authoritative (NEEDS-BACKEND §6), red-first; rules 32/32, engine-contracts 36/0, premerge PASS 9ea0c272; CI billing-locked). Root ff'd. 22 merged.
- Queue adds (from G47): engine-operator.ts:36 every upstream 503 → refused (maj); backend refusal of stop on degraded session (blk, backend lane); no_contact outranks not_accepted/refused (min); /settings "Which creators are on this default" ⓘ + grey paragraph (min, UI convention).
- G44b fixer done 36155633 (+base 67cbb71d): rwl full R1 running. G48 implementer started (fix-g48 off 574f956b).
- #377 G44b merged ecd79396 (rwl full; Moxy creators not hard-coded, follow-ups/cancel always mounted; premerge PASS 2d38b84e; CI billing-locked). Root ff'd. 23 merged. Deferred: M1 split EngagementPanel, M2 policy switches hidden while Moxy read loading/failed (backend answer), ⓘ test, dup React key "of-a".
- live-6 @ecd79396: build exit 0; cold dev crashes (TypeError 'length') iff /_not-found is first compile, 3x measured; warm GET / first → all 8 pages 200. F0 live GREEN 6/6 5s. G44b live: Moxy-off state, no creator select, ⓘ, engagement settings visible (screens in evidence/fix/live-6-ecd79396). G06 runtime-envelope bug live-confirmed (Account handling "not in the expected shape").
- G48 R1 fixer f1734e60: D3 reverted (DA idea adopted; test:onlyfans-launch already uses scripts/tsconfig), shared TS-compiler walker tests/helpers/import-graph.ts, all 232 'use client' modules guarded. R2 Sonnet APPROVE; Opus structure 2 major (redundant BACKENDS list; plan-c.test substring denylist hits browser-safe core) → R2 fixer running. F8 extension zip → backend queue (git archive of loginExtension/). plan-c-d3-server-only: won't-fix.
- G02a (fix-g02 3c5d8d41, 5/7 plan-c members promoted): R1 Opus 1 major (dup denial block w/ G47 → route core) + 3 minor; codex review clean; codex-da HIGH (refusal after unconfirmed releases key → dup send) + MED (ack w/o action = success) adopted; DA idea mock-vs-real rejected. Fixer running (/tmp/g02-findings.md). Not promoted: 9a-stop-withdraws-drafts (conflicts G01 rules, needs decision), plan-c-stop-needs-revision (NEEDS-BACKEND).
- F0 fast @0814be10 RED 5 = live:page 000 while :3001 hung (not F0). Rerun running.
- F0 rerun @0814be10: fast GREEN 44/0/14 in 270s, live GREEN 6/6 5s. PRs #378 (plan) → #379 (exec) → #380 (core) → #381 (live), stacked, cap reached at R3. Codex finals: a P1 `&` false-green + P2 weak NEEDS assert; b1 3 P1 (TEST-NET probe fail-open, PATH-shadow sandbox-exec, detached children → REJECT: sandbox inherited) + P2 redaction; b2 2 P1 (planner unsandboxed w/ NODE_OPTIONS; non-run actions/zero passes GREEN); c P0 (dashboard process env can override .env SUPABASE_URL) + 2 P1 (curl -q, psql budget) + P2 (CHECK_LIVE_ONLY fast exits 0). Fix round running.
- #382 G48 merged 525a2995 (full rwl; codex final P2 → SERVER_MODULES now derives every lib secret-env reader, 19 modules; plant client→owner-auth red; premerge PASS 0cc85644; CI billing-locked). Root ff'd. 24 merged.
- G02a R1 fixer 49f52e13 + 538cf480 (plan-c.test regex → authorizeOnlyFansRead after G48 merge): all 6 closed; key held after any unconfirmed until recorded ack; ack.action required (backend words verified from source d10e065). 69/69 measured. R2 Sonnet APPROVE; Opus structure running.
- G06a 4c102710 (fix-g06): 5 members red→green (runtime envelope, requiresAttention default true, aiArea needs running sender, coverage w/o timestamp → incomplete, 403 copy); premerge PASS. Small-tier: Sonnet + Flash running. Note: premerge printed "changed tests (none under tests/)" despite new tests/rules files → check.
- Gotchas: zsh `$br:r` path modifier mangles refspecs, quote `"${br}:refs/heads/${br}"`; cold dev: wait Ready, GET / before anything else.
- #383 G02a merged 6aa6947f; #384 G06a merged 337c85cf; #385 vault fixture stub + CI "Rules and API guards" step merged dcad7c45.
- #386 G18 merged 7b66437c (full rwl R1+R2+R3; Flash final FL1 legacy non-UUID proposals → 409 unknown, red-first; codex final P2 settle-failure swallowed = deferred, fails safe; rules 281, api 52, premerge PASS; CI green). 28 merged. ESCALATE: setFanCredits sets a numeric money value (pre-existing CLAUDE.md rule 3 conflict).
- G05 #387: full rwl R1+R2, codex final clean; Flash final F11 (shared-media ?creator= case → false 403, fail-closed) fixed red-first ae163629; rules 266, premerge PASS. update-branch → 19641356, CI running.
- F0 #378-#381 pushed after codex-final minors (b1 6ba94114 header; c d7aeb209 env w/o PATH= unreadable); fast GREEN 370s 44/0/14 (premerge 322s under 600s cap, load 21). b1 339 / c 390 LOC over cap.
- Started: G30 (+G19 removals-sql RPC) fix-g30, G04 (+plan-c key lost on reload) fix-g04.
- #378 F0a merged 45603a33. 30 merged. Fable consult @30: G30b split + F1 read-only OK with 3 conditions (warn on Remove, prove admin restore path, pg_get_functiondef diff before apply); G04a trim helpers; 429/408 = unavailable; check backend handover actor binding; restart now.
- live-7 @45603a33: build 0; G48 0 secret hits in .next/static; check.sh live GREEN 6/6 5s; G06a Account handling renders, no shape error; G05 upper-case ?creator= 200; unknown creator 503 (should be 403/404, minor); dup React key of-91610731 (G43a, inferred). Evidence evidence/fix/live-7-45603a33.
- G30 #388 R1 fixed 897a39f8 (F1 option a, F5 → G30b, CI pg fail-closed); R1b (Fable conditions) running. G04a/G04b R1 findings merged (Opus+codex+codex-da+Flash) → fixer running; G04b reload items → G04c. F0 b1/b2/c: Linux CI harness tests → darwin-only skip, running.
- #390 G04b merged 32ef05cc; #380 F0 b2 merged 4b5eacae; #389 G04a merged 6922a752 (RPC-404 residual deferred, in PR body); #381 F0 c merged 9f5f4692 (team merged in, add/add resolved --ours, diff verified EXACT; premerge PASS ca4ec2c0; CI green); #393 doc (payments sum up to per-row rounding; missing cut fails closed) merged 88117b44. 37 merged. Gate now = check.sh fast GREEN + CI.
- Fable @34: G30b option A inverted (retry only 2 proven-nothing-staged pairs w/ media_id null; hold > dup upload); G04a 404 rejection stands. Queue: G24 → G09 (consumes G24 held-gating fn; pair w/ G07); G19 before G03; G05b chatter stop before G34.
- G30b #391 363d6a6f: R1 fixed; R2 Sonnet APPROVE all closed (filter==SQL==index, 3-valued walk); codex final NONE; Flash final running. Owner: apply migration before deploy (one-way door).
- G19 #392 f378326e: fast GREEN pass=38 264s; Sonnet 7 items + Flash 2 majors (health 503 from paused tokenless OF-only clones; business-connection swallows DB errors → false 200/403) → Opus fixer running. Skipped fans-offset-cap (contradicts clamp contract, owner item).
- G24 fix-g24: implementer running (exports pure held-gating fn for G09).
- live-8 @9f5f4692: first dev start wedged (uncaughtException reading 'length' compiling /_not-found, live RED http 000 x2) → stale .next cache (inferred); moved aside, restart → check.sh live GREEN 6/6 6s. next build running in throwaway worktree. Evidence evidence/fix/live8-9f5f4692.
- live-8 build exit 0 56s; root at 88117b44.
- #391 G30b merged 6a5e2ad2 (full rwl R1+R2, codex final NONE, Flash final NONE, fast GREEN 44 313s, CI green after :91 flake rerun). 38 merged. OWNER: apply migration before deploy (one-way door); Fable: row-count precheck, if large build index separately then drop constraint; add index-exists probe to deploy checklist. Backend lane: concurrent create same commandKey/fileId relies on provider dedupe (pre-existing). Reset-receipt idea rejected.
- #392 G19 merged 4469a768 (full rwl; R2 A active tokenless clone false-green fixed by orch 5c97baed red-first; first fast RED = strict tsc on my test, fixed 995446f4; fast GREEN 44 306s; CI green). 39 merged.
- Fable @38: no G30b must-fix; G24 accept+flag 310 src LOC (net -24), PR body must state live send validator equivalence; G24 dropped not_delivered → G04c; G03 next (disjoint), G09 after G24; process: batch disjoint rwl-clean PRs on one integration ref for one fast run; log whether LIVE ran in fast.
- G24 #394: R1 (Opus 3 maj + codex P2 + DA 2 maj + Flash 2 min) fixed 824885f8+ec435744; R2 Sonnet APPROVE, Opus structure REQUEST CHANGES (InboxView leftover regex, scenario hook guards = inert-toggle trap, boolean validator dup 4000 + lost reasons) → final fix round running.
- G07a #395 30f7c65c (L2 STOP always rendered + route bare STOP pinned fresh, L5 stale ?account=, L27 empty ?account=): R1 Opus maj stale-fingerprint STOP refused; codex P1/DA retry identity. Decision (Fable): STOP always pinned fresh on action, key after fill only if backend fingerprint changes per recorded control (fixer verifies in backend source), "Send stop again", pending/busy never disable STOP. Fixer running. ESCALATE backend lane: STOP impossible while readiness read down (503, nothing sent); idempotent STOP w/ stable intent key. L3/L4 (403 withdraws STOP; unconfirmed STOP not labelled/holding resume) → G07c.
- #394 G24 merged 579bcd79 (full rwl R1-R3 + codex final 18 deferred + Flash final 19 FIXED red-first 439a4ca6: any recorded delivery incident holds, failed included per projections.py delivery_incident/store.py _unresolved; Sonnet verdict APPROVE; fast GREEN 44 292s; CI green). 40 merged. G24b deferred: composer byte-limit dup, partial override overwrites accepted receipt, attempt id as "Receipt recorded", accepted_pending override no incident.
- live-9 @579bcd79: restart :3001, check.sh live GREEN 6/6 6s, next build (throwaway wt) exit 0 47s. No G24 screenshot: fixture source has no dashboard route; held gating proven by jsdom/rules only (inferred). Evidence evidence/fix/live9-579bcd79.
- G07a #395: R2 fix 7f202a2a (two result lanes, one blocked() gate, workspace reads only listed ids); R3 Sonnet APPROVE + Opus structure APPROVE (cap); minor pass 8b1ba923 (stale browser check moved to lost-ack pause + "Send stop again"; listed() helper; ready! narrowed); codex final NONE; Flash final pending; updated onto 579bcd79 → ea4eda7e, fast running. Deferred G07b: in-flight keyed by action not lane.
- G03 #396: R1 fix 82d3745c (D1 stop targets from refused list, D2 no truncation ≤20000B, D6 alias conflict, D5); R2 Sonnet RC (FL4 conversationId not tied to fanId, backend contract.py:126); R2 Opus structure RC (S1 dup conversation rules, S2 optional stopTargets on generic read, S3 alias conflict opt-in per field); final fix round running.
- #395 G07a merged 2d79e802 (full rwl R1-R3, codex final NONE, Flash final NONE, fast GREEN 44 308s, CI green). 41 merged. Live @2d79e802 (hot reload): ?account=of-gone on automation/memory/launch → "That account is not available to this session", no per-account API calls (measured, network log); ?account= empty → falls back to the authorised account (measured). Evidence evidence/fix/g07a-live. L2 (readiness read down) = jsdom only (inferred).
- G03 #396: R2 fix b9090672; R3 Sonnet APPROVE + Opus structure APPROVE w/ minors 12-14 → Sonnet minor pass 305ffaec (get/outcome split, fanId string, pick per source; plant-red D6); fast GREEN 44 301s; codex final NONE; Flash final + CI pending.
- G09 #397 49aca494 (F8, F21, P7, P20, P4, P29; fast GREEN 44 297s). R1: Opus CHANGES (P4 default-flip only, brake hidden after toggle; 3rd jsdom harness; manualPriceCents treats 0 as paid), codex P1 + Flash maj (Pause after unconfirmed activate: stale revision / data=null hides Pause), DA (brakes disabled while go in flight → G09b, ESCALATE; paid-intent field rejected). Fable (hard decision): P4 not closed by a default flip; brake beside Send, restore auto-close + 480px guard. Fix round 1 running.
- #396 G03 merged 717d236c (full rwl R1-R3 + minor pass, codex final NONE, Flash final NONE, fast GREEN 44 301s, CI green). 42 merged. Live: /onlyfans/plan-c shows "configured administrator only" for password login (pre-existing gate planCOperatorOnly, plan-c-route.ts:22); parser proven by tests only (inferred). Evidence evidence/fix/g03-live.
- Fable @42: G09 FB1 Pause account must outrank a running enable (own lock); G04c split c1 shared refresh (read-only upstream re-read, missing job stays held, no migration) / c2 reload-surviving held keys (fan-visible sends only, payload digest, reuse G04a store, after G09) / c3 not_delivered → backend lane (provider must verify absence).
- G05b BLOCKED → backend: api.py:128 capability "chat" only for manual_message/request_takeover/release_takeover; agency_scope.py:67. Add pause_automation + mark_no_contact to chat set, dashboard follows. Known-red /tmp/g05b-kr.test.ts.
- G09 #397 fix r1 1cd93e65 + FB1 ddc16f93: Reply control beside Send (panel/sheet when open), auto-close ≤1279 + 480px guard restored, Pause re-reads revision, keeps last data on refresh fail, 0 price invalid, preview2 harness merged into preview1; G09+G24 90/90, rules 548, ui-browser 273/0; fast GREEN 44 316s. R2 Sonnet delta + Opus structure running. G04c1 implementer running (fix-g04c1 off 717d236c).
- G09 #397 r2 1929be96 (one AbortController/op, compact ChatBrakes under thread, serve raw+signal, refused rule) → R3 minor pass 0c95729b (pause survives unmount, controlLabel, serve abort rejects); codex final P1 (Pause preflight GET unbounded, PR-introduced) fixed c6686feb: 3s AbortSignal.timeout, fall back to last-known revision, red-first CF-P1. Rules 554/554, fast GREEN 44 287s. Flash final pending. G09b: hung AllFansControl pause no timeout, DA2 brakes during in-flight go, bulk-ai cancelled() signal, mobile scroll-to-newest.
- G04c1 #398 9c88ce76 (shared refresh: observe() re-read, CAS save, held gate): rwl done (R1 4 lenses, R2/R3 Sonnet clean, codex final CF2/CF3 fixed, CF1 → G04c1b receipt-id targeting; Flash final = CF2). Fast GREEN 44 295s. Escalate: D5 backend claim race vault_media.py:313-323. Waiting on CI runners.
- #398 G04c1 merged 2e2463af. #397 G09 merged 08b9ff29 (Flash final: unmount during pre-read dropped stop → fixed 497fcd74 red-first FF1; other 3 = DA1/DA2/G09b). 44 merged.
- live-10 @08b9ff29: build 0 (53s), 0 secret hits .next/static; first dev restart wedged (uncaughtException TypeError compiling /_not-found, http 000) → restart again OK (inferred one-off); check.sh live GREEN 6/6 3s; /onlyfans/inbox 1024+390 data-of-chat-brakes=1, all-fans controls (Pause account) rendered, 0 non-GET; console: dup React key only (G43a). G04c1 live limited: local shared_media_transfers 0 rows. :3001 pid 37327. Evidence evidence/fix/live10-08b9ff29.
- G07b #399 21412fee (L8/L9/L13/L16, non-test +49/-33, fast GREEN 288s). Small tier: Sonnet REQUEST CHANGES (maj lastOk cross-account leak, latent: AbcWorkspace key remounts) + Flash (maj draft lost on 503/500 re-read; maj silent memory-edit close). Fix round 1 running.

## 2026-11-13
- #399 G07b merged → 32654df3 (45 merged). R1 Sonnet+Flash, fix be868ff0, Sonnet delta APPROVE. Fast GREEN 44 in 297s @9e84a027. Deferred G07b minors: N1 denied doesn't clear lastOk (PersonalityScreen:448); N2 memory "changed" notice stays on reopen (BMemoryPanel:254). The shared hook useJsonResource now returns loading on a url change (17 callers checked).
- #400 G04c2 opened (55541e63). R1: Opus APPROVE (5 minor); codex CHANGES (campaign payload lost on reload, operator-scoped heldWrites, 32-bit digest collision measured, 24h expiry); codex-da CHANGES. Fix r1 running. 24h expiry deferred with the plan-c key cap. DA idea (same-page retry only) rejected in favour of persisting the exact payload.
- 09:47-10:5xZ: Claude API 403 (Cloudflare auth_failed) on all subagents; G04c2 r2 + G07c workers died twice. WIP checkpoints pushed: G04c2 7b55cadd (r2 red tests), G07c d4566eb5 (L3/L4 red + partial fix). API back ~10:5xZ (probe OK); both workers resumed.
- G04c2 R2 ruling (Fable): held create must not disable campaign Pause/Cancel (blocker); release held entry only on allowlisted post-lookup backend codes, 2nd consecutive same-key refusal; no discard hatch; hold create only; purge scope on 401/403; drop keepRequests naming. G04c2b deferred: generic store<T>, move to held-keys.ts.
- G07c (L3 403 withdraws STOP; L4 unconfirmed STOP not named, resume not held) worker on fix/g07c-launch-stop-hold.
- 11:3xZ OWNER directive applied (FIX-MODE 11:2xZ):
  - The per-PR rwl is dropped from #400/#401: the G04c2 R3 structure pass was stopped; the R3 Sonnet delta came back CLEAN.
  - The header has been recounted by actionable groups: 40 open (inferred).
  - Minors have moved to .scratch/rwl-programme/POST-FIXMODE.md.
  - The batch-rwl counter starts at #400 (0/4 merges, 0/600 LOC).
- STAGE MINUTES (measured, wall clock):
  - #400 G04c2: fix r2 13 · fast 5.1 (worker) · R3 Sonnet delta 0.6 · codex final ~25 (find-to-done) · orchestrator fix of codex P2s (cross-kind purge, unmounted purge; red→green 25/25) 4 · fast 5.6 · Flash final (pending) · CI (pending).
  - Codex final on #400: 6 findings. 2 P2 fixed (4eed5ecf). P1 24h expiry, P1 swallowed setItem, P2 malformed request entry and P3 in-memory streak all go to G04c2-exp (send path, kept in queue).
- #401 G07c R1 (pre-directive, full lenses): Opus, codex, codex-da and Flash all returned CHANGES.
  - Merged findings: Moxy/engagement go escapes the hold; go is live while STOP is in flight; reload drops the hold (3 lenses, so the deferral is reversed); stale-read clear; goDenied per account; hold re-derived in 3 places; stop-lane pending not cleared.
  - Fix r1 is running. After it: fast + Flash + Codex final (send path).
- G17 (admin paging/filters) slot refilled, worktree fix-g17 @32654df3. Gate: fast + Flash (no auth file touched).
- 12:0xZ #402 G17 merged → 9f31af71 (46 merged). Codex final P2 (nextBefore dropped) fixed: kept as deprecated field + legacy-pager test; P3 cursor claim narrowed to "malformed cursor = 400" (shape-checked, not provenance-bound; only narrows). Flash NONE. Fast GREEN 44 306s @52342d4d. Batch rwl: 1/4 merges, 127 non-test LOC.
  - STAGE MINUTES #402 (measured): fix 14 · fast ~5.5 · Flash ~3 (parallel) · codex final 2.6 · codex fixes 4 · fast 5.1 · CI ~22.
- #400 G04c2 Flash final #19/#20 fixed c2a79278 (403 keeps hold; control ack re-shows held send), fast GREEN 308s. CI both Build & Type Check RED at check-onlyfans-takeover-browser.mjs:91 (known flake, POST-FIXMODE). Local under load: head 14/15, base 10/10 (measured); item-20 change is inert for a takeover without a held send (inferred). Rerun of failed jobs pending; a second red = regression. Open (send path, → G04c2-exp): ack with another held send on the same conversation leaves the acked send's draft uncleared.
  - STAGE MINUTES #400 (measured): + Flash final ~6 · fix 19/20 ~10 · fast 5.1 · CI 9 (red) · rerun pending.
- #401 G07c fix r1 732a8f2c (all 8 items), codex final 3 min: 2 P1 (identical enabled engagement policy escapes hold; older STOP reply clears newer hold) fixed 25363019 (attempt id in b-stop-held marker; strict retry rule). Fast GREEN 315s, G07c 22/22, rules 696. Ruling: strict retry rule kept (a brake-only retry while another flag is on is held; disable still one click via current view + save; STOP never held). CI pending.
  - STAGE MINUTES #401 (measured): fix r1 23 · codex final 3 · fix P1s 10 · fast 5.3 · CI pending.
- BOTTLENECK (3 PRs, measured): fixer rounds (10-23 min) and CI (9-22 min, plus flake reruns) dominate. Codex final 3 min, Flash 3-6 min, fast 5-6 min. CI flake :91 now costs a rerun per hit; moving it out of POST-FIXMODE is worth considering if it repeats.
- Slots: G45 (blk, CI wiring; fix-g45) and G27 (sec-money, clone save money/columns/spoil/minor gate; fix-g27). G16 waits on #402 (clones/create overlap), now unblocked.
- 12:1xZ #400 G04c2 merged → 08e3247a (47); rerun green (flake :91 confirmed). #401 G07c merged → d504d672 (48); no file overlap with #400 (measured). Batch rwl: 3/4 merges.
- LIVE @d504d672: build 0; first dev boot hung (stale root .next, TypeError 'length' on /_not-found), .next moved to /tmp, restart OK; check.sh live GREEN 6/6; automation page settled view (evidence live-d504d672.md). Next restart ~51-53.
- #403 G45: Flash 2 weak guards fixed 35bf8929 (planted red, measured), fast GREEN 39. CI pending.
- #404 G27 (head 966cd94f): Codex final P1 blank credit → 199 fallback; P2 partial-save silent (also Flash major, two lenses → in scope); P2 Moxy widening REJECTED (removing hardcoded roster is the finding; access unchanged). Flash: tip_credits unvalidated (maj), 2 weak tests (min); route 400 item dropped (G16 owns route). Fix round running.
- #405 G16 (head 8bc9a75a): Codex final P1 duplicate multipart dryRun reaches Telegram; P1 create blocklist misses tip_reask_*; P2 agency summary comment. Fix round running; Flash pending.
- G25 (preview view-as exit, selection cache, stop revision) started, worktree fix-g25 @9f31af71.
- Follow-ups → POST-FIXMODE candidates: CLAUDE.md "admin API has no write routes" stale (docs); G16 create is a blocklist (new money column passes until listed).
- 13:xxZ #403 G45 merged → 5fa7b923 (49); adds composerSettled wait (takeover-browser :91 flake, Fable ruling). #404 G27 merged → 3865035f (50): credit blanks refused, partial save named, Moxy roster split parked (POST-FIXMODE D-Moxy, escalate).
- BATCH RWL 1 (#400/#401/#402, 32654df3..d504d672) done (Flash pending): B1 BLOCKER STOP hold read only in BAutomationPanel (inbox resume/hand-back, campaign create/Resume ignore it); B2 BLOCKER plan-c 24h expiry/cap drops unresolved held keys (dup send/create). Majors B3-B6, minors B7-B10. HARD BARRIER: no live restart/promotion/send re-enable until B1+B2 merge. Structure S1/S3/S4 → POST-FIXMODE.
- In flight: G04c3h (B2,B3,B4,B5,B9; fix-g04c3h), G36 (users actions money; fix-g36). Next: G07d (B1,B6,B7,B8,B10) after #406 + G04c3h. CI: #405 G16 32dd97db, #406 G25 712c5c0d, #407 G28 bd795e4c.
- RECOUNT @50 (inferred): open actionable groups 37 (blk 0 · sec-money-maj 24 · maj 8 · send follow-ups 5 incl. batch B1/B2 as G07d/G04c3h). Fixed-by-us +3 since 11:3xZ (G45, G27, G17). Follow-ups added: G28b purchase race (DB constraint), G25b backend exact-revision stop, G16b.
- 13:2xZ W9 lane 10 handoff (lib-mtproto-2, rwl/W9-lib-mtproto-2 @9459f9c2, 5 known-red files): G50a blk brakes F1/F2/F3/F5/F10 (dedupes W8 H3/H4, W4 O8; disjoint from G07d: lib/mtproto + GlobalStopControl vs onlyfans-launch) · G50b sec-money F4/F8/F11-F14/F17. F6/F7 worker-only → before send re-enable. Slot after B1/B2 (G07d, #408). Recount: blk 1, sec-money 25 → 39 open.
- Batch rwl 1 Flash: B11 (Pause disabled after unknown STOP, inv 7) + B13 (503→refused clears hold) → G07d; B12 (401 purges current-scope holds → dup) → #408 fix round.
- 13:4xZ #407 G28 merged → e08e0972 (51). #405 G16 merged → 2013dd9c (52). #406 G25 conflict (deps array only) resolved by merge commit 3ce4a878, fast GREEN 39; CI pending. #408 G04c3h opened (B2-B5); codex P1 (scope switch keeps A's Retry → dup) + B12 + Flash (purge on Plan C path, quota fail-closed) → fix round. #409 G36 opened; codex P1 unblock TOCTOU.
- BATCH RWL 2 started @2013dd9c (d504..2013dd9c: #403/#404/#407/#405, 307 non-test LOC): Opus correctness + codex + codex-da + Flash. Structure lens SKIPPED (fix mode, POST-FIXMODE only), so this is not a full rwl.
- FABLE @52: Q1 quota fail-closed yes (new entries only; drop in-memory entry on failed save; no "clear site data" copy). Q2 manual 1:1 send under STOP hold stays live (takeover recorded; backend refusal shown). Q3 merge G36 with history-first limit (G36b low); error must say history already gone; null blocked_reason = admin-only. Q4 G50a ahead of G07d OK. Concerns: B12 likely inert (re-login = new actor = scope change; inferred) → residual, not closed; "never expire" = per-tab sessionStorage; backend command-key retention unknown (escalate); view-as purge test.
- ESCALATE (owner, now): lib/mtproto + components/mtproto are byte-identical on origin/main a1dd0ffe and team head (measured), so the 5 G50a fail-open brakes ship in the main code today. A fix parked on the team branch protects no live fan until promotion.
- #409 G36 Flash: legacy fan route (app/clones/[id]/fans) same bugs + cross-tenant read; /ai write-tools coercion; refill loop uncapped → fix round queued (/tmp/g36-r1-findings.md), starts when a worker slot frees (cap 2: #408 round, G50a).
- 13:5xZ #406 zane-demo verify red: check-creator-demo.mjs:60 expected creator-branch 403; G25 makes a bare Referer take admin branch (307 /twin). Test updated (TEST-CHANGE), head 6c63a00c. Local Node 23 also red at :63 on base (ALS null in route, measured); CI Node 22 decides. #408 r1 head 8411225a, body updated, CI running. #410 G50a opened (3fe6cc1e), Flash + Opus final (Codex quota out until 11-17, measured) running. G36 r1 resumed. G28c (C1+C2) worker started.
- 14:0xZ #410 Opus final (codex sub, native reviewer) APPROVE. New follow-ups G50c (send path, in scope): (a) creator pause writes clones.status only, worker never reads it, so a paused creator's running live run keeps sending (inferred; fix: pause also sets userbot_connections.paused); (b) F3 fingerprint is recomputed at review click, not taken from dry-run episodes (inferred). P3 currentMtprotoLimits defaults fallback -> fold into #410 with PR-body claim narrowing after Flash. Batch-2 Flash merged: C2b race BLOCKER + C10 -> G28c; C11 createCloneRow drops stripped -> G16c with C3; C12 -> POST-FIXMODE.
- 14:1xZ #408 G04c3h MERGED 4db5687a (CI green, fast GREEN @8411225a, Flash rwl + codex r0 fixed in r1). Residual: B12 inert for operators (re-login mints new actor hash), manual-send storage-full refusal silent (OnlyFansWorkspace, G07d), inbox-no-selection purge (G07d).
- RECOUNT @53 (inferred): open actionable groups 41 (blk 2: G50a, G28c[C2b] · rest sec-money/maj/send). Fixed-by-us +1 (G04c3h). Follow-ups added +3: G28c (C1 C2 C2b C10), G16c (C3 C11), G50c (worker-side pause + reviewed-set, escalation). Under 50: review lanes may resume.
- 14:2xZ #406 G25 MERGED 7f9c7b7e (CI all green incl zane-demo verify on Node 22, so local Node 23 :63 red is env-only, measured; no file overlap with #408). Merge count 54; batch rwl 3 due at 56 (#408 #406 + next 2); Fable due 56. G07d unblocked (needs slot). #411 G28c opened, r1 findings (Opus final + Flash: 1 blk, 3 maj) queued; worker held for cap 2 (G50a r1, G16c running). RECOUNT @54 (inferred): 40 open (blk 2), fixed-by-us +1 (G25).
- 14:5xZ #409 G36 MERGED 2910e048 (CI green, fast GREEN @1ef63f0c; codex P1 unblock TOCTOU closed by conditional update f255172f, Flash fixed in r1; page adminOnly matches server). Residual: G36b history-first delete non-transactional (low, Fable Q3); screenshots owed at live restart. #410 G50a r1 fb5502d6 (Flash fixes; tests push LOC over 300, flagged), CI running. G28c r1 resumed. RECOUNT @55 (inferred): 39 open (blk 2: G50a, G28c), fixed-by-us +1 (G36), follow-ups +0.
- 15:0xZ OWNER blk+maj only (FIX-MODE 11:4xZ) applied: G07d minus B7/B8 (worker told; B10 also parked), G28c r1 minus item 6, D2-C5 already folded into #412 (C11 round) and parked if a fix round reverts it; G36b parked. All one-liners in POST-FIXMODE "Dashboard minors parked". No P-M* batches in this queue (measured, grep). #412 G16c opened (e9cd16d4): Flash + Opus final + CI running; follow-up twin-bot clonify FACT_KEYS still sends ethnicity/occupation → 400 until it maps to ethnicity_tags/cover_story (escalate). G07d worker started (fix-g07d off 2910e048: B1 B6 B11 B13 + storage-full silent refusal + no-selection purge). RECOUNT @55 blk+maj only (inferred): 39 (no minor-only groups were in the queue; scope freeze already excluded them).
- 15:2xZ OWNER 14:2xZ Telegram/MTProto OUT OF SCOPE: G50a #410 stopped at fb5502d6 (PR open, branch kept, CI wait stopped), G50b + G50c parked; mtproto-on-main ESCALATE resolved (no main hotfix). POST-FIXMODE "Telegram (owner: no fix)". Batch rwl 3 excludes telegram surfaces. Correction: P-M1/P-M2/P-M3 minor batches DO exist (item 4 above; earlier grep was truncated) → POST-FIXMODE. #412 G16c r1 78f738f5 (retired keys 200 + notStored, not 400; clonify compatible), fast + CI running. Next blk/maj group: G26 agency actor scope (TRIAGE-FLASH P11), starts at the next free worker slot (G28c, G07d running). RECOUNT @55 blk+maj (inferred): 36 (−G50a −G50b −G50c), blk 1 (G28c).
- 15:3xZ OWNER GO 14:3xZ: job = close batch-rwl barrier then restart + check.sh live GREEN; restart after every barrier clears. Barrier now: batch1 B1/B6/B11/B13 (G07d worker), batch2 C1/C2/C2b/C10 (#411 G28c r1 worker) + C3/C11 (#412 G16c r1, fast+CI running). Clear = those 3 merged → STACK.lock restart, build, check.sh live, G36 screenshots. DONE = 0 blk · <10 maj · lanes reviewed (supervisor lanes) · all merged fixes live → stop + report, no main.
- 15:4xZ #412 G16c MERGED e480e3d8 (56; CI green, fast GREEN; r1 closed the Opus-final + Flash blk, retired keys 200 + notStored + system_logs, money/unknown still 400; C5 kept in PR since already tested). Batch2 C3/C11 closed. RECOUNT @56 blk+maj (inferred): 35, blk 1 (G28c, #411 r1 delta APPROVE, CI running). BATCH RWL 3 started on frozen rwl-batch3 @e480e3d8 (2013dd9c..e480e3d8: #408 4db5687a, #406 7f9c7b7e, #409 2910e048, #412 e480e3d8; non-test 26 files +396/-175): Opus correctness + Flash, blk/maj only, telegram excluded, codex out (quota until 11-17). Batch-3 blk/money = barrier items. Fable @56 consult sent. G26 worker running (fix-g26).
- 15:5xZ FABLE @56: Q1 G16c retired-keys 200+notStored YES (pin-key-set test → POST-FIXMODE). Q2 keep C5 YES, but it is a money default: measured both create paths seed credits from getCloneDefaults (route.ts:74, form via page) before `...CREATE_CREDIT_DEFAULTS` spread at actions.ts:1134 is overridden by rowFromForm, so the fallback is unreached in practice (inferred) → owner one-liner. Q3 G28c declined public_path step ACCEPT. Q4 batch-3 blk/money gate this restart; restart from a pinned SHA = e480e3d8 + #411 + G07d + batch-3 blk fixes (delta review only); G26 HELD until after restart. Q5 DONE is joint: report my 3 conditions at SHA X + quote supervisor lane status; ask supervisor to drop Telegram lanes. Concerns adopted: batch 3 without codex is a weaker barrier → adversarial Opus DA on #408/#409 launched, codex re-run on the range before any promotion; any maj→minor downgrade needs a reviewer's agreement in this log; G07d told to ship B1/B6/B11/B13 first if the other 2 slip.
- 16:0xZ BATCH RWL 3 Opus: REQUEST CHANGES, 2 maj, 0 blk (/tmp/rwl-batch3/FINDINGS.md). D1 #408 manual-send fail-closed refusal silent → already G07d scope. D2 #409 dashboard block writes no blocked_reason so non-admin unblock is dead for every dashboard block (measured: only bot blockUser writes "operator") → new G36c (maj), next slot. Neither is blk/money → no extra barrier. Flash + adversarial DA (#408/#409) pending. RECOUNT (inferred): 36 (+G36c).
- 16:1xZ #413 G26 opened (f9e4126f, off 2910e048; non-test +36/-146, tests +226): invite code URL→60s httpOnly cookie, link route refuses foreign-clone unlink/move + fails closed on read error, dead creator-cut Save deleted (middleware 403 kept as the brake; owner decision if agencies should set cut, needs agency POST route + G31 lib F1). Flash + Opus final (auth) + CI running. MERGE HELD until after the barrier restart (Fable Q4). New follow-up G26b (maj, auth/secret): team invite token in URL app/agency/team/manage/route.ts:21 (+ agency-admin creator-codes :78, admin-only) → reuse cookie helper; scripts/check-agency-team-onboarding.cjs + build-agency-trial.cjs depend on it. G36c worker started (fix-g36c off e480e3d8). RECOUNT (inferred): 37 (+G26b; G26 closes at merge).
- 16:2xZ #411 G28c MERGED 29499174 (57; CI green, fast GREEN @4771327d, r1 delta APPROVE). Batch2 barrier C1/C2/C2b/C10 closed; blk 0 (inferred). Adversarial DA on #408/#409: D2 confirmed (+ hiding fixture → G36c), D1 confirmed (G07d), NEW D3 inbox workspace not keyed by operatorScope → possible dup send after re-login (send dup = barrier, folded into G07d), D4 moot. Barrier now: G07d (B1 B6 B11 B13 D1 D3) + batch-3 Flash pending. RECOUNT @57 blk+maj (inferred): 36 (−G28c), blk 0 open as groups but D3 is barrier.
- 16:3xZ #413 G26: Opus final APPROVE (3×P3 parked); Flash REQUEST CHANGES F1 MAJOR confirmed by code read (measured): linking to a shared clone deletes another agency's creator link (RPC deletes other links when platform_creator_id null) → G26 r1 (/tmp/g26-r1-findings.md), queued for next slot (cap 2: G07d, G36c); #413 is held to after restart anyway. RPC-level atomic fix needs a migration → parked/owner.
- 16:4xZ BATCH RWL 3 Flash: REQUEST CHANGES. F-a B12 re-login purge → dup (claims blocker; was Fable @52 residual), F-b G36b (claims blocker; parked @52), F-c G16c 060/063/042 facts 400 (maj, propose minor). Fable consulted on all three (hard call). #413 CI: 1 fail = check-creator-sign-in-ui.mjs:184 click intercepted TimeoutError (creator platforms modal, untouched by #413 → flaky, inferred); failed job rerun.
- 16:5xZ #414 G07d opened (f0d921ef off 2910e048; non-test +84/-29, tests +380/-10; fast GREEN 39, rules 980/981 + 1 todo, tsc ×3 clean, measured by worker): B1 B6 B11 B13 + D1 visible storage refusal + D3 workspace keyed by scope + scope entered on mount (no-selection claim was reversed: stale holds were NOT purged). 3 TEST-CHANGE lines. Flash + Opus final (send) + CI running. New follow-ups: G07e (maj, inv 7) Plan C console approve/hand back ignore the STOP hold; G07a-backend: backend accepts campaign create with automation disabled (backend lane, escalate). G26 r1 (F1 shared-clone) resumed in the G26 worker slot. Slots: G36c, G26 r1. RECOUNT (inferred): 37 (+G07e).
- 17:0xZ FABLE @57 on batch-3 Flash: F-a BLOCKER (barrier, gates this restart + send re-enable) → G04c3i (/tmp/g04c3i-findings.md): one stable dedupe identity (agency grant.actor | internal constant) for held-store scope AND commandKey digest first element, manual send + campaign create; audit actor stays per-session; live proof on local stack (reply dropped → re-sign-in → retry → exactly one). Starts after #414 merges (same files), next slot. F-b stays parked, counted MAJOR (not blocker); condition "error says history already gone, retry" met (measured app/users/actions.ts:279). F-c minor, Fable agreed (reviewer agreement for the downgrade) → POST-FIXMODE. Barrier now: #414 + G04c3i. RECOUNT (inferred): 38 (+G04c3i; G36b counted maj).
- 17:1xZ #414 G07d: Opus final + Flash both REQUEST CHANGES → r1 (/tmp/g07d-r1-findings.md): bulk Enable-AI bypasses STOP hold (blk, both), goHold optional→required (maj), Plan C approve/handback ignore hold (blk, was G07e, folded), stop hold per-tab sessionStorage vs "another tab" claim (maj). Deny-hold-never-lifts minor + B7 stay parked. r1 waits for a slot (G36c, G26 r1 running), first in line, then G04c3i. RECOUNT (inferred): 37 (G07e folded into G07d).
- 17:3xZ G36c → PR #415 head 151a03c2 (prod 30 / tests 145 LOC; over 300? no, 190 total). check.sh fast GREEN, test:rules 981/0 (worker, measured). Adds narrow agency-write allowance (reason='operator' stamp only) → auth path: Flash + Opus final running, CI wait. #414 r1 handed to G07d worker (slot freed).
- 17:4xZ #415 G36c Opus final REQUEST CHANGES, 3 maj (/tmp/g36c-r1-findings.md): agency-write stamp not exact + flip/stamp race (→ one conditional PATCH, exact boundary); stale 'operator' survives unblock (→ clear on unblock); admin/AI blocks get operator stamp (→ stamp only for agency caller, decided). r1 → G36c worker. #413 G26 r1 c49bfbb1 (F1 shared-clone refused, fails closed; fast GREEN 39, rules 979/0) → Sonnet delta + CI running; merge still held to after restart. G29 (catalogue/PPV money) next free slot (cap 2: G07d r1, G36c r1). RECOUNT (inferred): 37.
- 17:5xZ #413 G26 r1 Sonnet delta APPROVE (F1 CLOSED, read-only proof); minor null-data → POST-FIXMODE G26-m4. CI wait running; merge held to after restart.
- 17:5xZ #415 Flash REQUEST CHANGES: NEW BLOCKER blocked_at not cleared on unblock → fan still catalogue-gated after unblock (measured, lib/catalogue-core.ts:32); major = Opus #1. Folded into G36c r1 (worker). RECOUNT (inferred): 37 (same group).
- 18:0xZ #414 G07d r1 9a962105 (items 1/2/4/5; prod +75/-28 tests +212/-27 vs f0d921ef; fast GREEN 39, rules 987/0 + 1 todo, tsc ×4 clean, plant-back 11/11 red, measured by worker). Residual: localStorage blocked → in-memory per-page hold (in PR body). Body updated; Sonnet delta + CI running. G29 worker started (fix-g29 off 29499174, catalogue/PPV money truth, classify blk/maj first). Slots: G36c r1, G29.
- 18:1xZ #414 r1 Sonnet delta: items 1/2/4/5 CLOSED (file:line); A maj inv 8 missing TEST-CHANGE on 4 fixture-moved tests → fixed by orchestrator de7d5797 (comment-only, G07 46/46 measured); minors B/C/D → POST-FIXMODE G07d-m4..m6. Fast + CI running @de7d5797; merge when green (then G04c3i).
- 18:2xZ #415 G36c r1 4f6391c3 (single conditional stamp/clear, admin+AI blocks unstamped, unblock clears blocked_at, exact operatorStampWrite 15 shapes rejected; bot grep: minor/us_location gates don't read blocked_at, measured; prod 57 tests 193 vs base; fast GREEN 39, rules 987/0, plant-back 8/8). Sonnet delta + CI running. Free slot reserved for G04c3i (starts at #414 merge).
- 18:4xZ #414 fast GREEN 39 @de7d5797 (measured), CI pending. #415 Sonnet delta: 2/3/6 CLOSED, 1 PARTIAL (bare agency {blocked:false} admitted at boundary, pre-existing) → orchestrator fix b2b70028 red-first (3 shapes), tsc clean, rules 987/0, fast GREEN 39 (measured); body updated; CI pending.
- 18:3xZ #416 G29 opened 0b8cc65d (red ce5569d8): TON timeout→pending, per-item TON order reuse, Stars/TON lock, funnel selectAllRows + incomplete alert, PPV 400/413 logged, ingest bound 2, bundle floor. prod +88/-37, tests +561 (OVER 300 from tests only). fast GREEN 39, rules 1006/0 (worker, measured). Flash + Opus final (money) + CI running. Queued G29b (maj): Moxy price range j H2; TON order lost on reload (server-side pending reuse); PPV 401/403 "uploaded" no log (owner 2026-10-10). Minors G29-m1..m3 → POST-FIXMODE. G35 (sec-money) next; G04c3i after #414 merge.
- 19:0xZ MERGED #414 G07d → c51c7f6f (CI 6/6 pass, fast GREEN 39 @de7d5797, measured). Merges 58. #416 Opus final REQUEST CHANGES: 2 maj (payTip false cancel + re-mint double charge; ingest queue no timeout/no depth cap) → G29 worker r1; 4 minors → POST-FIXMODE G29-m4..m7. G04c3i (barrier blk) worker started off c51c7f6f. G35 worker PAUSED (cap 2: G29 r1 + G04c3i), resume via SendMessage when a slot frees. RECOUNT (inferred): 36.

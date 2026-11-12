# Dashboard FIX-QUEUE (fix-orchestrator, 2026-11-12)

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

## Queue order (serial, one fix worker)
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

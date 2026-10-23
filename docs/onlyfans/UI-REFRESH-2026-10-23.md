# OnlyFans UI refresh

The OnlyFans workspace now has its own read-only Overview and a shared light-blue visual system. Its navigation is Overview, Accounts, Inbox, Campaigns, Content, Sales, Settings and Operations. The All channels and Telegram workspaces retain their existing presentation.

The refresh starts from combined integration commit `7c0d0fd5fba92df61ff78dd7b1f8c6dd7a08e664`, including all four commits that arrived during implementation. It preserves existing route guards, API contracts, mutation handlers, revision checks, account controls, content import/sync, personality, memory, engagement and ledger work. The agency page allowlist adds only GET/HEAD access to the new Overview; operator-only Operations access is unchanged.

The new Overview uses existing workspace earnings and account health, plus one named account's latest sales page. Workspace totals are explicitly labelled, original currencies are preserved and unavailable data stays unavailable. The current earnings contract has neither creator-filtered totals nor a verified daily series; Account activity fills the lower-left panel rather than inventing a revenue chart. The page does not send, start sync work or change automation.

Accounts use creator photos already supplied to the shell, with initials as a fallback. Content uses Vault/Offers tabs. Sales separates transactions from open offers, retains pending/refund states and preserves compact currency/status totals and cursor pagination. Settings has Personality, Reply settings and Account panels that remain mounted to preserve unsaved edits; save/retry behavior is unchanged. The Inbox keeps existing actions and delivery uncertainty, with secondary unavailable-action explanations and delivery history in expandable sections. Operations groups all existing counters without dropping evidence.

## Verification

Twenty-one relevant command suites passed: channel integration; the new UI/read-only Overview check; OnlyFans preview, reads, unconfigured states, operations, agency scope, workspace contracts, configuration, controls, campaigns, content, vault, vault previews, vault editing, vault media, public-origin regression, launch A, launch B, launch access; and combined earnings.

`npx tsc --noEmit --incremental false`, `npm run build` and `git diff --check` passed. The new UI check also renders real presentation components to verify pending/original-currency semantics and read-only Settings panels.

The synthetic browser review rendered all eight pages at 390, 430, 768 and 1440 pixels and checked each page heading before measuring its main content. All 32 cases had no horizontal page overflow. Sales/Open offers switching and retention of an edited persona across Settings tabs were checked in the real shared components. This is component/browser presentation evidence, not live-account or provider acceptance. Review fixtures and their navigation shim live only under `preview/`; no production route falls back to them.

## Release integration

Apply this UI change through the combined OnlyFans release branch. The production site and live automation settings were not changed during UI implementation. Run the combined candidate's normal integration/release acceptance and authenticated account read checks before deployment. Existing live permissions and delivery settings must remain unchanged by the release.

Use `node preview/onlyfans-ui/build.mjs` for a repeatable synthetic component review, or `node scripts/preview-onlyfans-ui.mjs` for the isolated Next review harness. See the review README for its API refusal boundary.

## UI release to production

The owner requested immediate publication on 23 October 2026. This release applies the visual changes to current main `0b2a88e02a58fc5b1724d8cf45d4e2ef727e0b68`, preserving the Live Telegram UI. Pending offer import and launch controls remain in their existing integration PR. NativeWorkspaceView includes only currently released functionality. The integration version in PR 253 retains those pending features for the combined release. UI regression assertions now cover the approved OnlyFans shell separately while preserving shared Main/Telegram geometry.

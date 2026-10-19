# Creator connection scope — 20 October 2026

## Binding decision

Use Twin's self-hosted OnlyFans connector on Twin's own infrastructure. OnlyFansAPI.com is explicitly excluded. Do not introduce that service, its SDK, a provider account, or its billing as a prerequisite. Any future connector decision must preserve this constraint unless Jesse explicitly changes it.

Reuse the existing canonical creator identity, agency assignments, invitations, onboarding, content storage, native enrollment, account-owner verification and worker. Avoid parallel creator stores or messaging engines.

## This candidate

Dashboard base: be0f97d3ca06e85789357fe9e7515a303480e0a7.
Existing native backend base: 995d031b326df68f39d488b5bc487549d0626307.

Direct OnlyFans and Telegram actions replace checkbox selection plus Save platforms. They reuse the protected setup route and canonical-profile RPC and retain the other selected platform. Creator pages keep their current brand palette. Only the connection route suppresses redundant onboarding/content banners; other creator pages keep their shell behavior.

An installed Twin desktop connector starts once from the primary action and resumes an existing connection attempt. The dialog closes only after a new enrollment is accepted and its account connection is verified and unexpired. Pending verification never appears as Connected. The existing agency-assisted input remains available in a collapsed section.

This candidate still uses the desktop connector. It does not implement a completed server-hosted creator login, and mobile cannot yet complete the desktop-dependent path. Do not claim that the target installation-free experience is live or complete.

## Remaining work

Complete creator sign-in using Twin's own infrastructure and existing capture/connector capabilities. First establish which existing browser/capture components can be hosted and reused; define the authenticated creator-to-attempt binding, session handoff, network/proxy continuity, expiry, cancellation and cleanup before adding infrastructure.

Keep sign-in and verification simple on the creator page. Technical credentials and session files must not become requirements for an ordinary creator. A browser success signal alone must never establish account ownership: retain worker-side proof of the exact numeric OnlyFans owner and the existing canonical binding.

Preserve existing agency/operator controls over outgoing activation. Test the completed self-hosted path with an explicitly authorised account before release. Account selection and creator sign-in are the eventual human inputs; an OnlyFansAPI account/key is not required.

## Withdrawn vendor experiment

The OnlyFansAPI dashboard commits a4fe5ff and 3698f1b were reverted from the active candidate. The corresponding native backend PR is withdrawn. Neither experiment was deployed. Its simulated-provider tests are not evidence that Twin's self-hosted login has been completed.

## Verification

- node scripts/check-creator-platforms.cjs
- node scripts/check-creator-platforms-ui.mjs
- node --import tsx scripts/check-creator-workspace.ts
- npm run build

The UI harness uses synthetic connector messages and HTTP fixtures. It verifies layout and route behavior, not a real OnlyFans login. The restored functional source matches the previously validated d6dfe13 candidate; ownership/UI checks are rerun after restoring it.

# Creator connection scope — 20 October 2026

Use Twin's self-hosted OnlyFans connector. OnlyFansAPI.com, its SDK, accounts and subscriptions are excluded. Reuse the existing creator/agency identity, invitations, onboarding, content storage, encrypted enrollment, numeric account-owner verification and worker.

Dashboard candidate: PR #197, based on be0f97d3ca06e85789357fe9e7515a303480e0a7. Native candidate: PR #3, based on 995d031b326df68f39d488b5bc487549d0626307.

## Implemented behavior

Direct OnlyFans and Telegram actions reuse the protected setup route and canonical-profile RPC. Selecting either preserves the other platform, current agency and content. Creator pages retain their existing brand palette.

When the private self-hosted sign-in service is configured, OnlyFans opens its temporary browser inside the existing creator dialog on desktop or phone. The creator signs in, confirms the detected handle and waits for the existing worker's ownership verification. The dialog closes only after a new accepted enrollment has a verified, unexpired connection. Opening login, capturing a session and pending verification are never presented as Connected.

The installed desktop connector remains the fallback when the private service is not configured. It starts once and resumes its active attempt. Agency-assisted input stays in a collapsed section; it is not required in the new hosted creator flow.

Connection does not activate outgoing messages or replace existing agency/operator controls. Native reconnect preserves the current proxy and model configuration and rejects a changed network assignment before provider I/O.

## Release state

The self-hosted implementation and fixture tests are in the paired candidates. The hosted experience is not live until the new private browser container, matching native API/worker and dashboard environment are deployed and verified. Physical phone input, the real provider login/challenges, numeric owner verification, sync and reconnect require the selected creator's pilot.

See `SELF-HOSTED-SIGN-IN-2026-10-20.md` for boundaries, reuse and checks, and the native `creator-sign-in/README.md` for deployment/rollback. No provider key or subscription is needed from Jesse.

## Withdrawn work

The earlier vendor dashboard commits a4fe5ff and 3698f1b were reverted; native PR #2 was withdrawn. Those experiments were never deployed and their simulated-provider tests are not evidence for this self-hosted release.

# Creator connection candidate — 20 October 2026

Dashboard base: be0f97d3ca06e85789357fe9e7515a303480e0a7.
Backend base: 995d031b326df68f39d488b5bc487549d0626307.
Neither candidate is deployed. Hosted connection defaults off.

## Creator experience

The existing creator page keeps its brand palette, shell, profile, content and agency. Direct OnlyFans and Telegram actions replace checkbox selection and Save platforms. The protected setup RPC adds a selected channel to the same canonical profile and retains the other channel. Existing invitations and onboarding are reused.

With hosted connection configured, Connect OnlyFans creates one server-owned client session and opens the pinned @onlyfansapi/auth 2.1.0 embedded sign-in. It runs outside the native desktop dialog so the provider overlay remains visible. Password/initial verification entry belongs to the provider. Reconnecting an existing hosted account resumes that provider account, with a verification-code or supported identity-check screen when needed. It does not create a second Twin profile.

The browser's success callback only changes the progress message. A correctly signed accounts.connected webhook, current creator/profile/agency checks, durable native enrollment, and worker-side /me owner verification must all succeed before Connected is shown. The worker can sync initial history with delivery disabled. The existing agency/operator activation controls continue to govern outgoing messages.

When hosted connection is off, the existing desktop extension and collapsed agency-assisted capture form remain available. An installed extension starts once and resumes an existing attempt. Unsupported mobile setup is described honestly.

## Integration and reuse

OnlyFansAPI does not currently document a supported export of all native session/signing material. The candidate therefore adds an account-bound wire adapter to the existing native connector, rather than assuming hosted account IDs are native cookies. The existing intake, message parsing, model, media catalogue, one-use dispatch authority, encrypted credentials and creator bindings remain their owners. No new creator/vault store or database schema is introduced.

Canonical IDs remain of-{numeric OnlyFans owner}; provider acct_ IDs are encrypted transport references. Descending message pagination maps to first_id and requires explicit provider pagination evidence. Every send still consumes the existing one-use authority and uses the durable intent as the provider Idempotency-Key. Unknown POST outcomes are not retried.

Hosted connections use a renewable 23-hour health lease with identity probes. Lease renewal does not alter credential revision, delivery allowance or independently stopped runtime state. Paused connections remain paused. Only transient identity GET failures receive bounded enrollment retries (15 seconds, at most 60 attempts / 15 minutes).

## Configuration before a real-account pilot

Set these only on the candidate services after provider access is selected:

- ONLYFANS_HOSTED_CONNECT_ENABLED=1 on dashboard, native API and worker.
- OFAPI_API_KEY on dashboard and worker; server-only, distinct from Twin's internal ONLYFANS_* purpose tokens.
- OFAPI_WEBHOOK_SECRET on dashboard, at least 32 random characters; register the same signing secret at the provider.
- Optional OFAPI_PROXY_COUNTRY: us (default), uk or gb.
- Keep the existing ONLYFANS_CONNECTION_TOKEN / encryption key and scoped backend configuration.
- Register signed accounts.connected events at https://dashboard.tgaiclone.xyz/creator-auth/platforms/onlyfans/events.

No provider key was present in the live service configuration names checked. No subscription, real account connection, provider write or deployment was made during implementation.

## Remaining release gates and explicit limits

Provider access and one explicitly authorised real OnlyFans account are required to verify the actual embedded UI, signed event delivery, initial history/vault shapes, reconnection and expiry. Automated checks use simulated provider responses, not live provider compatibility. Do not merge or enable this candidate as a completed live integration until those checks pass.

OnlyFansAPI documents an Auth+ iPhone app requirement for v2 Face Authentication; universal installation-free or two-second completion cannot be promised. Unsupported reconnection verification directs the creator to agency help. Existing native captures with a private proxy cannot silently switch to provider-managed networking.

Hosted earnings import is explicitly held as unsupported: provider marker/startDate pagination differs from the existing native ledger's offset/window protocol. It needs a separately verified adapter. Existing native earnings import remains unchanged. Hosted CDN previews, vault writes, special message types and provider response sizes beyond the bounded native dialect also require pilot verification; no feature-parity claim is made.

## Verification

- node scripts/check-creator-platforms.cjs
- node scripts/check-hosted-connect.cjs
- node scripts/check-creator-platforms-ui.mjs
- node scripts/check-hosted-connect-ui.mjs
- node --import tsx scripts/check-creator-workspace.ts
- npm run build
- Backend Creator platform acceptance workflow includes hosted wire/ownership/lease/intake/one-use-send tests alongside native connection, enrollment, recovery, ledger, planning and worker regression tests on isolated PostgreSQL.

The browser harness proves mobile/desktop layout and progress behavior with an SDK simulation. Screenshots contain synthetic creators. Build warnings inherited from Supabase Edge Runtime and Windows standalone symlink handling are recorded separately from release verification.

Primary integration references:
https://docs.onlyfansapi.com/auth/quickstart
https://docs.onlyfansapi.com/api-reference/client-sessions/create-client-session
https://docs.onlyfansapi.com/webhooks/available-events
https://docs.onlyfansapi.com/webhooks/protecting-your-webhooks
https://docs.onlyfansapi.com/api-reference/connect-onlyfans-account/re-authenticate-account
https://docs.onlyfansapi.com/introduction/essentials/idempotency

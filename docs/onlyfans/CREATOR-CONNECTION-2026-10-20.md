# Creator connection page — 20 October 2026

Status: UI implementation for review. Installation-free OnlyFans authentication is not implemented or released.

Base dashboard commit: be0f97d3ca06e85789357fe9e7515a303480e0a7.
Existing native backend remains at 995d031b326df68f39d488b5bc487549d0626307.

## Implemented

- Direct OnlyFans and Telegram actions replace checkbox selection plus Save platforms.
- Actions reuse the current protected setup route and canonical creator-profile RPC, preserving the other selected platform.
- Existing agency invitations, profile/content storage, onboarding routes and permission checks are reused.
- The connection route suppresses redundant content/onboarding banners. Other creator pages keep the existing shell behaviour.
- The page inherits each existing creator brand palette.
- An installed desktop Twin Connect starts from the primary action. Opening the dialog again resumes an existing connection attempt.
- The connection dialog returns to the page only after a new enrollment is accepted and its account has a verified, unexpired connection.
- Pending verification never appears as Connected. Expired connections show Reconnect.
- Agency-assisted file input was moved intact into its own component and remains in a collapsed section.
- The mobile fallback explicitly describes the existing desktop requirement.

## Unresolved hosted authentication dependency

OnlyFansAPI documents an embedded modal through @onlyfansapi/auth and short-lived client sessions:
https://docs.onlyfansapi.com/auth/quickstart
https://docs.onlyfansapi.com/api-reference/client-sessions/create-client-session

That establishes sign-in UI availability; it does not establish compatibility with Twin's native transport.
The provider's March 2026 changelog links a Get Session Data endpoint, but on this investigation the link returned 404 and neither its current OpenAPI schema nor llms.txt included that endpoint. Export support must be confirmed and tested rather than assumed.

Twin's current enrollment requires native cookies, signing headers/rules and an owner-bound verification step. An account ID returned by a hosted login is insufficient. Accepting a browser success callback as a Twin connection would be incorrect.

No provider-specific OFAPI key was found among the live dashboard/API configuration names checked. Existing ONLYFANS_* tokens are Twin's internal service credentials and must not be repurposed as third-party keys.

The candidate provider also documents an Auth+ iPhone-app requirement for v2 Face Authentication:
https://docs.onlyfansapi.com/introduction/guides/connect-onlyfans-account

## Gate before installation-free release

1. Obtain access to the chosen provider account without embedding keys in browser code.
2. Confirm its supported session-export handoff, proxy compatibility and renewal semantics. If it requires a transport adapter instead, define that explicitly before changing the architecture.
3. Bind sign-in attempts to the authenticated canonical creator and validate completion server-side.
4. Prove verification, initial sync, expiry/reconnection and wrong-account refusal with one explicitly authorised real account.
5. Keep outgoing-message activation under the existing agency/operator controls.

No new creator/vault store, messaging engine, database schema or paid provider subscription was introduced. No real OnlyFans login or message send was attempted.

## Validation

The UI harness uses synthetic connector messages and HTTP fixtures. It proves UI behaviour and ownership-route integration in isolation; it does not prove a live OnlyFans connection.

Run:

- node scripts/check-creator-platforms.cjs
- node scripts/check-creator-platforms-ui.mjs (CHROMIUM_PATH set on the Windows workstation)
- node --import tsx scripts/check-creator-workspace.ts
- npm run build

The first production build passed with the existing Supabase Edge Runtime warning and a Windows standalone-output symlink warning. Those warnings are not a claim that the Windows standalone package is deployable.

# Self-hosted creator sign-in implementation — 20 October 2026

Status: implementation plan based on repository inspection, not a completed hosted login.
Dashboard candidate: PR #197. Native source inspected: 995d031b326df68f39d488b5bc487549d0626307.

## Creator experience

Keep the existing creator studio and canonical profile. The creator chooses Connect OnlyFans, signs in on the genuine OnlyFans page, confirms the detected account and returns to Twin. A password, two-factor prompt or provider challenge can take longer than two seconds; the Twin steps should be short. Desktop and phone use the same connection states.

No external OnlyFans API subscription, SDK or account is part of this implementation.

## Reuse inventory

| Existing component | Reuse |
| --- | --- |
| Dashboard platformCommand / platformProfile | Authenticate the actual creator, reject read-only views and foreign origins, resolve the current canonical profile. |
| Existing agency invitations and onboarding | Retain current agency assignment, creator account, requested channels and stored content. |
| loginExtension/interceptor.js | Capture complete signed provider requests and minimal /users/me identity; use this source rather than a second interceptor. |
| Native validate_browser_payload / normalize_browser_payload | Validate the existing of-browser.v1 payload, derive signing rules and check the captured signatures. |
| Native connection enrollments | Encrypt submitted sessions, preserve exact command retries, verify numeric provider ownership before canonical provisioning. |
| Existing connection records and worker | Store one canonical connection, retain revision checks, expiry and operator-controlled outgoing activation. |
| Current CreatorPlatforms connection states | Show pending, verified and expired honestly; opening a browser or capturing cookies is not Connected. |

## Why the old capture launcher cannot be exposed

At native commit 995d031, service/session_bootstrap.py contains run_playwright_proxy, but its imported capture_session_proxy module is absent from tracked files and from the inspected checkout. The launcher adopts sessions into the legacy account registry and defaults make_active to true. It is not a ready creator endpoint for the native enrollment path.

The Electron capture window is also a desktop path, not an existing phone-accessible hosted login. The native runtime Docker image contains no interactive browser/viewer. Do not expose the legacy bootstrap, install the old dashboard or introduce another creator registry.

## Implementation order

1. Add a short-lived sign-in attempt behind the current protected creator route. Bind it to tenant, authenticated creator account, canonical profile and an unpredictable attempt ID. Repeated starts resume the active attempt; changing creator, cancellation or expiry invalidates access. Before allocating a browser, apply creator and tenant capacity bounds.
2. Run an isolated browser session on Twin infrastructure for that attempt, with a private authenticated viewer usable from desktop and phone. Keep the browser-control endpoint private. Viewer access must be scoped to the signed-in creator and expire with the attempt; no durable viewer bearer token in URLs. Do not record keystrokes, login screenshots, network bodies or authentication cookies.
3. Freeze the runtime network configuration before login. For reconnect, reuse the account's assigned proxy. A first account needs an operator-configured network assignment. Capture, signing normalization, identity verification and later runtime requests must use the same assignment, with no automatic direct fallback.
4. Reuse the existing interceptor in that browser and produce the existing of-browser.v1 envelope. Bound the attempt, capture size and capture lifetime. Capture is held privately for confirmation, never returned by a public status endpoint. The hosted browser must not access other creator sessions.
5. Show only the detected handle and progress to the original creator. Confirmation uses the current authenticated profile again and submits through the existing encrypted enrollment boundary with a stable command key. A lost acknowledgement resumes that same attempt; it must not attach or submit a second account.
6. Let the existing worker normalize and verify the exact numeric OnlyFans owner. The browser's success event is insufficient. Preserve foreign-owner refusal and existing canonical binding. Connecting must not activate outgoing messages, allocate a sending allowance or imply history has synced before that actually happens.
7. Close and remove the browser session and transient capture on accepted handoff, cancellation, timeout, failure or runtime shutdown. A restarted browser job cannot revive an expired attempt.

A new transient browser-attempt record may be needed before the OnlyFans owner is known. It is a lifecycle record only: it must not become another creator identity, vault, messaging engine or provider-connection store.

The hosted path must have accurate privacy copy. A password is entered on the provider page inside Twin's remote browser; do not copy the desktop extension claim that the password never passes through Twin infrastructure. Do not store passwords or replay credentials automatically.

## Verification before release

- Run the existing creator identity/ownership, canonical-profile, inbox and platform UI checks.
- Exercise the browser and handoff against local fixtures first: creator switch, crossed attempts, unrelated tabs, capture mismatch, duplicate start/confirm, lost reply, expiry and cancellation.
- Confirm failed proxy configuration cannot silently switch egress and that restart/cleanup removes browser access and captured credentials.
- Test phone input and provider challenge presentation; a static render is not evidence these work.
- Complete a real account pilot with the explicitly selected creator: sign-in, provider ownership check, sync, expiry/reconnect and preserved agency settings. Live sending remains a separate existing activation decision.

## Current release-check repair

The two failed dashboard jobs stopped while esbuild bundled CSS modules without an output directory. The repair emits and serves the actual JavaScript and CSS bundles in both existing fixtures. Existing navigation, earnings, mobile, brand, account-state and isolation assertions remain intact. This repair does not implement hosted login.

Local verification after the repair: creator platform ownership/route checks passed; the real earnings preview passed at 390px and 1440px; saved-content navigation passed in Chromium and WebKit for all 32 combinations of agency brand, mobile/desktop width, connected/unconnected and submitted/draft. The fixture currency-provider adapter now exports the current useCurrency hook. Both browser engines and all original assertions remain required. GitHub Actions verification is recorded on PR #197.

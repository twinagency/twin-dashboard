# Twin creator sign-in — 20 October 2026

Deployed candidate: dashboard PR #197, paired with native PR #3. The private browser, native API/worker and dashboard configuration are now enabled together on the existing Sydney server. See [deployment evidence](./SELF-HOSTED-SIGN-IN-DEPLOYMENT-2026-10-20.md). Fixture tests do not establish a successful live OnlyFans login.

## Creator experience

Choose **Connect OnlyFans**, sign in on the actual provider page inside a temporary Twin browser, complete the provider's verification, then confirm the detected handle. The existing worker verifies the numeric provider owner. The creator sees **Checking your account** until a new enrollment is accepted and its connection is verified and unexpired. The existing creator page and agency branding remain in place.

The same screen supports desktop and phone without installing the desktop extension. Credentials and provider challenges can take longer than two seconds. A physical phone keyboard and an authorised live account remain pilot checks.

## Existing systems reused

| Component | Responsibility |
| --- | --- |
| platformCommand / platformProfile | Actual creator session, origin and read-only guards, canonical creator profile. |
| Existing invitations and onboarding | Agency assignment, creator identity, requested channels and saved content. |
| loginExtension/interceptor.js | Existing signed-request and minimal account-identity capture source. |
| validate_browser_payload / normalize_browser_payload | Existing browser envelope validation, signing-rule derivation and signature checks. |
| Native encrypted enrollment and worker | Stable retries, encrypted session handoff and exact numeric owner proof before canonical binding. |
| Existing connection records | Proxy and operator settings, revision checks, expiry and separate outgoing activation. |

No additional creator registry, vault, messaging engine or external OnlyFans API provider is introduced. OnlyFansAPI.com remains excluded.

## Added connection boundary

- `/creator-auth/platforms/onlyfans/sign-in` authenticates every status, frame, input and confirmation request. Scope and actor come from the current creator session; public input cannot select another creator, proxy or operator settings.
- `creator-sign-in` in the native repository runs a separate Chromium process per attempt. Jobs expire after 15 minutes, have per-creator start bounds and a configurable small global capacity. The service uses a distinct private token. Its port is reachable only by the dashboard server.
- The genuine provider page is rendered to authenticated, non-cacheable frames. Input is serialized. The browser permits login/challenge operations and refuses message sends, purchases, arbitrary origins and popups. Provider verification is presented, not bypassed.
- Reconnect obtains the current account proxy through the private native capture-context route. An opaque network fingerprint is frozen with the capture and checked before provider requests and at canonical save. There is no direct fallback if that assignment changes.
- New connections use direct egress from the same host/network as the native worker. Moving the browser to another host requires an explicit shared proxy assignment before enabling it; the direct fingerprint alone does not prove shared public egress.
- Only the detected handle and lifecycle metadata reach public status responses. Captured cookies, signed requests, private proxy configuration and service credentials remain server-side. The password passes through Twin's temporary remote browser and is not stored or replayed.
- The browser closes at capture. Confirmation hands the same frozen envelope to the existing encrypted enrollment before acknowledgement clears transient capture. Lost acknowledgement retries the same existing command. Cancel, expiry, error and shutdown clear browser access and captured data.

## Verification

`node scripts/check-creator-platforms.cjs` exercises the real protected route with isolated identity/transport adapters: foreign creator/account refusal, private frames, read-only/view-as/origin guards, expiry, exact retry after lost acknowledgement and no outgoing activation.

`node scripts/check-creator-sign-in-ui.mjs` exercises the real creator components in Chromium and mobile WebKit: one start in StrictMode, input ordering, confirmation, uncertain-response retry, pending versus verified state, expired restart and lost authentication. All provider responses are local fixtures.

`node scripts/check-creator-platforms-ui.mjs` retains the desktop fallback and shared-profile regression coverage. The native `creator-sign-in/check.mjs` uses an actual isolated browser and the existing interceptor against a local login fixture. Native PostgreSQL acceptance covers canonical scope, network continuity, crash/retry and connection activation boundaries.

Deployment and rollback instructions live in the paired native repository's `creator-sign-in/README.md`. Before enablement, test the headed container with its Chromium sandbox on the target host and complete a selected creator's real login, verification, sync and reconnect pilot. Live sending remains a separate existing activation decision.

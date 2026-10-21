# Agency launch preparation — 22 October 2026

## Scope and source
User authorised the connection/import status correction and completion of the existing agency staff workflow.
This is an implementation checkpoint, not a live-release claim.
Dashboard base: cd0815ce12ac489229d1929da89e948672166585 (main, includes the latest loading work at checkout).
Backend base: a3eb11fe9d3849d0946b364bc5e112c1fc95fe20.
Backend candidate: 39dec86cbbc68c41dca1fdc36c465b3c722ae231.
Both owned worktrees use codex/agency-launch-status-20261022:
- C:/Users/conta/codex-work/agency-launch-dashboard-20261022
- C:/Users/conta/codex-work/agency-launch-backend-20261022

## Implemented
- A shared connection presentation distinguishes temporary provider retry, automatic renewal checks, authentication rejection, pause, and unavailable status.
- Creator screens no longer infer a definite logout from a renewable verification deadline. They refresh visible account status every 30 seconds (10 seconds during initial connection), retaining request cancellation, identity and stale-response controls.
- Connection editor reports a verification deadline, preserves typed form fields during background refresh, and does not offer outgoing activation while verification is unhealthy. First pending verification commands and exact lost-ack retries remain supported.
- Opt-in native connection GET ?progress=1 exposes existing canonical scan pages, completed/remaining conversation histories, pending/conflicting messages, recovery requirement and the last complete sync time. Ordinary GET retains its exact old shape.
- The connection read preserves explicit paused/failed state after its deadline rather than masking either as expired. No saved credentials, lease renewal, provider route, worker retry, activation or send policy is changed.
- Owner Agency access screen lists a selected agency's team and supports password-based account creation, existing membership access changes, revocation and restoration. Read-only is the creation default where supported by the existing agency policy. Fixed legacy agency permissions remain unchanged.
- Each change is fenced by agency, user, email and expected active/access flags. An old form cannot overwrite a newer membership change. Internal admin verification rejects creator/agency/mixed sessions; writes require the existing trusted form origin.
- Creator assignment remains in the existing creator management workflow. Staff currently share agency-level creator assignments; no per-member creator assignment, agency-owner delegation, email invitation flow, new role/schema or live membership change is introduced.
- Feature checks are added to the existing dashboard CI and required predeployment creator-uploads job.

## Verification completed
- Dashboard full TypeScript noEmit passed on the final source.
- Shared connection state/progress parser checks passed, including expired renewable sessions, first pending retry, auth rejection, pause, old-backend compatibility and no completion inferred from page counts.
- Owner team route and rendered-form checks passed: auth/origin, default scope, exact user/agency filters, stale changes, revoke/restore, provisioning failure cleanup, and no page-created accounts.
- Existing OnlyFans agency scope, internal-admin, Moxy owner access, connection adapters and creator-platform route suites passed.
- Actual Chromium creator-platform UI passed at desktop and phone widths, including retrying/progress view, absent reconnect prompt during renewal, no false Connected state, and session-loss clearing.
- Channel integration, unconfigured OnlyFans and preview regression suites passed.
- Next production compilation, type validation and static generation completed, exit 0. Windows standalone tracing warned that symlink creation is not permitted with the shared dependency junction; Linux production image packaging remains an external release gate.
- Python AST checks passed for the changed backend module, API and tests. The new PostgreSQL tests have NOT run. Earlier 241 checks apply to the currently deployed release, not this candidate.

## Release blocked by automatic approval review
An attempted command to prepare/send an isolated backend acceptance payload to AWS and push the feature branch was rejected before execution.
The reviewer reason: it requires explicit user approval to transmit committed source to the AWS host and external GitHub remote.
Do not bypass this rejection using another tool or indirect command. No candidate was pushed, merged, uploaded to AWS or deployed.
Finish local preparation and obtain explicit approval for these exact destinations:
- GitHub: jesse98/twin-dashboard and jesse98/twin-onlyfans-backend.
- Existing AWS account/profile tsocial, ap-southeast-2, instance i-09a9dd3bd749643a5.
The prepared local script is C:/Users/conta/AppData/Local/Temp/agency-launch-backend-prepare.cjs.
It derives exact committed files and builds from deployed image 369c750e97f5e6c8d36cdb3faa379fa80c8f6bd85bd46c4eb33fd9b095d87101, using the previously inspected isolated test owner. It has not been executed.

After approval: fetch/reconcile current branches, publish the reviewed branches, run exact-source CI and the isolated 161-unit/PG acceptance on the current production Python image. Fix failures before merging/releasing. Use the existing hash-checked, locked native release helper and dashboard release workflow, verify running digests and authenticated progress responses, preserve active uploads and outgoing settings, and document exact release evidence.
Do not replay an old release payload or deploy untested source.

## Live limits and remaining scope
Production still runs PR14's API/worker image 369c750e97f5e6c8d36cdb3faa379fa80c8f6bd85bd46c4eb33fd9b095d87101.
Last live read in this chat: account of-176774528 verified, revision 2, provider_connection_check_retry, zero chats/messages and no complete sync. OnlyFans route previously returned HTTP503 with a planned-maintenance response. No newer provider recovery is claimed.
No fan send, model call, upload, purchase, refund, invitation email or live staff grant was performed in this change.
Full live inbox/import/send/media/payment acceptance, full audience and campaign completion, protected-video playback, deeper staff suite and restart/backup recovery remain separate unfinished gates. See INBOX-SYNC-2026-10-22.md and DELIVERY-PLAN-2026-10-19.md in the backend.

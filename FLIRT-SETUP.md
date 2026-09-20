# FLIRT white label on Twin services

Status: code preparation and offline checks only. The FLIRT database, live deployment and end-to-end acceptance checks remain pending.

## Confirmed scope, 20 September 2026
Jesse owns Twin and wants FLIRT to use the existing Twin operation. Reuse the current AI, voice cloning, transcription, hosting and email provider accounts. New provider accounts, subscriptions or a separate AWS account are not requirements.

Keep FLIRT customer data and reporting separate: a fresh database, its own Auth users and storage, FLIRT login/session secrets, its own application hostname, and FLIRT-specific creator/bot assignments. Both FLIRT dashboard and FLIRT bot point at that same fresh database. Twin's existing database and running applications are unchanged.

Shared provider-account administrators can still see provider usage and may access provider-held assets. Shared infrastructure administrators may access FLIRT data. Application-level separation does not remove those administrator permissions.

## Source and scope
- Repository: `jesse98/twin-dashboard`.
- Source main commit: `5e89194c59bef6c18527fb29240dbf8c41905d5f`.
- Branch: `flirt/independent-backend-2026-09-19`. The historical branch name remains for continuity; the supported operation is a white label using shared Twin services.
- The full source is inherited. Preserve Twin's page layouts, workflows and behaviour, with FLIRT logos and colours.
- This is a FLIRT deployment track. Do not merge its database restrictions or deployment settings into Twin main.
- Marketing remains `jesse98/fan-voice-flow` at `https://lynqai.co`. Change its signup/sign-in destination only after live acceptance passes.

## Shared services
- `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY` and `DEEPGRAM_API_KEY` can be the authorised existing Twin keys. Existing environment injection continues to work.
- An optional read-only Docker secret is supported by `deployment/flirt-shared-services.cjs`. Only those three provider key names are accepted. The file cannot set database credentials, login secrets, bot tokens or deployment flags. Malformed files fail before startup.
- The loader runs before the production application starts. Explicit per-application environment values take precedence. The inherited bot still reads FLIRT-local `app_settings` overrides, then falls back to the injected provider credentials.
- Rotating a shared key requires updating the host secret and recreating the relevant FLIRT container. It does not automatically change Twin's running environment.
- Existing ElevenLabs accounts can hold FLIRT voice clones. Each new creator still goes through the existing consent and voice onboarding. Do not copy another creator's voice IDs or assets into their account.
- Reuse the existing Telegram owner/management process. Each active bot token must have only one worker. Never copy Twin's active creator tokens into a second polling runtime. New FLIRT creators get their own assignments.
- Reuse the existing email delivery account if its verified sender supports FLIRT. Configure the FLIRT Auth project's SMTP sender and redirect allowlist separately.

## Running alongside Twin
The root `docker-compose.yml` uses FLIRT-specific application/container names. Dashboard binds only `127.0.0.1:3101`; Twin retains its existing `3001` binding. The bot keeps its 30-second shutdown grace period.

The same AWS account and suitable existing hosts may be used after capacity and access are checked. This preparation does not reserve server capacity or establish remote access. Production containers should use CI-built, verified image digests; do not build the dashboard on a resource-constrained live bot host.

See `deployment/SHARED-HOSTING.md` for the exact runtime configuration and provider-secret option. Existing Twin ECR repositories may hold distinct FLIRT commit-tagged images; never overwrite a moving Twin production tag or reuse the `next-app` container name.

The old Twin deployment and account-reset workflows remain absent from the FLIRT branch because they target the existing Twin application. Branch CI only runs tests. A GitHub code link is not a hosted preview.

## Data boundary
- Startup is disabled until explicitly enabled with `FLIRT_BACKEND_ENABLED=true`.
- `FLIRT_SUPABASE_PROJECT_REF`, database URLs and keys must identify the fresh FLIRT project. Current and legacy Twin data projects remain blocked in this FLIRT runtime.
- Database/public-key matching, independent login origins and different creator/operator signing secrets remain enforced.
- No users, conversations, transactions, uploads, sessions, bot tokens or full `app_settings` table have been copied.
- Original historical migrations remain blocked. Some include production imports, fleet-wide mutations and partner identifiers. Do not replay them onto a new database.

## Remaining provisioning steps
1. Confirm the Supabase organisation and project cost. Using the existing Twin organisation is supported. Check administrator membership if limiting staff access is required.
2. Create the fresh FLIRT project. Export and review the current schema only, including tables, functions, triggers, RLS, grants and custom storage policies. Do not restore Twin's Auth users or customer data. The checked-in historical schema predates current onboarding.
3. Review and copy only reusable prompt templates and sanitised operational defaults. Do not copy `app_settings` wholesale. Service credentials should use the controlled injection above.
4. Create fresh FLIRT agency/admin/invite records. Configure FLIRT storage buckets, SMTP and Auth redirects. Preserve scoped access, creator consent and payment deduplication.
5. Inject the FLIRT database/login environment plus the authorised existing Twin provider keys. Run `npm run flirt:preflight` with the environment supplied. This is an offline check, not proof of provider access.
6. Deploy the FLIRT dashboard/bot alongside Twin using separate application resources. Configure HTTPS on the FLIRT hostname and proxy the dashboard to port 3101.
7. Test signup, recovery, agency invites, onboarding, uploads, creator-scoped access, chat, voice and test payments with FLIRT-only accounts. Check desktop/mobile pages against Twin, then connect the landing page.
8. Retire the older LYNQ backend as a separate task. No deletion or automatic migration of its existing data is included.

## Verification
`npm run test:flirt-isolation` tests provider sharing, startup, credential boundaries and data isolation using synthetic inputs. Existing offline suites remain in branch CI. These checks do not prove live signup, emails, provider availability or payments work.

References: [Docker project separation](https://docs.docker.com/compose/how-tos/project-name/), [Supabase schema backup](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). Use schema only, not the guide's full data restore.

## FLIRT branding pass (19 September 2026)
- Preserved the source page layouts, typography, navigation, form fields and responsive rules.
- Added the supplied FLIRT wordmark and favicon under `public/brand/`.
- Applied hot pink, accessible action pink, near black, warm white and blush through `app/flirt-theme.css`. Financial and status colours retain their meanings; Telegram previews retain their native colours.
- Recoloured the original auth texture layers without replacing the artwork. Updated the platform's visible names, page titles, onboarding labels and release-note labels.
- The backend's legacy marketing route redirects to the existing FLIRT homepage; the marketing repository was not modified.
- Partner account identities, invite assignments, custom agency branding and route identifiers remain data and access-control concerns. No inherited customer records should be copied into the fresh FLIRT database.
- Removed embedded Twin project credentials from both recovery screens. Recovery receives validated public credentials from server pages at request time. `SUPABASE_PUBLISHABLE_KEY` must belong to the same independent project. No service key is sent to the browser.
- Added recovery isolation checks and enabled the existing creator login/routing/onboarding regression checks in branch CI.
- Public and authenticated visual review, email delivery and end-to-end signup still require the independent FLIRT deployment. A successful offline build is not evidence of working live accounts or payments.

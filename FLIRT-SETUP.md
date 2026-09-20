# FLIRT white label on Twin services

Status: FLIRT database and private upload storage provisioned and verified. Existing Twin AWS deployment access and shared-provider configuration confirmed. The user explicitly approved storing the FLIRT key in GitHub encrypted Actions secrets and protected configuration on the existing AWS servers. Both repository secrets are saved. Application deployment, recovery-email setup and live acceptance remain pending.

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

The old Twin deployment and account-reset workflows remain absent from the FLIRT branch because they target the existing Twin application. Regular branch CI only runs tests. The dashboard branch also has a separate read-only hosting readiness workflow using the existing AWS connection; it does not deploy or restart anything. A GitHub code link is not a hosted preview.

## Data boundary
- Startup is disabled until explicitly enabled with `FLIRT_BACKEND_ENABLED=true`.
- `FLIRT_SUPABASE_PROJECT_REF`, database URLs and keys must identify the fresh FLIRT project. Current and legacy Twin data projects remain blocked in this FLIRT runtime.
- Database/public-key matching, independent login origins and different creator/operator signing secrets remain enforced.
- No users, conversations, transactions, uploads, sessions, bot tokens or full `app_settings` table have been copied.
- Original historical migrations remain blocked. Some include production imports, fleet-wide mutations and partner identifiers. Do not replay them onto a new database.

## Provisioning checkpoint, 20 September 2026

The approved FLIRT project is `lkmfwpqegjluirfusnaw` in the existing Sage AI organisation, Sydney region. Jesse approved the quoted US$10/month project cost. The public project reference and bucket specification are in `deployment/flirt-project.json`. Runtime remains disabled until live acceptance.

Completed on FLIRT:
- 62 tables, 882 columns, 285 constraints, 198 indexes, 3 sequences, 34 application functions, 3 triggers and 1 reporting view copied as schema only.
- Table, constraint and index comparison matches Twin. UUID generation resolves to the equivalent extension function. Function bodies are unchanged; three previously unset search paths are fixed.
- Row-level security is enabled on all 62 tables. Browser roles have no table, sequence or function privileges. Only the server service role can use application records. The reporting view uses security-invoker mode.
- Four reviewed local cleanup/reporting schedules installed. No customer data, production counters or cross-project connections copied.
- Six generic prompt templates copied verbatim. Operational defaults passed through the existing dashboard allowlist and validators. Creator identity, personality, credentials, voice IDs and bot assignments are excluded.
- One new FLIRT agency created with a generated ID. No owner login, reusable invite token or creator account created.
- Database transaction tests passed for server onboarding writes, creator relationships, credit updates, generated spend tiers, single-use agency codes and denial of browser reads/RPCs/TRUNCATE. All synthetic rows rolled back.
- All business tables and Auth users remain empty. Only six prompt templates, one defaults row and the fresh FLIRT agency are present.
- Private `media`, `onboarding-content` and `voice-samples` buckets created through the Storage dashboard. Their configuration exactly matches `deployment/flirt-project.json`: 50 MiB and the existing seven media MIME types for `media`, 2 GiB and unrestricted MIME types for onboarding and voice. The project global upload limit is 2048 MB. Read-back confirmed all buckets private, zero stored objects and zero client Storage policies. Only server service-role/signed-URL access is intended.
- Supabase security advisor has no warning/error findings. Its 62 informational "RLS enabled, no policy" notices reflect intentional server-only access. Do not add broad browser access just to clear them. [Advisor explanation](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).

Authoritative migrations are in the FLIRT branch of `jesse98/twin-bot`:
- `supabase/migrations/20260920022012_flirt_schema_baseline.sql`
- `supabase/migrations/20260920022353_flirt_reusable_defaults.sql`

These match the recorded remote migration versions and are already applied. The original historical migrations remain blocked and must not be replayed. The rollback-only SQL check is `deployment/flirt-database-smoke.sql` in that repository.

## Hosting and email checkpoint, 20 September 2026

- Both dashboard and bot [read-only hosting checks](https://github.com/jesse98/twin-dashboard/actions/runs/35488669875) succeeded at commit `2b970a6cb58937087ab27dc406df6b627adf3608`.
- Existing GitHub AWS credentials reached the expected AWS account `323149985112`, region `ap-southeast-2`, dashboard instance `i-09a9dd3bd749643a5` and bot instance `i-0584d283506f3f6be`.
- At the latest check, the dashboard host had 1195 MiB available memory and 21 GiB free disk. Twin's `next-app` used 177.6 MiB. Local port 3101 was unused. These are readiness observations, not a reservation or a load test.
- The bot host had 1248 MiB available memory, but its disk was 91% full with only 3.6 GiB free. Do not blindly deploy another image or prune existing production images. Check image size and disk headroom or place the separate FLIRT worker on a suitable host before deployment. No cleanup or hosting change was performed.
- Only presence was checked for `OPENROUTER_API_KEY`, `ELEVENLABS_API_KEY` and `DEEPGRAM_API_KEY` in both existing runtimes. All three are configured on both hosts. No secret values were printed or copied by the check. Provider calls and billing were not tested.
- Both Twin and FLIRT Supabase Auth dashboards have custom SMTP disabled. There is no existing Auth SMTP configuration to copy. Production password recovery still needs an authorised existing email provider and verified sender. Supabase's default email service is intended for testing, restricts recipients and is not production delivery. [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp).
- Supabase and GitHub browser access are now working. No new account or paid hosting service was created.
- The user explicitly approved transferring FLIRT's new database key into GitHub encrypted Actions secrets and protected AWS runtime configuration. `FLIRT_SUPABASE_SERVICE_KEY` is now saved in both repositories. No credential was committed to source or printed in chat. The release script encrypts the key to a host-generated RSA public key using OAEP/SHA-256 before passing it through SSM. Only the root-owned host key can decrypt it; SSM command history receives ciphertext. The runtime environment lives under root-owned `/etc/flirt` with mode 0700 and files mode 0600.

## Remaining provisioning steps
1. Run the gated FLIRT release workflows on the dedicated branch. The credential transfer is approved and both encrypted GitHub secrets are saved. Public project identifiers are pinned in `deployment/flirt-project.json`; Twin database keys must not be reused.
2. Inject the FLIRT database/login environment and the authorised existing Twin provider keys. Generate separate creator/operator signing secrets and a new operator password on the protected host. Run `npm run flirt:preflight` and `node deployment/flirt-provision-storage.cjs --check`. Storage is already provisioned; do not recreate or make buckets public.
3. Build verified immutable FLIRT images and deploy separate dashboard/bot containers on suitable existing Twin hosting. Both hosts are reachable. Initially run both separate FLIRT containers on the existing dashboard host (`i-09a9dd3bd749643a5`), which has 21 GiB free, instead of adding images to the nearly full bot host. Set hard memory limits of 512 MiB for dashboard and 384 MiB for worker, and rotate their Docker logs. Reassess capacity as FLIRT traffic grows. Keep Twin's containers, image tags and ports unchanged. Do not use the production `next-app` replacement workflow.
4. Configure the FLIRT HTTPS application hostname, DNS and reverse proxy to dashboard port 3101. The runtime is prepared for `https://dashboard.lynqai.co`; DNS/TLS/proxy setup is still pending and this is not yet a public preview link. Update the FLIRT Auth recovery redirect allowlist for that exact origin.
5. Configure recovery-email SMTP with the authorised existing email provider and verified sender. No new email subscription is required. Twin has no configured Auth SMTP values available to copy.
6. Test live signup, recovery, agency invites, onboarding, uploads, two-account isolation, chat, voice and test payments with FLIRT-only accounts. Compare desktop/mobile pages against Twin, then connect the marketing login. Neither a GitHub build nor database checks prove these flows work live.
7. Retire the old LYNQ backend only after acceptance. No deletion or automatic customer migration is part of this setup.

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

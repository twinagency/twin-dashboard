# FLIRT independent backend preparation

Status: source preparation only. No FLIRT database or deployment has been created.

## Source and scope
- Repository: jesse98/twin-dashboard
- Source main commit: 5e89194c59bef6c18527fb29240dbf8c41905d5f
- FLIRT branch: `flirt/independent-backend-2026-09-19`
- The full source tree is inherited, including creator onboarding and dashboard functionality.
- This branch is a separate deployment track. Do not merge its environment changes into Twin main.
- Existing FLIRT frontend remains `jesse98/fan-voice-flow` at `https://lynqai.co`. Its current authentication remains unchanged until the new flow passes acceptance checks.

## Isolation implemented
- Backend startup defaults to disabled.
- Explicit new Supabase project reference required. Twin's current and older project references are rejected.
- Supabase URL, legacy JWT project/role, optional Postgres connection and public API URL are checked against that project.
- Dashboard requires an explicit independent public origin and different creator/operator signing secrets.
- Docker entrypoints run the guard before starting the application. Central dashboard database clients and bot config also validate their environment.
- Both legacy bot migration runners are disabled. SQL history is retained for review only.
- Inherited GitHub Actions workflows are removed from this branch. They included live Twin AWS deployment and account-reset operations.
- Replacement CI runs offline isolation checks and compile checks, with no production credentials.
- No source database rows, storage objects, users, bot tokens, sessions, transactions or service credentials have been copied.

## Functional inventory
The source includes creator signup, login, recovery, agency invite codes, application intake, onboarding drafts, uploads, account/agency assignments, creator workspaces, chat/voice runtime and Telegram Stars accounting. The dashboard and bot require the same new Supabase project.

Relevant creator tables verified in the current database:
`creator_accounts`, `creator_agency_assignments`, `creator_agency_codes`, `creator_applications`, `creator_clone_links`, `creator_consents`, `creator_files`, `creator_onboarding_progress`, `partner_agencies`.

The source schema.sql predates current onboarding. Historical migrations include data imports (for example 108 and 109), fleet mutations and hardcoded partner identifiers. Do not replay that history or restore a full data backup.

Prompt templates are stored in the source database, not only in git. They need a reviewed non-secret configuration export. Do not copy `app_settings` wholesale because it contains service credentials.

## Provisioning still required
1. Confirm a FLIRT-owned Supabase organisation and project cost. Organisation/project admins can access project data; separate projects alone do not revoke their access.
2. Create a fresh project. Build and review a schema-only baseline of current tables, functions, triggers, RLS, grants and storage policies. Validate it on the empty target. Do not copy Auth users or business data.
3. Import only reviewed reusable prompt/config templates. Create fresh FLIRT agency/admin records and invite codes with new IDs.
4. Provision FLIRT-owned service credentials, Telegram test bot, storage buckets, email delivery and auth redirect allowlists. Audit inherited hardcoded partner/demo IDs, absolute URLs and tracking integrations.
5. Review FLIRT branding on the provisioned preview across signup, recovery, onboarding and workspace. Preserve permission checks, payment deduplication, creator consent and scoped access.
6. Provision separate dashboard and bot hosting, logs and CI credentials. Do not reuse Twin's EC2 instances, ECR targets or deployment secrets.
7. Supply the fresh environment from `.env.example`. Keep `FLIRT_BACKEND_ENABLED=false` until schema/config review is complete. Run `npm run flirt:preflight` with injected environment; it makes no network requests.
8. Run full typecheck, build and existing offline suites, then end-to-end signup, recovery, upload, invite, onboarding, creator-scoping, chat, voice and test payment checks against FLIRT only. Capture a preview before switching frontend auth.
9. After acceptance, connect the FLIRT landing page signup/sign-in to the new flow. Retire the old LYNQ backend separately, without deleting data as part of this preparation.

## Verification
`npm run test:flirt-isolation` runs dependency-free configuration and launch checks using synthetic inputs only. These checks do not establish that onboarding or payments work against a provisioned FLIRT database.

Reference: [Supabase schema backup and restore](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore). For this new deployment, use schema only and separately reviewed configuration, not the guide's full data restore.



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

# Supplemental creator-flow acceptance runner

This is a normal public HTTPS regression check run inside the **already authorized, correct brand runtime**. It supplements the real browser audit. It does not establish native iPhone picker behavior, mobile layout, browser playback/seek, real mailbox recovery or phone upload speed.

Run the offline safety tests first:

```sh
node deployment/creator-flow-live-check.test.cjs
```

After verifying the serving commit, invoke one brand and mode at a time. The exact 40-character expected commit must come from independent deployment evidence, not be copied from the runtime's own environment merely to satisfy the guard.

```sh
node deployment/creator-flow-live-check.cjs --run --brand=flirt --expected-sha=EXTERNALLY_VERIFIED_40_CHARACTER_COMMIT --flow-only
node deployment/creator-flow-live-check.cjs --run --brand=flirt --expected-sha=EXTERNALLY_VERIFIED_40_CHARACTER_COMMIT --small-only
node deployment/creator-flow-live-check.cjs --run --brand=flirt --expected-sha=EXTERNALLY_VERIFIED_40_CHARACTER_COMMIT --large
```

Use `--brand=moxy` only inside the shared Twin runtime. The runner fixes each brand's public origin and Supabase project, requires the runtime's matching `GIT_SHA`, and rejects FLIRT/Twin backend confusion. It uses existing runtime credentials internally, with no credentials supplied in command arguments. The shared Twin canonical origin can be `dashboard.tgaiclone.xyz`; actual Moxy HTTP requests always use `dashboard.lynqai.co`, an existing application allowlisted host.

From the already authorized CI AWS connection, the standalone wrapper sends source to the existing container without deploying or exporting runtime credentials:

```sh
python3 deployment/creator-flow-live-check.py --brand=flirt --expected-sha=EXTERNALLY_VERIFIED_40_CHARACTER_COMMIT --mode=flow-only
```

The wrapper verifies the expected AWS account, established dashboard instance, target container and serving commit. It checks both target and non-target containers remain unchanged, emits a safe progress marker every 30 seconds while waiting, and returns the redacted JSON check report. It never prints raw runtime stderr. Both scripts require separate runs for each brand; do not run them concurrently.

Modes:

| Mode | Coverage |
|---|---|
| `--flow-only` | Normal fresh signup, invitation, assignment, validation, optional GET skip/return, truthful Info state, explicit submission, logout/fresh login and management-route denial. No uploads. |
| `--small-only` | Flow plus two concurrent, moving 1-second H.264 uploads across categories, object verification, post-submit upload and fresh-login persistence. When deployed, also gallery ownership, ranged private retrieval and saved retry. |
| `--large` | Small checks plus sequential valid padded MP4 files at 536,869,888 / 536,870,912 bytes and over-limit 536,870,913 bytes. These test byte boundaries; they are not 5/10-minute realistic performance fixtures. |

After gallery deployment, optionally add `--removal-guards` to `--small-only` or `--large`. This clearly labelled supplemental internal guard test reserves removal through the existing service-only deletion RPC for this run's own uploaded file, checks a foreign-owner reservation returns only generic removed state and leaves the file intact, verifies normal creator HTTP submission is blocked while removal is pending, then retries the normal creator DELETE endpoint and confirms both object and record are gone. The ordinary flow subsequently proves submission is available again. It creates no test database function, synthetic identity or account row directly.

For the deliberately separate transport release, `--allow-missing-gallery` allows the selected transport checks to pass while explicitly reporting the missing gallery as unverified. Omit that flag for gallery acceptance. It cannot be combined with removal guards. Missing-gallery allowance never excuses a failed upload, missing saved object, login failure or failed cleanup.

The runner checks recovery URL configuration using the Auth admin recovery-link operation for its own normally registered disposable account, with `redirect_to` in the URL query exactly as the installed SDK sends it. It logs only the accepted boolean, brand and expected reset path. It never sends an email, follows the token or prints the generated link. Success establishes URL configuration only; actual delivery and browser password recovery remain unverified.

Registration always calls the public `/creator-auth/signup` route. No Auth creation API or creator-table insert is called by the runner. Disposable accounts use controlled `contact+creator-audit-…@twinagency.co` plus aliases and random runtime-only passwords. The normal configured route currently confirms generic signup emails immediately; that is recorded as configured behavior, never described as mailbox ownership verification.

FLIRT invitations are generated through `/agency/creator-invites/manage` after normal `/admin-auth` password authentication. Moxy uses the existing normal internal-admin invitation form at `/agency-admin/creator-codes/manage`, selecting the unique visible Moxy option from its page and verifying its active stored agency identity. It never creates an agency cookie, uses a fake identity, resets a shared code or sends invitation emails. Unavailable normal operator authentication blocks invitation-dependent tests.

The service credential is used only for fixture-scoped persistence reads, exact disposable cleanup, the unsent own-fixture recovery-link check, and the explicitly selected removal-guard test described above. Every ordinary user action uses its normally issued creator cookie. Ordinary requests explicitly use `redirect: 'manual'`; file uploads use `fs.openAsBlob` and **`redirect: 'error'`** because Node can retain multipart replay data even with manual redirects. Large uploads are sequential and use one padded fixture on disk at a time. Timings are total request time on the runtime connection; they must not be presented as faster phone transfer times or pure network transfer duration.

Run `node deployment/creator-flow-upload-memory.test.cjs` before repeating large live tests. It transfers a physically written 512 MiB file through the same native `fs.openAsBlob`/`FormData`/`fetch({redirect:'error'})` combination to a draining loopback receiver, verifies streamed payload hashing and enforces bounded client RSS. This is a client-memory test, not a production-speed or playable-video claim.

Output contains pass/failure labels and safe HTTP status, upload outcome, duration and request UUID. Raw responses, account emails, passwords, invitation codes, cookies, keys, customer information and signed media URLs are excluded. A separate private temporary manifest contains only exact disposable cleanup identifiers (no passwords/cookies). If cleanup cannot finish it is retained and its runtime-local path is reported for an authorized operator; do not remove it until the exact listed records and Storage objects are resolved.

Cleanup verifies each disposable account's unique email, exact display label, creation window and IDs; refuses a connected profile or downstream object references; removes exact objects using the authorized Storage API and verifies absence **before** removing file references; then removes Auth through its admin API and the exact creator row. Only this run's uniquely labelled invitations are deleted. Cleanup never alters shared invitation counters or deletes Storage metadata with SQL.

Cleanup also enumerates each exact `creators/<disposable UUID>/` prefix in onboarding-content and voice-samples through the Storage API, with category-only depth, 100-item pages and a 500-entry bound. This finds a Storage object written before a crashed process saved its database record. Unrecorded legacy objects must have the exact known fixture category, timestamp/UUID/filename structure, run-time window and expected byte range; bare-UUID objects require a known receipt or a pre-upload manifest record. All candidates and downstream/foreign references are checked before any removal. An unexpected object blocks cleanup and preserves the disposable identity. Both prefixes must be empty before account deletion. The same guarded prefix scan works for an older manifest whose account and Auth record are already absent.

Run `node deployment/creator-flow-cleanup.test.cjs` for standalone orphan-authorization, pagination, path, size and scope tests; the main runner regression additionally covers unknown objects and downstream/foreign references blocking deletion.

For an interrupted process, perform **cleanup only** using the exact recorded manifest, without any new signup or upload:

```sh
python3 deployment/creator-flow-live-check.py --brand=flirt --expected-sha=INDEPENDENTLY_VERIFIED_CURRENT_COMMIT --mode=cleanup-only --cleanup-manifest=/tmp/creator-flow-flirt-EXACT_DIRECTORY_SUFFIX/cleanup-manifest.json
```

The Node equivalent takes `--cleanup-manifest=…` instead of `--flow-only`, `--small-only` or `--large`. The manifest must be a real non-symlink file at the exact runner path, mode 0600 in a 0700 directory, owned by the runtime UID. Its brand, original commit format, run timestamp, controlled plus aliases, exact display names, UUIDs and invitation labels are checked before deletion. A newer serving commit is permitted while the external current-runtime SHA guard remains mandatory; output preserves the original manifest revision. If deployment replaced the source container, an authorized operator may copy **only that exact identifier manifest** into the current correct-brand container with the same path and ownership/modes. Do not start the stopped application or copy its environment. Cleanup handles already-removed Auth records and retains the manifest on an incomplete result.

Do not run all modes or both brands concurrently. Run flow-only after the small invitation/status release, then small-only after the transport release, then large only after the small checks pass. The runner creates and removes its own fixtures during each invocation. A missing gallery is explicitly blocked/unverified, even if upload persistence passes. A blocked or failed result is never a substitute for the remaining browser and physical-device checks.

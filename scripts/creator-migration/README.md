# Twin creator migration: verifiable rehearsal tools

## Current state

This is implementation work, not a completed migration or a production release.

The latest allowed rehearsal database check during this work returned 23 creator-account rows, 23 progress rows, 16 applications, 4 consent records and 3 clone-link rows. Four application answer objects still contained placeholder markers. There were zero individual creator file rows and zero Auth-linked creator accounts. An earlier claim that full answers/files were imported was not supported by that check. Accounts tagged `creator` also include test accounts; the tag is not proof that each is a real customer.

The database connector subsequently blocked record-level checks. No attempt was made to move this data through another connection after those blocks. No real export was fed to these scripts, no storage objects were copied by this work, and neither production database was modified.

The existing rehearsal branch is `creator-migration-rehearsal`, ref `uggnrwotrnjahjapeeyo`, under Twin `aouaenqayfltoqrmpitg`. Its last reported branch status was `MIGRATIONS_FAILED`, despite its database being active. Resolve the migration-history/schema drift before treating it as a faithful production rehearsal. Do not merge that database branch blindly.

## What is implemented

- One read-only SQL statement exports a coherent creator-scoped snapshot, including full answer JSON, original timestamps and complete individual file metadata. Profiles, progress, consents and existing API-link records are retained in the private snapshot, not silently discarded.
- Source-generated SHA-256 checksums are checked before SQL is prepared. Placeholder success flags, damaged/truncated JSON, duplicate IDs/emails, unexpected states, missing arrays, wrong file ownership and unsafe paths cause failure.
- The import transaction matches existing creator/application records and restores genuine answer objects. It refuses to overwrite differing genuine answers or changed application statuses. Files are staged in a private inventory as `pending`, not represented as successfully copied media.
- The Storage worker is dry-run by default. Explicit execution is restricted to the known rehearsal project, checks credential project identity and private-bucket configuration, reads the source without writing to it, and never enables overwrite/upsert.
- Each file is downloaded, hashed, uploaded with resumable six-MiB TUS chunks, independently downloaded from the destination and hashed again. Interrupted uploads save their upload location privately. Existing equal objects are reverified; unequal objects stop the operation rather than being overwritten.
- Finalization requires a matching receipt for every planned file before generating SQL to populate `creator_files` and mark its inventory entry verified. It keeps file verification separate from Auth migration and consent-image verification.
- The optional hardening SQL removes browser write policies from the seven creator tables. Earlier owner-row policies alone would not prevent self-approval, changing identity/link fields or inserting arbitrary file references. This hardening SQL is prepared, not applied.

## Run tests

Node 20 or newer; no third-party runtime dependencies are needed:

```sh
node --test scripts/creator-migration/check.test.mjs
```

The local suite passed 51 tests using synthetic data and mocked HTTP responses. It covers preservation, failure cases, read-only dry runs, credential/host guards, checksums, resumable offsets after a lost response, refusal to overwrite, and rejection of incomplete finalization receipts. These are not a claim that the SQL ran against PostgreSQL or that live Supabase Auth/Storage/RLS passed an end-to-end test.

## Approved execution sequence, once blocked access is resolved

Do not use these tools to bypass denied connector actions or missing authorizations. No database or Storage step is launched by importing the modules or running tests.

1. Reconcile the rehearsal schema/migration history with production without importing operational fan data, bot secrets, transactions or live webhook jobs. Review and apply the hardening SQL to the rehearsal project through the approved migration interface. A project-ref label inside a generated SQL file is not proof of the connected database identity: the runner/operator must verify its real destination.
2. Generate the read-only source query with `node scripts/creator-migration/prepare.mjs export-sql`. Once source read access is allowed, save its single result row (`payload_text` and `payload_sha256`) as an export JSON file outside the repository. Never paste or commit real exports, SQL payloads, tokens, signatures or receipt files into GitHub.
3. Run `node scripts/creator-migration/prepare.mjs prepare /private/export.json /private/new-output-directory`. This only generates private SQL, a file-transfer plan and a summary. The output directory must not already exist. Apply the reviewed SQL exclusively to the verified rehearsal database using the approved database connection.
4. Prepare a private `creator-onboarding` Storage bucket on the rehearsal project. Its bucket and project file-size limits must permit the largest source object. The worker checks the bucket limit; the project-wide limit must also be checked separately. No source bucket permissions need changing.
5. Run the Storage worker without `--execute` first. Explicit execution requires `TWIN_MIGRATION_EXECUTION_APPROVED=rehearsal-only`, `SOURCE_PROJECT_REF`, `SOURCE_STORAGE_SERVICE_ROLE_JWT` and `REHEARSAL_STORAGE_SERVICE_ROLE_JWT`, supplied through an approved server-side secret mechanism, never committed or exposed to a browser. This implementation expects project-specific service-role JWTs; publishable/anonymous keys are insufficient.

```sh
node scripts/creator-migration/copy-storage.mjs /private/output/storage-plan.json /private/copy-work
# Only after access, target identity and limits have been approved:
node scripts/creator-migration/copy-storage.mjs /private/output/storage-plan.json /private/copy-work --execute
```

6. Preserve `verified-receipts.json`. Rerunning rechecks each object; it does not trust previous receipt counts as proof that bytes still match. A failed file leaves a resumable checkpoint. An expired TUS location is removed and the next approved run creates a new upload. The worker uses a lock file; remove a stale lock only after verifying no worker remains active.
7. Generate finalization SQL with `node scripts/creator-migration/prepare.mjs finalize-sql /private/export.json /private/copy-work/verified-receipts.json`. Review and apply it only on the verified rehearsal database. Full scope reconciliation is still required afterwards.

For hardening SQL: `node scripts/creator-migration/prepare.mjs hardening-sql`.

## Still required before production cutover

The real full-answer import, individual file inventory import and actual byte transfer must run and reconcile. Verify consent signature objects separately: a `signature_path` row is not a copied signature image. Verify account/profile/progress/consent/API-link fields against the retained source snapshot, not only row counts. Resolve agency attribution and clone IDs without inventing matches or overwriting revenue shares. Preserve non-creator/admin legacy records under a separate reviewed mapping; this creator-scoped export does not authorize their deletion.

Auth identities/password strategy, email verification, existing-account claiming, private agency invitation codes, creator signup/signin, creator portal, admin application review, negative authorization tests, a final incremental source snapshot and a rollback plan are separate outstanding work. No DNS, public signup, partner dashboard or production migration is changed by this branch.

## Documentation used

- Supabase resumable uploads: https://supabase.com/docs/guides/storage/uploads/resumable-uploads
- Supabase storage downloads and the distinction between bytes and metadata: https://supabase.com/docs/guides/storage/management/download-objects
- PostgreSQL SHA-256 and binary string functions: https://www.postgresql.org/docs/16/functions-binarystring.html

# Native text and operations checkpoint — 18 October 2026

Historical 0074 checkpoint. Continue with
[NATIVE-MODEL-BUDGET-2026-10-18.md](NATIVE-MODEL-BUDGET-2026-10-18.md)
for schema 0075 and Operations v2.

The new `/onlyfans/operations` page reads actual account-scoped processing
counters through the existing authenticated backend port. It shows intake,
work, drafts, queued/unknown deliveries, current holds, last complete sync and
recorded allowance. It explicitly labels the provider connection unverified
and live sending disabled. There are no send, cap-reset or recovery-release
controls. The existing inbox and Telegram surfaces retain their behavior.

`GET /api/onlyfans/accounts/[accountId]/operations` uses positive internal
operator authentication, refuses agency/view-as sessions, and returns private
no-store responses. The server port calls
`/onlyfans/api/v1/accounts/{account_id}/operations`, with outer `of-preview.v2`
and nested `of-operations.v1`. Strict parsing rejects cross-account data,
unsupported versions, invalid counters, unknown fields and secret-bearing
extensions. Failure remains visibly unavailable rather than healthy/sample data.

Pair this source with the backend's `0074_native_text_plans` migration and
`docs/onlyfans/NATIVE-TEXT-AND-OPERATIONS-2026-10-18.md`. That document explains
the bounded synthetic native preparation, shared one-use delivery authority,
accepted source provenance, encrypted backup/quarantined restore and remaining
milestone gates. The complete native planner, media sales, model budget and
live connection are still unfinished. No real provider/model was contacted.

Validation uses the actual Next session/routes/page and FastAPI/PostgreSQL
integration, mobile overflow and session-loss checks, existing read/channel
checks, `scripts/check-onlyfans-operations.ts` and TypeScript. The packaged
`VALIDATION.md` distinguishes fresh checks from retained historical evidence.

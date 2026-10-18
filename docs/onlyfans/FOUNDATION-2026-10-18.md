# Authenticated offline integration — 18 October 2026

The next offline slice is documented in
[TEXT-AUTHORITY-2026-10-18.md](TEXT-AUTHORITY-2026-10-18.md). This foundation
record is retained as the previous checkpoint.

This checkpoint extends `codex/onlyfans-dashboard-foundation` at
`a6539d2ca9f2ad3932cc02444a6b99e9140c5c9a`, paired with
`jesse98/twin-onlyfans-backend` at `b3a7c0015b3691c34de0bd1c059795f924f518ad`.
It is source work and synthetic verification, not a deployment or commit.

The real dashboard now calls the backend's correct `/onlyfans/api/v1` path,
speaks `of-preview.v2`, preserves incomplete synchronization on successful
reads, accepts nullable sync timestamps and displays retracted history. The
session verifier rejects malformed signatures and extra token segments.
Sending and every mutation remain unavailable.

`preview/onlyfans-integration` is a separate Next app importing the production
pages, read routes and auth functions. Its shell is synthetic, its records come
from PostgreSQL through the actual FastAPI service, and its external identity
dependency is a local synthetic HTTP server. The token-gated `test-login` route
is confined to that harness; it is not a route in the production dashboard.
This is distinct from `preview/onlyfans`, which still uses fixtures.

Install with `npm ci` in this repository and
`npm ci --prefix preview/onlyfans-integration`; install a Playwright Chromium
for the automated browser check. With a disposable local PostgreSQL server,
run the paired backend's `service/tests/onlyfans_demo.py --dashboard <this-path>`.
The backend's `docs/onlyfans/FOUNDATION-2026-10-18.md` has the exact commands,
schema and role setup, test instructions and remaining release gates.

The backend base URL is an origin or proxy mount, without the service path.
For example, `http://127.0.0.1:8018` becomes
`http://127.0.0.1:8018/onlyfans/api/v1/accounts`. Both repositories must move to
v2 together. `asOf: null` means synchronization is unknown or incomplete;
activity and a successful GET cannot turn it into a fresh sync. Connection
health remains disconnected without verified lifecycle evidence.

Verification includes the existing fixture, unconfigured, channel, operator
and view-as checks; additional stale-state regression cases; root and harness
TypeScript checks; actual HTTP identity/scope denials; and an actual browser
rendering PostgreSQL history, retraction and a sync-gap warning. Session loss
removes private history. No real OnlyFans, Supabase or model call was made.

The exhaustive sender/ownership checkpoint, shared Telegram/native integration,
full milestone 2 release gate, delivery authority and live acceptance are still
pending. See the paired backend handover before continuing those milestones.

# Creator reporting dashboard, first implementation

Base: `9a6fe9c75f20cb96bafe21cdec3d1e71cc9df1b8`.
Branch: `feat/creator-reporting-dashboard`. Review before production rollout.

## Scope

Replaces the small creator performance page with an operator-style, read-only
workspace: shared Card/Button/Input components, existing reporting engine and
Recharts, creator navigation, revenue/earnings estimates, audience statistics,
product breakdown, conversion, weekday/hour reports and recent transactions.
No new dependencies, database migrations, memberships, credentials, account
writes or production configuration changes are required by this patch.

Signup, onboarding, submissions, uploads and sign-out handlers are unchanged.
The root layout exits before all operator fleet reads for `/creator` and its
bounded child paths, including when an admin/agency cookie is also present.

## Authorization and isolation

1. `/creator/report-data` independently verifies the signed creator cookie.
2. Every page/report/export re-reads the creator account by both account ID and
   `auth_user_id`. Rejected/archived/unknown statuses are denied. Applicants
   remain readable because migrated linked accounts can have that status.
3. The clone comes exclusively from `creator_clone_links`, never a URL selector.
   An absent link yields an explicit awaiting-connection state, never fleet data.
4. The existing `withDashboardAccess` query/RPC restrictions run inside a
   request-local, read-only reporting scope with exactly one clone. The scope
   is named `creator:<account UUID>` so it cannot collide with an agency UUID,
   administrative cache key or management-capable agency ID. It creates no
   agency user, session or membership.
5. The existing revenue cache includes both this identity and its current clone
   assignment. Ownership is re-read even on warm-cache requests.
6. An explicit browser DTO withholds costs, profit, margin, AI calls/errors,
   prompts, tokens, media signing URLs, Telegram IDs and unknown future fields.
   Unexpected clone IDs in the raw snapshot cause a failure, not client hiding.
7. GET/HEAD only; JSON and CSV responses use private/no-store and Vary: Cookie.
   Existing admin APIs are never opened to creator sessions.

The shared server rollup may calculate internal costs; the creator response
never contains them. A later optimization can skip unnecessary server work,
without changing the established revenue definitions.

## Financial semantics

`Clone revenue` uses the signed ledger total after recorded refunds/adjustments.
`Estimated earnings` uses the stored `revenue_share_percent`, only when it is a
finite value from 0 to 100. Missing/invalid shares are not guessed. Both use the
existing platform Star-to-USD conversion. Estimated earnings are not a payable
balance, settled amount or Telegram withdrawal balance. Paid/pending payouts
and settlement history are deliberately not fabricated or displayed.

Average paid order uses positive payment volume, not refund-adjusted receipts.
Conversion rates from analytics are fractions and are multiplied by 100 only
for display. A missing denominator stays unavailable, not 0%.

## Exports and dates

Custom dates use the existing report-calendar helpers (Sydney time), with an
ordered maximum span of 366 days. Presets use the unchanged reporting engine.
CSV exports contain the latest available transactions, capped at 100, not a
claim of a full historical ledger. Both the screen and export disclose that
limit. CSV cells are quoted and fan-supplied formula prefixes are neutralized.

## Checks and remaining rollout gates

`npm run test:creator` exercises parser/DTO/HTTP boundaries with offline
fixtures, plus source-level integration guards. It is included in
`test:offline` and `test`. No test creates live users or fake production sales.

Before merging:
- Pass repository type check, Next build, existing offline checks and the new
  creator checks against the complete checkout.
- Run authenticated browser tests in an isolated staging environment with two
  fixture creators, mixed admin/agency cookies, expired/malformed sessions,
  rejected accounts, a revoked/reassigned link and an unlinked account.
- Exercise the actual scoped SQL/RPC path (including warm cache and export),
  not just the allowlist projector, and compare figures to the operator view.
- Check responsive layout, chart/custom dates, CSV and unchanged onboarding.
- Confirm configured revenue-share values are the intended creator percentages.

Do not describe this branch as live until it has been reviewed, merged and the
production deployment has been verified. No authentication bypass or public
fixture route is part of this change.

# Agency setup and team invitations

Agency owners can manage their staff at `/agency/team`. `/agency/setup` reuses
creator onboarding progress and links to the existing connections/import and
shared-content views. Desktop and mobile navigation share the setup link.

## Owner delegation

Twin admin explicitly grants delegation on `/agency-admin`, after selecting an
active member with all-creator scope. Existing members are not automatically
promoted. Delegation does not change the agency's existing creator-management
policy. Agency owners cannot remove themselves, modify another owner, or grant
owner status. Twin admin retains recovery and revocation authority.

## Invitations

An owner selects an email, access and creator scope, then creates a seven-day,
single-use invitation. The owner copies the link and shares it with the intended
recipient. Creation does **not** send email. Only the token hash is stored.
Creating another invitation for the same email revokes earlier pending ones.

The recipient requests the standard Supabase verification email, follows it,
chooses a password and accepts. The native Auth return path must allow
`https://dashboard.tgaiclone.xyz/agency/join` with its invitation query string.
Existing Auth users can sign in with their password. Existing agency memberships
are never overwritten or moved by invitations; Twin admin handles agency moves.

Acceptance verifies Auth identity and confirmed email, then atomically rechecks
the invitation, agency, issuing owner's active all-creator membership and current
assignments before inserting membership. Revoked/expired/accepted links fail.
Removing a creator from the agency cannot leave that creator accessible through
an older invitation. Each member edit requires its current revision.

New tables use RLS with no public policies. Only server service-role access is
granted. RPCs are SECURITY INVOKER and callable only by service_role; the server
supplies user ID and verified email after Auth.getUser, never from form fields.

## Validation and operational limits

- TypeScript and existing staff-access tests.
- HTTP boundary tests for owner authorization, origin, email confirmation and
  existing membership protection.
- Disposable PostgreSQL checks for owner/agency boundaries, assignments, grants,
  expiry, replay, stale updates, revocation and atomic acceptance.
- Production Auth generated-link check: correct Twin return URL, no email sent,
  exact synthetic account removed after the check.
- Actual email delivery has not been tested by sending to a real recipient.
- No existing staff permissions or owner delegations are changed by migration.
- Live OnlyFans sending, uploads and provider acceptance tests remain paused.
- This release is not evidence of complete OnlyFans history import or CRM launch
  readiness. The catalogue-video deployment audit has a separate existing failure.

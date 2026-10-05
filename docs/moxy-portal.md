# Moxy partner portal

Entry point: `/moxy`. Uses the existing dashboard and Supabase agency identity,
not an administrator session or a separate analytics implementation.

## Live assignment (2026-09-07)

- Agency slug: `moxy`, ID `bc670215-110b-4ea0-8f5c-af3dfe21d253`.
- Riley Mae Lewis: `20ef9407-83f2-4351-8d3c-48cc0ed54e0b`.
- Kyla Yesenosky: `d2678dce-6a4e-4f1c-b54a-86057bba427c`.

Assignments are rows in `agency_creators`, never hardcoded access in the app.
Existing LYNQ assignments and accounts were not changed.

## Account setup

An administrator uses `/agency-admin?agency=moxy` to create a read-only login
for the partner's confirmed email. Do not reuse a LYNQ member: memberships are
one agency per Auth user. Share `/moxy` and credentials through an approved
secure channel. No account or password is created by a code deploy.

Moxy team owners use the same `/moxy` email/password entry point. Apply
`deployment/moxy-owner-access.sql` before deploying owner support. An internal
operator can grant a specific active Moxy membership `can_manage = true` through
the service role. The default is false; existing reader accounts are unchanged.
The application only honours this flag for the verified Moxy agency ID and never
reads it from user metadata or browser inputs. Revoke by clearing the membership
flag or deactivating the membership.

Owners can manage assigned creators' supported bot settings, media and CRM tools.
Application approval, new bot creation and platform-wide settings remain internal
administrator functions. This is not a Twin platform administrator account.

## Security and presentation

- Login verifies Supabase Auth, active membership and active agency, then
  requires that identity to match the server-resolved `moxy` agency.
- All data reads retain mandatory creator filters and per-agency cache keys.
- Reader accounts cannot write. Owners use the existing management allowlist;
  every mutation is constrained to the agency's currently assigned creators.
- Owner and reader data caches are separate. Membership and agency status are
  verified for each authenticated request.
- Global settings, Tracker, API, Agency access and other administrator-only
  routes stay blocked for both roles. Owner navigation enables supported CRM.
- Bot token is a static locked placeholder; the token is never projected.
- AI Models is not rendered. Its selected model columns are removed from
  Moxy's clone projection, and `/api/models` is blocked for Moxy.
- The portal cookie is only a sign-in destination hint, never authentication.
- Normal administrator login clears partner cookies and keeps full access.

Brand artwork: unmodified `images/whitelogo.png` from the official Moxy site,
https://www.moxymgt.com/ (asset hosted on its public R2 domain). Local copy:
`public/moxy/logo.png`. Moxy uses monochrome chrome; money/status colours retain
their original semantic meaning. Admin and LYNQ branding remain unchanged.

Checks: `npm run test:agency`, `npm run test:offline`, `npm run build`.

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

## Security and presentation

- Login verifies Supabase Auth, active membership and active agency, then
  requires that identity to match the server-resolved `moxy` agency.
- All data reads retain mandatory creator filters and per-agency cache keys.
- All writes remain blocked by middleware and the scoped data client.
- CRM, AI, Tracker, API, Agency access and other administrator-only entries
  are visible as non-interactive `Not available` items. Direct routes stay 403.
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

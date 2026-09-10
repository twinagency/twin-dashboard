# Tether agency workspace

Requested scope: an agency/backend dashboard for Jesse and Tucci, using the existing LYNQ/Link and Ava dashboard features. No creator signup or onboarding changes.

## Portal and isolation

- Entry: `/tether`; authentication: `/tether/auth`; authenticated landing: `/revenue`.
- Agency: `95b1f78a-1eb2-43d2-84f3-630c2a125ee6`, slug `tether`, name `Tether`.
- Branding is provisional and neutral pending the owner's Tether website. Existing TwinWordmark renders the Tether name, including the shared desktop/mobile shell.
- Access comes from active Supabase Auth users, active `agency_memberships`, active `partner_agencies` and explicit `agency_creators`. Form fields and branding cookies never choose an agency or expand creator access.
- Tether uses the same scoped management allowlist as LYNQ and Ava. Internal administration remains blocked. Existing read/write guards and per-agency cache keys are retained.

## Current production configuration

The agency record and one confirmed assignment were inserted using a transaction on the existing Twin Supabase project. No schema, RLS policies, creator records or existing partner assignments were changed.

Confirmed assignment: Toochi (`bfaf6235-6c3b-4369-8d5c-c7068b08bea2`).

The owner also requested "Zoe Mox". The closest backend match is "Zoey Foxx", but that identity has not been confirmed. Do not assign that account based only on the similar name. The application and tests support two creators once the second creator is confirmed.

## Operator accounts

The owner retracted the proposed email address. No email was invented, no user account was created, and no invitation was sent. After real operator emails are supplied, provision their individual accounts through the existing authenticated `/agency-admin` screen and choose Tether. The existing account form requires a password of at least 16 characters. Do not reuse or modify another agency's membership.

## Verification

`npm run test:tether` exercises member-only authentication, input/origin rejection, ignored forged agency and creator fields, secure cookies, one/two-creator views, denied unrelated creators and admin routes, cache separation, revocation and return-to-Tether logout. It uses offline fixtures, not live customer credentials. It is included in `npm run test:agency` and the existing offline CI suite.

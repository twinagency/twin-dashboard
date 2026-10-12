# Named owner access

Full dashboard owners can sign in at `/login?owner=1` with a username and password.
The existing password-only admin entry remains available at `/login` and `/twin`.
These are full internal owners, not agency or creator accounts. Moxy full-owner
access uses the shared Twin console, not the read-only Moxy partner portal.

The schema in `deployment/dashboard-owner-schema.sql` was applied independently
to the Twin/Moxy and FLIRT databases. Credentials and session records never cross
database boundaries. No passwords, hashes, or service keys are stored in Git.

Only the server service role can access the owner tables and RPCs. RLS intentionally
has no public policies: anonymous users and ordinary authenticated users have no
table or function privileges. The security advisor's no-policy information is
expected for these server-only tables.

Passwords use bcrypt cost 12, with a maximum of 72 UTF-8 bytes. Use the
Postgres-supported `$2a$` format (`extensions.gen_salt('bf', 12)`, or explicitly
select the `2a` prefix in the password-hashing library). The installed pgcrypto
does not verify Python bcrypt's default `$2b$` format. Provision a unique
lowercase username and a cryptographically random password through an authorized
server operation; store only the hash. There is no public owner-signup endpoint.
Five failed attempts lock an account for 15 minutes. A successful login resets
the failure counter. Session cookies are HttpOnly, Secure in production, SameSite
Lax, and expire after 30 days; only SHA-256 token hashes are stored in the database.

Set an account's `active` flag to false to block its sign-ins and existing sessions.
Delete its session records to revoke them permanently. Updating `password_hash`
automatically changes the credential version, invalidating all prior sessions.

Validation: `node --import tsx scripts/check-owner-auth.ts` checks token boundaries,
failure behavior and legacy authentication. `scripts/check-owner-auth.sql` checks
database permissions, credentials, revocation, lockout and expiry inside a rolled
back transaction. Neither test requires real owner credentials.

## Private owner shortcuts

An explicitly issued owner session can be handed off at `/admin-access#owner_<token>`.
This is a full-owner credential, not a public preview link. Issue only for an
authorized, active owner, using 32 cryptographically random bytes and a new row
in `dashboard_owner_sessions`. Persist only the SHA-256 hash of the entire
`owner_`-prefixed token, the existing account ID and current credential version.
Keep the default 30-day expiry. Do not commit or log the raw link.

The fragment is removed from browser history before a same-origin POST. It is
never included in the HTTP URL, Referer, page HTML or an analytics request.
The standalone entry page has no third-party assets and a nonce-based CSP.
GET and HEAD never issue authentication. POST accepts only an existing owner
session verified by `dashboard_owner_session_verify`; there is no key-to-admin
bypass, new owner provisioning, or extension of the stored expiry. Normal
password sign-in is unchanged. Creator, agency, view-as and clone-filter
cookies are cleared on successful handoff.

Issue a distinct session in each independent database. A Moxy/Twin session
cannot authenticate against the Flirt database. Deleting the exact issued
session hash revokes its shortcut and browser access. Disabling the owner or
changing the owner's password retains the existing revocation behavior.
Never revoke unrelated sessions when replacing an individual shortcut.

`node --import tsx scripts/check-owner-shortcut.ts` exercises the real route,
origin/credential rejection, role-cookie cleanup and browser handoff. Set
`OWNER_SHORTCUT_BROWSERS=chromium,webkit` for both supported test browsers.


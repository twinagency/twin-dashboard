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

Passwords use bcrypt cost 12, with a maximum of 72 UTF-8 bytes. Provision a unique
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

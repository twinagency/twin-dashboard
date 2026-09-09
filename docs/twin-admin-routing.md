# Twin admin routing

The dashboard uses `/twin` as the canonical administrator namespace.

- `/twin` and `/twin/*` require a valid administrator session.
- Partner cookies such as Moxy or LYNQ never override an authenticated administrator session.
- The bare `/` path is a router only:
  - administrator session -> `/twin`
  - partner session/cookie -> partner portal
  - no session -> `/login`
- Authenticated administrator page navigation is redirected into the `/twin/*` namespace while APIs remain unprefixed.

This keeps the internal Twin backend isolated from partner portal routing without duplicating the existing Next.js admin pages.

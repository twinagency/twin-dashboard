# One-use transport checkpoint — 18 October 2026

The paired backend now requires a durable one-use grant consumption before
either synthetic egress or an actual HTTP request to an owned local fixture.
Replayed grants, stale controls/input/policy, revoked bindings and prewire cap
changes cannot start a request. Lost responses remain unresolved without resend.
Legacy provider clients also refuse at call time in dedicated process roles,
including cached clients and raw/retry paths covered by the register.

This is offline verification, not a real OnlyFans connection. The wire protocol
is a local rehearsal contract; no live session, planner, command route or Send
capability is enabled. The existing v2 read contract and UI remain unchanged.

The backend's `docs/onlyfans/ONE-USE-TRANSPORT-2026-10-18.md` records the 0073
migration, one-use/HTTP tests, exact limits and remaining live/native gates.
The checkpoint provides cumulative patches against the published bases and
delta patches against the preceding text-authority checkpoint. Apply one set.

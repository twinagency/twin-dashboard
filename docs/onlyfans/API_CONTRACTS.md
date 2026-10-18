# OF-D0: proposed dashboard API contracts

Status: proposal, with a read-only exception. Families 1 and 2 — the authorized
accounts and the conversations and messages under one account — now have real
handlers behind them, and the dashboard reads them. Everything else in this
document is still a proposal: **no endpoint for families 3 to 7 exists**, and no
screen calls one. Section 4 is the honest ledger of which is which.

These contracts exist so the fixtures the preview renders have the same shape as
the reads and commands a later stage would issue. Getting that shape wrong is
cheap to fix now and expensive to fix after five screens depend on it.

Design rules that apply to all of them:

1. The dashboard is a projection reader and a command submitter. It is never a
   second writable ledger.
2. Every read model carries a schema version, its channel, the account scope it
   was authorised for, stable identity, and freshness.
3. Every command carries an idempotency key and the revision it was decided
   against. The server derives the actor, the permissions and the permitted
   account binding from authenticated context. Browser ids only request scope.
4. Money is an integer count of minor units plus an explicit ISO-4217 currency.
   There is no implicit currency and no float.
5. A read that cannot be answered is an error state, not a zero. Empty,
   unavailable and zero are three different answers.

## 1. Read model envelope

Every read model and every paginated page carries this envelope.

| Field | Type | Notes |
|---|---|---|
| `schemaVersion` | string | Bumped whenever the projection changes shape |
| `channel` | `"onlyfans"` | Never inferred from a route |
| `accountScope` | string[] | The account ids this response was authorised for |
| `sourceRevision` | number | The backend revision the projection was built from |
| `asOf` | ISO timestamp or null | Last complete durable sync; null means missing or incomplete sync |
| `maxAgeSeconds` | number | After this, the client renders it as stale |
| `stale` | boolean | Computed server-side too, so client and server cannot disagree |
| `capabilities` | family 1 | What the caller may do with this data |

A page of a cursor-paged read is `{ items, nextCursor }`. `nextCursor` is null
only when the end has genuinely been reached.

## 2. Contract families

### Family 1: accounts, bindings, health and capabilities

`GET /api/onlyfans/accounts`

| Field | Type | Notes |
|---|---|---|
| `accountId` | string | Backend-owned. Never a browser-chosen recipient |
| `binding.bindingId` | string | Stable binding identity |
| `binding.creatorId` | string | Existing Twin creator identity |
| `binding.handle` | string | Display only |
| `health` | `connected` / `reconnecting` / `disconnected` / `expired_session` / `revoked` | Connection health only |
| `healthReason` | string or null | Plain language, never a raw provider error |
| `automationMode` | `automated` / `human_controlled` / `paused` / `no_contact` | Display of the account default |
| `capabilities.*` | `available` / `unavailable` / `not_configured` | Per operation, per account |
| `syncFreshness` | freshness | How current the synchronized history is; separate from connection health |

Capability keys the dashboard reads: `viewConversations`, `sendManualMessage`,
`pauseAutomation`, `requestTakeover`, `manageContent`, `managePrices`,
`viewSales`, `resolveDeliveryEvidence`.

A capability is advertised by the backend for that account. The dashboard must
never infer one capability from another, and must never treat "connected" as
"allowed to send".

### Family 2: conversations and messages

`GET /api/onlyfans/accounts/{accountId}/conversations?cursor=`

| Field | Type | Notes |
|---|---|---|
| `conversationId` | string | Account-scoped. Two accounts never share one |
| `revision` | number | The revision a command must state |
| `fan.fanId` | string | Account-scoped fan identity |
| `lastMessagePreview` | string | Truncated server-side |
| `lastActivityAt` | ISO timestamp | |
| `unreadCount` | number | |
| `priority` | `normal` / `priority` / `quiet` | |
| `automationMode` | as family 1 | Per conversation, not per account |
| `takeoverState` | `none` / `requested` / `effective` | Requested is not effective |
| `delivery` | family 3 | The conversation's most recent delivery outcome |
| `requiresAttention` | boolean | |
| `freshness` | freshness | |

`GET /api/onlyfans/accounts/{accountId}/conversations/{conversationId}`

Adds `messages[]`, `facts[]`, `ownedMedia[]` and `deliveryIncident`.

Each message carries `messageId`, `direction`, `origin`
(`fan` / `ai` / `human` / `imported`), `body`, `occurredAt`, its own `delivery`
outcome and an `evidenceRef` when one exists. Every bubble has its own receipt,
because a turn is several actions and one can land while the next does not.

`ownedMedia[]` entries are `{ mediaId, label, purchasedAt, price }`. Ownership
comes from a confirmed purchase event, never from an offer having been made.

### Family 3: delivery incidents and resolution

| Field | Type | Notes |
|---|---|---|
| `attemptId` | string | The recorded attempt the evidence resolves |
| `outcome` | delivery outcome | |
| `recordedAt` | ISO timestamp | |
| `detail` | string | Plain language, no raw provider error |

Resolving an incident is a command (family 6), not a read. The dashboard offers
it only when an incident exists, and it is the only control allowed while an
unresolved send is in force. There is no resend command.

### Family 4: creator and native configuration

`GET /api/onlyfans/accounts/{accountId}/configuration`

Returns the effective configuration version, the selected engine and its version,
the model purposes, requested versus effective controls, and the approved creator
facts with provenance. Read-only in the dashboard for now.

The dashboard must present requested and effective separately. A setting that has
been requested but not applied is not shown as applied.

### Family 5: catalogue, availability and offers

`GET /api/onlyfans/accounts/{accountId}/catalogue?cursor=`

Asset identity and source, type, existing copy, availability, price, analysis
state (`pending` / `ready` / `failed` / `needs_review`), and immutable offer
references.

An offer is distinct from a purchase. An unavailable asset is not a zero-price
asset. A failed analysis must never blank existing metadata or publish at a
guessed price. Not built in OF-D0.

### Family 6: purchases, refunds and summaries

`GET /api/onlyfans/accounts/{accountId}/purchases?cursor=` returns confirmed
commercial events with provenance and currency.

`GET /api/onlyfans/accounts/{accountId}/summary?from=&to=` returns a
currency-aware projection: gross, fees, refunds and net, each with its currency,
the period it covers and the freshness of the figure.

Rules the UI must honour:

- Provider acceptance never increments paid revenue.
- A refund does not appear as its own purchase. It is a credit against the
  original, and both stay visible.
- Totals never silently aggregate OnlyFans amounts with Telegram Stars, and a
  multi-currency account reports per currency rather than one converted number.

Not built in OF-D0.

### Family 7: commands

All writes are commands. One envelope, one gate, one audit trail.

`POST /api/onlyfans/accounts/{accountId}/commands`

| Field | Type | Notes |
|---|---|---|
| `commandId` | string | Stable per logical command |
| `idempotencyKey` | string | Reused verbatim on retry after a lost acknowledgement |
| `command` | enum | `pause_automation`, `resume_automation`, `request_takeover`, `release_takeover`, `mark_no_contact`, `send_manual_message`, `resolve_delivery_evidence` |
| `conversationId` | string | |
| `expectedRevision` | number | Refuse rather than apply to a conversation that moved on |
| `payload` | per command | Text, or the evidence resolution choice |

Response: `{ commandId, accepted, effectiveState, revision, refusalReason }`.

The four properties this contract exists to guarantee:

1. **Idempotent.** A retry with the same `idempotencyKey` returns the first
   result. It does not create a second send.
2. **Revision bound.** A command decided against stale state is refused, not
   applied.
3. **Authorised server-side.** The actor, the role and the permitted account
   binding come from authenticated context. A body field cannot widen them.
4. **One delivery path.** Every write routes through the shared delivery
   authority. No dashboard path talks to a provider.

## 3. Error model

| Code | Meaning | Dashboard behaviour |
|---|---|---|
| `not_authorised` | The caller may not act on this account | Refuse and say why. Do not retry |
| `revision_conflict` | The conversation moved on | Refresh, then let the operator decide again |
| `capability_unavailable` | The backend does not advertise this operation for this account | Replace the control with its reason |
| `unresolved_delivery` | An earlier send is not settled | Offer only the evidence path |
| `no_contact` | The fan asked for no further contact | Refuse, and say the exclusion is not reversible here |
| `rate_limited` | Account or provider throttling | Show a retry time. Never a silent retry loop |
| `not_configured` | No binding, or the integration is not enabled | Show the connection state, not a generic failure |

An error never renders as a zero, an empty list or a plausible default.

## 4. What is actually implemented today

Read this section as the honest counterpart to sections 1-3. Families 3 to 7 are
proposals for OF-D1 and OF-D2: no route, no handler and no adapter exists for
them, and nothing in the dashboard may imply otherwise. **Two of the seven
families have handlers — the first and the second — and both are read-only.**

### 4.1 The frontend contract

One TypeScript interface, `OnlyFansDataSource`, with five methods: `listAccounts`,
`getAccount`, `listConversations`, `getConversation`, `submitCommand`.

| Implementation | Behaviour |
|---|---|
| Fixture | Deterministic synthetic data (`lib/onlyfans-preview/fixture-data-source.ts`). `submitCommand` returns a simulation marker with `applied: false`. Used by the isolated preview and the offline checks, and refused outright in a production build |
| Live | `lib/onlyfans-preview/server-data-source.ts` over an injected transport. In the dashboard the transport is the dashboard's own same-origin read handlers; in the checks it is a fake |

There is no fallback in either direction: with no backend configured the live
source reports `unavailable`, and fixture data cannot be constructed in a
production build. `npm run test:onlyfans-preview` asserts the second,
`npm run test:onlyfans-read` the first.

### 4.2 The handlers that exist

| Method and path | State |
|---|---|
| `GET /api/onlyfans/accounts?creator=&account=` | Implemented, read-only |
| `GET /api/onlyfans/accounts/{accountId}/conversations?cursor=` | Implemented, read-only |
| `GET /api/onlyfans/accounts/{accountId}/conversations/{conversationId}` | Implemented, read-only |
| Families 3-7 (incidents, configuration, catalogue, purchases, commands) | **Not implemented.** No route exists |

Each handler answers with the envelope in section 1, stamped
`of-preview.v2`, and adds one field the proposal did not have: `scope`, carrying
the creator and account that were requested, so a client can tell what answer it
is holding.

Every handler calls `requireOnlyFansRead()` before anything else. That is the
authorization rule, and it is deliberately narrow:

1. The internal operator session must be **positively verified on this request**
   (`isAuthed()`). A null `getDashboardAccess()` is not authentication — it means
   "independently gated" — and `middleware.ts` returns early with no auth outside
   production, so a route that trusted middleware alone would be open on every
   dev server.
2. An agency identity is refused, and a view-as session is refused. Neither
   restriction is widened here; `lib/agency-policy.ts` is untouched.

The browser's `creator` and `account` parameters are a **request**, not a grant.
The backend owns the bindings and decides what this operator may read; the read
service then refuses any answer that crosses a creator or account boundary
(`scope_violation`, 502) rather than rendering another account's row under this
one's heading.

### 4.3 Configuration, and what happens without it

The live path needs both `ONLYFANS_API_BASE_URL` and `ONLYFANS_API_TOKEN`.
Absent, blank or malformed, the backend is `null` and every read answers `503
unavailable` — never an empty list and never sample data. The service credential
is the dashboard's own; no browser cookie is forwarded and no read is cached.

Status mapping is fixed: 401 from the backend is an operational problem on our
side and reports `unavailable`; 503 and 502 report `unavailable`; 403 and 404 are
refusals; anything else is an error. An error never renders as a zero, an empty
list or a plausible default.

### 4.4 What is still nothing but a proposal

`submitCommand` exists in the interface because the surface has to model what a
command *would* carry (`accountId`, `conversationId`, `expectedRevision`,
payload) so the fixtures can be decided against a revision. No delivery
authority is wired up: the live implementation throws rather than pretending,
and the routes expose no write handler at all. Sending, takeover, reconnect,
pausing and every other mutation in family 7 remain unimplemented.

### 4.5 Verification

| Check | What it proves |
|---|---|
| `npm run test:onlyfans-read` | 116 checks: authorization, cross-account refusal, scope in the URL, paging, late responses, incomplete-sync propagation, failure/transport mapping, schema-version negotiation and absence of fixture fallback |
| `npm run test:onlyfans-unconfigured` | 39 checks: the same chain rendered to markup — an unconfigured surface shows `unavailable` instead of throwing, and invents no card, no zero and no sample-data badge |
| `npm run test:onlyfans-preview` | 101 checks on the fixture contracts, including that fixture data is refused in a production build |
| `preview/onlyfans/scripts/check-isolation.mjs` | 70 browser checks against the running preview |

### 4.6 The backend behind these handlers (OF-B1)

The handlers above read their data from a service that now exists: the read-only
OnlyFans API implemented on the consolidated backend, in the isolated worktree
`inflowwkiller-of-b1` (branch `codex/onlyfans-of-b1`). Its full record is
`docs/onlyfans/OF-B1-READ-SERVICE.md` in that worktree.

What that changes for this document, and what it does not:

* **Families 1 and 2 have a backend.** The service serves
  `GET /onlyfans/api/v1/accounts`, `.../accounts/{id}/conversations` and
  `.../accounts/{id}/conversations/{conversationId}`, from the relay's own
  records, behind a service-to-service bearer token. `ONLYFANS_API_BASE_URL`
  points at it and `ONLYFANS_API_TOKEN` is its credential.
* **Nothing is deployed, migrated or bound.** The deployment is unconfigured, the
  migrations are authored and unapplied, and no account is bound, so today's
  real routes still answer `unavailable`. That is the honest state, not a
  placeholder.
* **Families 3-7 are still proposals** with a stronger reason now: the service
  has no delivery authority, no command route and no provider client, so nothing
  can pretend they exist.

The version is now negotiated in both directions, which closes the gap this
document recorded in §4.1: the dashboard sends
`X-OnlyFans-Schema-Version: of-preview.v2` and the service requires it; the
service stamps `schemaVersion` on every envelope and the dashboard refuses an
answer whose version is absent or different — as an **error**, not as
`unavailable`, because a backend that answers in the wrong contract is present
and needs a code change rather than a connection.

### 4.7 Offline foundation continuation

See [FOUNDATION-2026-10-18.md](FOUNDATION-2026-10-18.md). The service URL path is
still `/onlyfans/api/v1`; the v2 payload adds nullable sync timestamps and the
`retracted` delivery outcome. A successful read preserves stale sync state;
recent activity cannot establish synchronization or a healthy connection.
The actual Next handlers and pages have been exercised against the real backend
and disposable PostgreSQL using synthetic data. This does not deploy either
service or implement command families 3–7.
# Current Operations extension — 18 October 2026

`GET /api/onlyfans/accounts/{accountId}/operations` and the paired backend
`GET /onlyfans/api/v1/accounts/{accountId}/operations` retain outer
`of-preview.v2` and now require nested `of-operations.v3`. Earlier Operations
v1 examples below describe the historical checkpoint.

`modelCosts` has exactly `day` (valid UTC YYYY-MM-DD), `unit` (literal
`usd_millicents`), `spentMillicents`, `capPerProviderMillicents` (nullable),
`calls`, `unresolvedCalls` and `providers`. Numeric values are nonnegative safe
integers. 10,000 millicents equal USD 1.0000. Recorded spend includes retained
reservations; unresolved counts cover all-time pending/unknown calls, while
spend/calls/providers cover today's account-scoped daily rollups. The cap is
per provider, not a cross-provider total. No prompt or call identity crosses
this read. Controlled new reasons are `model_cost_unresolved` and
`model_budget_exhausted`. Older/future contracts and extra keys are refused.

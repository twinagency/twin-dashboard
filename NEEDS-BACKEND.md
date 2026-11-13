# Needs backend

The dashboard side of the engine wiring is built and tested against fixtures shaped like the backend's own output. These items need a backend change before they work against a real service. Until then each screen says "unavailable" or hides the control. Nothing here is faked as saved.

All paths are under the base URL in `ONLYFANS_API_BASE_URL`. All reads carry `Authorization: Bearer <API token>` and `X-OnlyFans-Schema-Version`. Writes carry the purpose token and a version header. Agency-scoped requests are rewritten to `/onlyfans/agency/v1/...` by the dashboard, so the backend agency allow-list in `onlyfans_read/agency_scope.py` must also admit the new GET paths below.

Reference for the existing shapes: `service/onlyfans_read/repo.py` `engine_status` (branch `claude/engine-defects-20261107`), `service/onlyfans_commands/engine_operator_api.py`, `service/conversation_engine/operator.py`.

## 1. HTTP route for the paged conversation status (read)

`engine_status(account_id, fan_id, cursor, limit)` exists as a repo method but is only reached through the conversation detail with its default page. The dashboard needs it with a cursor.

```
GET /onlyfans/api/v1/accounts/{accountId}/conversations/{conversationId}/engine-status?limit=20&cursor=<opaque>
```

- `limit`: integer 1 to 100 (default 20). `cursor`: opaque, `[A-Za-z0-9_=-]{1,512}`. The dashboard validates both and passes the cursor through untouched.
- Response: exactly what `engine_status` returns today, `schemaVersion: "of-engine.v1"`, `state: "current"`, plus `nextCursor` (string or null) and `environment` of `simulation`, `live` or `fansapi`. `conversationId` must be `{accountId}:{fanId}`. A different account or conversation is rejected by the dashboard parser.
- 404 when the fan has no engine owner. `{schemaVersion, state: "unavailable"}` when the binding changed, as today.
- The first page inside conversation detail (`detail.engineStatus`) must also carry `nextCursor` and the real `environment`. Today `engine_status` hard-codes `'environment': 'simulation'`.

## 2. Account-wide list of requests and sends needing a person (read)

Nothing serves this today.

```
GET /onlyfans/api/v1/accounts/{accountId}/engine/unresolved?limit=20&cursor=<opaque>
```

Response:

```json
{ "schemaVersion": "of-engine.v1", "state": "current", "scope": "account", "accountId": "of-a",
  "environment": "live", "nextCursor": null,
  "items": [ { "requestId": "<uuid>", "sourceMessageId": "9000", "status": "waiting_provider", "owner": "engine",
      "nextStep": "reconcile_existing_action", "revision": 3, "actionOutcome": "unknown", "actionType": "reply",
      "partsCompleted": 1, "partsTotal": 1, "conversationId": "of-a:42", "fanLabel": "fan_42",
      "attemptId": "<uuid or null>", "supportedActions": ["mark_reconciled"] } ] }
```

- Items are requests with `status` not in `completed|declined|cancelled`, plus any request whose newest action has `actionOutcome: "unknown"`. Unresolved first, then newest first, with the same keyset cursor idea as `engine_status`.
- `supportedActions` is the list of commands the backend will accept for that row. Omit or send `[]` when none. The dashboard shows "Mark reconciled" only when it contains `"mark_reconciled"`.
- `attemptId` is the send attempt without a confirmed outcome, or null.

## 3. Mark reconciled (write)

Same operator route as today, one more action. Do not add a second route.

```
POST /onlyfans/control/v1/accounts/{accountId}/conversations/{conversationId}/requests/{requestId}
Header: X-OnlyFans-Engine-Operator-Version: of-engine-operator.v1
{ "action": "mark_reconciled", "expectedRevision": 3, "commandKey": "<64 hex>", "actor": "<actor>",
  "evidenceRef": "operator:live:<what the person checked, up to 108 chars>" }
```

- Acknowledgement is the existing shape: `{schemaVersion, ok: true, accountId, conversationId, requestId, action: "mark_reconciled", commandKey, status, owner, nextStep, recordedRevision: expectedRevision + 1, replayed}`. `status` is whatever the request is after reconciliation. The dashboard checks only that it is a string.
- Semantics for the backend to define: the operator states that the unknown send was checked against provider evidence. It must not claim a delivery the evidence does not show. The existing `resolve_delivery_evidence` control (provider message id plus decision) remains the way to settle an attempt; this action is for the request-level record.
- Until this exists, a backend that receives the action answers 400 and the dashboard shows "The request action was not accepted."

## 4. Operator resolution evidence outside the simulation

`conversation_engine/operator.py` `execute` refuses anything but a synthetic delivery policy (`transport_kind != 'synthetic'`) and requires `evidence_ref.startswith('synthetic:')` for `complete` and `decline`.

The dashboard now sends:

- `synthetic:operator:<note>` when the status environment is `simulation` (unchanged).
- `operator:<environment>:<note>` when it is `live` or `fansapi` (`environment` is `live` or `fansapi`). At most 125 characters.

`execute` refuses every action, including `request_handover` and `accept_handover`, when the delivery policy is not synthetic, so a real binding needs that guard relaxed as well as the evidence prefix. For a real binding the backend must accept the `operator:` prefix, still insist on `synthetic:` for synthetic bindings, and refuse the reverse. Until then a real-environment request answers 409 and the dashboard shows "The request changed or is held. Refresh and review it before trying again."

The dashboard sends the `environment` label only to build the audit string. The backend must decide the real environment from the binding and must not trust the label.

## 5. Catalogue approval (read and write)

The vault already syncs `CatalogItem` rows (label, media ids, tags, price). The engine searches an `approved_available_catalogue` but there is no persisted `proposed|approved|retired` status and no way to confirm a price.

Read:

```
GET /onlyfans/api/v1/accounts/{accountId}/engine/catalogue?limit=20&cursor=<opaque>
```

```json
{ "schemaVersion": "of-engine-catalogue.v1", "ok": true, "accountId": "of-a", "nextCursor": null,
  "items": [ { "itemId": "11", "label": "Beach set", "mediaCount": 6, "tags": ["beach"],
      "proposedPriceCents": 1500, "approvedPriceCents": null, "status": "proposed",
      "revision": 0, "fingerprint": "<64 hex>" } ] }
```

- `status` is `proposed`, `approved` or `retired`. `approvedPriceCents` is non-null exactly when `status` is `approved`. Prices are integers from 300 to 20000. `itemId` is the `CatalogItem.id`. The dashboard rejects a row that breaks these rules.
- `revision` and `fingerprint` come from the item and bind a decision to what the person saw.

Write (content purpose token):

```
POST /onlyfans/content/v1/accounts/{accountId}/engine-catalogue/{itemId}
Header: X-OnlyFans-Engine-Catalogue-Version: of-engine-catalogue.v1
{ "action": "approve", "expectedRevision": 0, "expectedFingerprint": "<64 hex>", "confirmedPriceCents": 1500,
  "commandKey": "<64 hex>", "actor": "<actor>" }
{ "action": "retire", "expectedRevision": 2, "expectedFingerprint": "<64 hex>", "commandKey": "<64 hex>", "actor": "<actor>" }
```

Acknowledgement: `{ "schemaVersion": "of-engine-catalogue.v1", "ok": true, "applied": true, "accountId", "itemId", "commandKey", "action", "recordedRevision": expectedRevision + 1, "status": "approved" | "retired" }`. 409 on a stale revision or fingerprint.

The engine must offer only `approved` items and must use `approvedPriceCents`, never the proposed price. Manager access only.

## 6. Purchase evidence on requests (optional field)

Without a backend change the dashboard derives purchased, unlocked, refunded and held for review from `status`, `nextStep` and `actionType`, which is accurate but coarse. To show amounts and transaction references, add this optional field to each request in `engine_status` and the account list:

```json
"purchase": { "state": "purchased", "amountCents": 1500, "providerTransactionId": "tx-9" }
```

`state` is `offered|purchased|unlocked|refunded|held_for_review`. `amountCents` and `providerTransactionId` are optional. When present it overrides the derived state.

## 7. Plan C operator surface (`/onlyfans/plan-c`)

Built against `PLAN-C/OPERATOR-API-CONTRACT.md`. The dashboard proxies to `/onlyfans/control/v2/accounts/{account}/...` with the CONTROL token and header `X-OnlyFans-Engine-Operator-Version: of-engine-operator.v2`. Operator only (the internal session; agency, view-as and chat-only access are refused by the route and by `agencyOnlyFansRequest`). The contract leaves some response and acknowledgement fields open; this is what the dashboard parses, so the backend routes must match it (the typed mock in `tests/contracts/plan-c-mock-backend.ts` is the executable form).

Every JSON body carries `schemaVersion: "of-engine-operator.v2"`.

- `GET drafts` -> `{ ok: true, accountId, drafts: [...] }`. Each draft: `requestId` (uuid), `generation`, `draftVersion` (also accepted as `version`), `draftHash` (64 hex), `status` (`awaiting` is the only approvable state; `approved` is shown as waiting for delivery), `fanId` or `conversationId` (`{accountId}:{fanId}`), `expiresAt` (ISO), `parts` (ordered; each `{ part_index|partIndex, action, body|text, price_cents|priceCents, currency, media_ids|mediaIds, preview_ids, catalog_item_id|productId }`), optional `action` (`reply|offer`, derived from the parts when absent), optional draft-level `offer`/`productId`/`mediaCount`/`priceCents`/`currency`, `conversation: { revision, messages: [{ direction, text, at }] }` (the last 10 are shown), `evidence` (string or string array), and `approvedBy`/`actor` and `approvedAt`/`decidedAt` once approved. A draft that fails these checks, or belongs to another account, makes the whole list unreadable; it is never shown half-parsed.
- `conversation.revision` (or `conversationRevision`) is required for Stop, Take over and Hand back to be offered. Without it the screen says the revision is unknown and offers nothing.
- A conversation taken over has no draft left, so the hand back button depends on it appearing in `unresolved` with `conversationId` and `revision` (owner `human`, next step `awaiting_handback` or similar). Within one browser session the screen also remembers a takeover it just made, from `recordedRevision` in the acknowledgement.
- `GET unresolved` -> `{ ok: true, accountId, items: [{ id, kind, owner, nextStep, summary, conversationId?, revision?, createdAt? }] }`. `kind` is free text; `unknown_send`, `unlinked_transaction` and `unreconciled_access` get labels.
- `POST drafts/{requestId}/{generation}/approve|reject|edit`, `POST conversations/{conversationId}/stop|takeover|handback`, `POST unresolved/{id}/reconcile`: exactly the keys in the contract and no others (`actor` comes from the proxy, never the browser). Reconcile sends `evidenceRef: "operator:fansapi:<what the operator checked>"` (6 to 108 characters).
- Acknowledgement: 200 with `{ schemaVersion, ok: true, commandKey, replayed }` (`commandKey` must echo the request; `accountId`, `action`, `requestId`, `conversationId` and `id` are checked when present; `recordedVersion` and `recordedRevision` are used when present). Anything else is shown as unconfirmed, and a retry reuses the same `commandKey`, so the backend must replay an identical command and answer 409 to the same key with a different body.
- 409 means version or revision conflict: the screen reloads and shows the current draft. 404 and 410 also reload, refused as not available (not as a conflict). 400, 401, 403, 405, 413, 422 are refused. Everything else (any other non-2xx including 503, a 2xx without a matching ack, timeouts, unreadable replies) is unconfirmed: a 503 does not prove the write was not applied.
- The screen rejects em and en dashes in edited fan text before sending. The backend's own validation still applies.

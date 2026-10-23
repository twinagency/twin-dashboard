# Native launch dashboard contracts

The browser talks only to authenticated Next routes. Those routes derive the actor and command identity, keep purpose credentials server-side, and reuse the current agency grant. Native backend responses are checked for their exact contract version and account identity before projection. Native data is read back after every mutation; acknowledgements never replace newer current state.

| Operator flow | Dashboard route | Backend route suffix | Purpose/version | Mutation authority |
| --- | --- | --- | --- | --- |
| Readiness | `/api/onlyfans-launch/abc/accounts/{id}/readiness` | `/onlyfans/api/v1/accounts/{id}/readiness` | API / `of-preview.v2`; nested `of-launch-readiness.v1` | Read only |
| Ledger status | `.../abc/accounts/{id}/purchases` | `/onlyfans/api/v1/accounts/{id}/ledger` | API; flat `of-ledger.v1` | Read only |
| Ledger evidence pages | `.../abc/accounts/{id}/purchases/evidence?cursor=&limit=` | `/onlyfans/api/v1/accounts/{id}/ledger/evidence` | API / `of-preview.v2`; nested `of-ledger.v1` | Read only |
| Ledger recovery | `.../abc/accounts/{id}/command` with path `ledger/retry` | `/onlyfans/control/v1/accounts/{id}/ledger/retry` | CONTROL / `of-controls.v1` | Manager; expected connection revision and scan fingerprint, derived actor header/key; held current scan only |
| Verified transaction reconciliation | Same with path `ledger/resolve` | `/onlyfans/control/v1/accounts/{id}/ledger/resolve` | CONTROL / `of-controls.v1` | Manager; expected fingerprint, evidence hash, reason; no arbitrary ownership writes |
| Personality current/import/review/approval/history/revision | `.../abc/accounts/{id}/personality` and command/history/revision paths | `/onlyfans/configuration/v1/accounts/{id}/personality` | CONFIGURATION / `of-configuration.v3`; nested `of-personality.v1` | Manager; personality revision, displayed expected binding and derived actor/key. Approval requires all three acknowledgements |
| AI model, budget, reasoning, persona/facts | `/api/onlyfans-configuration/accounts/{id}` | `/onlyfans/configuration/v1/accounts/{id}` | CONFIGURATION / `of-configuration.v3` | Existing manager writer; configuration revision/fingerprint and audit |
| Memory fan pages and archive progress | `.../memory/accounts/{id}/fans?cursor=&limit=` | Configuration prefix + `/history-memory/fans` and `/history-memory/progress` | CONFIGURATION; nested memory/history versions | Read only; bounded paginated projection, no per-fan list fetches |
| Memory detail/source excerpts | `.../memory/accounts/{id}/fans/{fan}?query=` | Configuration prefix + `/history-memory/fans/{fan}/memory` and `/progress` | CONFIGURATION; nested `of-history-memory.v1` | Read only; decimal fan IDs stay strings |
| Memory corrections | PATCH memory detail | Configuration prefix + `/history-memory/fans/{fan}/corrections` | CONFIGURATION | Manager; field, set/clear, value/null, hash expectedVersion, reason, derived actor/key |
| Archive request/resume | POST account or fan `/backfill` | Configuration prefix + account or fan `/backfill` | CONFIGURATION | Manager; scheduling acknowledgement only |
| Engagement settings | `.../automation/accounts/{id}/settings` | Configuration prefix + `/engagement`, POST `/engagement/settings` | CONFIGURATION; nested `of-engagement.v1` | Manager; settings revision, full strict policy, derived actor/key |
| Engagement actions/detail | `.../automation/accounts/{id}/follow-ups?cursor=&limit=`, `/{actionId}` | Configuration prefix + `/engagement/actions`, `/{actionId}` | CONFIGURATION; nested `of-engagement.v1` | GET read only; explicit refresh/cancel POST require manager |
| Account pause/emergency stop/resume | `.../automation/accounts/{id}/emergency-stop` | API readiness read; CONTROL `/control` write | Separate API / CONTROL purposes | Manager; action, expected account fingerprint, reason, derived actor/key; authoritative readback |
| Conversation handling/takeover/no-contact | Existing `/api/onlyfans-controls/accounts/{id}/conversations/{conversationId}` | Existing control authority | CONTROL / `of-controls.v1` | Existing revisioned manager controls |

All Next launch responses use their browser wrapper (`of-launch.v1` for A, `of-launch-b.v1` for memory/automation). Body size, origin, content type, account binding, management scope, optimistic state guards and request replay remain enforced. Unsupported or unparseable responses show an error; operational routes do not use fixture data.

A current document can be a draft while the prior saved configuration remains effective. Import/review does not apply its text. Approval applies the saved complete review atomically, using the personality revision and displayed creator binding rather than the configuration revision. The native transaction fences the current binding; acknowledgements must match that binding, the next revision and the requested document state. A previously approved document can cease to match the saved configuration after another configuration edit; the UI reports that separately from approval and launch readiness. Historical approval acknowledgements never replace a newer current view.

Readiness separates stored memory processing, provider archive recovery, recent intake, current approval, credential/budget state, actual runtime flags and permission to activate. Unknown provider totals stay unknown. English declaration extraction and lexical source retrieval are explicit limits.

Cancellation requested, queued, dispatching, unknown and transport accepted remain distinct. A transport acceptance or paid-message send does not establish a purchase. A recovery request does not establish reconciliation completion. Account resume permits only new revalidated work; cancelled work is not replayed.

Synthetic contract and component browser suites are separate from the actual combined Next/API disposable rehearsal. Neither establishes production deployment or real-account autonomous handling.

The final combined disposable rehearsal passed all four cases on 23 October 2026, including the actual Next/API personality, ledger, memory, engagement and emergency-stop flows plus cleanup. Connected labels describe these delivered contracts. They do not establish a deployed version, completed live catch-up, approved live spending, provider behavior or enabled autonomous handling.

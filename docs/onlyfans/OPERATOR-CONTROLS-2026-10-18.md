# Operator controls — offline checkpoint, 18 October 2026

Paired backend schema: `0078_operator_controls`. Full behavior and credential
contract are documented in the backend's document of the same name.

The Inbox now submits pause, resume, takeover, hand-back and no-contact controls
through `/api/onlyfans-controls`. The separate write credential stays on the
dashboard server. Every request verifies the operator session, denies agency
and view-as identities, checks Origin/Fetch Metadata, and forwards only the
bounded command to the backend's active-binding and revision gate.

The existing `/api/onlyfans` read routes and read-only backend interface stay
separate. Read capability flags enable only the local controls for the explicit
command tenant. Provider health can remain disconnected while an operator
stops local work. Manual sends, delivery resolution, reconnect, prices, caps
and payment decisions remain unavailable.

An acknowledgement confirms an immutable historical control event. The UI then
refreshes accounts and conversation state. A lost acknowledgement stays visibly
unconfirmed and offers an explicit retry of the original request. The browser
does not choose the actor, override consent, clear unknown sends or apply an
optimistic mode. Session loss removes private conversation caches and actions.
The shared admin session supplies session-level attribution, not named-staff
identity. Preview fixtures still simulate and never substitute for live reads.

Takeover is requested while a send is unresolved. Only settled delivery
evidence can make it effective; resume and hand-back remain blocked meanwhile.
No-contact has no reversal control. Resuming does not regenerate an old reply
or reset an account, delivery or model allowance.

Actual API/Next/Chromium acceptance uses only synthetic identities, local HTTP
and disposable PostgreSQL. It exercises all five controls, a committed command
whose acknowledgement is deliberately lost and retried, unknown delivery holds,
cross-account and agency denials, CSRF checks, session loss, mobile Operations
and zero external browser requests. The checkpoint includes exact test logs.

This checkpoint is not deployed and does not use real accounts or paid models.
Curated packs, full native policy/semantic acceptance, provider lifecycle,
legacy writer retirement/import and production cutover remain open.

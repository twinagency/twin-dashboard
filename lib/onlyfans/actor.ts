/** Branded actor strings, so a named owner cannot reach a boundary that needs the session's own actor. Types only. */
declare const actorKind: unique symbol;
/** The actor this request's own session proves (owner-token hash or agency grant): revocable per session, the only kind an upload may carry. */
export type SessionActor = string & { readonly [actorKind]: "session" };
/** The stable named-owner actor (plan-c-owner-core.ts). Same op-session shape, but no session verifies it: never an upload actor. */
export type NamedOwnerActor = string & { readonly [actorKind]: "named-owner" };

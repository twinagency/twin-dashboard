export * from "./engagement-model";
import { ACTION_STATUS, ACTION_KIND, ActionStatus, EngagementAction, UUID, parseAction, POLICY_BOOLS, POLICY_INTS, Policy, EngagementSettings, parseSettings } from "./engagement-model";
import { digest, fail, ok, rec, upstream, refusal, READ_ONLY, FAN_ID, type Ans, type Env, type Rec } from "./upstream";
export async function engagementRead(env: Env): Promise<Ans> {
  const [settings, actions] = await Promise.all([upstream(env.fetch, "configuration", env.accountId, "/engagement"), upstream(env.fetch, "configuration", env.accountId, "/engagement/actions")]);
  if (!settings.ok) return refusal(settings);
  if (!actions.ok) return refusal(actions);
  const s = parseSettings(settings.body), list = Array.isArray(actions.body.actions) && actions.body.actions.length <= 50 ? actions.body.actions.map(parseAction) : null;
  const rows = list && list.every((a): a is EngagementAction => a !== null) ? list : null;
  if (!s || !rows || new Set(rows.map(r => r.actionId)).size !== rows.length) return fail(503, "The scheduled-message answer was not in the expected shape, so nothing is shown.", "unreadable");
  return ok(env.accountId, { settings: s, actions: rows });
}
const CANCELLABLE = new Set<ActionStatus>(["scheduled", "queued"]);
export async function engagementCancel(env: Env, input: unknown): Promise<Ans> {
  if (!env.canManage || !env.actor) return READ_ONLY;
  if (!rec(input) || Object.keys(input).join() !== "actionId" || typeof input.actionId !== "string" || !UUID.test(input.actionId)) return fail(400, "That cancellation is invalid.", "invalid_request");
  const r = await upstream(env.fetch, "configuration", env.accountId, `/engagement/actions/${input.actionId}/cancel`, { method: "POST", body: { actor: env.actor, reason: "operator_cancelled" } });
  if (!r.ok) return refusal(r);
  const a = parseAction(r.body.action);
  if (!a || a.actionId !== input.actionId) return fail(502, "The outcome is not confirmed. Refresh the list before trying again.", "outcome_unconfirmed", { outcome: "unconfirmed" });
  // "cancelled" only when the backend says so. A request on a message already past the point of no return is a request, not a cancellation.
  return ok(env.accountId, { action: a, cancelled: a.status === "cancelled", cancellable: CANCELLABLE.has(a.status) }, { outcome: a.status === "cancelled" ? "cancelled" : a.cancelRequested ? "cancel_requested" : "not_cancellable" });
}

/** Account-wide controls. "engagement" turns proactive messages off (configuration purpose, team managers allowed).
 * "account" pauses the provider connection and all outgoing messages (connection purpose, Twin operator only). */
export type ConnectionPort = {
  get(accountId: string): Promise<{ ok: true; data: { revision: number; status: string; outgoingEnabled: boolean } } | { ok: false; status: number; error: string }>;
  command(accountId: string, command: { action: "pause"; payload: Record<string, never>; expectedRevision: number; actor: string; commandKey: string }):
    Promise<{ ok: true; ack: { recordedRevision: number } } | { ok: false; status: number; outcome?: string; error: string }>;
};
export async function stopControl(env: Env, input: unknown, connection: ConnectionPort | null): Promise<Ans> {
  if (!env.canManage || !env.actor) return READ_ONLY;
  if (!rec(input) || Object.keys(input).join() !== "scope" || !["engagement", "account"].includes(input.scope as string)) return fail(400, "That stop request is invalid.", "invalid_request");
  const unconfirmed = fail(502, "The outcome is not confirmed. Nothing is assumed stopped. Refresh before trying again.", "outcome_unconfirmed", { outcome: "unconfirmed" });
  if (input.scope === "account") {
    if (env.agency) return fail(403, "Pausing the whole account is available to the Twin operator only. Stop proactive messages or pause conversations instead.", "operator_only");
    if (!connection) return fail(503, "Account connection management is not configured.", "unavailable", { outcome: "unavailable" });
    const got = await connection.get(env.accountId);
    if (!got.ok) return fail(got.status === 404 ? 404 : 503, "The account connection could not be read, so nothing was changed.", "unavailable", { outcome: "unavailable" });
    if (!got.data.outgoingEnabled) return ok(env.accountId, { recorded: false, reason: "Outgoing messages were already off. Nothing new was recorded.", status: got.data.status }, { outcome: "no_change" });
    const commandKey = digest(["launch_account_pause", env.accountId, got.data.revision, env.actor]);
    const done = await connection.command(env.accountId, { action: "pause", payload: {}, expectedRevision: got.data.revision, actor: env.actor, commandKey });
    if (!done.ok) return done.outcome === "unconfirmed" || done.status >= 500 ? unconfirmed : fail(done.status === 409 ? 409 : done.status === 404 ? 404 : done.status === 403 ? 403 : 503,
      done.status === 409 ? "The account changed. Refresh and try again." : "The pause was not accepted. Nothing was changed.", "refused", { outcome: "refused" });
    return ok(env.accountId, { recorded: true, recordedRevision: done.ack.recordedRevision }, { outcome: "recorded" });
  }
  const current = await upstream(env.fetch, "configuration", env.accountId, "/engagement");
  if (!current.ok) return refusal(current);
  const s = parseSettings(current.body);
  if (!s) return fail(503, "The engagement settings could not be read, so nothing was changed.", "unreadable");
  if (!s.settings.enabled) return ok(env.accountId, { recorded: false, reason: "Proactive messages were already off. Nothing new was recorded." }, { outcome: "no_change" });
  // The backend merges a partial settings object over defaults, so the whole current object is sent with only the switch changed.
  const settings = { ...s.settings, enabled: false };
  const commandKey = digest(["launch_engagement_stop", env.accountId, s.revision, settings, env.actor]);
  const r = await upstream(env.fetch, "configuration", env.accountId, "/engagement/settings", { method: "POST", body: { expectedRevision: s.revision, commandKey, actor: env.actor, settings } });
  if (!r.ok) return refusal(r);
  if (r.body.commandKey !== commandKey || r.body.revision !== s.revision + 1 || r.body.ok !== true) return unconfirmed;
  return ok(env.accountId, { recorded: true, recordedRevision: r.body.revision }, { outcome: "recorded" });
}
export type { Rec };

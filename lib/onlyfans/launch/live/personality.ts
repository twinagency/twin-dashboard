export * from "./personality-model";
import { PERSONALITY_VERSION, FACT_KEYS, FactKey, Conflict, Review, Ack, Evidence, Observation, Readiness, Document, Personality, History, int, parsePersonality, parseHistory, validReview, ACK, PersonalityAction } from "./personality-model";
import { digest, fail, ok, rec, upstream, refusal, READ_ONLY, ID, type Ans, type Env, type Rec } from "./upstream";
export async function personalityRead(env: Env, path: { history?: { before: string | null }; revision?: string }): Promise<Ans> {
  const { fetch, accountId } = env;
  if (path.history) {
    if (path.history.before !== null && !/^[1-9][0-9]{0,9}$/.test(path.history.before)) return fail(400, "That page reference is invalid.", "invalid_request");
    const r = await upstream(fetch, "configuration", accountId, `/personality/history${path.history.before ? `?before=${path.history.before}` : ""}`);
    if (!r.ok) return refusal(r);
    const h = r.body.personalityVersion === PERSONALITY_VERSION ? parseHistory(r.body.personality) : null;
    return h ? ok(accountId, h) : fail(503, "The history answer was not in the expected shape, so nothing is shown.", "unreadable");
  }
  if (path.revision !== undefined && !/^[1-9][0-9]{0,9}$/.test(path.revision)) return fail(400, "That revision is invalid.", "invalid_request");
  const r = await upstream(fetch, "configuration", accountId, path.revision ? `/personality/revisions/${path.revision}` : "/personality");
  if (!r.ok) return refusal(r);
  const p = r.body.personalityVersion === PERSONALITY_VERSION ? parsePersonality(r.body.personality) : null;
  return p ? ok(accountId, p) : fail(503, "The personality answer was not in the expected shape, so nothing is shown.", "unreadable");
}

/** Server-derived actor and command key. A retry after a lost reply is byte-identical and therefore idempotent. */
export async function personalityCommand(env: Env, action: PersonalityAction, input: unknown): Promise<Ans> {
  const { fetch, accountId, actor } = env;
  if (!env.canManage || !actor) return READ_ONLY;
  if (!rec(input)) return fail(400, "That personality request is invalid.", "invalid_request");
  const allowed = action === "import" ? ["expectedRevision", "bindingId"] : action === "review" ? ["expectedRevision", "bindingId", "review"] : ["expectedRevision", "bindingId", "acknowledgements"];
  if (Object.keys(input).sort().join() !== allowed.sort().join() || !int(input.expectedRevision) || (input.expectedRevision as number) >= 2 ** 31 - 1 ||
    typeof input.bindingId !== "string" || !ID.test(input.bindingId)) return fail(400, "That personality request is invalid.", "invalid_request");
  let extra: Rec = {};
  if (action === "review") { if (!validReview(input.review)) return fail(400, "That review is invalid.", "invalid_request"); extra = { review: input.review }; }
  if (action === "approve") {
    const a = input.acknowledgements;
    if (!rec(a) || Object.keys(a).sort().join() !== Object.keys(ACK).sort().join() || Object.values(a).some(x => x !== true)) return fail(400, "Approval needs all three acknowledgements.", "invalid_request");
    extra = { acknowledgements: ACK };
  }
  const commandKey = digest([action, accountId, input.bindingId, input.expectedRevision, extra, actor]);
  const r = await upstream(fetch, "configuration", accountId, `/personality/${action}`, { method: "POST", body: { expectedRevision: input.expectedRevision, commandKey, actor, ...extra } });
  if (!r.ok) return refusal(r);
  const p = r.body.personalityVersion === PERSONALITY_VERSION && r.body.commandKey === commandKey ? parsePersonality(r.body.personality) : null;
  // A replay acknowledges its recorded revision, never the current one. Success needs the right state for the action.
  const expected = action === "approve" ? "approved" : "draft";
  if (!p || p.state !== expected || p.bindingId !== input.bindingId)
    return fail(502, "The outcome is not confirmed. Refresh before trying again; a retry of the same request is safe.", "outcome_unconfirmed", { outcome: "unconfirmed" });
  return ok(accountId, { recordedRevision: p.revision, state: p.state }, { outcome: "recorded" });
}

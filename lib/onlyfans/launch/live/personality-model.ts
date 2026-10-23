/** Personality import, review, approval, history and readiness against the configuration-purpose backend routes
 * (of-personality.v1). Readiness comes only from the backend; a saved model name is never treated as readiness. */
import { rec, FAN_ID, ID, type Rec } from "./shared";

export const PERSONALITY_VERSION = "of-personality.v1";
export const FACT_KEYS = ["age", "job", "home_city", "relationship", "kids", "family", "tattoos", "kinks", "limits"] as const;
export type FactKey = typeof FACT_KEYS[number];
export type Conflict = { code: string; severity: "block"; message: string };
export type Review = { persona?: string; creatorFacts?: Partial<Record<FactKey, string | null>>; defaultModel?: string; replyModelOverride?: string | null };
export type Ack = { mixedAuthorship: true; runtimeRules: true; factsVerified: true };
export type Evidence = { id: string; sourceId: string; kind: string; author: string; excerpt: string; truncated: boolean };
export type Observation = { key: string; value: string; evidenceIds: string[]; attribution: string };
export type Readiness = { ready: boolean; blockers: string[];
  model: { state: string; modelId: string | null; provider: string | null };
  credential: { state: string; configured: boolean; metadataAvailable: boolean };
  budget: { state: string; dailyCostCapCents: number | null };
  tone: { state: string; conflicts: Conflict[] } };
export type Document = { source: string; review: Review;
  draft: { creatorFacts: Observation[]; writingStyle: Observation[]; operationalInstructions: { text: string; attribution: string; conflicts: Conflict[] }[];
    suggestedPersona: { text: string; warning: string | null; attribution: string | null }; evidence: Evidence[]; coverage: Rec };
  approval: { appliedConfigurationRevision: number } | null };
export type Personality = { state: "empty" | "draft" | "approved"; revision: number; bindingId: string; document: Document | null;
  configurationRevision: number | null; configurationCurrent: boolean | null; conflicts: Conflict[]; requiresFactResolution: string[];
  factComparisons: { key: string; current: string | null; proposed: string | null; changed: boolean }[]; readiness: Readiness | null;
  createdAt: string | null; actor: string | null };
export type History = { revisions: { revision: number; state: string; actor: string; createdAt: string }[]; nextBefore: number | null };

const str = (v: unknown, max = 8192): v is string => typeof v === "string" && v.length <= max;
const strOrNull = (v: unknown): v is string | null => v === null || str(v);
export const int = (v: unknown): v is number => Number.isSafeInteger(v) && (v as number) >= 0;
const list = <T,>(v: unknown, f: (x: unknown) => x is T, max = 500): v is T[] => Array.isArray(v) && v.length <= max && v.every(f);
const conflict = (v: unknown): v is Conflict => rec(v) && str(v.code, 64) && v.severity === "block" && str(v.message, 500);
const obs = (v: unknown): v is Observation => rec(v) && str(v.key, 64) && str(v.value, 2000) && list(v.evidenceIds, (x): x is string => str(x, 80), 50) && str(v.attribution, 32);

function parseReadiness(v: unknown): Readiness | null {
  if (!rec(v) || typeof v.ready !== "boolean" || !list(v.blockers, (x): x is string => str(x, 200), 50) || !rec(v.model) || !str(v.model.state, 64) ||
    !strOrNull(v.model.modelId) || !(v.model.provider === null || str(v.model.provider, 64)) || !rec(v.credential) || !str(v.credential.state, 64) ||
    typeof v.credential.configured !== "boolean" || typeof v.credential.metadataAvailable !== "boolean" || !rec(v.budget) || !str(v.budget.state, 64) ||
    !(v.budget.dailyCostCapCents === null || int(v.budget.dailyCostCapCents)) || !rec(v.tone) || !str(v.tone.state, 64) || !list(v.tone.conflicts, conflict)) return null;
  // Readiness may never be claimed without a verified credential: a contradictory answer is refused outright.
  if (v.ready && (!v.credential.configured || !v.credential.metadataAvailable)) return null;
  return v as unknown as Readiness;
}
export function parsePersonality(v: unknown): Personality | null {
  if (!rec(v) || v.version !== PERSONALITY_VERSION || !["empty", "draft", "approved"].includes(v.state as string) || !int(v.revision) || !str(v.bindingId, 80)) return null;
  if (v.state === "empty") return v.document === null ? { state: "empty", revision: v.revision, bindingId: v.bindingId, document: null, configurationRevision: null,
    configurationCurrent: null, conflicts: [], requiresFactResolution: [], factComparisons: [], readiness: null, createdAt: null, actor: null } : null;
  const d = v.document;
  if (!rec(d) || !str(d.source, 64) || !rec(d.review) || !rec(d.draft) || !list(d.draft.creatorFacts, obs) || !list(d.draft.writingStyle, obs) ||
    !list(d.draft.operationalInstructions, (x): x is Document["draft"]["operationalInstructions"][number] => rec(x) && str(x.text, 4000) && str(x.attribution, 32) && list(x.conflicts, conflict), 200) ||
    !rec(d.draft.suggestedPersona) || !str(d.draft.suggestedPersona.text, 4096) || !strOrNull(d.draft.suggestedPersona.warning ?? null) ||
    !list(d.draft.evidence, (x): x is Evidence => rec(x) && str(x.id, 80) && str(x.sourceId, 80) && str(x.kind, 32) && str(x.author, 32) && str(x.excerpt, 2000) && typeof x.truncated === "boolean", 200) ||
    !rec(d.draft.coverage)) return null;
  const readiness = parseReadiness(v.readiness);
  if (!readiness || !int(v.configurationRevision) || typeof v.configurationCurrent !== "boolean" || !list(v.conflicts, conflict) ||
    !list(v.requiresFactResolution, (x): x is string => str(x, 40), 20) || !str(v.createdAt, 40) || !str(v.actor, 128) ||
    !list(v.factComparisons, (x): x is Personality["factComparisons"][number] => rec(x) && str(x.key, 40) && strOrNull(x.current) && strOrNull(x.proposed) && typeof x.changed === "boolean", 20)) return null;
  const approval = d.approval === undefined ? null : rec(d.approval) && int(d.approval.appliedConfigurationRevision) ? { appliedConfigurationRevision: d.approval.appliedConfigurationRevision } : undefined;
  if (approval === undefined || (v.state === "approved") !== (approval !== null)) return null;
  return { state: v.state as "draft" | "approved", revision: v.revision, bindingId: v.bindingId, configurationRevision: v.configurationRevision,
    configurationCurrent: v.configurationCurrent, conflicts: v.conflicts, requiresFactResolution: v.requiresFactResolution, factComparisons: v.factComparisons,
    readiness, createdAt: v.createdAt, actor: v.actor,
    document: { source: d.source, review: d.review as Review, draft: d.draft as unknown as Document["draft"], approval } };
}
export function parseHistory(v: unknown): History | null {
  if (!rec(v) || !list(v.revisions, (x): x is History["revisions"][number] => rec(x) && int(x.revision) && str(x.state, 16) && str(x.actor, 128) && str(x.createdAt, 40), 20) ||
    !(v.nextBefore === null || (int(v.nextBefore) && v.nextBefore > 0))) return null;
  return v as unknown as History;
}

/** Review from the browser: only the four supported keys, bounded, never an actor or credential. */
export function validReview(v: unknown): v is Review {
  if (!rec(v) || !Object.keys(v).length || Object.keys(v).some(k => !["persona", "creatorFacts", "defaultModel", "replyModelOverride"].includes(k))) return false;
  if ("persona" in v && !(typeof v.persona === "string" && v.persona.trim() && v.persona.length <= 4096)) return false;
  if ("defaultModel" in v && !(typeof v.defaultModel === "string" && v.defaultModel.trim() && v.defaultModel.length <= 160)) return false;
  if ("replyModelOverride" in v && !(v.replyModelOverride === null || (typeof v.replyModelOverride === "string" && v.replyModelOverride.trim() && v.replyModelOverride.length <= 160))) return false;
  if ("creatorFacts" in v) {
    const f = v.creatorFacts;
    if (!rec(f) || !Object.keys(f).length || Object.entries(f).some(([k, x]) => !(FACT_KEYS as readonly string[]).includes(k) || !(x === null || (typeof x === "string" && x.trim() && x.length <= 240)))) return false;
  }
  return true;
}
export const ACK = { mixedAuthorship: true, runtimeRules: true, factsVerified: true };
export type PersonalityAction = "import" | "review" | "approve";


export const HANDOVER_SCHEMA = "of-handover.v1";
export type Handover = {
  schemaVersion: typeof HANDOVER_SCHEMA; accountId: string; conversationId: string; revision: number;
  mode: "automated" | "paused" | "human_controlled" | "no_contact";
  takeoverState: "none" | "requested" | "effective";
  owner: "you" | "team" | "operator" | "unknown" | null;
  canActAsOwner: boolean; hasMore: boolean;
  events: { action: string; mode: string; revision: number; who: string; at: string }[];
};
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** Redact immutable actor identifiers at the BFF. Browser labels are not grants. */
export function handoverForViewer(value: unknown, accountId: string, conversationId: string, actor: string | null, canManage: boolean, agency: boolean): Handover | null {
  if (!object(value) || value.schemaVersion !== HANDOVER_SCHEMA || value.accountId !== accountId || value.conversationId !== conversationId ||
      !Number.isSafeInteger(value.revision) || (value.revision as number) < 0 || !["automated", "paused", "human_controlled", "no_contact"].includes(String(value.mode)) ||
      !["none", "requested", "effective"].includes(String(value.takeoverState)) || !(value.ownerActor === null || typeof value.ownerActor === "string") ||
      typeof value.hasMore !== "boolean" || !Array.isArray(value.events) || value.events.length > 30) return null;
  const who = (id: string) => id === actor ? "you" : id.startsWith("agency-user:") ? "team" : id.startsWith("op-session:") ? "operator" : "system";
  const events: Handover["events"] = [];
  for (const event of value.events) {
    if (!object(event) || typeof event.action !== "string" || event.action.length > 32 || typeof event.actor !== "string" || event.actor.length > 128 ||
        typeof event.mode !== "string" || !["automated", "paused", "human_controlled", "no_contact"].includes(event.mode) || !Number.isSafeInteger(event.revision) || (event.revision as number) > (value.revision as number) ||
        typeof event.at !== "string" || !Number.isFinite(Date.parse(event.at))) return null;
    events.push({ action: event.action, mode: event.mode, revision: event.revision as number, who: who(event.actor), at: event.at });
  }
  const owner = value.takeoverState === "none" ? null : value.ownerActor ? who(value.ownerActor as string) : "unknown";
  return { schemaVersion: HANDOVER_SCHEMA, accountId, conversationId, revision: value.revision as number, mode: value.mode as Handover["mode"],
    takeoverState: value.takeoverState as Handover["takeoverState"], owner: owner === "system" ? "unknown" : owner,
    canActAsOwner: canManage && (!agency || value.ownerActor === actor), hasMore: value.hasMore, events };
}

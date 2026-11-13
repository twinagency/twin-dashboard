/** Section E types, parsers and pure action rules. */
import { ONLYFANS_PREVIEW_SCHEMA_VERSION, type AutomationMode, type TakeoverState } from "@/lib/onlyfans-preview/types";
import type { ControlAction } from "@/lib/onlyfans/controls";
import { parseWorkspace } from "@/lib/onlyfans/workspace";
import { bId } from "../b-common";

export const MODES: readonly AutomationMode[] = ["automated", "human_controlled", "paused", "no_contact"];
export const TAKEOVERS: readonly TakeoverState[] = ["none", "requested", "effective"];
export const HEALTHS = ["connected", "reconnecting", "disconnected", "expired_session", "revoked"] as const;
export const MODE_TEXT: Record<AutomationMode, string> = { automated: "Automatic replies", human_controlled: "Human controlled", paused: "Paused", no_contact: "No further contact" };
export const TAKEOVER_TEXT: Record<TakeoverState, string> = { none: "No takeover", requested: "Takeover requested (not yet effective)", effective: "Human has control" };
export const HEALTH_TEXT: Record<string, string> = { connected: "Connected", reconnecting: "Reconnecting", disconnected: "Disconnected", expired_session: "Session expired", revoked: "Access revoked" };

export type BAccount = { accountId: string; handle: string; health: string; automationMode: AutomationMode };
export type BConversation = { conversationId: string; revision: number; fanName: string; automationMode: AutomationMode; takeoverState: TakeoverState; lastActivityAt: string; requiresAttention: boolean };
export type BRuntime = { runtimeEnabled: boolean; deliveryEnabled: boolean | null; mediaEnabled: boolean | null; usedUnits: number | null; limitUnits: number | null; historyRecoveryRequired: boolean; providerConnectionVerified: boolean };

const rec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 200) => typeof v === "string" && v.length <= max;

export function parseAccounts(value: unknown): BAccount[] | null {
  if (!rec(value) || !Array.isArray(value.accounts) || value.accounts.length > 200) return null;
  const out: BAccount[] = [];
  for (const row of value.accounts) {
    if (!rec(row) || !bId(row.accountId) || !str(row.health, 32) || !MODES.includes(row.automationMode as AutomationMode)) return null;
    const binding = rec(row.binding) ? row.binding : {};
    out.push({ accountId: row.accountId, handle: str(binding.handle, 120) && binding.handle ? String(binding.handle) : row.accountId,
      health: row.health as string, automationMode: row.automationMode as AutomationMode });
  }
  return new Set(out.map(a => a.accountId)).size === out.length ? out : null;
}

export function parseConversations(value: unknown, accountId: string): { items: BConversation[]; more: boolean } | null {
  if (!rec(value) || value.accountId !== accountId || !rec(value.page) || !Array.isArray(value.page.items) || value.page.items.length > 200) return null;
  const items: BConversation[] = [];
  for (const row of value.page.items) {
    if (!rec(row) || row.accountId !== accountId || !bId(row.conversationId) || !Number.isInteger(row.revision) || (row.revision as number) < 0 ||
      !MODES.includes(row.automationMode as AutomationMode) || !TAKEOVERS.includes(row.takeoverState as TakeoverState) || !rec(row.fan) || !str(row.fan.displayName, 160)) return null;
    items.push({ conversationId: row.conversationId, revision: row.revision as number, fanName: (row.fan.displayName as string) || String(row.fan.shortRef ?? "Fan"),
      automationMode: row.automationMode as AutomationMode, takeoverState: row.takeoverState as TakeoverState,
      lastActivityAt: str(row.lastActivityAt, 40) ? String(row.lastActivityAt) : "",
      // Fail closed: a missing or malformed flag is shown as needing attention, never hidden.
      requiresAttention: row.requiresAttention !== false });
  }
  if (new Set(items.map(i => i.conversationId)).size !== items.length) return null;
  return { items, more: value.page.nextCursor !== null && value.page.nextCursor !== undefined };
}

/** Reads the workspace settings route's envelope, {schemaVersion, workspace: <of-workspace.v2 settings>}, with the same strict parser the backend uses. */
export function parseRuntime(value: unknown, accountId: string): BRuntime | null {
  const s = rec(value) && value.schemaVersion === ONLYFANS_PREVIEW_SCHEMA_VERSION ? parseWorkspace(value.workspace, accountId, "settings") : null;
  if (s?.section !== "settings") return null;
  const p = s.deliveryPolicy;
  return { runtimeEnabled: s.runtimeEnabled, deliveryEnabled: p ? p.enabled : null, mediaEnabled: p ? p.mediaEnabled : null,
    usedUnits: p ? p.usedUnits : null, limitUnits: p ? p.limitUnits : null,
    historyRecoveryRequired: s.historyRecoveryRequired, providerConnectionVerified: s.providerConnectionVerified };
}

export type ActionRule = { action: Exclude<ControlAction, "manual_message" | "resolve_delivery_evidence">; label: string; enabled: boolean; reason: string | null; confirm: boolean };
const LABEL: Record<Exclude<ControlAction, "manual_message" | "resolve_delivery_evidence">, string> = { pause_automation: "Pause", resume_automation: "Resume automatic replies",
  request_takeover: "Take over", release_takeover: "Hand back", mark_no_contact: "Mark no-contact" };

/** The go actions a hold withdraws. Every other action is a brake and a hold never touches it. */
const GO: readonly ActionRule["action"][] = ["resume_automation", "release_takeover"];
/** What this operator may do to this conversation right now. Read-only and no-contact fail closed; `hold` (why go is held) withdraws GO only. */
export function actionRules(c: Pick<BConversation, "automationMode" | "takeoverState">, canManage: boolean, hold: string | null = null): ActionRule[] {
  const rule = (action: keyof typeof LABEL, ok: boolean, why: string): ActionRule => {
    const held = hold !== null && GO.includes(action);
    return { action, label: LABEL[action], enabled: canManage && ok && !held,
      reason: !canManage ? "Your team access is read-only." : !ok ? why : held ? hold : null, confirm: action === "mark_no_contact" };
  };
  const dead = c.automationMode === "no_contact";
  const deadWhy = "No-contact cannot be undone from the dashboard.";
  return [
    rule("pause_automation", !dead && c.automationMode === "automated", dead ? deadWhy : "Only automatic conversations can be paused."),
    rule("resume_automation", !dead && c.automationMode === "paused", dead ? deadWhy : "Only paused conversations can be resumed."),
    rule("request_takeover", !dead && c.takeoverState === "none", dead ? deadWhy : "A takeover is already requested or in effect."),
    rule("release_takeover", !dead && c.takeoverState !== "none", dead ? deadWhy : "No takeover to hand back."),
    rule("mark_no_contact", !dead, deadWhy),
  ];
}

/** Expected mode after an acknowledged action. Only used as a hint until the next read confirms. */
export const AFTER: Record<Exclude<ControlAction, "manual_message" | "resolve_delivery_evidence">, string> = {
  pause_automation: "Pause recorded.", resume_automation: "Resume recorded.", request_takeover: "Takeover requested. It is effective only once the conversation shows it.",
  release_takeover: "Hand back recorded.", mark_no_contact: "No-contact recorded.",
};

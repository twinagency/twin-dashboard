/** Section E types, parsers and pure action rules. */
import type { AutomationMode, TakeoverState } from "@/lib/onlyfans-preview/types";
import type { ControlAction } from "@/lib/onlyfans/controls";
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
      lastActivityAt: str(row.lastActivityAt, 40) ? String(row.lastActivityAt) : "", requiresAttention: row.requiresAttention === true });
  }
  if (new Set(items.map(i => i.conversationId)).size !== items.length) return null;
  return { items, more: value.page.nextCursor !== null && value.page.nextCursor !== undefined };
}

export function parseRuntime(value: unknown, accountId: string): BRuntime | null {
  if (!rec(value) || value.accountId !== accountId || value.section !== "settings" || typeof value.runtimeEnabled !== "boolean") return null;
  const p = rec(value.deliveryPolicy) ? value.deliveryPolicy : null;
  return { runtimeEnabled: value.runtimeEnabled, deliveryEnabled: p ? p.enabled === true : null, mediaEnabled: p ? p.mediaEnabled === true : null,
    usedUnits: p && Number.isInteger(p.usedUnits) ? p.usedUnits as number : null, limitUnits: p && Number.isInteger(p.limitUnits) ? p.limitUnits as number : null,
    historyRecoveryRequired: value.historyRecoveryRequired === true, providerConnectionVerified: value.providerConnectionVerified === true };
}

export type ActionRule = { action: ControlAction; label: string; enabled: boolean; reason: string | null; confirm: boolean };
const LABEL: Record<Exclude<ControlAction, "manual_message">, string> = { pause_automation: "Pause", resume_automation: "Resume automatic replies",
  request_takeover: "Take over", release_takeover: "Hand back", mark_no_contact: "Mark no-contact" };

/** What this operator may do to this conversation right now. Read-only and no-contact fail closed. */
export function actionRules(c: Pick<BConversation, "automationMode" | "takeoverState">, canManage: boolean): ActionRule[] {
  const rule = (action: keyof typeof LABEL, ok: boolean, why: string): ActionRule => ({ action, label: LABEL[action],
    enabled: canManage && ok, reason: !canManage ? "Your team access is read-only." : ok ? null : why, confirm: action === "mark_no_contact" });
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
export const AFTER: Record<Exclude<ControlAction, "manual_message">, string> = {
  pause_automation: "Pause recorded.", resume_automation: "Resume recorded.", request_takeover: "Takeover requested. It is effective only once the conversation shows it.",
  release_takeover: "Hand back recorded.", mark_no_contact: "No-contact recorded.",
};

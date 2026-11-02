// lib/mtproto/flow-steps.ts
//
// The pure half of the flow builder: step types, labels and validateFlowSteps().
// Contract: twin-bot docs/MTPROTO-FLOWS.md. No database import, so the editor
// (a client component) can use it too. lib/mtproto/flows.ts re-exports it all.

import { RunValidationError, isUuid } from "./validate";

export class FlowValidationError extends RunValidationError {}

export const FLOWS_GLOBAL_KEY = "mtproto_flows_enabled";
export const MAX_FLOW_STEPS = 12;
export const MAX_TEXT_LINES = 10;
export const MAX_TEXT_CHARS = 280;
export const MAX_FREE_MEDIA_ITEMS = 5;
export const MIN_AFTER_MINUTES = 1;
export const MAX_AFTER_MINUTES = 1380; // must stay inside the 24h Business window
export const MAX_PAID_OFFERS = 2;
export const MAX_FLOW_NAME = 80;

export const FLOW_WHEN = ["reply", "yes", "after_minutes", "purchased"] as const;
export type FlowWhen = (typeof FLOW_WHEN)[number];
export const FLOW_ACTIONS = ["text", "free_media", "bundle_offer", "sequence_offer", "handoff"] as const;
export type FlowActionType = (typeof FLOW_ACTIONS)[number];

export type FlowAction =
  | { type: "text"; lines: string[] }
  | { type: "free_media"; photoIds: string[]; videoIds: string[]; caption?: string }
  | { type: "bundle_offer"; bundleId: string; caption?: string }
  | { type: "sequence_offer"; sequenceId: string }
  | { type: "handoff" };

export interface FlowStep {
  id: string;
  when: FlowWhen;
  afterMinutes?: number;
  action: FlowAction;
}

export interface Flow {
  id: string;
  name: string;
  cloneId: string | null;
  steps: FlowStep[];
  enabled: boolean;
  archived: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export const WHEN_LABEL: Record<FlowWhen, string> = {
  reply: "Fan replies",
  yes: "Fan says yes",
  after_minutes: "X minutes later",
  purchased: "Fan bought",
};
export const ACTION_LABEL: Record<FlowActionType, string> = {
  text: "Send text",
  free_media: "Send free media",
  bundle_offer: "Offer bundle",
  sequence_offer: "Offer video parts",
  handoff: "Hand back to normal chat",
};

// ── validation ───────────────────────────────────────────────────────────────

const STEP_ID = /^[a-z0-9_-]{1,24}$/;
const DASHES = /[\u2013\u2014]/;
// Links a fan-facing flow message must never carry: schemes, www, t.me, tg://
// and bare domains on the common TLDs.
const LINK = /(https?:\/\/|www\.|tg:\/\/|\bt\.me\b|\b[a-z0-9][a-z0-9-]*\.(com|net|org|me|io|co|app|xyz|ly|gg|link|bio|to|tv|info|site|online|vip|club|store|shop|page)\b)/i;

function badText(s: string, what: string): void {
  if (DASHES.test(s)) throw new FlowValidationError(`${what}: no em or en dashes allowed, use a comma or a period`);
  if (LINK.test(s)) throw new FlowValidationError(`${what}: links are not allowed`);
  if (s.length > MAX_TEXT_CHARS) throw new FlowValidationError(`${what}: at most ${MAX_TEXT_CHARS} characters`);
}

function optionalCaption(raw: unknown, what: string): string | undefined {
  if (raw == null) return undefined;
  if (typeof raw !== "string") throw new FlowValidationError(`${what}: caption must be text`);
  const s = raw.trim();
  if (!s) return undefined;
  badText(s, `${what} caption`);
  return s;
}

function idList(raw: unknown, what: string): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new FlowValidationError(`${what} must be a list`);
  const out: string[] = [];
  for (const v of raw) {
    if (!isUuid(v)) throw new FlowValidationError(`${what} has an invalid id`);
    const id = v.toLowerCase();
    if (!out.includes(id)) out.push(id);
  }
  return out;
}

function validateAction(raw: unknown, where: string): FlowAction {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new FlowValidationError(`${where}: action is missing`);
  const a = raw as Record<string, unknown>;
  switch (a.type) {
    case "text": {
      if (!Array.isArray(a.lines)) throw new FlowValidationError(`${where}: text needs a list of lines`);
      const lines = a.lines.map((l) => (typeof l === "string" ? l.trim() : ""));
      if (lines.some((l) => !l)) throw new FlowValidationError(`${where}: text lines cannot be empty`);
      if (lines.length < 1 || lines.length > MAX_TEXT_LINES) throw new FlowValidationError(`${where}: text needs 1 to ${MAX_TEXT_LINES} lines`);
      lines.forEach((l, i) => badText(l, `${where} line ${i + 1}`));
      return { type: "text", lines };
    }
    case "free_media": {
      const photoIds = idList(a.photoIds, `${where}: photoIds`);
      const videoIds = idList(a.videoIds, `${where}: videoIds`);
      const total = photoIds.length + videoIds.length;
      if (total < 1 || total > MAX_FREE_MEDIA_ITEMS) throw new FlowValidationError(`${where}: free media needs 1 to ${MAX_FREE_MEDIA_ITEMS} items`);
      const caption = optionalCaption(a.caption, where);
      return { type: "free_media", photoIds, videoIds, ...(caption ? { caption } : {}) };
    }
    case "bundle_offer": {
      if (!isUuid(a.bundleId)) throw new FlowValidationError(`${where}: pick a bundle`);
      const caption = optionalCaption(a.caption, where);
      return { type: "bundle_offer", bundleId: a.bundleId.toLowerCase(), ...(caption ? { caption } : {}) };
    }
    case "sequence_offer": {
      if (!isUuid(a.sequenceId)) throw new FlowValidationError(`${where}: pick a video sequence`);
      return { type: "sequence_offer", sequenceId: a.sequenceId.toLowerCase() };
    }
    case "handoff":
      return { type: "handoff" };
    default:
      throw new FlowValidationError(`${where}: unknown action`);
  }
}

/** Rebuilds the step list from scratch (unknown keys are dropped, never
 *  passed through) and throws FlowValidationError on anything the contract
 *  forbids. An empty list is valid (a flow still being drafted); turning a
 *  flow on needs at least one step (setFlowEnabled). */
export function validateFlowSteps(raw: unknown): FlowStep[] {
  if (!Array.isArray(raw)) throw new FlowValidationError("steps must be a list");
  if (raw.length > MAX_FLOW_STEPS) throw new FlowValidationError(`a flow has at most ${MAX_FLOW_STEPS} steps`);
  const seen = new Set<string>();
  const out: FlowStep[] = [];
  raw.forEach((r, i) => {
    const where = `Step ${i + 1}`;
    if (!r || typeof r !== "object" || Array.isArray(r)) throw new FlowValidationError(`${where} is not valid`);
    const s = r as Record<string, unknown>;
    if (typeof s.id !== "string" || !STEP_ID.test(s.id)) throw new FlowValidationError(`${where}: id must be 1 to 24 of a-z 0-9 _ -`);
    if (seen.has(s.id)) throw new FlowValidationError(`${where}: duplicate step id "${s.id}"`);
    seen.add(s.id);
    if (typeof s.when !== "string" || !(FLOW_WHEN as readonly string[]).includes(s.when)) throw new FlowValidationError(`${where}: unknown trigger`);
    const when = s.when as FlowWhen;
    let afterMinutes: number | undefined;
    if (when === "after_minutes") {
      const m = s.afterMinutes;
      if (typeof m !== "number" || !Number.isInteger(m) || m < MIN_AFTER_MINUTES || m > MAX_AFTER_MINUTES) {
        throw new FlowValidationError(`${where}: minutes later must be a whole number from ${MIN_AFTER_MINUTES} to ${MAX_AFTER_MINUTES}`);
      }
      afterMinutes = m;
    } else if (s.afterMinutes != null) {
      throw new FlowValidationError(`${where}: minutes only apply to the "X minutes later" trigger`);
    }
    out.push({ id: s.id, when, ...(afterMinutes !== undefined ? { afterMinutes } : {}), action: validateAction(s.action, where) });
  });
  return out;
}

export function paidOfferCount(steps: FlowStep[]): number {
  return steps.filter((s) => s.action.type === "bundle_offer" || s.action.type === "sequence_offer").length;
}

export function actionNeedsGirl(a: FlowAction): boolean {
  return a.type === "free_media" || a.type === "bundle_offer" || a.type === "sequence_offer";
}

export function validateFlowName(raw: unknown): string {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) throw new FlowValidationError("give the flow a name");
  if (name.length > MAX_FLOW_NAME) throw new FlowValidationError(`name is too long (max ${MAX_FLOW_NAME} characters)`);
  return name;
}


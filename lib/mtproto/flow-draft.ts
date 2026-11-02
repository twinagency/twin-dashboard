// lib/mtproto/flow-draft.ts
//
// Pure helpers for the flow editor: a flat, form-friendly draft of one step,
// and the conversion to and from the validated FlowStep shape. No validation
// happens here (validateFlowSteps does it, in the browser's send and again on
// the server); this only reshapes, so it is safe to import from client code.

import type { FlowActionType, FlowStep, FlowWhen } from "./flow-steps";

export interface DraftStep {
  id: string;
  when: FlowWhen;
  /** kept as text while typing */
  afterMinutes: string;
  actionType: FlowActionType;
  lines: string[];
  photoIds: string[];
  videoIds: string[];
  caption: string;
  bundleId: string;
  sequenceId: string;
}

export function nextStepId(existing: { id: string }[]): string {
  let max = 0;
  for (const s of existing) {
    const m = /^s(\d+)$/.exec(s.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `s${max + 1}`;
}

export function newDraftStep(existing: { id: string }[]): DraftStep {
  return {
    id: nextStepId(existing),
    when: "reply",
    afterMinutes: "10",
    actionType: "text",
    lines: [""],
    photoIds: [],
    videoIds: [],
    caption: "",
    bundleId: "",
    sequenceId: "",
  };
}

export function stepToDraft(s: FlowStep): DraftStep {
  const d = newDraftStep([]);
  d.id = s.id;
  d.when = s.when;
  d.afterMinutes = s.afterMinutes != null ? String(s.afterMinutes) : "10";
  d.actionType = s.action.type;
  const a = s.action;
  if (a.type === "text") d.lines = [...a.lines];
  if (a.type === "free_media") {
    d.photoIds = [...a.photoIds];
    d.videoIds = [...a.videoIds];
    d.caption = a.caption ?? "";
  }
  if (a.type === "bundle_offer") {
    d.bundleId = a.bundleId;
    d.caption = a.caption ?? "";
  }
  if (a.type === "sequence_offer") d.sequenceId = a.sequenceId;
  return d;
}

/** Reshape only. Empty text lines are dropped; an empty pick is left empty so
 *  validateFlowSteps names what is missing. Returns plain JSON for the server. */
export function draftsToSteps(drafts: DraftStep[]): unknown[] {
  return drafts.map((d) => {
    const base: Record<string, unknown> = { id: d.id, when: d.when };
    if (d.when === "after_minutes") base.afterMinutes = d.afterMinutes.trim() === "" ? NaN : Number(d.afterMinutes);
    let action: Record<string, unknown>;
    switch (d.actionType) {
      case "text":
        action = { type: "text", lines: d.lines.map((l) => l.trim()).filter(Boolean) };
        break;
      case "free_media":
        action = { type: "free_media", photoIds: d.photoIds, videoIds: d.videoIds, ...(d.caption.trim() ? { caption: d.caption } : {}) };
        break;
      case "bundle_offer":
        action = { type: "bundle_offer", bundleId: d.bundleId, ...(d.caption.trim() ? { caption: d.caption } : {}) };
        break;
      case "sequence_offer":
        action = { type: "sequence_offer", sequenceId: d.sequenceId };
        break;
      default:
        action = { type: "handoff" };
    }
    return { ...base, action };
  });
}

/** Drop every media/offer pick (used when the flow moves to another girl). */
export function clearRefs(d: DraftStep): DraftStep {
  return { ...d, photoIds: [], videoIds: [], bundleId: "", sequenceId: "" };
}

export function hasRefs(drafts: DraftStep[]): boolean {
  return drafts.some((d) => d.photoIds.length + d.videoIds.length > 0 || d.bundleId || d.sequenceId);
}

export function moveStep<T>(list: T[], from: number, dir: -1 | 1): T[] {
  const to = from + dir;
  if (to < 0 || to >= list.length) return list;
  const out = [...list];
  [out[from], out[to]] = [out[to], out[from]];
  return out;
}

import { canonicalManualMedia } from "../onlyfans/manual-media";
import { controlActionFor, controlFields, controlFieldsProblem } from "../onlyfans/controls";
// Which controls the dashboard may offer, and why.
//
// Three independent dimensions decide this, and none of them implies another:
//   * connection health (can this account talk to the provider at all)
//   * automation mode (who owns replies)
//   * delivery outcome (did the last action actually land)
//
// Plus two hard gates: the viewer's permission, and whether the backend even
// advertises the capability for this account.
//
// The rule that matters most: an unresolved send (dispatching or unknown) has
// no resend. It has an evidence resolution path instead. Guessing that a
// request failed is exactly how a fan receives the same message twice, and no
// screen may offer that guess as a button.

import type {
  ActionAvailability,
  AvailableAction,
  CommandPayload,
  CommandRequest,
  ConversationDetail,
  ConversationSummary,
  DeliveryOutcome,
  OfAccount,
  PreviewCommand,
  PreviewViewer,
} from "./types";

const LABELS: Record<AvailableAction, string> = {
  send_manual_message: "Send as creator",
  pause_automation: "Pause replies",
  resume_automation: "Resume replies",
  request_takeover: "Take over",
  release_takeover: "Hand back to automation",
  mark_no_contact: "Mark no further contact",
  resolve_delivery_evidence: "Resolve delivery outcome",
};

/** Ordered for display, most consequential first. */
const ALL_ACTIONS: AvailableAction[] = [
  "resolve_delivery_evidence",
  "send_manual_message",
  "request_takeover",
  "release_takeover",
  "pause_automation",
  "resume_automation",
  "mark_no_contact",
];

/** A send is settled only once it ended. Any other outcome, one this build does not know included, is unresolved. */
const SETTLED: readonly string[] = ["none", "sent", "retracted", "refused", "failed"] satisfies DeliveryOutcome[];
/** The settled sends the provider took, so the only ones with a receipt. */
export const RECEIPTED: readonly string[] = ["sent", "retracted"] satisfies DeliveryOutcome[];
/** An automated reply being prepared or queued: on the rollup it is the AI queue (ai-visibility.ts "AI reply queued"), not a held send. */
export const IN_FLIGHT: readonly string[] = ["generating", "queued"] satisfies DeliveryOutcome[];

/**
 * While a send is unresolved, only the actions that reduce activity are
 * offered. Pausing, taking over or excluding contact all stop future sends and
 * cannot create one; sending and resuming automation can, so both are withheld
 * until the outcome is known.
 *
 * This is the consolidation plan's "unknown outcomes pause conflicting work"
 * rule, expressed in the one place the controls are decided, so the interface
 * and the documented policy cannot drift apart again.
 */
export const UNRESOLVED_HOLDS: AvailableAction[] = ["send_manual_message", "resume_automation", "release_takeover"];

/**
 * The one held rule, for availableActions and every control outside it: the rollup is neither settled nor in flight, or a
 * delivery incident is recorded. The backend raises an incident only while a send is unresolved (onlyfans_read/projections.py
 * delivery_incident) and refuses new sends while its attempt pointer stands, whatever outcome the incident reports, failed
 * included (onlyfans_runtime/store.py Store._unresolved). A held thread loses UNRESOLVED_HOLDS and nothing else.
 */
export function isDeliveryHeld(
  delivery: DeliveryOutcome,
  deliveryIncident?: Pick<NonNullable<ConversationDetail["deliveryIncident"]>, "outcome"> | null,
): boolean {
  return (!SETTLED.includes(delivery) && !IN_FLIGHT.includes(delivery)) || deliveryIncident != null;
}

/** Which account capability each action needs. */
const REQUIRED_CAPABILITY: Record<AvailableAction, keyof OfAccount["capabilities"]> = {
  send_manual_message: "sendManualMessage",
  pause_automation: "pauseAutomation",
  resume_automation: "pauseAutomation",
  request_takeover: "requestTakeover",
  release_takeover: "requestTakeover",
  mark_no_contact: "pauseAutomation",
  resolve_delivery_evidence: "resolveDeliveryEvidence",
};

export type ActionSet = {
  available: ActionAvailability[];
  blocked: ActionAvailability[];
};

export function availableActions(input: {
  account: OfAccount;
  summary: ConversationSummary;
  viewer: PreviewViewer;
  /** Present when the detail read found a structured delivery incident. */
  deliveryIncident?: ConversationDetail["deliveryIncident"];
}): ActionSet {
  const { account, summary, viewer, deliveryIncident = null } = input;
  const held = isDeliveryHeld(summary.delivery, deliveryIncident);
  const hasIncident = deliveryIncident !== null;
  const available: ActionAvailability[] = [];
  const blocked: ActionAvailability[] = [];

  for (const action of ALL_ACTIONS) {
    const reason = blockReason(action);
    const entry: ActionAvailability = { action, label: LABELS[action], reason };
    if (reason) blocked.push(entry);
    else available.push(entry);
  }

  return { available, blocked };

  function blockReason(action: AvailableAction): string | null {
    if (!viewer.canManage && !(viewer.canChat && ["send_manual_message", "request_takeover", "release_takeover"].includes(action))) {
      return viewer.kind === "view_as"
        ? "Read only view. Changes are made by the account owner."
        : "Your role cannot change conversations for this account.";
    }

    if (viewer.canActAsOwner === false && ["send_manual_message", "release_takeover"].includes(action)) {
      return "Only the staff member handling this conversation can reply or hand it back. Refresh to check ownership.";
    }
    if (account.health !== "connected" && action === "send_manual_message") {
      return account.healthReason ?? "This account cannot send until the connection is restored.";
    }

    const capability = account.capabilities[REQUIRED_CAPABILITY[action]];
    // A stop stays offered on a degraded session (it is the safe direction); the backend may still refuse it, and that
    // refusal is shown as not accepted. Not configured still hides it.
    const stop = action === "pause_automation" || action === "mark_no_contact";
    if (capability !== "available" && !(stop && capability === "unavailable")) {
      return capability === "not_configured"
        ? "Not configured for this account."
        : "Not available for this account right now.";
    }

    // Resolving evidence is decided before the other holds: an unresolved send
    // is exactly what it exists to settle.
    if (action === "resolve_delivery_evidence") {
      return !hasIncident ? "There is no unresolved delivery to resolve." : deliveryIncident && ["dispatching", "accepted_pending"].includes(deliveryIncident.outcome) ? "This send is still being processed. Wait for its receipt before resolving it." : null;
    }

    // Then the unresolved hold, which withdraws only the actions that could
    // start another send. This hold never withdraws pausing, taking over or
    // excluding contact (the safe direction); the other gates still may.
    if (held && UNRESOLVED_HOLDS.includes(action)) {
      return action === "send_manual_message"
        ? "An earlier send is unresolved. Resolve its outcome before sending anything else."
        : "An earlier send is unresolved. Resolving it comes before resuming replies.";
    }

    if (summary.automationMode === "no_contact") {
      return "This fan asked for no further contact. Contact exclusions are not reversible from here.";
    }

    switch (action) {
      case "send_manual_message":
        if (summary.delivery === "queued" || summary.delivery === "generating") return "An automated reply is still being prepared. Wait for it before sending.";
        return summary.automationMode === "human_controlled" && summary.takeoverState === "effective"
          ? null : "Take over this conversation before sending a manual reply.";
      case "request_takeover":
        return summary.takeoverState === "none"
          ? null
          : "A takeover request is already with the backend.";
      case "release_takeover":
        return summary.takeoverState === "effective"
          ? null
          : "Automation is not currently paused for a human.";
      case "pause_automation":
        return summary.automationMode === "automated" ? null : "Replies are not currently automated.";
      case "resume_automation":
        return summary.automationMode === "paused" && summary.takeoverState === "none"
          ? null : "Replies are not paused for a simple resume. Complete the handover first.";
      case "mark_no_contact":
        return null;
      default:
        return null;
    }
  }
}

/**
 * The final gate. A control that renders but cannot be invoked is the same
 * class of defect as a configured but inert setting, so the guard lives here
 * and the UI asks it rather than deciding for itself.
 */
export function canSubmitCommand(
  viewer: PreviewViewer,
  actionSet: ActionSet,
  action: AvailableAction,
): boolean {
  if (!viewer.canManage && !(viewer.canChat && ["send_manual_message", "request_takeover", "release_takeover"].includes(action))) return false;
  return actionSet.available.some((entry) => entry.action === action);
}

/**
 * A deterministic digest of a payload.
 *
 * Two different messages aimed at the same conversation at the same revision
 * must not share a command identity, or a retry of the second would be treated
 * as a duplicate of the first. FNV-1a is used because it is stable, dependency
 * free and entirely local. This is an identity for a modelled command, not a
 * security hash.
 */
export function canonicalPayload(payload: CommandPayload): string {
  switch (payload.kind) {
    // JSON-encoded tuples: a field can never spell another field's prefix (body "item-5:hi" vs catalogItemId 5).
    case "manual_message":
      return JSON.stringify(["message", payload.media ? canonicalManualMedia(payload.media) : null, payload.catalogItemId ?? null, payload.body]);
    case "delivery_resolution":
      return JSON.stringify(["resolution", payload.attemptId, payload.decision, payload.providerMessageId ?? null]);
    case "none":
      return "none";
  }
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

export function payloadDigest(payload: CommandPayload): string {
  return fnv1a(canonicalPayload(payload));
}

/**
 * The idempotency key in the UUID shape the controls route accepts. Derived from the intent, not random, so a retry of the
 * same intent (after a lost reply, a remount or a reload) sends the same key.
 */
export function intentRequestKey(idempotencyKey: string): string {
  return uuidRequestKey([0, 1, 2, 3].map(salt => fnv1a(`${salt}:${idempotencyKey}`)).join(""));
}
/** The first 32 hex digits of a key in the UUID shape the controls and campaign routes take as `requestKey`. */
export const uuidRequestKey = (hex: string) => `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;

/** A manual send's held-key intent (G04c2): the full canonical command, never payloadDigest, whose 32 bits collide. */
export const sendIntent = (input: CommandRequestInput) =>
  JSON.stringify([input.command, input.accountId, input.conversationId, input.expectedRevision, canonicalPayload(input.payload)]);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
/** A held manual send read back from storage, or null unless it is one the controls route's own field rule accepts unchanged. */
export function heldSendInput(value: unknown): CommandRequestInput | null {
  if (!record(value) || value.command !== "send_manual_message" || typeof value.accountId !== "string" || typeof value.conversationId !== "string"
    || typeof value.expectedRevision !== "number" || !Number.isSafeInteger(value.expectedRevision) || !record(value.payload)) return null;
  const { kind, body, ...rest } = value.payload;
  if (kind !== "manual_message" || typeof body !== "string" || Object.keys(rest).some(key => key !== "catalogItemId" && key !== "media")
    || controlFieldsProblem("manual_message", { body, ...rest })) return null;
  return { command: value.command, accountId: value.accountId, conversationId: value.conversationId, expectedRevision: value.expectedRevision,
    payload: { kind, body, ...rest } };
}

/**
 * Whether a payload is the right shape for a command, and says why not when it
 * is not. The UI, the fixture data source and the live adapter all ask this,
 * and it gives the controls route's own field rule and reason (controlFieldsProblem),
 * so no preview path accepts what the route refuses.
 */
export function commandPayloadProblem(
  command: PreviewCommand,
  payload: CommandPayload,
): string | null {
  const action = controlActionFor(command);
  const kind = action === "manual_message" ? "manual_message" : action === "resolve_delivery_evidence" ? "delivery_resolution" : "none";
  return payload.kind === kind ? controlFieldsProblem(action, controlFields(payload)) : "That payload does not belong to this command.";
}

export type CommandRequestInput = {
  command: PreviewCommand;
  accountId: string;
  conversationId: string;
  expectedRevision: number;
  payload: CommandPayload;
};

/**
 * Command identity. Deterministic, so a retry after a lost acknowledgement
 * reuses the same command and idempotency key instead of creating a second
 * send, and content-addressed, so a different message is a different command.
 */
export function createCommandRequest(input: CommandRequestInput): CommandRequest {
  const key = [
    input.command,
    input.accountId,
    input.conversationId,
    input.expectedRevision,
    payloadDigest(input.payload),
  ].join(":");
  return {
    commandId: `cmd-${key}`,
    idempotencyKey: `idem-${key}`,
    command: input.command,
    accountId: input.accountId,
    conversationId: input.conversationId,
    expectedRevision: input.expectedRevision,
    payload: input.payload,
  };
}

/**
 * The action a control offers and the command it submits are the same things
 * today. Mapping them explicitly means a future rename cannot silently submit
 * the wrong command.
 */
const ACTION_COMMAND: Record<AvailableAction, PreviewCommand> = {
  send_manual_message: "send_manual_message",
  pause_automation: "pause_automation",
  resume_automation: "resume_automation",
  request_takeover: "request_takeover",
  release_takeover: "release_takeover",
  mark_no_contact: "mark_no_contact",
  resolve_delivery_evidence: "resolve_delivery_evidence",
};

export function commandForAction(action: AvailableAction): PreviewCommand {
  return ACTION_COMMAND[action];
}

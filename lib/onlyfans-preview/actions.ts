import { validManualMedia, canonicalManualMedia } from "../onlyfans/manual-media";
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

/** An unresolved send blocks every competing write for that conversation. */
export const UNRESOLVED_OUTCOMES: DeliveryOutcome[] = ["dispatching", "accepted_pending", "unknown", "partial"];

export function isDeliveryUnresolved(outcome: DeliveryOutcome): boolean {
  return UNRESOLVED_OUTCOMES.includes(outcome);
}

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

export function isHeldByUnresolvedDelivery(action: AvailableAction): boolean {
  return UNRESOLVED_HOLDS.includes(action);
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
  const unresolved = isDeliveryUnresolved(summary.delivery);
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
    // A stop is our own state, not a provider write, so a degraded session never blocks it. Not configured still does.
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
    // start another send. Pausing, taking over and excluding contact stay
    // available, because during an uncertain send they are the safe direction.
    if (unresolved && isHeldByUnresolvedDelivery(action)) {
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
    case "manual_message":
      return payload.media ? `message:media-${canonicalManualMedia(payload.media)}:${payload.body}` : payload.catalogItemId == null ? `message:${payload.body}` : `message:item-${payload.catalogItemId}:${payload.body}`;
    case "delivery_resolution":
      return `resolution:${payload.attemptId}:${payload.decision}:${payload.providerMessageId ?? ""}`;
    case "none":
      return "none";
  }
}

export function payloadDigest(payload: CommandPayload): string {
  const canonical = canonicalPayload(payload);
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/** The longest modelled manual message. A contract limit, not a provider rule. */
export const MAX_MANUAL_MESSAGE_LENGTH = 4000;

/**
 * Whether a payload is the right shape for a command, and says why not when it
 * is not. Both the UI and the fixture data source ask this, so a control and
 * the simulated backend cannot disagree about what a valid command looks like.
 */
export function commandPayloadProblem(
  command: PreviewCommand,
  payload: CommandPayload,
): string | null {
  if (command === "send_manual_message") {
    if (payload.kind !== "manual_message") {
      return "A manual message needs a message payload.";
    }
    if (payload.body.trim().length === 0 && !payload.media) {
      return "A manual message needs some text before it can be modelled.";
    }
    if (new TextEncoder().encode(payload.body).length > MAX_MANUAL_MESSAGE_LENGTH) {
      return `That message is longer than the ${MAX_MANUAL_MESSAGE_LENGTH} byte limit.`;
    }
    if (payload.media !== undefined && (!validManualMedia(payload.media) || payload.catalogItemId != null)) return "Choose valid vault files and a message price.";
    if (payload.catalogItemId != null && (!Number.isInteger(payload.catalogItemId) || payload.catalogItemId <= 0 || payload.catalogItemId >= 2 ** 31)) {
      return "Select a saved content item from this account.";
    }
    return null;
  }
  if (command === "resolve_delivery_evidence") {
    if (payload.kind !== "delivery_resolution") {
      return "Resolving a delivery needs the decision it resolves.";
    }
    if (payload.attemptId.trim().length === 0) {
      return "A delivery resolution needs the attempt it resolves.";
    }
    return null;
  }
  return payload.kind === "none" ? null : `A ${command} command carries no payload.`;
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

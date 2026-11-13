import { WRITE_TOOL_NAMES } from "./write-tools";

// THE APPROVAL GATE.
//
// Until 2026-07-31 the assistant's write tools executed the instant the model
// called them. The only thing between the model and live bot config was a line
// of system-prompt text saying "only after the user confirms". This codebase
// has now been bitten three separate times by treating prompt text as
// enforcement (hallucinated unlocks, invented Star prices, the reply-length
// rule) and every one of those was fixed the same way: move the rule out of the
// prompt and into code. This is that move, for writes.
//
// HOW IT WORKS
//   1. The model calls a write tool.
//   2. dispatchTool (route.ts) does NOT execute it. It records a Proposal and
//      hands the model back a result saying "proposed, not applied".
//   3. The proposal is stored on the turn's ai_messages row, then streamed to
//      the browser as an approval card.
//   4. Nothing happens until the operator presses Approve, which POSTs the
//      proposal id back to /api/ai-assistant/approve, and THAT is the only code
//      path in the assistant that can call executeWriteTool.
//
// The model is therefore structurally incapable of changing anything on its
// own, no matter what it decides the prompt means.

export type Proposal = {
  /** randomUUID: /approve finds exactly this card by it (older proposals have per-turn ids "p1", "p2": legacy, never approvable, lib/ai-claim-state.ts). */
  id: string;
  tool: string;
  args: Record<string, unknown>;
  /** Plain-English "this is what will happen", written by code, not the model. */
  summary: string;
  /** True for the ones that stop a bot talking to fans, or touch a fan's money. */
  heavy: boolean;
};

function str(v: unknown): string {
  return typeof v === "string" ? v : JSON.stringify(v);
}

/**
 * Describe a proposed write in plain English, FROM THE ARGUMENTS, not from
 * anything the model wrote in prose. If the card said what the model wanted it
 * to say rather than what the tool call actually does, the approval would be
 * approving the wrong thing — which is the whole failure this gate exists to
 * prevent.
 */
export function describeProposal(tool: string, args: Record<string, unknown>): { summary: string; heavy: boolean } {
  switch (tool) {
    case "setCloneFeature": {
      const on = args.enabled === true;
      return {
        summary: `Turn ${on ? "ON" : "OFF"} "${str(args.field)}" for clone ${str(args.clone)}.`,
        heavy: false,
      };
    }
    case "setCloneDial": {
      return {
        summary: `Set "${str(args.field)}" to "${str(args.value)}" for clone ${str(args.clone)}.`,
        heavy: false,
      };
    }
    case "setCloneStatus": {
      const paused = args.status === "paused";
      return {
        summary: paused
          ? `PAUSE clone ${str(args.clone)}. She stops replying to every fan within about 30 seconds.`
          : `Resume clone ${str(args.clone)}, so she starts replying to fans again.`,
        heavy: true,
      };
    }
    case "recompileClonePersona":
      return {
        summary: `Re-run the persona compiler for clone ${str(args.clone)}, overwriting her current compiled persona.`,
        heavy: true,
      };
    case "setFanCredits":
      return {
        summary: `Set fan ${str(args.userId)}'s message credit balance to ${str(args.credits)}. This overrides what they paid for.`,
        heavy: true,
      };
    case "setFanActive":
      return {
        summary: `Mark fan ${str(args.userId)} as ${args.active === true ? "active" : "inactive"}.`,
        heavy: false,
      };
    case "setFanBlocked":
      return {
        summary:
          args.blocked === true
            ? `BLOCK fan ${str(args.userId)}. The clone stops replying to them entirely.`
            : `Unblock fan ${str(args.userId)}, so the clone replies to them again.`,
        heavy: true,
      };
    case "resetFanCounters":
      return {
        summary: `Zero fan ${str(args.userId)}'s lifetime messages-sent and purchased counters. Their credit balance is untouched.`,
        heavy: true,
      };
    default:
      // Unreachable while WRITE_TOOL_NAMES and this switch agree. Kept honest
      // rather than defaulting to a friendly-sounding summary: an approval card
      // that cannot say what it does must not look like one that can.
      return { summary: `Run "${tool}" with ${JSON.stringify(args)}. No description available for this action.`, heavy: true };
  }
}

/**
 * Re-check on the way back in. The browser sends the proposal it displayed, and
 * this is the server refusing to run anything that is not a known write tool —
 * so the approve endpoint can never be turned into a generic "run this" hole.
 */
export function isApprovableWrite(tool: unknown): tool is string {
  return typeof tool === "string" && WRITE_TOOL_NAMES.has(tool);
}

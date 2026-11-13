import { NextRequest } from "next/server";
import { executeWriteTool, logUnknownWrite } from "../write-tools";
import { describeProposal, isApprovableWrite } from "../proposals";
import { appendMessage, claimProposal, settleClaim, type ProposalClaim } from "../db";
import { OUTCOME_UNKNOWN } from "../claim-state";
import { trustedFormOrigin } from "@/lib/form-origin";

export const dynamic = "force-dynamic";

// The ONLY place in the assistant that can perform a write. The chat route
// (../route.ts) deliberately cannot: it turns every write tool call into a
// proposal and stops. Reaching this endpoint requires a human to have pressed
// Approve on a card describing exactly this action.
//
// Keep that property. If a future change makes the chat route able to write
// again, the approval gate is gone and the model is back to being able to
// change live bot config on its own reading of the prompt.
export async function POST(req: NextRequest) {
  // Same-origin only, like every other mutating route (lib/form-origin.ts). A cross-origin text/plain POST
  // needs no preflight, so without this a page on another origin could press Approve.
  if (!trustedFormOrigin(req)) return Response.json({ ok: false, error: "origin not allowed" }, { status: 403 });

  let body: { conversationId?: string; proposalId?: string; tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  const { tool, args, conversationId, proposalId } = body;
  if (!isApprovableWrite(tool)) {
    return Response.json({ ok: false, error: `"${String(tool)}" is not an approvable write action` }, { status: 400 });
  }
  if (typeof conversationId !== "string" || !conversationId || typeof proposalId !== "string" || !proposalId) {
    return Response.json({ ok: false, error: "missing conversationId or proposalId" }, { status: 400 });
  }

  // Only the stored proposal with this id runs, with its STORED args, and the claim is atomic, so a replayed
  // approval (reload, second tab, double click) cannot apply the same change twice, nor consume an identical card.
  let claim: ProposalClaim;
  try {
    claim = await claimProposal(conversationId, proposalId, tool, args ?? {});
  } catch (e) {
    console.error("[ai-assistant/approve] claim failed", e);
    return Response.json({ ok: false, error: "could not check this proposal, nothing was changed" }, { status: 500 });
  }
  if (claim.status === "missing") {
    return Response.json({ ok: false, error: "this proposal was not found in this conversation, nothing was changed" }, { status: 404 });
  }
  if (claim.status === "ambiguous") {
    return Response.json({ ok: false, error: "this older card matches more than one stored proposal, nothing was changed" }, { status: 409 });
  }
  if (claim.status === "taken") {
    return claim.state === "applied"
      ? Response.json({ ok: false, error: "this change was already applied", state: "applied" }, { status: 409 })
      : Response.json({ ok: false, error: OUTCOME_UNKNOWN, state: "unknown" }, { status: 409 });
  }
  const { messageId, proposal } = claim;
  const safeArgs = proposal.args;

  // Re-derive the description server-side rather than trusting one sent by the
  // client, so what gets recorded in the transcript is what actually ran.
  const { summary } = describeProposal(tool, safeArgs);

  const settle = (state: "applied" | "unknown" | null) =>
    settleClaim(messageId, proposal.id, state).catch((e) =>
      console.error(`[ai-assistant/approve] could not record claim ${state ?? "released"} for ${proposal.id}`, e),
    );
  let result: unknown;
  try {
    result = await executeWriteTool(tool, safeArgs);
  } catch (e) {
    // A throw can come after the database write (revalidation, cache, audit transport), so the change may have
    // landed: never released for a retry. Never the raw database text either; the detail goes to the server log.
    console.error("[ai-assistant/approve] write threw, outcome unknown", e);
    await settle("unknown");
    await logUnknownWrite(tool, safeArgs, summary);
    return Response.json({ ok: false, error: OUTCOME_UNKNOWN, state: "unknown" }, { status: 500 });
  }

  const r = result as { ok?: boolean; summary?: string; error?: string; auditLogged?: boolean } | null;
  if (!r?.ok) {
    // ok:false is a refusal before anything was written (validation, missing fan), so the card stays retryable.
    await settle(null);
    return Response.json({ ok: false, error: r?.error ?? "the write did not report success" }, { status: 400 });
  }
  await settle("applied");

  // Record it in the conversation so the approval survives a reload and is not
  // just a transient bit of UI state. Best-effort: the write already happened,
  // and failing the response here would tell the operator it did not.
  // An unaudited write says so in the summary itself, so the card and transcript both show it (CLAUDE.md rule 3).
  const unaudited = r.auditLogged === false;
  const applied = `${r.summary ?? summary}${unaudited ? " Warning: the audit log entry failed to save." : ""}`;
  try {
    await appendMessage(conversationId, "assistant", `Applied: ${applied}`, { writes: [{ summary: applied }] });
  } catch (e) {
    // transcript is a record, not the source of truth for what changed
    console.error("[ai-assistant/approve] could not record the Applied line", e);
  }

  return Response.json(unaudited ? { ok: true, summary: applied, auditLogged: false } : { ok: true, summary: applied });
}

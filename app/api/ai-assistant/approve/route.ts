import { NextRequest } from "next/server";
import { executeWriteTool } from "../write-tools";
import { describeProposal, isApprovableWrite } from "../proposals";
import { appendMessage } from "../db";

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
  let body: { conversationId?: string; tool?: string; args?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const { tool, args } = body;
  if (!isApprovableWrite(tool)) {
    return Response.json({ error: `"${String(tool)}" is not an approvable write action` }, { status: 400 });
  }
  const safeArgs = (args ?? {}) as Record<string, unknown>;

  // Re-derive the description server-side rather than trusting one sent by the
  // client, so what gets recorded in the transcript is what actually ran.
  const { summary } = describeProposal(tool, safeArgs);

  let result: unknown;
  try {
    result = await executeWriteTool(tool, safeArgs);
  } catch (e) {
    const message = e instanceof Error ? e.message : "write failed";
    return Response.json({ error: message }, { status: 500 });
  }

  const r = result as { ok?: boolean; summary?: string; error?: string } | null;
  if (!r?.ok) {
    return Response.json({ error: r?.error ?? "the write did not report success" }, { status: 400 });
  }

  // Record it in the conversation so the approval survives a reload and is not
  // just a transient bit of UI state. Best-effort: the write already happened,
  // and failing the response here would tell the operator it did not.
  const applied = r.summary ?? summary;
  if (body.conversationId) {
    try {
      await appendMessage(body.conversationId, "assistant", `Applied: ${applied}`, { writes: [{ summary: applied }] });
    } catch {
      // transcript is a record, not the source of truth for what changed
    }
  }

  return Response.json({ ok: true, summary: applied });
}

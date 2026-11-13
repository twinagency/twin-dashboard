import { isDeepStrictEqual } from "node:util";
import { supabaseAdmin } from "@/lib/supabase";
import type { ClaimState } from "@/lib/ai-claim-state";

// Conversation persistence for the /ai assistant (migration 048). Plain CRUD
// against ai_conversations / ai_messages — not part of the model's own tool
// surface, this is app plumbing the route handler uses directly, same as any
// other dashboard page reading/writing its own tables.

export type AiMessageMeta = {
  tools?: string[];
  /** Writes that were actually APPLIED (i.e. approved). See proposals.ts. */
  writes?: { summary: string }[];
  /**
   * Writes the assistant asked for and did NOT perform, pending approval.
   * Persisted so a pending card survives a reload instead of silently
   * vanishing, which would look like the change had gone through.
   */
  proposals?: { id: string; tool: string; args: Record<string, unknown>; summary: string; heavy: boolean }[];
  /** What /approve did with each proposal id (lib/ai-claim-state.ts). */
  claims?: Record<string, ClaimState>;
  /** Compare-and-swap counter bumped by EVERY meta write after the insert (casUpdateMessage), not only claims. */
  claimRev?: number;
};

export type AiMessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  meta: AiMessageMeta | null;
  created_at: string;
};

export type AiConversationRow = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listConversations(limit = 50): Promise<AiConversationRow[]> {
  const { data, error } = await supabaseAdmin
    .from("ai_conversations")
    .select("id,title,created_at,updated_at")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConversationMessages(conversationId: string): Promise<AiMessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("ai_messages")
    .select("id,conversation_id,role,content,meta,created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  // The NEWEST 200, returned oldest first (history and transcript both read top to bottom).
  return (data ?? []).reverse();
}

export async function createConversation(firstUserMessage: string): Promise<AiConversationRow> {
  const title = firstUserMessage.trim().slice(0, 60) || "New conversation";
  const { data, error } = await supabaseAdmin
    .from("ai_conversations")
    .insert({ title })
    .select("id,title,created_at,updated_at")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function appendMessage(
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  meta?: AiMessageMeta,
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("ai_messages")
    .insert({
      conversation_id: conversationId,
      role,
      content,
      meta: meta && (meta.tools?.length || meta.writes?.length || meta.proposals?.length) ? meta : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  return data.id;
}

export async function renameConversation(conversationId: string, title: string): Promise<void> {
  const clean = title.trim().slice(0, 80);
  if (!clean) throw new Error("title cannot be empty");
  const { error } = await supabaseAdmin.from("ai_conversations").update({ title: clean }).eq("id", conversationId);
  if (error) throw new Error(error.message);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_conversations").delete().eq("id", conversationId);
  if (error) throw new Error(error.message);
}

type StoredProposal = NonNullable<AiMessageMeta["proposals"]>[number];
export type ProposalClaim =
  | { status: "ok"; messageId: string; proposal: StoredProposal }
  | { status: "missing" }
  | { status: "ambiguous" }
  | { status: "taken"; state: ClaimState };

/**
 * Read-modify-write of one message's meta (and optionally its content), with a compare-and-swap on meta.claimRev so a
 * concurrent claim or a still-streaming turn adding a proposal cannot overwrite the other. `change` returns null to abort.
 */
async function casUpdateMessage(
  messageId: string,
  change: (meta: AiMessageMeta) => AiMessageMeta | null,
  columns: { content?: string } = {},
): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabaseAdmin.from("ai_messages").select("meta").eq("id", messageId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("message not found");
    const meta = (data.meta ?? {}) as AiMessageMeta;
    const next = change(meta);
    if (!next) return false;
    let q = supabaseAdmin
      .from("ai_messages")
      .update({ ...columns, meta: { ...next, claimRev: (meta.claimRev ?? 0) + 1 } })
      .eq("id", messageId);
    q = meta.claimRev == null ? q.is("meta->>claimRev", null) : q.eq("meta->>claimRev", String(meta.claimRev));
    const { data: hit, error: casError } = await q.select("id");
    if (casError) throw new Error(casError.message);
    if ((hit ?? []).length === 1) return true;
  }
  throw new Error("message meta update kept conflicting");
}

/**
 * The chat route stores its assistant turn as soon as the first proposal exists, before the card is streamed, then
 * updates that same row as the turn goes on, so every card on screen is stored. Returns the row id.
 */
export async function saveTurn(
  conversationId: string,
  messageId: string | null,
  content: string,
  meta: Pick<AiMessageMeta, "tools" | "writes" | "proposals">,
): Promise<string> {
  if (!messageId) return appendMessage(conversationId, "assistant", content, meta);
  await casUpdateMessage(messageId, (m) => ({ ...m, ...meta }), { content });
  return messageId;
}

/**
 * Atomically claim exactly the stored proposal `proposalId` in this conversation, so /approve runs only what was
 * proposed, with the stored args, once. tool+args must still equal the stored ones. "ambiguous": only for proposals
 * stored before ids were UUIDs (per-turn "p1", "p2"), when that id with these args sits in more than one turn.
 */
export async function claimProposal(conversationId: string, proposalId: string, tool: string, args: unknown): Promise<ProposalClaim> {
  const { data, error } = await supabaseAdmin
    .from("ai_messages")
    .select("id,meta")
    .eq("conversation_id", conversationId)
    .eq("role", "assistant")
    .contains("meta", { proposals: [{ id: proposalId }] });
  if (error) throw new Error(error.message);
  const hits = ((data ?? []) as { id: string; meta: AiMessageMeta | null }[]).flatMap((row) => {
    const p = row.meta?.proposals?.find((x) => x.id === proposalId);
    return p && p.tool === tool && isDeepStrictEqual(p.args, args) ? [{ messageId: row.id, proposal: p }] : [];
  });
  if (!hits.length) return { status: "missing" };
  if (hits.length > 1) return { status: "ambiguous" };
  let taken: ClaimState | undefined;
  const claimed = await casUpdateMessage(hits[0].messageId, (meta) => {
    taken = meta.claims?.[proposalId];
    return taken ? null : { ...meta, claims: { ...meta.claims, [proposalId]: "claimed" } };
  });
  return claimed ? { status: "ok", ...hits[0] } : { status: "taken", state: taken! };
}

/** Record how a claimed write ended: applied, or unknown (it threw, it may have landed, never retried). */
export async function settleClaim(messageId: string, proposalId: string, state: "applied" | "unknown"): Promise<void> {
  await casUpdateMessage(messageId, (meta) => ({ ...meta, claims: { ...meta.claims, [proposalId]: state } }));
}

/** Drop a claim because the tool refused before writing (ok:false), so the card can be retried. */
export async function releaseClaim(messageId: string, proposalId: string): Promise<void> {
  await casUpdateMessage(messageId, (meta) => {
    const claims = { ...meta.claims };
    delete claims[proposalId];
    return { ...meta, claims };
  });
}

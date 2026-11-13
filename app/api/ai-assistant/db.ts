import { isDeepStrictEqual } from "node:util";
import { supabaseAdmin } from "@/lib/supabase";

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
  /** Proposal ids claimed by /approve (each runs once), and the compare-and-swap counter guarding them. */
  claimed?: string[];
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
): Promise<void> {
  const { error } = await supabaseAdmin.from("ai_messages").insert({
    conversation_id: conversationId,
    role,
    content,
    meta: meta && (meta.tools?.length || meta.writes?.length || meta.proposals?.length) ? meta : null,
  });
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
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
  | { status: "claimed"; messageId: string; proposal: StoredProposal }
  | { status: "missing" | "used" };

/** Compare-and-swap on meta.claimRev: the update lands only if no other claim changed meta since the read. */
async function casClaims(messageId: string, meta: AiMessageMeta, claimed: string[]): Promise<boolean> {
  let q = supabaseAdmin
    .from("ai_messages")
    .update({ meta: { ...meta, claimed, claimRev: (meta.claimRev ?? 0) + 1 } })
    .eq("id", messageId);
  q = meta.claimRev == null ? q.is("meta->>claimRev", null) : q.eq("meta->>claimRev", String(meta.claimRev));
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length === 1;
}

/**
 * Atomically claim the newest unclaimed stored proposal in this conversation with exactly this tool and args,
 * so /approve runs only what was proposed, and runs it once. "used": it matched, but was already claimed.
 */
export async function claimProposal(conversationId: string, tool: string, args: unknown): Promise<ProposalClaim> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("ai_messages")
      .select("id,meta")
      .eq("conversation_id", conversationId)
      .eq("role", "assistant")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    let used = false;
    let hit: { id: string; meta: AiMessageMeta; proposal: StoredProposal } | null = null;
    for (const row of (data ?? []) as { id: string; meta: AiMessageMeta | null }[]) {
      for (const p of row.meta?.proposals ?? []) {
        if (p.tool !== tool || !isDeepStrictEqual(p.args, args)) continue;
        if (row.meta?.claimed?.includes(p.id)) used = true;
        else hit ??= { id: row.id, meta: row.meta!, proposal: p };
      }
    }
    if (!hit) return { status: used ? "used" : "missing" };
    if (await casClaims(hit.id, hit.meta, [...(hit.meta.claimed ?? []), hit.proposal.id])) {
      return { status: "claimed", messageId: hit.id, proposal: hit.proposal };
    }
  }
  throw new Error("proposal claim kept conflicting");
}

/** Undo a claim whose write did not apply, so the operator can retry the same card. */
export async function releaseProposal(messageId: string, proposalId: string): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabaseAdmin.from("ai_messages").select("meta").eq("id", messageId).maybeSingle();
    if (error || !data?.meta) return;
    const meta = data.meta as AiMessageMeta;
    if (await casClaims(messageId, meta, (meta.claimed ?? []).filter((id) => id !== proposalId))) return;
  }
}

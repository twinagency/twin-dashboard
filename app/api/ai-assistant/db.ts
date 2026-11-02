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
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
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

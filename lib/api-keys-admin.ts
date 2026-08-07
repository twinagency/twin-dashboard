// ── Issuing, listing and revoking per-model API keys ─────────────────────────
//
// ONE IMPLEMENTATION, TWO CALLERS: the CLI (scripts/issue-api-key.ts) and the
// dashboard page (app/api-access/*). Writing this twice is how the UI ends up
// minting keys with a different length, a different prefix, or without
// hashing. Everything about a key's lifecycle lives here.
//
// THE PLAINTEXT KEY EXISTS FOR EXACTLY ONE FUNCTION RETURN. createKey() is the
// only thing that ever sees it; it is hashed before the insert and never
// logged, never stored, never recoverable. If the operator loses it, the
// answer is a new key and a revoke, not a lookup.

import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "./supabase";
import { hashKey, keyPrefix, KEY_BYTES } from "./api-tenant";

export type ApiKeyRow = {
  id: string;
  cloneId: string;
  cloneSlug: string | null;
  cloneName: string | null;
  prefix: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

// 32 random bytes, base64url: 43 characters, ~256 bits. Long enough that the
// stored 8-character prefix gives a guesser nothing.
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString("base64url");
}

export type CreateResult = { ok: true; key: string; prefix: string } | { ok: false; error: string };

export async function createKey(cloneId: string, label: string): Promise<CreateResult> {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, error: "a label is required, so keys can be told apart later" };
  if (!cloneId) return { ok: false, error: "pick a model for this key" };

  // Verify the clone exists rather than relying on the FK error, so the
  // operator gets a sentence instead of a Postgres constraint name.
  const { data: clone } = await supabaseAdmin.from("clones").select("id").eq("id", cloneId).maybeSingle();
  if (!clone) return { ok: false, error: "that model no longer exists" };

  const key = generateKey();
  const { error } = await supabaseAdmin.from("api_keys").insert({
    clone_id: cloneId,
    key_hash: hashKey(key),
    key_prefix: keyPrefix(key),
    label: trimmed,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, key, prefix: keyPrefix(key) };
}

type Embedded = { slug: string; name: string } | { slug: string; name: string }[] | null;

// PostgREST returns an embedded to-one relation as an object in some versions
// and a single-element array in others. Normalise rather than guess.
function firstEmbed(v: Embedded): { slug: string; name: string } | null {
  if (!v) return null;
  return Array.isArray(v) ? v[0] ?? null : v;
}

export async function listKeys(cloneId?: string | null): Promise<ApiKeyRow[]> {
  let q = supabaseAdmin
    .from("api_keys")
    .select("id,clone_id,key_prefix,label,created_at,last_used_at,revoked_at,clones(slug,name)")
    .order("created_at", { ascending: false });
  if (cloneId) q = q.eq("clone_id", cloneId);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  return (data ?? []).map((r) => {
    const row = r as unknown as {
      id: string;
      clone_id: string;
      key_prefix: string;
      label: string;
      created_at: string;
      last_used_at: string | null;
      revoked_at: string | null;
      clones: Embedded;
    };
    const clone = firstEmbed(row.clones);
    return {
      id: row.id,
      cloneId: row.clone_id,
      cloneSlug: clone?.slug ?? null,
      cloneName: clone?.name ?? null,
      prefix: row.key_prefix,
      label: row.label,
      createdAt: row.created_at,
      lastUsedAt: row.last_used_at,
      revokedAt: row.revoked_at,
    };
  });
}

// Revocation is a timestamp, never a delete, so the key stays auditable and old
// system_logs rows referring to it still resolve. Only live keys are touched,
// so revoking twice is a no-op rather than a moved timestamp.
export async function revokeKeyById(id: string): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .is("revoked_at", null)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "no live key with that id (already revoked?)" };
  return { ok: true };
}

export async function revokeKeyByPrefix(prefix: string): Promise<{ ok: boolean; count: number; error?: string }> {
  const { data, error } = await supabaseAdmin
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("key_prefix", prefix)
    .is("revoked_at", null)
    .select("id");
  if (error) return { ok: false, count: 0, error: error.message };
  return { ok: true, count: data?.length ?? 0 };
}

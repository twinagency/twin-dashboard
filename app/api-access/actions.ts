"use server";

import { revalidatePath } from "next/cache";
import { createKey, revokeKeyById } from "@/lib/api-keys-admin";
import { supabaseAdmin } from "@/lib/supabase";

// These run behind the dashboard login (middleware.ts), same as every other
// write in this app. Note the caveat that applies to the whole dashboard, not
// just this page: middleware auth is bypassed when NODE_ENV !== "production",
// so on a dev server anyone who can reach :3002 can mint a key. That is the
// existing posture for every write page here, not something this page
// introduces, and the KEYS THEMSELVES are never bypassable — the public API
// authenticates independently (lib/api-tenant.ts).

export type IssueState = { key?: string; prefix?: string; error?: string };

export async function issueKeyAction(_prev: IssueState, fd: FormData): Promise<IssueState> {
  const cloneId = String(fd.get("clone_id") ?? "");
  const label = String(fd.get("label") ?? "");

  const result = await createKey(cloneId, label);
  if (!result.ok) return { error: result.error };

  // Deliberately NOT logged to system_logs with the key in it. The issuance
  // event is worth recording; the credential is not.
  void supabaseAdmin
    .from("system_logs")
    .insert({
      level: "info",
      source: "api-keys",
      clone_id: cloneId,
      message: `API key issued (${result.prefix}…) — ${label}`,
      detail: { prefix: result.prefix, label },
    })
    .then(
      () => undefined,
      () => undefined,
    );

  revalidatePath("/api-access");
  return { key: result.key, prefix: result.prefix };
}

export async function revokeKeyAction(fd: FormData): Promise<void> {
  const id = String(fd.get("key_id") ?? "");
  const prefix = String(fd.get("key_prefix") ?? "");
  const result = await revokeKeyById(id);

  if (result.ok) {
    void supabaseAdmin
      .from("system_logs")
      .insert({
        level: "warn",
        source: "api-keys",
        message: `API key revoked (${prefix}…)`,
        detail: { prefix },
      })
      .then(
        () => undefined,
        () => undefined,
      );
  }
  revalidatePath("/api-access");
}

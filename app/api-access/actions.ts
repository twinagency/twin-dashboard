"use server";

import { guardDashboardAction } from "@/lib/agency-management";

import { revalidatePath } from "next/cache";
import { createKey, revokeKeyById } from "@/lib/api-keys-admin";
import { FLEET_OPTION } from "./scope";
import { supabaseAdmin } from "@/lib/supabase";

// These run behind the dashboard login (middleware.ts), same as every other
// write in this app. Note the caveat that applies to the whole dashboard, not
// just this page: middleware auth is bypassed when NODE_ENV !== "production",
// so on a dev server anyone who can reach :3002 can mint a key. That is the
// existing posture for every write page here, not something this page
// introduces, and the KEYS THEMSELVES are never bypassable — the public API
// authenticates independently (lib/api-tenant.ts).

export type IssueState = { key?: string; prefix?: string; scope?: "clone" | "fleet"; error?: string };

export async function issueKeyAction(_prev: IssueState, fd: FormData): Promise<IssueState> {
  await guardDashboardAction("app/api-access/actions.ts#issueKeyAction", [_prev, fd]);
  const picked = String(fd.get("clone_id") ?? "");
  const label = String(fd.get("label") ?? "");
  const fleet = picked === FLEET_OPTION;

  const result = await createKey(fleet ? null : picked, label, fleet ? "fleet" : "clone");
  if (!result.ok) return { error: result.error };

  // Deliberately NOT logged to system_logs with the key in it. The issuance
  // event is worth recording; the credential is not.
  //
  // A fleet key is logged with a null clone_id and says so in the message. It
  // is the widest key this system issues, so the one thing its audit line must
  // not do is look like an ordinary per-model issuance in the log.
  void supabaseAdmin
    .from("system_logs")
    .insert({
      level: fleet ? "warn" : "info",
      source: "api-keys",
      clone_id: fleet ? null : picked,
      message: fleet
        ? `FLEET API key issued (${result.prefix}…) — reads every model — ${label}`
        : `API key issued (${result.prefix}…) — ${label}`,
      detail: { prefix: result.prefix, label, scope: fleet ? "fleet" : "clone" },
    })
    .then(
      () => undefined,
      () => undefined,
    );

  revalidatePath("/api-access");
  return { key: result.key, prefix: result.prefix, scope: fleet ? "fleet" : "clone" };
}

export async function revokeKeyAction(fd: FormData): Promise<void> {
  await guardDashboardAction("app/api-access/actions.ts#revokeKeyAction", [fd]);
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

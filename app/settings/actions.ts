"use server";

import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";
import { API_KEY_FIELDS } from "./fields";

export async function saveApiKeys(fd: FormData) {
  const now = new Date().toISOString();
  for (const { key } of API_KEY_FIELDS) {
    const v = String(fd.get(key) ?? "").trim();
    if (!v) continue; // blank = keep the existing key (don't wipe it)
    if (v === "__CLEAR__") {
      await supabaseAdmin.from("app_settings").delete().eq("key", key);
      continue;
    }
    await supabaseAdmin.from("app_settings").upsert({ key, value: v, updated_at: now });
  }
  revalidatePath("/settings");
}

// Which keys are currently set (for a masked status display — never returns the
// raw secret).
export async function getApiKeyStatus(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from("app_settings").select("key,value");
  const out: Record<string, string> = {};
  for (const r of data ?? []) {
    const v = String(r.value ?? "");
    if (v) out[r.key] = v.length > 4 ? `••••${v.slice(-4)}` : "••••";
  }
  return out;
}

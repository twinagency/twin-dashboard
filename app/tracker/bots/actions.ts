"use server";

import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase";

// Settings for the reader bots. This page CONFIGURES them, it does not run
// them: the bots are cron jobs on the home server that read these rows at the
// top of every run. So a change here takes effect on the bot's next run, not
// immediately, and the UI says so.
//
// Nothing here can make a bot write to anything except the tracker. That is a
// property of the bots themselves, asserted by their own checks, not a setting
// anyone can flip from a dashboard.

export async function updateBot(slug: string, fd: FormData): Promise<void> {
  const num = (key: string, min: number, max: number, fallback: number) => {
    const n = Number(fd.get(key));
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
  };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fd.has("enabled")) patch.enabled = fd.get("enabled") === "on" || fd.get("enabled") === "true";
  // 0 means "on demand only", which is how Repro runs. Capped at a week so a
  // typo cannot park a bot forever without it being obvious.
  if (fd.has("every_minutes")) patch.every_minutes = num("every_minutes", 0, 10080, 180);
  if (fd.has("lookback_hours")) patch.lookback_hours = num("lookback_hours", 0, 720, 3);
  if (fd.has("max_items")) patch.max_items = num("max_items", 1, 500, 25);
  if (fd.has("model")) patch.model = String(fd.get("model") ?? "").trim();
  if (fd.has("files_to_tracker")) patch.files_to_tracker = fd.get("files_to_tracker") === "on";
  if (fd.has("runs_after")) {
    const v = String(fd.get("runs_after") ?? "").trim();
    patch.runs_after = v === "" || v === "none" ? null : v;
  }

  const { error } = await supabaseAdmin.from("tracker_bots").update(patch).eq("slug", slug);
  if (error) throw new Error(error.message);
  revalidatePath("/tracker/bots");
}

export async function toggleBot(slug: string, on: boolean): Promise<void> {
  await supabaseAdmin
    .from("tracker_bots")
    .update({ enabled: on, updated_at: new Date().toISOString() })
    .eq("slug", slug);
  revalidatePath("/tracker/bots");
}

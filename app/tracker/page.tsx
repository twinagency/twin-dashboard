import { loadBoard } from "@/lib/tracker";
import { supabaseAdmin } from "@/lib/supabase";
import { TrackerBoard } from "./TrackerBoard";
import type { BotRow } from "./bots/BotSettings";
import type { LogRow } from "./bots/BotLog";

// The tracker. Bugs, feature requests and anything else, in the dashboard the
// operator already has open, instead of in .txt files he cannot read.
//
// Three zones, top to bottom: the ARCHIVE of shipped batches (collapsed), the
// batch being worked right now, then the OPEN pile. An item is never filed
// under a date, because bugs roll on for days and a date log either repeats
// them or buries them. See ../../lib/tracker.ts and
// ../../../bot/db/migrations/110_tracker.sql for the full reasoning.

export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  // One page. The bots, what they found, and what they did are the same
  // subject, so they are not split across two routes: a finding is only
  // meaningful next to the bot that filed it and the run it came from.
  const [board, botsRes, logRes] = await Promise.all([
    loadBoard(),
    supabaseAdmin.from("tracker_bots").select("*").order("sort_order"),
    supabaseAdmin.from("tracker_bot_log").select("*").order("ts", { ascending: false }).limit(200),
  ]);

  return (
    <TrackerBoard
      board={board}
      bots={(botsRes.data ?? []) as BotRow[]}
      log={(logRes.data ?? []) as LogRow[]}
    />
  );
}

import { supabaseAdmin } from "@/lib/supabase";
import { BotSettings, type BotRow } from "./BotSettings";
import { BotLog, type LogRow } from "./BotLog";

// The reader bots, and how often they run.
//
// Every one of these is READ ONLY against the live system. They read message
// logs, payment rows or the boxes, and the only thing they ever write is a
// tracker item or a note on one. None of them edits a clone, a fan, a price, a
// prompt or any deployed code. That is enforced in each bot's own checks, not
// by a switch on this page.

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  // Newest 200 log lines. Enough to see the last few runs of every bot without
  // turning the page into a log viewer, which is what /logs already is.
  const [botsRes, logRes] = await Promise.all([
    supabaseAdmin.from("tracker_bots").select("*").order("sort_order"),
    supabaseAdmin.from("tracker_bot_log").select("*").order("ts", { ascending: false }).limit(200),
  ]);

  return (
    <>
      <BotSettings bots={(botsRes.data ?? []) as BotRow[]} />
      <div className="mx-auto max-w-4xl px-4 pb-10">
        <BotLog rows={(logRes.data ?? []) as LogRow[]} />
      </div>
    </>
  );
}

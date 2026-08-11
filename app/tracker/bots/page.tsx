import { supabaseAdmin } from "@/lib/supabase";
import { BotSettings, type BotRow } from "./BotSettings";

// The reader bots, and how often they run.
//
// Every one of these is READ ONLY against the live system. They read message
// logs, payment rows or the boxes, and the only thing they ever write is a
// tracker item or a note on one. None of them edits a clone, a fan, a price, a
// prompt or any deployed code. That is enforced in each bot's own checks, not
// by a switch on this page.

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const { data } = await supabaseAdmin.from("tracker_bots").select("*").order("sort_order");
  return <BotSettings bots={(data ?? []) as BotRow[]} />;
}

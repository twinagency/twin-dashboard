import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { getFleetClones } from "@/lib/query-cache";
import { requireOnlyFansRead, type ReadContext } from "@/lib/onlyfans/route";
import { authorizeRead, readAccounts } from "@/lib/onlyfans/reads";
import type { ChannelRoster, RosterSource, TelegramCreator, WorkspaceAccount } from "./model";
const idle = <T>(): RosterSource<T> => ({ status: "not_requested", items: [], error: null });
const failed = <T>(error: string): RosterSource<T> => ({ status: "unavailable", items: [], error });
async function telegramRoster(): Promise<RosterSource<TelegramCreator>> {
  try {
    // The existing clones table owns Telegram configuration. Filter credentials
    // in the database; NEVER select or serialize bot_token into a browser DTO.
    const [result, fleet] = await Promise.all([
      supabaseAdmin.from("clones").select("id,name,status,business_username").not("bot_token", "is", null).neq("bot_token", "").order("name", { ascending: true }),
      getFleetClones(),
    ]);
    if (result.error || !result.data) return failed("Telegram creators could not be loaded. Refresh to try again.");
    const photos = new Map(fleet.map(creator => [creator.id, creator]));
    return { status: "ready", error: null, items: result.data.map(row => ({ id: row.id as string, name: row.name as string, status: row.status as string, handle: row.business_username as string | null, photoUrl: photos.get(row.id)?.photoUrl, color: photos.get(row.id)?.color ?? "#4fa7d9" })) };
  } catch { return failed("Telegram creators could not be loaded. Refresh to try again."); }
}
async function onlyfansRoster(context: ReadContext): Promise<RosterSource<WorkspaceAccount>> {
  try {
    const result = await readAccounts(context, { creatorId: null, accountId: null });
    if (!result.ok) return failed(result.state === "unavailable" ? "The OnlyFans account service is unavailable. Refresh to try again." : "OnlyFans accounts could not be loaded. Refresh to try again.");
    return { status: "ready", error: null, items: result.body.accounts.map(account => ({ id: account.accountId, creatorId: account.binding.creatorId, creatorName: account.binding.creatorName, handle: account.binding.handle, health: account.health })) };
  } catch { return failed("OnlyFans accounts could not be loaded. Refresh to try again."); }
}
export async function readChannelRoster(context: ReadContext, channel: "all" | "telegram" | "onlyfans"): Promise<ChannelRoster> {
  const denial = authorizeRead(context.auth);
  if (denial) return { schemaVersion: "channel-roster.v1", telegram: failed("An internal operator session is required."), onlyfans: failed("An internal operator session is required.") };
  const [telegram, onlyfans] = await Promise.all([channel === "onlyfans" ? Promise.resolve(idle<TelegramCreator>()) : telegramRoster(), channel === "telegram" ? Promise.resolve(idle<WorkspaceAccount>()) : onlyfansRoster(context)]);
  return { schemaVersion: "channel-roster.v1", telegram, onlyfans };
}
/** Reuse the existing positive internal-operator read guard; no new auth mode. */
export async function loadChannelRoster(channel: "all" | "telegram" | "onlyfans"): Promise<ChannelRoster> {
  const context = await requireOnlyFansRead();
  if (context instanceof NextResponse) return { schemaVersion: "channel-roster.v1", telegram: failed("Sign in to read your creators."), onlyfans: failed("Sign in to read your accounts.") };
  return readChannelRoster(context, channel);
}

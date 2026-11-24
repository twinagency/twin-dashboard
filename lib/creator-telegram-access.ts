import "server-only";
import { cache } from "react";
import type { CreatorDashboardIdentity } from "./creator-dashboard-identity";
import { flirtOnboardingOptional } from "./flirt-onboarding";
import { serviceClient, serviceClientForAccess } from "./supabase-service";
import { enabled, identity as liveTwinIdentity } from "../deployment/flirt-live-twin.cjs";

const telegramReaders: ReadonlyMap<string, { slug: string; cloneId: string }> = new Map([
  ["75df7b21-b83d-49c6-bf35-4d33fc68f80f", { slug: "randy", cloneId: "e66c7b0a-21b5-48cc-9611-bd09f6b9f96a" }],
]);

// This entitlement grants only the chat view. Revalidate the local account's
// current link and the matching live bot without extending its dashboard role.
export const getCreatorTelegramScope = cache(async (creator: CreatorDashboardIdentity | null): Promise<string | null> => {
  if (!creator || creator.kind !== "creator" || !flirtOnboardingOptional() || !enabled()) return null;
  const expected = telegramReaders.get(creator.accountId);
  if (!expected) return null;
  const link = await serviceClient().from("creator_clone_links").select("clone_id,twin_slug")
    .eq("creator_account_id", creator.accountId).maybeSingle();
  if (link.error || link.data?.twin_slug !== expected.slug || link.data.clone_id !== null) return null;
  const bot = await serviceClientForAccess(liveTwinIdentity()).from("clones").select("id")
    .eq("id", expected.cloneId).eq("slug", expected.slug).maybeSingle();
  return bot.data?.id === expected.cloneId && !bot.error ? expected.slug : null;
});

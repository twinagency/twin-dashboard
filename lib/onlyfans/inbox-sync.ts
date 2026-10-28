import type { Freshness, OfAccount } from "../onlyfans-preview/types";
import { workspaceHref } from "../onlyfans-preview/scope";

/** Explain the selected account's stale reads, never another account's state. */
export function inboxSyncNotice(account: OfAccount | null, conversationFreshness: Freshness | null, detailFreshness: Freshness | null) {
  if (!account) return null;
  const href = workspaceHref("/onlyfans/accounts", {
    creatorId: account.binding.creatorId, accountId: account.accountId,
  }) + "&connection=1#connection-" + encodeURIComponent(account.accountId);
  if (account.health !== "connected") return {
    title: "Connection needs attention.",
    detail: `${account.binding.creatorName}: ${account.healthReason ?? "Open account status to review the saved login and connection."}`,
    asOf: null, href,
  };
  const stale = [account.syncFreshness, conversationFreshness, detailFreshness]
    .filter((value): value is Freshness => !!value?.stale);
  if (!stale.length) return null;
  const incomplete = stale.some(value => !value.asOf);
  const oldest = stale.reduce<string | null>((value, next) =>
    !next.asOf || value && Date.parse(value) <= Date.parse(next.asOf) ? value : next.asOf, null);
  return {
    title: incomplete ? "History sync incomplete." : "History may be out of date.",
    detail: `${account.binding.creatorName}: ${incomplete ? "A complete sync has not been recorded for this view." : "The sync information for this view is out of date."} Newer activity may be missing.`,
    asOf: incomplete ? null : oldest, href,
  };
}

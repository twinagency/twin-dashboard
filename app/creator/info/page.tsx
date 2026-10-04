import { creatorApplicationState } from "@/lib/creator-application-state";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { withDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { cloneBotToken } from "@/lib/clone-credentials";
import { getStarBalance } from "@/lib/star-balance";
import StarAmount from "@/components/StarAmount";
import { Card } from "@/components/ui/card";
export const dynamic = "force-dynamic";
export default async function CreatorInfoPage() {
  const creator = await requireCreatorWorkspace();
  const application = creator.applicationState || creatorApplicationState(null);
  const id = creator.cloneIds[0];
  const details = id ? await withDashboardAccess(creator, async () => {
    const clone = await supabaseAdmin.from("clones").select("id,name,slug,status").eq("id", id).maybeSingle();
    if (clone.error || !clone.data) throw new Error("Your creator information could not be loaded");
    const token = await cloneBotToken(id);
    const balance = token ? await getStarBalance(id, token).catch(() => null) : null;
    return { clone: clone.data, balance };
  }) : null;
  return <div className="dashboard-page mx-auto grid max-w-3xl gap-5 text-ink"><div><h1 className="text-2xl font-semibold">Info</h1><p className="mt-1 text-sm text-muted">Your connected AI profile and account information.</p></div><Card className="divide-y divide-line overflow-hidden p-0">{[
    ["Creator", creator.creatorName], ["Agency", creator.name], ["Profile", details?.clone.slug || "Awaiting connection"], ["AI profile status", details?.clone.status || "Not connected"], ["Onboarding", application.label],
  ].map(([label, value]) => <div key={label} className="flex items-center justify-between gap-4 p-4 text-sm"><span className="text-muted">{label}</span><span className="creator-name text-right font-medium">{value}</span></div>)}</Card><div className="grid gap-4 sm:grid-cols-2"><Card className="p-5"><h2 className="mb-3 text-sm text-muted">Lifetime proceeds</h2><div className="text-2xl font-semibold text-good">{details?.balance ? <StarAmount stars={details.balance.lifetimeStars} /> : "Unavailable"}</div><p className="mt-2 text-xs text-muted">Sales received by your AI profile after the earnings split, not a payout balance.</p></Card><Card className="p-5"><h2 className="mb-3 text-sm text-muted">Telegram Stars balance</h2><div className="text-2xl font-semibold text-good">{details?.balance?.totalBalanceStars != null ? <StarAmount stars={details.balance.totalBalanceStars} /> : "Unavailable"}</div><p className="mt-2 text-xs text-muted">The current bot wallet balance, when Telegram makes it available.</p></Card></div></div>;
}

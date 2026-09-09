import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import TwinWordmark from "@/components/TwinWordmark";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { supabaseAdmin } from "@/lib/supabase";
import { getDashboard, type CloneStats, type DashboardData } from "@/lib/dashboard-data";
import { fmtMoney, fmtNum, starsToMoney } from "@/lib/money";
import { CREATOR_SESSION_COOKIE, verifyCreatorSession } from "@/lib/creator-session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Creator Dashboard · Twin" };

function cloneStats(data: DashboardData | null, cloneId: string | null): CloneStats | null {
  if (!data || !cloneId) return null;
  return data.perClone[cloneId] || null;
}

function money(stars: number | null | undefined) {
  return fmtMoney(starsToMoney(Number(stars || 0), "USD"), "USD");
}

function metric(label: string, value: string, sub?: string) {
  return (
    <Card className="border border-border bg-white shadow-sm">
      <CardHeader className="pb-1 text-sm text-muted">{label}</CardHeader>
      <CardContent>
        <div className="font-heading text-3xl font-semibold tracking-[-0.03em] text-ink">{value}</div>
        {sub ? <div className="mt-1 text-xs text-muted">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

export default async function CreatorHomePage() {
  const session = await verifyCreatorSession((await cookies()).get(CREATOR_SESSION_COOKIE)?.value);
  if (!session) redirect("/creator/login");

  const [{ data: account }, { data: application }, { data: assignment }, { data: link }] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("id,display_name,email,account_status").eq("id", session.accountId).single(),
    supabaseAdmin.from("creator_applications").select("status").eq("creator_account_id", session.accountId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    supabaseAdmin.from("creator_agency_assignments").select("agency_id,partner_agencies(name)").eq("creator_account_id", session.accountId).maybeSingle(),
    supabaseAdmin.from("creator_clone_links").select("clone_id,twin_slug,clones(name)").eq("creator_account_id", session.accountId).maybeSingle(),
  ]);

  if (!account) redirect("/creator-auth/logout");

  const cloneId = link?.clone_id || null;
  const cloneName = (link as any)?.clones?.name || link?.twin_slug || "Not linked yet";
  const agencyName = (assignment as any)?.partner_agencies?.name || "Twin Direct";

  let day: DashboardData | null = null;
  let week: DashboardData | null = null;
  let all: DashboardData | null = null;
  let performanceError = false;

  if (cloneId) {
    try {
      [day, week, all] = await Promise.all([getDashboard("1D"), getDashboard("1W"), getDashboard("ALL")]);
    } catch (error) {
      performanceError = true;
      console.error("creator dashboard performance load failed", error);
    }
  }

  const dayStats = cloneStats(day, cloneId);
  const weekStats = cloneStats(week, cloneId);
  const allStats = cloneStats(all, cloneId);
  const recent = cloneId ? (all?.recent || []).filter((tx) => tx.cloneId === cloneId).slice(0, 8) : [];
  const submitted = ["submitted", "reviewing", "approved"].includes(application?.status || "");

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="sticky top-0 z-20 border-b border-border bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <TwinWordmark />
          <div className="flex items-center gap-4">
            <Link href="/creator/onboarding" className="text-sm font-medium text-muted hover:text-ink">Onboarding</Link>
            <form action="/creator-auth/logout" method="post"><button className="text-sm font-medium text-muted hover:text-ink">Sign out</button></form>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-5 py-8 sm:py-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-2">Creator dashboard</p>
            <h1 className="mt-2 font-heading text-4xl font-semibold tracking-[-0.04em] text-ink">Hi, {account.display_name || "creator"}</h1>
            <p className="mt-2 text-muted">Track your Twin performance, audience and sales in one place.</p>
          </div>
          <div className="rounded-full border border-border bg-white px-4 py-2 text-sm font-medium text-ink">
            {cloneId ? cloneName : application?.status === "submitted" ? "Awaiting clone connection" : "Setup in progress"}
          </div>
        </div>

        {!cloneId ? (
          <div className="mt-7 rounded-2xl border border-border bg-white p-6 shadow-sm">
            <div className="text-lg font-semibold text-ink">Your onboarding is submitted</div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
              Your creator dashboard is ready. Performance data will populate automatically as soon as the Twin team links this account to your live clone.
            </p>
            <div className="mt-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-full bg-muted/20 px-3 py-1.5 text-muted">Application: {application?.status || "not started"}</span>
              <span className="rounded-full bg-muted/20 px-3 py-1.5 text-muted">Agency: {agencyName}</span>
            </div>
          </div>
        ) : null}

        {performanceError ? (
          <div className="mt-7 rounded-2xl border border-border bg-white p-5 text-sm text-muted shadow-sm">
            Your live performance data could not be loaded just now. Your account and clone link are intact. Refresh this page to try again.
          </div>
        ) : null}

        <section className="mt-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-2xl font-semibold text-ink">Performance</h2>
              <p className="mt-1 text-sm text-muted">Live data from your linked Twin clone.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {metric("Revenue today", cloneId && dayStats ? money(dayStats.stars) : "—", cloneId ? "Gross clone revenue" : "Available after your clone is linked")}
            {metric("Revenue this week", cloneId && weekStats ? money(weekStats.stars) : "—", cloneId ? "Gross clone revenue" : undefined)}
            {metric("Total revenue", cloneId && allStats ? money(allStats.stars) : "—", cloneId ? "Gross clone revenue" : undefined)}
            {metric("Sales today", cloneId && dayStats ? fmtNum(dayStats.sales) : "—")}
            {metric("Active users", cloneId && dayStats ? fmtNum(dayStats.activeUsers) : "—", "Today")}
            {metric("Total fans", cloneId && allStats ? fmtNum(allStats.totalFans) : "—")}
          </div>

          {cloneId ? (
            <p className="mt-3 text-xs leading-5 text-muted">
              Revenue currently shows the clone's gross sales. Your personal payout amount will replace this once your creator revenue-share percentage is configured in Twin.
            </p>
          ) : null}
        </section>

        <section className="mt-8 grid gap-5 lg:grid-cols-3">
          <Card className="border border-border bg-white shadow-sm lg:col-span-2">
            <CardHeader>
              <div>
                <h2 className="font-heading text-xl font-semibold text-ink">Recent activity</h2>
                <p className="mt-1 text-sm text-muted">Your latest paid transactions.</p>
              </div>
            </CardHeader>
            <CardContent>
              {!cloneId ? (
                <div className="rounded-xl bg-muted/10 px-4 py-8 text-center text-sm text-muted">Activity will appear when your clone is linked.</div>
              ) : recent.length === 0 ? (
                <div className="rounded-xl bg-muted/10 px-4 py-8 text-center text-sm text-muted">No recent paid activity yet.</div>
              ) : (
                <div className="divide-y divide-border">
                  {recent.map((tx, index) => (
                    <div key={`${tx.paidAt}-${index}`} className="flex items-center justify-between gap-4 py-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-ink">{tx.buyerName || tx.username || "Fan"}</div>
                        <div className="mt-0.5 text-xs capitalize text-muted">{tx.kind || "purchase"} · {new Date(tx.paidAt).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold text-ink">{money(tx.stars)}</div>
                        <div className="text-xs text-muted">{fmtNum(tx.stars)} stars</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-5">
            <Card className="border border-border bg-white shadow-sm">
              <CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Your Twin</h2></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between gap-4"><span className="text-muted">Clone</span><span className="text-right font-medium text-ink">{cloneName}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Agency</span><span className="text-right font-medium text-ink">{agencyName}</span></div>
                <div className="flex justify-between gap-4"><span className="text-muted">Status</span><span className="text-right font-medium capitalize text-ink">{account.account_status}</span></div>
              </CardContent>
            </Card>

            <Card className="border border-border bg-white shadow-sm">
              <CardHeader><h2 className="font-heading text-xl font-semibold text-ink">Reach</h2></CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="flex justify-between"><span className="text-muted">Messageable now</span><span className="font-medium text-ink">{cloneId && dayStats ? fmtNum(dayStats.reachable24h) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted">Messages today</span><span className="font-medium text-ink">{cloneId && dayStats ? fmtNum(dayStats.messages) : "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted">Buyers this week</span><span className="font-medium text-ink">{cloneId && weekStats ? fmtNum(weekStats.buyers) : "—"}</span></div>
              </CardContent>
            </Card>
          </div>
        </section>

        {submitted ? (
          <div className="mt-8 flex items-center justify-between gap-4 rounded-2xl border border-border bg-white px-5 py-4 text-sm shadow-sm">
            <div><span className="font-medium text-ink">Onboarding complete.</span> <span className="text-muted">You can still view the information you submitted.</span></div>
            <Link href="/creator/onboarding" className="shrink-0 font-medium text-primary hover:underline">View onboarding</Link>
          </div>
        ) : null}
      </main>
    </div>
  );
}

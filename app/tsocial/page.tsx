import { notFound } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { selectAllRows } from "@/lib/select-all";
import { fmtNum } from "@/lib/money";
import { TSOCIAL_ORIGIN, tablesMissing } from "@/lib/tsocial";
import { setCreatorEnabled, setPostEnabled } from "./actions";
import EnabledToggle from "./EnabledToggle";

export const dynamic = "force-dynamic";

type Clone = { id: string; name: string; slug: string };
type Post = { id: string; clone_id: string; type: string; src: string; poster: string | null; enabled: boolean; sort: number };

export default async function TSocialPage() {
  if ((await getDashboardAccess()) !== null) notFound();

  const probe = await supabaseAdmin.from("tsocial_creators").select("clone_id").limit(1);
  if (probe.error && tablesMissing(probe.error)) {
    return (
      <main className="dashboard-page flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-ink">T-Social</h1>
        <Card><p className="text-sm text-ink">Run the T-Social migration first (db/migrations/20261001120000_tsocial.sql, then db/manual/tsocial_seed_2026-10-01.sql).</p></Card>
      </main>
    );
  }

  const now = Date.now();
  const d7 = new Date(now - 7 * 864e5).toISOString();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const count = async (kind: string, since: string) =>
    (await supabaseAdmin.from("tsocial_events").select("id", { count: "exact", head: true }).eq("kind", kind).gte("at", since)).count ?? 0;

  const [clonesRes, creatorsRes, postsRes, opensToday, opens7, profiles7, messages7, verified7, messageRows] = await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug").order("name"),
    supabaseAdmin.from("tsocial_creators").select("clone_id,enabled"),
    supabaseAdmin.from("tsocial_posts").select("id,clone_id,type,src,poster,enabled,sort").order("sort"),
    count("open", dayStart.toISOString()),
    count("open", d7),
    count("profile", d7),
    count("message", d7),
    selectAllRows<{ telegram_id: number }>(supabaseAdmin.from("tsocial_events").select("telegram_id").eq("verified", true).gte("at", d7).order("id"), { label: "tsocial verified" }),
    selectAllRows<{ clone_id: string | null }>(supabaseAdmin.from("tsocial_events").select("clone_id").eq("kind", "message").gte("at", d7).order("id"), { label: "tsocial messages" }),
  ]);

  const clones = (clonesRes.data ?? []) as Clone[];
  const enabledBy = new Map(((creatorsRes.data ?? []) as { clone_id: string; enabled: boolean }[]).map((c) => [c.clone_id, c.enabled]));
  const posts = (postsRes.data ?? []) as Post[];
  const uniqueUsers = new Set(verified7.rows.map((r) => r.telegram_id).filter((v) => v != null)).size;
  const msgBy = new Map<string, number>();
  for (const r of messageRows.rows) if (r.clone_id) msgBy.set(r.clone_id, (msgBy.get(r.clone_id) ?? 0) + 1);
  const postsBy = new Map<string, Post[]>();
  for (const p of posts) postsBy.set(p.clone_id, [...(postsBy.get(p.clone_id) ?? []), p]);

  const stats: [string, number, string][] = [
    ["Opens today", opensToday, "Times the Mini App was opened since midnight, server time."],
    ["Opens 7d", opens7, "Times the Mini App was opened in the last 7 days."],
    ["Unique users 7d", uniqueUsers, "Distinct Telegram accounts, counted only when the app proved who they were (signed Telegram data)."],
    ["Profile views 7d", profiles7, "Creator profiles opened in the last 7 days."],
    ["Message taps 7d", messages7, "Taps on Message, the real conversion into a creator chat."],
  ];
  const withPosts = clones.filter((c) => (postsBy.get(c.id) ?? []).length > 0);

  return (
    <main className="dashboard-page flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-ink">T-Social</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {stats.map(([label, value, tip]) => (
          <Card key={label} size="sm" className="gap-1">
            <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}<Info text={tip} /></div>
            <div className="text-2xl font-semibold text-ink">{fmtNum(value)}</div>
          </Card>
        ))}
      </div>

      <Card>
        <h2 className="mb-3 text-lg font-semibold text-ink">Creators</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead className="text-xs text-muted">
              <tr><th className="py-2 pr-3">Creator</th><th className="px-2">Shown</th><th className="px-2">Posts</th><th className="px-2">Message taps 7d</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {clones.map((c) => {
                const ps = postsBy.get(c.id) ?? [];
                return (
                  <tr key={c.id}>
                    <td className="py-2 pr-3 font-medium text-ink">{c.name}</td>
                    <td className="px-2"><EnabledToggle id={c.id} enabled={enabledBy.get(c.id) === true} label="" action={setCreatorEnabled} /></td>
                    <td className="px-2">{ps.filter((p) => p.enabled).length} / {ps.length}</td>
                    <td className="px-2">{fmtNum(msgBy.get(c.id) ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {withPosts.map((c) => (
        <Card key={c.id}>
          <h2 className="mb-3 text-lg font-semibold text-ink">{c.name}</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
            {(postsBy.get(c.id) ?? []).map((p) => (
              <div key={p.id} className={`flex flex-col gap-2 ${p.enabled ? "" : "opacity-60"}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="" loading="lazy" src={`${TSOCIAL_ORIGIN}/${p.poster || p.src}`} className="aspect-[9/16] w-full rounded-lg bg-panel object-cover" />
                <div className="flex items-center justify-between text-xs text-muted">
                  <span>{p.type}</span>
                  <EnabledToggle id={p.id} enabled={p.enabled} label="" action={setPostEnabled} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </main>
  );
}

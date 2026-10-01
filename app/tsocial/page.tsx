import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { selectAllRows } from "@/lib/select-all";
import { fmtNum } from "@/lib/money";
import { groupReports, tablesMissing, tsocialMediaUrl, type ReportRow } from "@/lib/tsocial";
import { AccountControls, ReportControls, ReviewControls, SettingRow } from "./Controls";

export const dynamic = "force-dynamic";

type Account = {
  id: string; tg_user_id: number; username: string | null; display_name: string | null; avatar_path: string | null;
  plan: string; plan_until: string | null; verified: boolean; banned: boolean; followers: number;
};
type Post = {
  id: string; account_id: string | null; type: string; src: string; poster: string | null; caption: string | null;
  purpose: string; price_ton: number | null; status: string; created_at: string;
};
type ChatPost = { id: string; account_id: string; text: string; status: string };

const MAX_ACCOUNT_ROWS = 100;

function Media({ post, className = "" }: { post: Pick<Post, "type" | "src" | "poster">; className?: string }) {
  const cls = `aspect-[9/16] w-full rounded-lg bg-panel object-cover ${className}`;
  if (post.type === "voice") return <div className={`${cls} flex items-center justify-center text-xs text-muted`}>voice</div>;
  const poster = tsocialMediaUrl(post.poster);
  if (post.type === "video" && !poster) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <video muted playsInline preload="metadata" controls src={tsocialMediaUrl(post.src) ?? undefined} className={cls} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img alt="" loading="lazy" src={(poster ?? tsocialMediaUrl(post.src)) ?? undefined} className={cls} />;
}

const who = (a: Account | undefined) => (a ? a.display_name || (a.username ? `@${a.username}` : String(a.tg_user_id)) : "unknown");
const settingText = (v: unknown) => (v == null ? "" : Array.isArray(v) ? v.join("\n") : String(v));

export default async function TSocialPage() {
  if ((await getDashboardAccess()) !== null) notFound();

  const probe = await supabaseAdmin.from("tsocial_accounts").select("id").limit(1);
  if (probe.error && tablesMissing(probe.error)) {
    return (
      <main className="dashboard-page flex flex-col gap-4">
        <h1 className="text-3xl font-bold text-ink">T-Social</h1>
        <Card><CardContent><p className="text-sm text-ink">Run the T-Social migrations first (db/migrations/*tsocial*.sql in the bot repo).</p></CardContent></Card>
      </main>
    );
  }

  const nowIso = new Date().toISOString();
  const d7 = new Date(Date.now() - 7 * 864e5).toISOString();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const count = async (kind: string, since: string) =>
    (await supabaseAdmin.from("tsocial_events").select("id", { count: "exact", head: true }).eq("kind", kind).gte("at", since)).count ?? 0;

  const [opensToday, opens7, profiles7, messages7, newAccounts7, paidActive, verified7, payments7, reviewRes, reportRes, accountsRes, postsRes, settingsRes] = await Promise.all([
    count("open", dayStart.toISOString()),
    count("open", d7),
    count("profile", d7),
    count("message", d7),
    supabaseAdmin.from("tsocial_accounts").select("id", { count: "exact", head: true }).gte("created_at", d7).then((r) => r.count ?? 0),
    supabaseAdmin.from("tsocial_accounts").select("id", { count: "exact", head: true }).eq("plan", "paid").gt("plan_until", nowIso).then((r) => r.count ?? 0),
    selectAllRows<{ telegram_id: number }>(supabaseAdmin.from("tsocial_events").select("telegram_id").eq("verified", true).gte("at", d7).order("id"), { label: "tsocial verified" }),
    selectAllRows<{ method: string; amount: number }>(supabaseAdmin.from("tsocial_payments").select("method,amount").eq("status", "paid").gte("created_at", d7).order("id"), { label: "tsocial payments" }),
    supabaseAdmin.from("tsocial_posts").select("id,account_id,type,src,poster,caption,purpose,price_ton,status,created_at").eq("status", "review").order("created_at", { ascending: false }).limit(60),
    supabaseAdmin.from("tsocial_reports").select("id,post_id,chat_post_id,tg_user_id,reason,created_at").order("created_at", { ascending: false }).limit(1000),
    selectAllRows<Account>(supabaseAdmin.from("tsocial_accounts").select("id,tg_user_id,username,display_name,avatar_path,plan,plan_until,verified,banned,followers").order("id"), { label: "tsocial accounts" }),
    selectAllRows<{ account_id: string | null; views: number }>(supabaseAdmin.from("tsocial_posts").select("account_id,views").not("account_id", "is", null).neq("status", "rejected").order("id"), { label: "tsocial posts" }),
    supabaseAdmin.from("tsocial_settings").select("key,value"),
  ]);

  const accounts = accountsRes.rows;
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const postStats = new Map<string, { posts: number; views: number }>();
  for (const p of postsRes.rows) {
    if (!p.account_id) continue;
    const s = postStats.get(p.account_id) ?? { posts: 0, views: 0 };
    s.posts++; s.views += p.views ?? 0;
    postStats.set(p.account_id, s);
  }
  const ranked = [...accounts].sort((a, b) => (postStats.get(b.id)?.views ?? 0) - (postStats.get(a.id)?.views ?? 0));

  const stars = payments7.rows.filter((r) => r.method === "stars");
  const ton = payments7.rows.filter((r) => r.method === "ton");
  const sum = (rows: { amount: number }[]) => rows.reduce((t, r) => t + Number(r.amount), 0);
  const uniqueUsers = new Set(verified7.rows.map((r) => r.telegram_id).filter((v) => v != null)).size;

  const stats: [string, string, string][] = [
    ["Opens today", fmtNum(opensToday), "Times the Mini App was opened since midnight, server time."],
    ["Opens 7d", fmtNum(opens7), "Times the Mini App was opened in the last 7 days."],
    ["Unique users 7d", fmtNum(uniqueUsers), "Distinct Telegram accounts, counted only when the app proved who they were (signed Telegram data)."],
    ["Profile views 7d", fmtNum(profiles7), "Account profiles opened in the last 7 days."],
    ["Message taps 7d", fmtNum(messages7), "Taps on Message, the real conversion into a chat with an account."],
    ["New accounts 7d", fmtNum(newAccounts7), "Accounts created in the last 7 days."],
    ["Paid plans active", fmtNum(paidActive), "Accounts on the paid plan whose plan has not expired."],
    ["Stars plan payments 7d", `${fmtNum(sum(stars))} (${stars.length})`, "Stars received for plans in the last 7 days, with the number of payments in brackets. Paid status only."],
    ["TON plan payments 7d", `${sum(ton).toLocaleString("en-US", { maximumFractionDigits: 3 })} (${ton.length})`, "TON received for plans in the last 7 days, with the number of payments in brackets. Paid status only."],
  ];

  // Review queue
  const review = (reviewRes.data ?? []) as Post[];

  // Reports: group, then drop items that are already hidden or gone.
  const groups = groupReports((reportRes.data ?? []) as ReportRow[]);
  const clipIds = groups.filter((g) => g.kind === "clip").map((g) => g.itemId);
  const chatIds = groups.filter((g) => g.kind === "chat").map((g) => g.itemId);
  const [clipRes, chatRes] = await Promise.all([
    clipIds.length ? supabaseAdmin.from("tsocial_posts").select("id,account_id,type,src,poster,caption,purpose,price_ton,status,created_at").in("id", clipIds) : Promise.resolve({ data: [] }),
    chatIds.length ? supabaseAdmin.from("tsocial_chat_posts").select("id,account_id,text,status").in("id", chatIds) : Promise.resolve({ data: [] }),
  ]);
  const clips = new Map(((clipRes.data ?? []) as Post[]).map((p) => [p.id, p]));
  const chats = new Map(((chatRes.data ?? []) as ChatPost[]).map((p) => [p.id, p]));
  const openGroups = groups.filter((g) => (g.kind === "clip" ? clips.get(g.itemId)?.status : chats.get(g.itemId)?.status) !== "hidden");

  const settings = new Map(((settingsRes.data ?? []) as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));

  return (
    <main className="dashboard-page flex flex-col gap-6">
      <h1 className="text-3xl font-bold text-ink">T-Social</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {stats.map(([label, value, tip]) => (
          <Card key={label} size="sm" className="gap-1">
            <CardContent>
              <div className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{label}<Info text={tip} /></div>
              <div className="text-2xl font-semibold text-ink">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent>
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">Review queue ({review.length})<Info text="Posts the AI flagged. They stay hidden from the feed until you approve or reject them." /></h2>
          {review.length === 0 ? <p className="text-sm text-ink">Nothing waiting.</p> : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {review.map((p) => (
                <div key={p.id} className="flex flex-col gap-2">
                  <Media post={p} />
                  <div className="text-xs text-ink">{who(p.account_id ? accById.get(p.account_id) : undefined)} · {p.purpose}{p.price_ton ? ` · ${p.price_ton} TON` : ""}</div>
                  {p.caption && <div className="line-clamp-2 text-xs text-ink">{p.caption}</div>}
                  <ReviewControls postId={p.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">Reports ({openGroups.length})<Info text="Newest first, one row per reported item. Hide takes the item out of the feed. Dismiss deletes its reports and leaves it live." /></h2>
          {openGroups.length === 0 ? <p className="text-sm text-ink">No open reports.</p> : (
            <div className="flex flex-col divide-y divide-line">
              {openGroups.map((g) => {
                const clip = g.kind === "clip" ? clips.get(g.itemId) : undefined;
                const chat = g.kind === "chat" ? chats.get(g.itemId) : undefined;
                const owner = accById.get((clip?.account_id ?? chat?.account_id) ?? "");
                return (
                  <div key={`${g.kind}:${g.itemId}`} className="flex gap-3 py-3">
                    <div className="w-20 shrink-0">
                      {clip ? <Media post={clip} /> : <div className="rounded-lg bg-panel p-2 text-xs text-ink">{chat ? chat.text.slice(0, 120) : "Deleted"}</div>}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="text-sm font-medium text-ink">{g.kind === "clip" ? "Clip" : "Chat post"} by {who(owner)}</div>
                      <div className="text-xs text-ink">
                        {g.count} report{g.count === 1 ? "" : "s"} from {g.reporters} user{g.reporters === 1 ? "" : "s"} · {new Date(g.latest).toLocaleString("en-GB")}
                      </div>
                      <div className="text-xs text-ink">{g.reasons.length ? g.reasons.join(" / ") : "No reason given"}</div>
                      <div className="text-xs text-muted">Reporter ids: {(reportRes.data ?? []).filter((r: { post_id: string | null; chat_post_id: string | null }) => (r.post_id ?? r.chat_post_id) === g.itemId).map((r: { tg_user_id: number | null }) => r.tg_user_id ?? "anon").slice(0, 8).join(", ")}</div>
                      {(clip || chat) && <ReportControls kind={g.kind} itemId={g.itemId} />}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">Accounts ({fmtNum(accounts.length)})<Info text={`Ranked by total views on their posts. Showing the top ${MAX_ACCOUNT_ROWS}. Paid plans are set by payment, so only free and staff can be picked by hand.`} /></h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr><th className="py-2 pr-2">#</th><th className="pr-3">Account</th><th className="px-2">Plan</th><th className="px-2">Until</th><th className="px-2">Posts</th><th className="px-2">Followers</th><th className="px-2">Views</th><th className="px-2">Controls</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {ranked.slice(0, MAX_ACCOUNT_ROWS).map((a, i) => {
                  const s = postStats.get(a.id);
                  const avatar = tsocialMediaUrl(a.avatar_path);
                  return (
                    <tr key={a.id} className={a.banned ? "opacity-60" : ""}>
                      <td className="py-2 pr-2 text-muted">{i + 1}</td>
                      <td className="pr-3">
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {avatar ? <img alt="" loading="lazy" src={avatar} className="size-8 rounded-full bg-panel object-cover" /> : <span className="size-8 rounded-full bg-panel" />}
                          <div className="min-w-0">
                            <div className="truncate font-medium text-ink">{a.display_name || "No name"}{a.verified ? " ✓" : ""}{a.banned ? " (banned)" : ""}</div>
                            <div className="truncate text-xs text-muted">{a.username ? `@${a.username}` : a.tg_user_id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2">{a.plan}</td>
                      <td className="px-2">{a.plan_until ? new Date(a.plan_until).toLocaleDateString("en-GB") : "-"}</td>
                      <td className="px-2">{fmtNum(s?.posts ?? 0)}</td>
                      <td className="px-2">{fmtNum(a.followers)}</td>
                      <td className="px-2">{fmtNum(s?.views ?? 0)}</td>
                      <td className="px-2"><AccountControls id={a.id} banned={a.banned} verified={a.verified} plan={a.plan} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">Settings<Info text="Live values the Mini App reads. Price and percentage changes ask you to confirm first." /></h2>
          <div className="grid gap-4 md:grid-cols-2">
            <SettingRow settingKey="price_stars" label="Plan price (Stars)" hint="Whole Stars charged for a paid plan." initial={settingText(settings.get("price_stars"))} />
            <SettingRow settingKey="ton_test_flat" label="TON flat price" hint="Fixed TON price for testing. Leave empty to price TON from the Stars price." initial={settingText(settings.get("ton_test_flat"))} />
            <SettingRow settingKey="ton_discount_pct" label="TON discount (%)" hint="Percent off when paying with TON, 0 to 100." initial={settingText(settings.get("ton_discount_pct"))} />
            <SettingRow settingKey="platform_cut_pct" label="Platform cut (%)" hint="Our share of direct TON purchases of paid posts, 0 to 100." initial={settingText(settings.get("platform_cut_pct"))} />
            <SettingRow settingKey="monthly_post_limit" label="Monthly post limit" hint="Posts a free account may publish per month, 1 to 1000." initial={settingText(settings.get("monthly_post_limit"))} />
            <SettingRow settingKey="blocked_domains" label="Blocked domains" hint="One hostname per line, like example.com. Links to these are rejected in posts and chat." initial={settingText(settings.get("blocked_domains"))} multiline />
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

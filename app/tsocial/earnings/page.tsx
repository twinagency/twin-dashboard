import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { selectAllRows } from "@/lib/select-all";
import { fmtNum } from "@/lib/money";
import { buildEarnings, parseVipPostId, type AiPurchaseRow, type PayRow, type TonOrderRow } from "@/lib/tsocial-earnings";
import TSocialTabs from "../TSocialTabs";

export const dynamic = "force-dynamic";

const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const ton = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default async function TSocialEarningsPage() {
  if ((await getDashboardAccess()) !== null) notFound();

  const [payRes, tonRes, aiRes, settingsRes] = await Promise.all([
    selectAllRows<PayRow>(supabaseAdmin.from("tsocial_payments").select("id,tg_user_id,method,amount,currency,status,payload,created_at").order("id"), { label: "tsocial payments" }),
    selectAllRows<TonOrderRow>(supabaseAdmin.from("tsocial_unlock_orders").select("payload,post_id,tg_user_id,amount_nano,cut_nano,status,created_at").order("id"), { label: "tsocial unlock orders" }),
    supabaseAdmin.from("ai_model_purchases").select("id,type,model_id,telegram_id,image_id,stars,paid_at").limit(5000),
    supabaseAdmin.from("tsocial_settings").select("key,value").eq("key", "star_usd"),
  ]);
  const aiMissing = !!aiRes.error;
  const aiPurchases = (aiRes.error ? [] : aiRes.data ?? []) as AiPurchaseRow[];
  const starUsd = Number((settingsRes.data ?? [])[0]?.value) || 0.013;

  // who owns each paid thing, and who is a test account
  const postIds = [...new Set([...payRes.rows.map((p) => parseVipPostId(p.payload)), ...tonRes.rows.map((o) => o.post_id)].filter((v): v is string => !!v))];
  const postRows: { id: string; account_id: string | null }[] = [];
  for (const c of chunks(postIds, 100)) postRows.push(...(((await supabaseAdmin.from("tsocial_posts").select("id,account_id").in("id", c)).data ?? []) as typeof postRows));
  const accIds = [...new Set(postRows.map((p) => p.account_id).filter((v): v is string => !!v))];
  const accRows: { id: string; display_name: string | null; username: string | null }[] = [];
  for (const c of chunks(accIds, 100)) accRows.push(...(((await supabaseAdmin.from("tsocial_accounts").select("id,display_name,username").in("id", c)).data ?? []) as typeof accRows));
  const modelRows = ((await supabaseAdmin.from("ai_models").select("id,name")).data ?? []) as { id: string; name: string }[];
  const buyerIds = [...new Set([...payRes.rows.map((p) => p.tg_user_id), ...tonRes.rows.map((o) => o.tg_user_id), ...aiPurchases.map((a) => a.telegram_id)].filter((v): v is number => v != null))];
  const testIds = new Set<number>();
  for (const c of chunks(buyerIds, 200)) for (const u of (((await supabaseAdmin.from("users").select("telegram_id").eq("is_test", true).in("telegram_id", c)).data ?? []) as { telegram_id: number }[])) testIds.add(u.telegram_id);

  const e = buildEarnings({
    payments: payRes.rows, tonOrders: tonRes.rows, aiPurchases,
    postOwner: new Map(postRows.filter((p) => p.account_id).map((p) => [p.id, p.account_id as string])),
    accountName: new Map(accRows.map((a) => [a.id, a.display_name || (a.username ? `@${a.username}` : "Unnamed")])),
    modelName: new Map(modelRows.map((m) => [m.id, m.name])),
    testIds, starUsd,
  });

  const stats: [string, string, string][] = [
    ["Stars earned", fmtNum(e.stars), "Telegram Stars paid to the T-Social bot, all time: VIP bundles, posting plans and AI girl pics. Refunded payments are not counted."],
    ["USD estimate", usd(e.usd), `Stars x ${starUsd} USD per Star (T-Social setting star_usd). An estimate, Telegram pays out after its own cut.`],
    ["TON earned", ton(e.ton), "TON paid for VIP bundles and paid clips (tsocial_payments and tsocial_unlock_orders, paid only)."],
    ["Paid purchases", fmtNum(e.count), "Number of paid purchases, Stars and TON together."],
    ["Buyers", fmtNum(e.buyers), "Distinct Telegram accounts that paid at least once."],
    ["Test accounts", `${fmtNum(e.testStars)} Stars`, `Part of the total paid by accounts flagged is_test (${e.testCount} purchases, ${ton(e.testTon)} TON). Subtract this for real money.`],
    ["Refunded", `${fmtNum(e.refundedStars)} Stars`, "Stars given back to buyers. Not part of the total above."],
    ["Unpaid invoices", `${fmtNum(e.unpaid.count)} (${fmtNum(e.unpaid.stars)} Stars)`, "Invoices the Mini App opened that nobody paid. This is demand, not earnings."],
  ];
  const src: [string, { stars: number; ton: number; count: number; buyers: number }, string][] = [
    ["VIP bundles", e.bySource.vip, "Paid VIP unlocks, Stars or TON."],
    ["Posting plans", e.bySource.plans, "Creators paying T-Social for a monthly posting plan."],
    ["Paid clips (TON)", e.bySource.paidClips, "TON purchases of a single paid clip."],
    ["AI girl pics", e.bySource.ai, aiMissing ? "Table ai_model_purchases does not exist yet (migration 20261008140000 not applied), so this is 0." : "Stars paid for locked pics in AI girl chats."],
  ];

  return (
    <main className="dashboard-page flex flex-col gap-6">
      <TSocialTabs active="earnings" />
      <p className="text-sm text-ink">
        Everything the T-Social Mini App and its bot (@TSocialAppBot) has earned. Source: <code>tsocial_payments</code>, <code>tsocial_unlock_orders</code>{aiMissing ? "" : ", ai_model_purchases"}.
        {e.count === 0 ? " Nothing has been paid yet, so every number is 0." : ` First payment ${new Date(e.firstPaid!).toLocaleDateString("en-GB")}, latest ${new Date(e.lastPaid!).toLocaleDateString("en-GB")}.`}
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">By source<Info text="Where the money came from." /></h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Source</th><th className="px-2">Stars</th><th className="px-2">TON</th><th className="px-2">Purchases</th><th className="px-2">Buyers</th><th className="px-2">Note</th></tr></thead>
              <tbody className="divide-y divide-line">
                {src.map(([label, s, note]) => (
                  <tr key={label}><td className="py-2 pr-3 font-medium text-ink">{label}</td><td className="px-2">{fmtNum(s.stars)}</td><td className="px-2">{ton(s.ton)}</td><td className="px-2">{fmtNum(s.count)}</td><td className="px-2">{fmtNum(s.buyers)}</td><td className="px-2 text-xs text-muted">{note}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">By creator<Info text="VIP bundles and paid clips are credited to the creator who owns the post. AI girls and posting plans have their own rows." /></h2>
          {e.byCreator.length === 0 ? <p className="text-sm text-ink">0 Stars. Nothing paid yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Creator</th><th className="px-2">Stars</th><th className="px-2">USD</th><th className="px-2">TON</th><th className="px-2">Purchases</th><th className="px-2">Buyers</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {e.byCreator.map((c) => (
                    <tr key={c.key}><td className="py-2 pr-3 font-medium text-ink">{c.name}</td><td className="px-2">{fmtNum(c.stars)}</td><td className="px-2">{usd(c.stars * starUsd)}</td><td className="px-2">{ton(c.ton)}</td><td className="px-2">{fmtNum(c.count)}</td><td className="px-2">{fmtNum(c.buyers)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">By day<Info text="Sydney time. Only days with a payment are listed." /></h2>
          {e.byDay.length === 0 ? <p className="text-sm text-ink">No payments yet.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs text-muted"><tr><th className="py-2 pr-3">Day</th><th className="px-2">Stars</th><th className="px-2">USD</th><th className="px-2">TON</th><th className="px-2">Purchases</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {e.byDay.map((d) => (
                    <tr key={d.day}><td className="py-2 pr-3 font-medium text-ink">{d.day}</td><td className="px-2">{fmtNum(d.stars)}</td><td className="px-2">{usd(d.stars * starUsd)}</td><td className="px-2">{ton(d.ton)}</td><td className="px-2">{fmtNum(d.count)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

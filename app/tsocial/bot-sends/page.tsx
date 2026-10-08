import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { tablesMissing } from "@/lib/tsocial";
import { groupSends, reconstructDeliveries, type Bubble, type SendRow, type UnlockRow } from "@/lib/tsocial-sends";
import TSocialTabs from "../TSocialTabs";

export const dynamic = "force-dynamic";

const MAX_THREADS = 200;
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });

function Media({ media }: { media: Bubble["media"] }) {
  const photos = media.filter((m) => m.type === "photo").length, videos = media.length - photos;
  return (
    <div className="mt-1 grid max-w-[240px] grid-cols-3 gap-1">
      {media.slice(0, 9).map((m, i) => (
        <div key={i} className="flex aspect-square items-center justify-center rounded-md bg-white/10 text-[10px] text-white/70">{m.type === "video" ? "Video" : "Photo"}</div>
      ))}
      <div className="col-span-3 text-[11px] text-white/60">{photos ? `${photos} photo${photos === 1 ? "" : "s"}` : ""}{photos && videos ? ", " : ""}{videos ? `${videos} video${videos === 1 ? "" : "s"}` : ""}{media.length > 9 ? ` (first 9 shown)` : ""}</div>
    </div>
  );
}

export default async function TSocialBotSendsPage({ searchParams }: { searchParams: Promise<{ u?: string }> }) {
  if ((await getDashboardAccess()) !== null) notFound();
  const { u } = await searchParams;

  const sendsRes = await supabaseAdmin.from("tsocial_bot_sends").select("id,at,tg_user_id,method,text,media,ok,error").order("id", { ascending: false }).limit(5000);
  const logMissing = !!sendsRes.error && tablesMissing(sendsRes.error);
  const real = ((sendsRes.error ? [] : sendsRes.data) ?? []) as SendRow[];

  const unlockRes = await supabaseAdmin.from("tsocial_unlocks").select("post_id,tg_user_id,delivered_at").not("delivered_at", "is", null).order("delivered_at", { ascending: false }).limit(2000);
  const unlocks = (unlockRes.data ?? []) as UnlockRow[];
  const postIds = [...new Set(unlocks.map((x) => x.post_id))];
  const items = new Map<string, { type: string }[]>();
  for (const c of chunks(postIds, 50)) {
    const { data } = await supabaseAdmin.from("tsocial_vip_items").select("post_id,type").in("post_id", c).limit(5000);
    for (const r of (data ?? []) as { post_id: string; type: string }[]) (items.get(r.post_id) ?? items.set(r.post_id, []).get(r.post_id)!).push({ type: r.type });
  }
  const threads = groupSends(real, reconstructDeliveries(unlocks, items, real)).slice(0, MAX_THREADS);

  const ids = threads.map((t) => t.tg);
  const names = new Map<number, string>();
  for (const c of chunks(ids, 200)) {
    const [fans, accs] = await Promise.all([
      supabaseAdmin.from("users").select("telegram_id,name,username").in("telegram_id", c),
      supabaseAdmin.from("tsocial_accounts").select("tg_user_id,display_name,username").in("tg_user_id", c),
    ]);
    for (const f of (fans.data ?? []) as { telegram_id: number; name: string | null; username: string | null }[]) if (!names.has(f.telegram_id) && (f.name || f.username)) names.set(f.telegram_id, f.name || `@${f.username}`);
    for (const a of (accs.data ?? []) as { tg_user_id: number; display_name: string | null; username: string | null }[]) if (a.display_name || a.username) names.set(a.tg_user_id, a.display_name || `@${a.username}`);
  }
  const nameOf = (tg: number) => names.get(tg) ?? `User ${tg}`;
  const sel = threads.find((t) => String(t.tg) === u) ?? threads[0];
  const realCount = real.length;

  return (
    <main className="dashboard-page flex flex-col gap-4">
      <TSocialTabs active="bot-sends" />
      <p className="flex items-center gap-1 text-sm text-ink">
        Messages @TSocialAppBot sent to fans, shown the way a fan sees them in Telegram.
        <Info text="Logged by the T-Social server on every private send (table tsocial_bot_sends). Media is shown as tiles with the type and count, file ids are never stored. Rows marked reconstructed are the VIP delivery rebuilt from unlock records, for sends made before logging existed." />
      </p>
      {logMissing && <Card><CardContent><p className="text-sm text-ink">The log table does not exist yet, so only reconstructed VIP deliveries are shown. Apply <code>db/2026-10-08-tsocial-bot-sends.sql</code> in the twin-reels repo, then deploy the T-Social server.</p></CardContent></Card>}
      {!logMissing && realCount === 0 && <Card><CardContent><p className="text-sm text-ink">0 logged sends so far. The log table exists but the T-Social server that writes it is not deployed yet, so only reconstructed VIP deliveries are shown.</p></CardContent></Card>}

      {threads.length === 0 ? <Card><CardContent><p className="text-sm text-ink">Nothing sent yet.</p></CardContent></Card> : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <Card>
            <CardContent>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Fans ({threads.length})</h2>
              <div className="flex max-h-[70vh] flex-col divide-y divide-line overflow-y-auto">
                {threads.map((t) => (
                  <Link key={t.tg} href={`/tsocial/bot-sends?u=${t.tg}`} aria-current={t.tg === sel?.tg ? "page" : undefined} className={"flex flex-col gap-0.5 px-2 py-2 text-sm " + (t.tg === sel?.tg ? "bg-accent/10" : "hover:bg-panel")}>
                    <span className="truncate font-medium text-ink">{nameOf(t.tg)}</span>
                    <span className="text-xs text-muted">{t.count} message{t.count === 1 ? "" : "s"}{t.failed ? `, ${t.failed} failed` : ""} · {when(t.last)}</span>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {sel && (
            <div className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-[28px] border border-line bg-[#0e1621] text-white shadow-lg">
              <div className="flex items-center gap-3 border-b border-white/10 bg-[#17212b] px-4 py-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-[#2ea6ff] text-sm font-bold">T</div>
                <div className="min-w-0"><div className="text-sm font-semibold">T-Social</div><div className="text-[11px] text-white/60">bot, chat with {nameOf(sel.tg)}</div></div>
              </div>
              <div className="flex max-h-[65vh] min-h-[320px] flex-col gap-2 overflow-y-auto px-3 py-4">
                {sel.bubbles.map((b) => (
                  <div key={b.key} className={"max-w-[85%] self-start rounded-2xl rounded-bl-md px-3 py-2 text-sm " + (b.ok ? "bg-[#182533]" : "bg-red-900/50")}>
                    {b.text && <p className="whitespace-pre-wrap break-words">{b.text}</p>}
                    {b.media.length > 0 && <Media media={b.media} />}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-white/50">
                      <span>{when(b.at)}</span>
                      {b.reconstructed && <span className="italic">reconstructed from unlock record</span>}
                      {!b.ok && <span className="text-red-300">failed to send{b.error ? `: ${b.error}` : ""}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

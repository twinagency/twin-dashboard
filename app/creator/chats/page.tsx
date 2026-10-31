import { notFound } from "next/navigation";
import { requireCreatorWorkspace } from "@/lib/creator-dashboard";
import { creatorChatsClone } from "@/lib/creator-chats-policy";
import { loadChatFans, loadChatThread } from "@/lib/creator-chats";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export const dynamic = "force-dynamic";

const time = (at: string | null) => at ? new Date(at).toLocaleString("en-AU", { timeZone: "Australia/Brisbane", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "";
const fanLabel = (f: { name: string | null; username: string | null; telegramId: string }) => f.name || (f.username ? `@${f.username}` : `Fan ${f.telegramId}`);

export default async function CreatorChatsPage({ searchParams }: { searchParams: Promise<{ fan?: string; q?: string; before?: string }> }) {
  const creator = await requireCreatorWorkspace();
  if (!creatorChatsClone(creator.accountId)) notFound();
  const params = await searchParams;
  const search = (params.q || "").slice(0, 100);
  const fanId = /^-?\d{1,16}$/.test(params.fan || "") ? params.fan! : null;
  const before = params.before && params.before.length <= 700 ? params.before : null;
  const [{ fans, v2Unavailable }, thread] = await Promise.all([
    loadChatFans(creator, search),
    fanId ? loadChatThread(creator, fanId, before) : Promise.resolve(null),
  ]);
  const shown = fans.slice(0, 300);
  const active = fanId ? fans.find(f => f.telegramId === fanId) ?? { telegramId: fanId, name: null, username: null, lastAt: null, messages: null, stars: 0 } : null;
  const link = (extra: Record<string, string>) => `/creator/chats?${new URLSearchParams({ ...(search ? { q: search } : {}), ...extra }).toString()}`;
  return <div className="grid min-w-0 gap-5 text-ink">
    <div><h1 className="text-2xl font-semibold">Chats</h1><p className="mt-1 text-sm text-muted">Every fan conversation with your AI. Read only.</p></div>
    {(v2Unavailable || thread?.v2Unavailable) && <p className="rounded-lg border border-warn/30 bg-warn/10 px-4 py-2 text-sm text-warn">Latest messages are temporarily unavailable. Older messages are still shown. Refresh in a minute.</p>}
    <div className="grid min-w-0 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <Card className="flex max-h-[75vh] min-w-0 flex-col p-0">
        <form action="/creator/chats" method="get" className="flex gap-2 border-b border-line p-3">
          <input name="q" defaultValue={search} maxLength={100} placeholder="Search fans" className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink" />
          <Button type="submit">Search</Button>
        </form>
        <p className="border-b border-line px-4 py-2 text-xs text-muted">{fans.length.toLocaleString()} fans{fans.length > shown.length ? `, latest ${shown.length} shown. Search to find others.` : ""}</p>
        <ul className="flex-1 divide-y divide-line overflow-y-auto">
          {shown.map(f => <li key={f.telegramId}><a href={link({ fan: f.telegramId })} className={`block px-4 py-3 hover:bg-elev ${f.telegramId === fanId ? "bg-elev" : ""}`}>
            <div className="flex items-baseline justify-between gap-2"><span className="truncate text-sm font-medium">{fanLabel(f)}</span><span className="shrink-0 text-xs text-muted">{time(f.lastAt)}</span></div>
            <div className="mt-0.5 text-xs text-muted">{f.username && f.name ? `@${f.username} · ` : ""}{f.stars ? `${f.stars.toLocaleString()} stars spent` : "No purchases yet"}</div>
          </a></li>)}
          {!shown.length && <li className="p-8 text-center text-sm text-muted">No fans match.</li>}
        </ul>
      </Card>
      <Card className="flex max-h-[75vh] min-w-0 flex-col p-0">
        {!active || !thread ? <div className="p-10 text-center text-sm text-muted">Pick a fan to read the chat.</div> : <>
          <div className="border-b border-line px-5 py-3"><h2 className="font-semibold">{fanLabel(active)}</h2><p className="text-xs text-muted">{active.username ? `@${active.username} · ` : ""}{active.stars ? `${active.stars.toLocaleString()} stars spent` : "No purchases yet"}</p></div>
          <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
            {thread.older && <div className="text-center"><a href={link({ fan: active.telegramId, before: thread.older })} className="rounded-lg border border-line px-3 py-1.5 text-xs">Load older messages</a></div>}
            {thread.messages.map(m => <div key={m.id} className={`flex ${m.role === "fan" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${m.role === "fan" ? "bg-elev" : "bg-sky-500/15"}`}>
                <div className="whitespace-pre-wrap break-words">{m.content}</div>
                <div className="mt-1 text-[10px] text-muted">{m.role === "fan" ? "Fan" : "Your AI"} · {time(m.at)}</div>
              </div>
            </div>)}
            {!thread.messages.length && <p className="p-8 text-center text-sm text-muted">No saved messages for this fan.</p>}
          </div>
          {before && <div className="border-t border-line px-5 py-2 text-right"><a href={link({ fan: active.telegramId })} className="text-xs text-muted underline">Back to latest</a></div>}
        </>}
      </Card>
    </div>
    <p className="text-xs text-muted">Times shown in Brisbane time.</p>
  </div>;
}

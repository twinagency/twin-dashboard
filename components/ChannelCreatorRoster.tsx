"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import CreatorAvatar from "./CreatorAvatar";
import { Card } from "./ui/card";
import { setCloneScope } from "@/app/actions/clone-scope";
import { mergeChannelCreators, type ChannelRoster } from "@/lib/channel-workspace/model";
import { telegramWorkspaceHref } from "@/lib/channel-nav";
export default function ChannelCreatorRoster({ roster, channel }: { roster: ChannelRoster; channel: "all" | "telegram" }) {
  const [query, setQuery] = useState(""), [filter, setFilter] = useState("all"), [error, setError] = useState("");
  const [pending, startTransition] = useTransition(), router = useRouter();
  const creators = useMemo(() => mergeChannelCreators(roster), [roster]);
  const visible = creators.filter(creator => (!query.trim() || [creator.name, creator.telegram?.handle, ...creator.onlyfans.map(account => account.handle)].some(value => value?.toLowerCase().includes(query.trim().toLowerCase()))) && (filter === "all" || filter === "telegram" && creator.telegram || filter === "onlyfans" && creator.onlyfans.length));
  const openTelegram = (id: string, path: string) => startTransition(async () => {
    setError("");
    try { await setCloneScope(id); router.push(telegramWorkspaceHref(path)); router.refresh(); }
    catch { setError("Could not open this creator. Please try again."); }
  });
  return <section className="space-y-5" data-channel-roster={channel}>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-tight">{channel === "telegram" ? "Telegram" : "All channels"}</h1><p className="mt-2 text-sm text-muted">{channel === "telegram" ? "Your Telegram creators, conversations and content." : "Your creators across Telegram and OnlyFans, together."}</p></div><Link className="rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold" href={channel === "telegram" ? "/clones/new?workspace=telegram" : "/onlyfans/accounts"}>{channel === "telegram" ? "Add Telegram creator" : "Connect OnlyFans"}</Link></div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Card className="p-4"><p className="text-xs text-muted">{channel === "telegram" ? "Telegram creators" : "Creators across channels"}</p><p className="mt-2 text-2xl font-semibold" data-roster-total>{roster.telegram.status === "unavailable" || channel === "all" && roster.onlyfans.status === "unavailable" ? `${creators.length} loaded` : creators.length}</p></Card>
      <Card className="p-4"><p className="text-xs text-muted">Telegram</p><p className="mt-2 text-2xl font-semibold" data-roster-telegram-count>{roster.telegram.status === "ready" ? roster.telegram.items.length : "Unavailable"}</p></Card>
      {channel === "all" ? <Card className="p-4"><p className="text-xs text-muted">OnlyFans accounts</p><p className="mt-2 text-2xl font-semibold" data-roster-onlyfans-count>{roster.onlyfans.status === "ready" ? roster.onlyfans.items.length : "Unavailable"}</p></Card> : <Card className="p-4"><p className="text-xs text-muted">Marked active</p><p className="mt-2 text-2xl font-semibold">{roster.telegram.status === "ready" ? roster.telegram.items.filter(creator => creator.status === "active").length : "Unavailable"}</p></Card>}
    </div>
    {[roster.telegram, roster.onlyfans].filter(source => source.status === "unavailable").map((source, index) => <p key={index} role="alert" className="rounded-xl border border-warn/30 bg-warn/5 p-4 text-sm">{source.error}</p>)}
    {channel === "all" && roster.onlyfans.status === "ready" && roster.onlyfans.items.length === 0 ? <p className="text-sm text-muted" data-roster-onlyfans-empty>No OnlyFans accounts connected yet. <Link href="/onlyfans/accounts" className="font-semibold text-accent">Connect an account</Link></p> : null}
    <div className="flex flex-wrap gap-3"><input aria-label="Search channel creators" className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-2 text-sm sm:max-w-sm" placeholder="Search creators or handles…" value={query} onChange={event => setQuery(event.target.value)} />{channel === "all" ? <select aria-label="Filter creator channel" className="rounded-lg border border-line bg-panel px-3 py-2 text-sm" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All channels</option><option value="telegram">Telegram</option><option value="onlyfans">OnlyFans</option></select> : null}</div>
    {error ? <p role="alert" className="text-sm text-crit">{error}</p> : null}
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map(creator => <Card key={creator.id} className="min-w-0 space-y-4 p-5" data-roster-creator={creator.id}>
      <div className="flex min-w-0 items-center gap-3"><CreatorAvatar name={creator.name} photoUrl={creator.photoUrl} className="h-12 w-12 shrink-0" /><div className="min-w-0"><h2 className="creator-name truncate font-semibold">{creator.name}</h2><div className="mt-1 flex flex-wrap gap-2 text-xs text-muted">{creator.telegram ? <span data-creator-channel="telegram">Telegram · {creator.telegram.status}</span> : null}{creator.onlyfans.length ? <span data-creator-channel="onlyfans">OnlyFans · {creator.onlyfans.length} account{creator.onlyfans.length === 1 ? "" : "s"}</span> : null}</div></div></div>
      {creator.telegram ? <div className="space-y-3"><p className="truncate text-xs text-muted">{creator.telegram.handle ? `@${creator.telegram.handle.replace(/^@/, "")}` : "Telegram clone configured"}</p><div className="flex flex-wrap gap-2">{[["Messages", "/users"], ["Content", "/media"], ["Flows", "/flows"]].map(([label, path]) => <button key={path} disabled={pending} onClick={() => openTelegram(creator.id, path)} className="rounded-lg border border-line px-3 py-2 text-xs font-semibold text-accent disabled:opacity-50" data-open-telegram={path}>{label}</button>)}<Link href={telegramWorkspaceHref(`/clones/${creator.id}`)} className="rounded-lg px-2 py-2 text-xs text-muted">Settings</Link></div></div> : null}
      {channel === "all" && !creator.onlyfans.length ? <div className="compact-channel-unavailable" aria-disabled="true" data-onlyfans-disconnected><strong>OnlyFans</strong><span>{roster.onlyfans.status === "ready" ? "Not connected" : "Connection unavailable"}</span></div> : null}
      {creator.onlyfans.map(account => <div key={account.id} className="border-t border-line pt-3" data-roster-account={account.id}><p className="truncate text-sm">@{account.handle.replace(/^@/, "")}</p><p className="mt-1 text-xs text-muted">{account.health.replaceAll("_", " ")}</p><div className="mt-3 flex gap-4 text-xs font-semibold text-accent"><Link href={`/onlyfans/inbox?creator=${encodeURIComponent(creator.id)}&account=${encodeURIComponent(account.id)}`}>Inbox</Link><Link href={`/onlyfans/content?creator=${encodeURIComponent(creator.id)}&account=${encodeURIComponent(account.id)}`}>Content</Link><Link href={`/onlyfans/accounts?creator=${encodeURIComponent(creator.id)}&account=${encodeURIComponent(account.id)}`}>Account</Link></div></div>)}
    </Card>)}</div>
    {visible.length === 0 && creators.length > 0 ? <p className="py-8 text-sm text-muted">No creators match this search.</p> : null}
    {creators.length === 0 && roster.telegram.status === "ready" && (channel === "telegram" || roster.onlyfans.status === "ready") ? <p className="py-8 text-sm text-muted">No {channel === "telegram" ? "Telegram creators configured" : "channel accounts connected"} yet.</p> : null}
  </section>;
}

"use client";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import StarAmount from "@/components/StarAmount";
export type CreatorPpv = { id: string; type: "photo" | "video" | "bundle"; name: string; caption: string; stars: number; path: string | null; items: string[] };
function Media({ path, video = false, full = false }: { path: string | null; video?: boolean; full?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setUrl(null); setFailed(false);
    if (!path) return;
    const ctrl = new AbortController();
    fetch(`/api/media-sign?path=${encodeURIComponent(path)}`, { signal: ctrl.signal, cache: "no-store" })
      .then(async r => { if (!r.ok) throw new Error(); return r.json(); })
      .then(data => setUrl(data.url || null)).catch(e => { if (e.name !== "AbortError") setFailed(true); });
    return () => ctrl.abort();
  }, [path]);
  const cls = full ? "max-h-[60vh] w-full rounded-xl object-contain" : "aspect-[4/3] w-full rounded-t-xl object-cover";
  if (!url) return <div className={`${cls} grid place-items-center bg-elev text-sm text-muted`}>{failed ? "Preview unavailable" : path ? "Loading preview…" : "No preview"}</div>;
  return video ? <video src={url} controls={full} muted={!full} playsInline preload="metadata" className={cls} /> : <img src={url} alt="Creator media" className={cls} loading="lazy" />;
}
export default function CreatorPpvLibrary({ items }: { items: CreatorPpv[] }) {
  const [type, setType] = useState("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CreatorPpv | null>(null);
  const rows = items.filter(item => (type === "all" || item.type === type) && `${item.name} ${item.caption}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="dashboard-page text-ink"><h1 className="mb-1 text-2xl font-semibold">Pay-per-view library</h1><p className="mb-5 text-sm text-muted">Your photos, videos and bundles.</p>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><div className="flex gap-1 rounded-full bg-elev p-1">{[["all", "All"], ["photo", "Photos"], ["video", "Videos"], ["bundle", "Bundles"]].map(([key, label]) => <button key={key} type="button" onClick={() => setType(key)} aria-pressed={type === key} className={`rounded-full px-4 py-2 text-sm font-medium ${type === key ? "bg-accent text-white shadow-sm" : "text-muted"}`}>{label}</button>)}</div><Input aria-label="Search PPVs" placeholder="Search content" value={query} onChange={e => setQuery(e.target.value)} className="max-w-xs bg-panel" /></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{rows.map(item => <button type="button" key={`${item.type}-${item.id}`} onClick={() => setSelected(item)} className="overflow-hidden rounded-xl border border-line bg-panel text-left shadow-sm transition hover:shadow-md"><Media path={item.path} video={item.type === "video"} /><div className="p-4"><div className="mb-2 flex items-center justify-between gap-2"><span className="text-xs font-medium capitalize text-muted">{item.type}</span><StarAmount stars={item.stars} /></div><h2 className="truncate text-sm font-semibold">{item.name}</h2><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{item.caption || "No caption"}</p></div></button>)}</div>
    {!rows.length && <div className="rounded-xl border border-line bg-panel px-5 py-12 text-center text-sm text-muted">{items.length ? "No content matches this search." : "No PPV content has been connected to your clone yet."}</div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.name || "Content preview"}</DialogTitle></DialogHeader>{selected && <><Media path={selected.path} video={selected.type === "video"} full /><div className="flex items-center justify-between"><span className="text-sm capitalize text-muted">{selected.type}</span><StarAmount stars={selected.stars} /></div><p className="whitespace-pre-wrap text-sm">{selected.caption}</p>{selected.type === "bundle" && selected.items.slice(1).map(path => <Media key={path} path={path} full />)}</>}</DialogContent></Dialog>
  </div>;
}

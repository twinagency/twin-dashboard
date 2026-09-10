"use client";
import { useEffect, useMemo, useState } from "react";
import { Image as ImageIcon, Film, Layers, Search } from "lucide-react";
import StarAmount from "./StarAmount";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

export type CreatorMediaItem = { id: string; kind: "photo" | "video" | "bundle"; name: string; caption: string | null; teaser: string | null; stars: number; paths: string[]; createdAt: string };
function Preview({ path, video, expanded = false }: { path?: string; video: boolean; expanded?: boolean }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    setUrl(null); setFailed(false);
    if (path) fetch(`/api/media-sign?path=${encodeURIComponent(path)}`, { signal: controller.signal, cache: "no-store" }).then(async response => {
      if (!response.ok) throw new Error("Unavailable");
      const data = await response.json();
      if (!data.url) throw new Error("Unavailable");
      setUrl(data.url);
    }).catch(error => { if (error.name !== "AbortError") setFailed(true); });
    return () => controller.abort();
  }, [path]);
  const classes = expanded ? "max-h-[60vh] w-full rounded-lg object-contain" : "aspect-square w-full object-cover transition group-hover:scale-[1.02]";
  if (!url) return <div className="grid aspect-square w-full place-items-center bg-elev text-sm text-muted">{failed ? "Preview unavailable" : path ? "Loading preview…" : "No preview"}</div>;
  return video ? <video src={url} className={classes} controls={expanded} muted={!expanded} playsInline preload="metadata" onError={() => setFailed(true)} /> : <img src={url} alt="Creator content preview" loading="lazy" className={classes} onError={() => { setUrl(null); setFailed(true); }} />;
}
export default function CreatorMediaLibrary({ items }: { items: CreatorMediaItem[] }) {
  const [tab, setTab] = useState<CreatorMediaItem["kind"]>("photo");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<CreatorMediaItem | null>(null);
  const [index, setIndex] = useState(0);
  const filtered = useMemo(() => items.filter(item => item.kind === tab && `${item.name} ${item.caption || ""} ${item.teaser || ""}`.toLowerCase().includes(search.toLowerCase())), [items, tab, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / 24));
  const currentPage = Math.min(page, totalPages - 1);
  return <div className="grid min-w-0 gap-5 text-ink">
    <div><h1 className="text-2xl font-semibold">PPVs</h1><p className="mt-1 text-sm text-muted">Your photos, videos and bundles. Open an item to review its media, caption and price.</p></div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Media type" className="flex rounded-xl border border-line bg-panel p-1">{([{ key: "photo", label: "Photos", Icon: ImageIcon }, { key: "video", label: "Videos", Icon: Film }, { key: "bundle", label: "Bundles", Icon: Layers }] as const).map(({key,label,Icon}) => <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => { setTab(key); setPage(0); }} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${tab === key ? "bg-accent text-white" : "text-muted hover:bg-elev"}`}><Icon className="h-4 w-4" />{label}<span className="text-xs opacity-75">{items.filter(item => item.kind === key).length}</span></button>)}</div>
      <label className="flex min-w-0 items-center gap-2 rounded-lg border border-line bg-panel px-3"><Search className="h-4 w-4 text-muted" /><input value={search} onChange={event => { setSearch(event.target.value); setPage(0); }} aria-label="Search your media" placeholder="Search your media" className="w-full bg-transparent py-2 text-sm outline-none" /></label>
    </div>
    {filtered.length ? <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">{filtered.slice(currentPage * 24, currentPage * 24 + 24).map(item => <Card key={item.id} className="overflow-hidden p-0"><button type="button" className="group block w-full text-left" onClick={() => { setSelected(item); setIndex(0); }} aria-label={`View ${item.name}`}><div className="overflow-hidden bg-elev"><Preview path={item.paths[0]} video={item.kind === "video"} /></div><div className="grid gap-2 p-4"><div className="flex items-start justify-between gap-2"><span className="min-w-0 truncate text-sm font-semibold">{item.name}</span><span className="shrink-0 text-xs font-semibold text-good">{item.stars > 0 ? <StarAmount stars={item.stars} /> : "Free"}</span></div>{item.kind === "bundle" && <p className="text-xs text-muted">{item.paths.length} items</p>}<p className="line-clamp-2 text-xs leading-5 text-muted">{item.teaser || item.caption || "No caption"}</p><span className="text-xs font-medium text-accent">View media</span></div></button></Card>)}</div> : <Card className="p-10 text-center text-sm text-muted">{search ? "No media matches your search." : "No media in this category yet."}</Card>}
    {totalPages > 1 && <div className="flex items-center justify-center gap-4"><Button variant="outline" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button><span className="text-sm text-muted">{currentPage + 1} / {totalPages}</span><Button variant="outline" disabled={currentPage + 1 >= totalPages} onClick={() => setPage(currentPage + 1)}>Next</Button></div>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>{selected?.name || "Media preview"}</DialogTitle></DialogHeader>{selected && <div className="grid gap-4"><Preview path={selected.paths[index]} video={selected.kind === "video"} expanded />{selected.paths.length > 1 && <div className="flex items-center justify-between"><Button variant="outline" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous item</Button><span className="text-sm">{index + 1} / {selected.paths.length}</span><Button variant="outline" disabled={index === selected.paths.length - 1} onClick={() => setIndex(index + 1)}>Next item</Button></div>}<div className="text-sm font-semibold text-good"><StarAmount stars={selected.stars} /></div><div><h3 className="text-sm font-semibold">Caption</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{selected.caption || "No caption"}</p></div>{selected.teaser && <div><h3 className="text-sm font-semibold">Teaser shown to fans</h3><p className="mt-1 whitespace-pre-wrap text-sm text-muted">{selected.teaser}</p></div>}</div>}</DialogContent></Dialog>
  </div>;
}

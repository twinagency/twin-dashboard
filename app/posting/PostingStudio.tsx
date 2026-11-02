"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { inputCls, selectCls } from "@/components/clone/fields";
import { loadCatalogue, loadRecent, loadTargets, publish, removePost, type DestinationResult } from "./actions";
import type { BrandTarget, CatalogueItem, ChannelTarget, RecentPost, StoryTarget, Targets } from "@/lib/posting";

type Clone = { id: string; slug: string; name: string };
type Kind = "photo" | "video" | "upload";
type BtnRow = { text: string; url: string };

const TSOCIAL_OPEN = "https://t.me/TSocialAppBot?startapp";
const TSOCIAL_CAPTION = "new on my T-Social 💕\nmy clips, my threads, and me. tap below to open it 👇";

const PERIODS = [
  { v: "6", l: "6 hours" },
  { v: "12", l: "12 hours" },
  { v: "24", l: "24 hours" },
  { v: "48", l: "48 hours" },
];

function when(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function Pill({ on, children, title }: { on: boolean; children: React.ReactNode; title?: string }) {
  return (
    <span
      title={title}
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
        (on ? "bg-emerald-500/15 text-emerald-600" : "bg-black/5 text-muted line-through decoration-1")
      }
    >
      {children}
    </span>
  );
}

export default function PostingStudio({ clones }: { clones: Clone[] }) {
  const [targets, setTargets] = useState<Targets | null>(null);
  const [targetsErr, setTargetsErr] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [cloneId, setCloneId] = useState<string | null>(null);

  const refreshTargets = useCallback(async (fresh: boolean) => {
    setChecking(true);
    const r = await loadTargets(fresh);
    setChecking(false);
    if (r.ok) {
      setTargets(r.data);
      setTargetsErr(null);
    } else setTargetsErr(r.error);
  }, []);
  useEffect(() => {
    void refreshTargets(false);
  }, [refreshTargets]);

  const bySlug = useMemo(() => new Map(clones.map((c) => [c.slug, c])), [clones]);
  const storyFor = useCallback(
    (slug: string): StoryTarget | null =>
      targets ? [...targets.stories.available, ...targets.stories.unavailable].find((s) => s.clone === slug) ?? null : null,
    [targets],
  );
  const channelFor = useCallback(
    (slug: string): ChannelTarget | null =>
      targets ? [...targets.channels.available, ...targets.channels.unavailable].find((s) => s.clone === slug) ?? null : null,
    [targets],
  );

  // Girls who can take at least one kind of post first, then the rest.
  const ordered = useMemo(() => {
    const score = (c: Clone) => (storyFor(c.slug)?.available ? 1 : 0) + (channelFor(c.slug)?.available ? 2 : 0);
    return [...clones].sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  }, [clones, storyFor, channelFor]);

  const selected = clones.find((c) => c.id === cloneId) ?? null;

  return (
    <div className="text-ink">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Posting</h1>
          <p className="text-sm text-muted">Stories and channel posts from her content, through her own bot.</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted">
          {targets && <span>Checked {when(targets.checkedAt)}</span>}
          <Button size="sm" variant="outline" disabled={checking} onClick={() => refreshTargets(true)}>
            {checking ? "Checking…" : "Recheck Telegram"}
          </Button>
        </div>
      </div>

      {targetsErr && <div className="mb-3 rounded-xl bg-red-500/10 p-3 text-sm text-red-600">{targetsErr}</div>}

      <Card className="mb-4 p-3">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Girl</div>
        {!targets && !targetsErr && <div className="text-sm text-muted">Checking what each bot can post…</div>}
        <div className="flex flex-wrap gap-2">
          {targets &&
            ordered.map((c) => {
              const s = storyFor(c.slug);
              const ch = channelFor(c.slug);
              const active = c.id === cloneId;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCloneId(c.id)}
                  className={
                    "flex flex-col items-start gap-1 rounded-xl border px-3 py-2 text-left transition " +
                    (active ? "border-accent-2 ring-2 ring-accent-2/30" : "border-line hover:border-accent-2/60")
                  }
                >
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="flex gap-1">
                    <Pill on={Boolean(s?.available)} title={s?.reason ?? "Story ready"}>Story</Pill>
                    <Pill on={Boolean(ch?.available)} title={ch?.reason ?? `Channel ${ch?.channel ?? ""} ready`}>
                      {ch?.channel ?? "Channel"}
                    </Pill>
                  </span>
                </button>
              );
            })}
        </div>
      </Card>

      {selected && (
        <Composer
          key={selected.id}
          clone={selected}
          story={storyFor(selected.slug)}
          channel={channelFor(selected.slug)}
          brands={targets?.brands ?? []}
        />
      )}

      <RecentPanel cloneId={selected?.id ?? null} bySlug={bySlug} />
    </div>
  );
}

function Composer({
  clone,
  story,
  channel,
  brands,
}: {
  clone: Clone;
  story: StoryTarget | null;
  channel: ChannelTarget | null;
  brands: BrandTarget[];
}) {
  const [kind, setKind] = useState<Kind>("photo");
  const [q, setQ] = useState("");
  const [items, setItems] = useState<CatalogueItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<CatalogueItem | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);

  const [toStory, setToStory] = useState(Boolean(story?.available));
  const [toChannel, setToChannel] = useState(false);
  const [toBrands, setToBrands] = useState<string[]>([]);
  const anyChannel = toChannel || toBrands.length > 0;
  const anyDest = toStory || anyChannel;
  const [caption, setCaption] = useState("");
  const [channelText, setChannelText] = useState("");
  const [period, setPeriod] = useState("24");
  const [linkUrl, setLinkUrl] = useState("");
  const [buttons, setButtons] = useState<BtnRow[]>([]);
  const [pin, setPin] = useState(false);
  const [starPrice, setStarPrice] = useState("");
  const [silent, setSilent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<DestinationResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (offset: number) => {
      if (kind === "upload") return;
      setLoading(true);
      const r = await loadCatalogue(clone.id, kind, q, offset);
      setLoading(false);
      if (!r.ok) return setError(r.error);
      setItems((prev) => (offset === 0 ? r.data.items : [...prev, ...r.data.items]));
      setTotal(r.data.total);
    },
    [clone.id, kind, q],
  );
  useEffect(() => {
    const t = setTimeout(() => void fetchPage(0), q ? 300 : 0);
    return () => clearTimeout(t);
  }, [fetchPage, q]);

  useEffect(() => {
    if (!files[0]) return setUploadPreview(null);
    const u = URL.createObjectURL(files[0]);
    setUploadPreview(u);
    return () => URL.revokeObjectURL(u);
  }, [files]);

  const mediaCount = kind === "upload" ? files.length : picked ? 1 : 0;
  const profileLink = `https://t.me/TSocialAppBot?startapp=c_${clone.slug}`;

  // One tap: caption, channel text, "Open T-Social" button and her profile as
  // the story link. Whatever picture is picked stays as is.
  function applyTsocialTemplate() {
    setCaption(TSOCIAL_CAPTION);
    setChannelText(TSOCIAL_CAPTION);
    setLinkUrl(profileLink);
    setButtons([{ text: "Open T-Social 💕", url: TSOCIAL_OPEN }]);
  }

  async function send(dryRun: boolean) {
    setError(null);
    setResults(null);
    const where = [
      toStory && `${clone.name}'s story`,
      toChannel && (channel?.channel ?? "her channel"),
      ...brands.filter((b) => toBrands.includes(b.key)).map((b) => b.channel),
    ]
      .filter(Boolean)
      .join(", ");
    if (!dryRun && !window.confirm(`Post to ${where} now? This is live.`)) return;
    const fd = new FormData();
    fd.set("cloneId", clone.id);
    fd.set("toStory", String(toStory));
    fd.set("toChannel", String(toChannel));
    toBrands.forEach((b) => fd.append("toBrand", b));
    fd.set("dryRun", String(dryRun));
    if (kind === "upload") files.forEach((f) => fd.append("file", f));
    else if (picked) {
      fd.set("itemKind", picked.kind);
      fd.set("itemId", picked.id);
    }
    fd.set("caption", caption);
    fd.set("channelText", channelText);
    fd.set("activePeriod", period);
    fd.set("linkUrl", linkUrl);
    const rows = buttons.filter((b) => b.text.trim() || b.url.trim());
    if (rows.length) fd.set("buttons", JSON.stringify(rows));
    fd.set("pin", String(pin));
    fd.set("starPrice", starPrice);
    fd.set("silent", String(silent));
    setBusy(true);
    const r = await publish(fd);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    setResults(r.data);
  }

  const preview = kind === "upload" ? uploadPreview : picked?.url ?? null;
  const previewIsVideo = kind === "upload" ? files[0]?.type.startsWith("video/") : picked?.kind === "video";

  return (
    <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_380px]">
      <Card className="p-3">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(["photo", "video", "upload"] as Kind[]).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={kind === k ? "default" : "outline"}
              onClick={() => {
                setKind(k);
                setPicked(null);
                setItems([]);
              }}
            >
              {k === "photo" ? "Photos" : k === "video" ? "Videos" : "Upload"}
            </Button>
          ))}
          {kind !== "upload" && (
            <input className={inputCls + " max-w-xs"} placeholder="Search captions" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          {kind !== "upload" && <span className="text-xs text-muted">{total} in her bucket</span>}
        </div>

        {kind === "upload" ? (
          <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line p-6 text-sm text-muted">
            <span>{files.length ? `${files.length} file(s) ready` : "Choose photos or videos"}</span>
            <span className="text-xs">1 file for a story, up to 10 for a channel album</span>
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              className="hidden"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []).slice(0, 10))}
            />
          </label>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
              {items.map((it) => (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => setPicked(picked?.id === it.id ? null : it)}
                  title={[it.name, it.caption].filter(Boolean).join(" · ")}
                  className={
                    "relative aspect-[3/4] overflow-hidden rounded-lg bg-black/5 " +
                    (picked?.id === it.id ? "ring-3 ring-accent-2" : "hover:opacity-90")
                  }
                >
                  {it.url &&
                    (it.kind === "video" ? (
                      <video src={it.url} muted preload="metadata" className="h-full w-full object-cover" />
                    ) : (
                      <img src={it.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ))}
                  <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white">
                    {it.isFree ? "free" : it.starValue ? `${it.starValue}★` : ""}
                  </span>
                </button>
              ))}
            </div>
            {loading && <div className="mt-2 text-sm text-muted">Loading…</div>}
            {!loading && items.length === 0 && <div className="mt-2 text-sm text-muted">Nothing here.</div>}
            {!loading && items.length < total && (
              <Button className="mt-3" size="sm" variant="outline" onClick={() => fetchPage(items.length)}>
                Load more
              </Button>
            )}
          </>
        )}
      </Card>

      <Card className="flex flex-col gap-3 self-start p-3 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Post for {clone.name}</div>

        {preview ? (
          previewIsVideo ? (
            <video src={preview} controls className="max-h-72 w-full rounded-lg bg-black object-contain" />
          ) : (
            <img src={preview} alt="" className="max-h-72 w-full rounded-lg bg-black/5 object-contain" />
          )
        ) : (
          <div className="rounded-lg bg-black/5 p-4 text-center text-xs text-muted">No media picked (channel text post only)</div>
        )}
        <div className="rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-700">
          Stories and channels are public. Check the picture yourself, the nudity tags are often wrong.
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={toStory} disabled={!story?.available} onChange={(e) => setToStory(e.target.checked)} />
            Her story
            {!story?.available && <span className="text-xs text-muted">({story?.reason ?? "not available"})</span>}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={toChannel} disabled={!channel?.available} onChange={(e) => setToChannel(e.target.checked)} />
            Channel {channel?.channel ?? ""}
            {!channel?.available && <span className="text-xs text-muted">({channel?.reason ?? "not available"})</span>}
          </label>
          {brands.map((b) => (
            <label key={b.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={toBrands.includes(b.key)}
                disabled={!b.available}
                onChange={(e) => setToBrands(e.target.checked ? [...toBrands, b.key] : toBrands.filter((k) => k !== b.key))}
              />
              {b.label} {b.channel}
              {!b.available && <span className="text-xs text-muted">({b.reason ?? "not available"})</span>}
            </label>
          ))}
          {toBrands.includes("tsocial") && (
            <div className="text-[11px] text-amber-700">T-Social is sexy, not NSFW. Use a safe picture.</div>
          )}
        </div>

        <Button size="sm" variant="outline" className="self-start" onClick={applyTsocialTemplate}>
          T-Social promo template
        </Button>

        <textarea
          className={inputCls + " min-h-20"}
          placeholder="Caption"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
        />

        {toStory && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-2">
            <div className="text-xs font-semibold text-muted">Story</div>
            <select className={selectCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIODS.map((p) => (
                <option key={p.v} value={p.v}>
                  Up for {p.l}
                </option>
              ))}
            </select>
            <input className={inputCls} placeholder="Tap link (optional), https://t.me/..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
            <div className="flex flex-wrap gap-1">
              <Button size="xs" variant="outline" onClick={() => setLinkUrl(profileLink)}>
                Link to her T-Social profile
              </Button>
              <Button size="xs" variant="outline" onClick={() => setLinkUrl(TSOCIAL_OPEN)}>
                Link to open T-Social
              </Button>
              {linkUrl && (
                <Button size="xs" variant="outline" onClick={() => setLinkUrl("")}>
                  Clear
                </Button>
              )}
            </div>
          </div>
        )}

        {anyChannel && (
          <div className="flex flex-col gap-2 rounded-lg border border-line p-2">
            <div className="text-xs font-semibold text-muted">Channel post</div>
            <textarea
              className={inputCls + " min-h-16"}
              placeholder="Channel text (blank = same as caption)"
              value={channelText}
              onChange={(e) => setChannelText(e.target.value)}
            />
            {buttons.map((b, i) => (
              <div key={i} className="flex gap-1">
                <input
                  className={inputCls}
                  placeholder="Button text"
                  value={b.text}
                  onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                />
                <input
                  className={inputCls}
                  placeholder="https://t.me/..."
                  value={b.url}
                  onChange={(e) => setButtons(buttons.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                />
                <Button size="sm" variant="outline" onClick={() => setButtons(buttons.filter((_, j) => j !== i))}>
                  ✕
                </Button>
              </div>
            ))}
            {buttons.length < 8 && (
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" onClick={() => setButtons([...buttons, { text: "", url: "" }])}>
                  + Button
                </Button>
                <Button size="sm" variant="outline" onClick={() => setButtons([...buttons, { text: "Open T-Social 💕", url: TSOCIAL_OPEN }])}>
                  + Open T-Social
                </Button>
                <Button size="sm" variant="outline" onClick={() => setButtons([...buttons, { text: "See my T-Social 💕", url: profileLink }])}>
                  + Her T-Social profile
                </Button>
              </div>
            )}
            <input
              className={inputCls}
              inputMode="numeric"
              placeholder="Paid post price in Stars (blank = free post)"
              value={starPrice}
              onChange={(e) => setStarPrice(e.target.value.replace(/\D/g, ""))}
            />
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={pin} onChange={(e) => setPin(e.target.checked)} /> Pin
              </label>
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={silent} onChange={(e) => setSilent(e.target.checked)} /> Silent
              </label>
            </div>
            {mediaCount > 1 && buttons.length > 0 && !starPrice && (
              <div className="text-[11px] text-red-600">An album cannot have buttons. Pick one file or remove the buttons.</div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" disabled={busy || !anyDest} onClick={() => send(true)}>
            Check
          </Button>
          <Button disabled={busy || !anyDest} onClick={() => send(false)}>
            {busy ? "Working…" : "Post now"}
          </Button>
        </div>

        {error && <div className="rounded-lg bg-red-500/10 p-2 text-sm text-red-600">{error}</div>}
        {results?.map((r) => (
          <div key={r.destination} className={"rounded-lg p-2 text-sm " + (r.ok ? "bg-emerald-500/10" : "bg-red-500/10 text-red-600")}>
            <div className="font-medium">
              {r.destination === "story" ? "Story" : r.destination === "channel" ? channel?.channel ?? "Channel" : brands.find((b) => b.key === r.destination)?.channel ?? r.destination}: {r.ok ? (r.dryRun ? "ready to post" : "posted") : "failed"}
            </div>
            {r.error && <div>{r.error}</div>}
            {r.ok && !r.dryRun && typeof r.detail?.link === "string" && (
              <a className="text-xs underline" href={r.detail.link} target="_blank" rel="noreferrer">
                Open post
              </a>
            )}
            {r.warnings?.map((w) => (
              <div key={w} className="text-xs text-amber-700">
                {w}
              </div>
            ))}
          </div>
        ))}
      </Card>
    </div>
  );
}

function RecentPanel({ cloneId, bySlug }: { cloneId: string | null; bySlug: Map<string, Clone> }) {
  const [posts, setPosts] = useState<RecentPost[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    loadRecent(cloneId).then((r) => {
      if (!live) return;
      if (r.ok) setPosts(r.data);
      else setError(r.error);
    });
    return () => {
      live = false;
    };
  }, [cloneId, tick]);

  async function del(p: RecentPost) {
    const c = p.clone ? bySlug.get(p.clone) : null;
    if (!c && !p.brand) return;
    if (!window.confirm(`Delete this ${p.kind === "story" ? "story" : "channel post"} from Telegram?`)) return;
    const r = await removePost({ kind: p.kind, cloneId: c?.id ?? null, brand: p.brand, storyId: p.storyId, channel: p.channel, messageIds: p.messageIds });
    if (!r.ok) return window.alert(r.error);
    setTick((t) => t + 1);
  }

  const status = (p: RecentPost) =>
    p.deleted ? "deleted" : p.kind === "story" ? (p.live === null ? "story" : p.live ? "live" : "expired") : "posted";

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">Recent posts {cloneId ? "" : "(all girls)"}, last 30 days</div>
        <Button size="sm" variant="outline" onClick={() => setTick((t) => t + 1)}>
          Refresh
        </Button>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      {posts && posts.length === 0 && <div className="text-sm text-muted">Nothing posted yet.</div>}
      {posts && posts.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="py-1 pr-3">When</th>
                <th className="py-1 pr-3">Girl</th>
                <th className="py-1 pr-3">Where</th>
                <th className="py-1 pr-3">Text</th>
                <th className="py-1 pr-3">Status</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {posts.map((p, i) => (
                <tr key={i}>
                  <td className="py-1.5 pr-3 whitespace-nowrap">{when(p.at)}</td>
                  <td className="py-1.5 pr-3">{p.brand ? "T-Social" : (p.clone && bySlug.get(p.clone)?.name) ?? p.clone ?? "?"}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap">
                    {p.kind === "story" ? "Story" : p.channel ?? "Channel"}
                    {p.starPrice ? ` · ${p.starPrice}★` : ""}
                    {p.via === "dashboard" ? "" : " · API"}
                  </td>
                  <td className="max-w-xs truncate py-1.5 pr-3 text-muted" title={p.text ?? ""}>
                    {p.text ?? ""}
                  </td>
                  <td className="py-1.5 pr-3">
                    {p.link && p.kind === "channel_post" ? (
                      <a className="underline" href={p.link} target="_blank" rel="noreferrer">
                        {status(p)}
                      </a>
                    ) : (
                      status(p)
                    )}
                  </td>
                  <td className="py-1.5 text-right">
                    {!p.deleted && (p.storyId || p.messageIds?.length) && p.live !== false ? (
                      <Button size="xs" variant="outline" onClick={() => del(p)}>
                        Delete
                      </Button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

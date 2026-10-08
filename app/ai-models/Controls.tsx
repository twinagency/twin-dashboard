"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldLabel, Toggle, inputCls, selectCls } from "@/components/clone/fields";
import { PERSONA_FIELDS } from "@/lib/ai-models";
import { createAiModel, deleteAiImage, savePersona, setImageAccess, setImageStatus, setProfilePic, setShowInTSocial, uploadAiMedia } from "./actions";

function useRun() {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = (fn: () => Promise<unknown>, done?: string) => {
    setError(null); setOk(null);
    start(async () => { try { await fn(); if (done) setOk(done); } catch (e) { setError(e instanceof Error ? e.message : "Failed"); } });
  };
  return { pending, error, ok, run };
}
const Msg = ({ error, ok }: { error: string | null; ok: string | null }) => (error ? <span className="text-xs text-crit">{error}</span> : ok ? <span className="text-xs text-good">{ok}</span> : null);

export function NewModelForm() {
  const { pending, error, run } = useRun();
  return (
    <form className="flex flex-wrap items-end gap-2" action={(fd) => run(() => createAiModel(fd))}>
      <label className="block min-w-0"><FieldLabel label="New AI model, name" /><input name="name" className={inputCls + " !w-56"} maxLength={40} required placeholder="Luna" /></label>
      <Button type="submit" size="sm" disabled={pending}>Create</Button>
      <Msg error={error} ok={null} />
    </form>
  );
}

export function PersonaForm({ id, name, tagline, about, consent, vars }: { id: string; name: string; tagline: string; about: string; consent: string; vars: Record<string, string> }) {
  const { pending, error, ok, run } = useRun();
  const groups = ["Basics", "Voice", "Chat rules"] as const;
  return (
    <form className="flex flex-col gap-5" action={(fd) => run(() => savePersona(id, fd), "Saved")}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block min-w-0"><FieldLabel label="Name" required /><input name="name" className={inputCls} defaultValue={name} maxLength={40} required /></label>
        <label className="block min-w-0"><FieldLabel label="Tagline" hint="Short line under her name in T-Social. 60 characters." /><input name="tagline" className={inputCls} defaultValue={tagline} maxLength={60} /></label>
        <label className="block min-w-0 md:col-span-2"><FieldLabel label="Bio" hint="Shown on her T-Social profile. 300 characters. Say she is an AI character." /><textarea name="about" className={inputCls} rows={2} defaultValue={about} maxLength={300} /></label>
        <label className="block min-w-0 md:col-span-2"><FieldLabel label="Consent note" hint="fictional for a made-up girl. For a real creator, who gave written consent to AI pics of herself." /><input name="consent_note" className={inputCls} defaultValue={consent} maxLength={200} /></label>
      </div>
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g}</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {PERSONA_FIELDS.filter((f) => f.group === g).map((f) => (
              <label key={f.key} className={"block min-w-0 " + (f.rows > 1 ? "md:col-span-2" : "")}>
                <FieldLabel label={f.label} hint={f.hint} />
                {f.rows === 1 ? <input name={f.key} className={inputCls} defaultValue={vars[f.key] ?? ""} maxLength={f.max} /> : <textarea name={f.key} className={inputCls} rows={f.rows} defaultValue={vars[f.key] ?? ""} maxLength={f.max} />}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center gap-3"><Button type="submit" disabled={pending}>Save persona</Button><Msg error={error} ok={ok} /></div>
    </form>
  );
}

export function ShowSwitch({ id, enabled }: { id: string; enabled: boolean }) {
  const { pending, error, run } = useRun();
  const [on, setOn] = useState(enabled);
  return (
    <div className="flex flex-col gap-1">
      <Toggle label="Show in T-Social" name="tsocial_enabled" checked={on} disabled={pending} hint="On: she appears in the T-Social feed and Trending, her profile gets a Message button and fans can chat with her. Needs a birth date (18+) and at least one approved Free pic."
        onChange={(v) => { const prev = on; setOn(v); run(async () => { try { await setShowInTSocial(id, v); } catch (e) { setOn(prev); throw e; } }); }} />
      <Msg error={error} ok={null} />
    </div>
  );
}

export function UploadForm({ id }: { id: string }) {
  const { pending, error, ok, run } = useRun();
  const [access, setAccess] = useState<"free" | "locked">("free");
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form ref={ref} className="flex flex-wrap items-end gap-3" action={(fd) => run(async () => { const r = await uploadAiMedia(id, fd); ref.current?.reset(); setAccess("free"); router.refresh(); return r; }, "Uploaded, now approve them below")}>
      <label className="block min-w-0"><FieldLabel label="Pics or videos" hint="jpg, png, webp, heic, mp4, mov, webm. Up to 20 at a time. They start as pending." /><input name="file" type="file" multiple required accept="image/*,video/mp4,video/quicktime,video/webm" className="text-sm text-ink" /></label>
      <label className="block min-w-0"><FieldLabel label="Show as" hint="Free goes in her public feed and profile, so keep it non-explicit. Locked is sold for Stars inside her chat, fans only see a blurred preview." />
        <select name="access" className={selectCls + " !w-28"} value={access} onChange={(e) => setAccess(e.target.value === "locked" ? "locked" : "free")}><option value="free">Free</option><option value="locked">Locked</option></select>
      </label>
      {access === "locked" && <label className="block min-w-0"><FieldLabel label="Price (Stars)" /><input name="price" type="number" min={1} max={10000} step={1} required className={inputCls + " !w-28"} placeholder="250" /></label>}
      <Button type="submit" disabled={pending}>{pending ? "Uploading" : "Upload"}</Button>
      <Msg error={error} ok={ok} />
    </form>
  );
}

export type GalleryImage = { id: string; kind: "photo" | "video"; status: string; access: string; price_stars: number | null; url: string | null; isProfile: boolean };

export function ImageCard({ modelId, img }: { modelId: string; img: GalleryImage }) {
  const { pending, error, run } = useRun();
  const [price, setPrice] = useState(img.price_stars ? String(img.price_stars) : "");
  const badge = img.status === "approved" ? "bg-good/15 text-good" : img.status === "rejected" ? "bg-crit/15 text-crit" : "bg-warn/15 text-warn";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line p-2">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-lg bg-panel">
        {img.url ? (img.kind === "video"
          // eslint-disable-next-line jsx-a11y/media-has-caption
          ? <video src={img.url} controls preload="metadata" className="size-full object-cover" />
          // eslint-disable-next-line @next/next/no-img-element
          : <img alt="" src={img.url} loading="lazy" className="size-full object-cover" />) : <div className="flex size-full items-center justify-center text-xs text-muted">No preview</div>}
        <span className={`absolute left-1 top-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge}`}>{img.status}</span>
        {img.isProfile && <span className="absolute right-1 top-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-white">profile pic</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {img.status !== "approved" && <Button size="xs" disabled={pending} onClick={() => run(() => setImageStatus(img.id, "approved"))}>Approve</Button>}
        {img.status !== "rejected" && <Button size="xs" variant="destructive" disabled={pending} onClick={() => run(() => setImageStatus(img.id, "rejected"))}>Reject</Button>}
        {img.status !== "pending" && <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setImageStatus(img.id, "pending"))}>Pending</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <select className={selectCls + " !w-24"} aria-label="Free or Locked" value={img.access} disabled={pending}
          onChange={(e) => { const next = e.target.value === "locked" ? "locked" : "free"; if (next === "locked" && !price) return run(async () => { throw new Error("Type a price first, then pick Locked"); }); run(() => setImageAccess(img.id, next, next === "locked" ? Number(price) : null)); }}>
          <option value="free">Free</option><option value="locked">Locked</option>
        </select>
        <input className={inputCls + " !w-20"} aria-label="Price in Stars" inputMode="numeric" placeholder="Stars" value={price} onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))} />
        {img.access === "locked" && <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setImageAccess(img.id, "locked", Number(price)))}>Set price</Button>}
      </div>
      <div className="flex flex-wrap gap-1">
        {img.kind === "photo" && img.status === "approved" && img.access === "free" && !img.isProfile && <Button size="xs" variant="outline" disabled={pending} onClick={() => run(() => setProfilePic(modelId, img.id))}>Use as profile pic</Button>}
        <Button size="xs" variant="outline" disabled={pending} onClick={() => { if (confirm("Delete this file for good?")) run(() => deleteAiImage(img.id)); }}>Delete</Button>
      </div>
      <Msg error={error} ok={null} />
    </div>
  );
}

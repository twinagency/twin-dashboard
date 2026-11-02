import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Info } from "@/components/clone/fields";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { supabaseAdmin } from "@/lib/supabase";
import { ImageCard, PersonaForm, ProfilePhotoForm, ShowSwitch, UploadForm, type GalleryImage } from "../Controls";

export const dynamic = "force-dynamic";

type Model = { id: string; slug: string; name: string; status: string; tsocial_enabled: boolean; profile_image_id: string | null; tagline: string | null; about: string | null; consent_note: string; chat_vars: Record<string, string> | null };
type Img = { id: string; kind: "photo" | "video"; storage_path: string; status: string; access: string; price_stars: number | null; created_at: string };

export default async function AiModelPage({ params }: { params: Promise<{ id: string }> }) {
  if ((await getDashboardAccess()) !== null) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: model } = await supabaseAdmin.from("ai_models").select("id,slug,name,status,tsocial_enabled,profile_image_id,tagline,about,consent_note,chat_vars").eq("id", id).maybeSingle<Model>();
  if (!model) notFound();
  const imgs = (((await supabaseAdmin.from("ai_model_images").select("id,kind,storage_path,status,access,price_stars,created_at").eq("model_id", id).order("created_at", { ascending: false }).limit(500)).data) ?? []) as Img[];

  // thumbnails: originals sit in the private bucket, so the admin gets short lived signed links
  const signed = new Map<string, string>();
  if (imgs.length) {
    const { data } = await supabaseAdmin.storage.from("ai-private").createSignedUrls(imgs.map((i) => i.storage_path), 3600);
    for (const s of data ?? []) if (s.path && s.signedUrl) signed.set(s.path, s.signedUrl);
  }
  const gallery: GalleryImage[] = imgs.map((i) => ({ id: i.id, kind: i.kind, status: i.status, access: i.access, price_stars: i.price_stars, url: signed.get(i.storage_path) ?? null, isProfile: model.profile_image_id === i.id }));
  const counts = { pending: imgs.filter((i) => i.status === "pending").length, free: imgs.filter((i) => i.status === "approved" && i.access === "free").length, locked: imgs.filter((i) => i.status === "approved" && i.access === "locked").length };

  return (
    <main className="dashboard-page flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/ai-models" className="text-sm text-muted hover:text-ink">AI Models</Link>
        <h1 className="text-3xl font-bold text-ink">{model.name}</h1>
        <span className="rounded-full bg-panel px-3 py-1 text-xs text-muted">{model.slug}</span>
      </div>

      <Card><CardContent className="flex flex-col gap-2">
        <ShowSwitch id={model.id} enabled={model.tsocial_enabled} />
        <p className="text-xs text-muted">{counts.free} Free approved, {counts.locked} Locked approved, {counts.pending} pending.</p>
      </CardContent></Card>

      <Card><CardContent>
        <h2 className="mb-3 text-lg font-semibold text-ink">Profile photo</h2>
        <ProfilePhotoForm id={model.id} current={gallery.find((g) => g.isProfile)?.url ?? null} />
      </CardContent></Card>

      <Card><CardContent>
        <h2 className="mb-3 flex items-center gap-1 text-lg font-semibold text-ink">Persona<Info text="Her name, bio and chat voice. Field names match the Bot V2 details form." /></h2>
        <PersonaForm id={model.id} name={model.name} tagline={model.tagline ?? ""} about={model.about ?? ""} consent={model.consent_note} vars={model.chat_vars ?? {}} />
      </CardContent></Card>

      <Card><CardContent className="flex flex-col gap-4">
        <h2 className="flex items-center gap-1 text-lg font-semibold text-ink">Media ({imgs.length})<Info text="Upload, then Approve. Only approved files reach T-Social. Free files are public in her feed and profile. Locked files show a blurred preview and sell for the price you set." /></h2>
        <UploadForm id={model.id} />
        {gallery.length === 0 ? <p className="text-sm text-ink">No files yet.</p> : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {gallery.map((g) => <ImageCard key={g.id} modelId={model.id} img={g} />)}
          </div>
        )}
      </CardContent></Card>
    </main>
  );
}

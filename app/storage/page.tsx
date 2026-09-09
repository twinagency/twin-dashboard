import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { linkCreatorToClone } from "./actions";

export const dynamic = "force-dynamic";

type Creator = { id: string; display_name: string | null; email: string | null; account_status: string };
type Clone = { id: string; name: string; slug: string };
type LinkRow = { creator_account_id: string; clone_id: string | null; twin_slug: string | null };
type FileRow = {
  id: string; creator_account_id: string; kind: string; bucket: string; storage_path: string;
  mime_type: string | null; size_bytes: number | null; original_name: string | null;
  storage_transfer_status: string; source_object_status: string; created_at: string;
};

function prettyBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes; let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`;
}

function FileGallery({ selected, selectedFiles, signed }: { selected: Creator; selectedFiles: FileRow[]; signed: Map<string,string> }) {
  const media = selectedFiles.filter((f) => f.kind !== "voice");
  const voice = selectedFiles.filter((f) => f.kind === "voice");
  return (
    <section>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div><h2 className="text-lg font-semibold">{selected.display_name || selected.email} storage</h2><p className="text-xs text-muted">Only verified files are shown.</p></div>
        <Link href="/storage" className="rounded-md px-3 py-2 text-sm font-medium text-muted hover:bg-black/5 hover:text-ink">Close</Link>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {media.map((file) => {
          const url = signed.get(file.id);
          const video = file.mime_type?.startsWith("video/");
          return (
            <Card key={file.id} className="overflow-hidden p-0">
              <div className="aspect-square bg-black/5">
                {url ? (video ? <video src={url} controls playsInline preload="metadata" className="h-full w-full object-cover" /> : <img src={url} alt={file.original_name ?? "Creator storage"} className="h-full w-full object-cover" />) : <div className="grid h-full place-items-center text-xs text-muted">Preview unavailable</div>}
              </div>
              <div className="p-2"><div className="truncate text-xs font-medium" title={file.original_name ?? undefined}>{file.original_name || "Untitled"}</div><div className="mt-1 text-[11px] text-muted">{video ? "Video" : "Photo"} · {prettyBytes(file.size_bytes)}</div></div>
            </Card>
          );
        })}
      </div>
      {voice.length > 0 && <div className="mt-6"><h3 className="mb-2 text-sm font-semibold">Voice files</h3><div className="grid gap-2 md:grid-cols-2">{voice.map((file) => <Card key={file.id} className="p-3"><div className="mb-2 truncate text-xs font-medium">{file.original_name || "Voice sample"}</div>{signed.get(file.id) ? <audio controls preload="metadata" src={signed.get(file.id)} className="w-full" /> : <div className="text-xs text-muted">Preview unavailable</div>}<div className="mt-1 text-[11px] text-muted">{prettyBytes(file.size_bytes)}</div></Card>)}</div></div>}
      {selectedFiles.length === 0 && <Card className="p-8 text-center text-sm text-muted">No verified storage files for this creator.</Card>}
    </section>
  );
}

export default async function StoragePage({ searchParams }: { searchParams: Promise<{ creator?: string }> }) {
  const agencyAccess = await getDashboardAccess();
  if (agencyAccess) redirect("/revenue");
  const params = await searchParams;

  const [creatorRes, cloneRes, linkRes, fileRes] = await Promise.all([
    supabaseAdmin.from("creator_accounts").select("id,display_name,email,account_status").order("created_at", { ascending: true }),
    supabaseAdmin.from("clones").select("id,name,slug").order("created_at", { ascending: true }),
    supabaseAdmin.from("creator_clone_links").select("creator_account_id,clone_id,twin_slug"),
    supabaseAdmin.from("creator_files").select("id,creator_account_id,kind,bucket,storage_path,mime_type,size_bytes,original_name,storage_transfer_status,source_object_status,created_at").order("created_at", { ascending: false }),
  ]);

  const schemaError = creatorRes.error || linkRes.error || fileRes.error;
  if (schemaError) return <div className="dashboard-page text-ink"><h1 className="mb-2 text-2xl font-semibold">Storage</h1><p className="text-sm text-muted">Creator Storage is not initialized in this database environment yet.</p></div>;

  const creators = (creatorRes.data ?? []) as Creator[];
  const clones = (cloneRes.data ?? []) as Clone[];
  const links = (linkRes.data ?? []) as LinkRow[];
  const files = (fileRes.data ?? []) as FileRow[];
  const linkByCreator = new Map(links.map((row) => [row.creator_account_id, row]));
  const cloneById = new Map(clones.map((row) => [row.id, row]));
  const cloneBySlug = new Map(clones.map((row) => [row.slug, row]));
  const counts = new Map<string, { total: number; verified: number; photos: number; videos: number; voice: number }>();
  for (const creator of creators) counts.set(creator.id, { total: 0, verified: 0, photos: 0, videos: 0, voice: 0 });
  for (const file of files) {
    const c = counts.get(file.creator_account_id); if (!c) continue;
    c.total += 1; if (file.storage_transfer_status === "verified") c.verified += 1;
    if (file.kind === "voice") c.voice += 1; else if (file.mime_type?.startsWith("video/")) c.videos += 1; else c.photos += 1;
  }
  const totals = [...counts.values()].reduce((a, c) => ({ files: a.files + c.total, verified: a.verified + c.verified, photos: a.photos + c.photos, videos: a.videos + c.videos }), { files: 0, verified: 0, photos: 0, videos: 0 });
  const mapped = links.filter((l) => l.clone_id || l.twin_slug).length;
  const selected = creators.find((c) => c.id === params.creator) ?? null;
  const selectedFiles = selected ? files.filter((f) => f.creator_account_id === selected.id && f.storage_transfer_status === "verified") : [];
  const signed = new Map<string,string>();
  if (selectedFiles.length) {
    const grouped = new Map<string, FileRow[]>();
    for (const file of selectedFiles) grouped.set(file.bucket, [...(grouped.get(file.bucket) ?? []), file]);
    await Promise.all([...grouped.entries()].map(async ([bucket, rows]) => {
      const { data } = await supabaseAdmin.storage.from(bucket).createSignedUrls(rows.map((r) => r.storage_path), 60 * 60);
      rows.forEach((row, i) => { const url = data?.[i]?.signedUrl; if (url) signed.set(row.id, url); });
    }));
  }

  return (
    <div className="dashboard-page text-ink">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Storage</h1><p className="mt-1 text-sm text-muted">General creator photos, videos and voice assets. PPVs stay separate.</p></div>
        <Link href="/creator-management" className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-black/[0.03]">Manage creators</Link>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card className="p-4"><div className="text-xs text-muted">Stored files</div><div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totals.files}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Verified</div><div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totals.verified}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Photos / videos</div><div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{totals.photos + totals.videos}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted">Creators mapped</div><div className="mt-1 font-mono text-2xl font-semibold tabular-nums">{mapped}/{creators.length}</div></Card>
      </div>

      {selected && <div className="mb-6 md:hidden"><FileGallery selected={selected} selectedFiles={selectedFiles} signed={signed} /></div>}

      <Card className="mb-6 overflow-hidden p-0">
        <div className="border-b border-border px-4 py-3"><div className="font-semibold">Creator → clone mapping</div><div className="mt-0.5 text-xs text-muted">Map legacy creators to their live Twin clone.</div></div>
        <div className="grid gap-3 p-3 md:hidden">
          {creators.map((creator) => {
            const count = counts.get(creator.id)!; const link = linkByCreator.get(creator.id);
            const linkedClone = link?.clone_id ? cloneById.get(link.clone_id) : link?.twin_slug ? cloneBySlug.get(link.twin_slug) : null;
            return <div key={creator.id} className="rounded-xl border border-border bg-white p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="truncate font-semibold">{creator.display_name || creator.email || "Unnamed creator"}</div><div className="truncate text-xs text-muted">{creator.email || creator.account_status}</div></div><div className="shrink-0 text-xs font-medium text-muted">{count.verified}/{count.total}</div></div>
              <form action={linkCreatorToClone} className="mt-3 grid gap-2"><input type="hidden" name="creator_account_id" value={creator.id} /><select name="clone_id" defaultValue={link?.clone_id ?? linkedClone?.id ?? ""} className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"><option value="">Not linked</option>{clones.map((clone) => <option key={clone.id} value={clone.id}>{clone.name} / {clone.slug}</option>)}</select><div className="flex items-center justify-between gap-2"><Button type="submit" size="sm">Save mapping</Button><Link href={`/storage?creator=${creator.id}`} className="rounded-lg px-3 py-2 text-sm font-semibold text-accent hover:bg-black/[0.03]">View files →</Link></div></form>
            </div>;
          })}
        </div>
        <div className="hidden overflow-x-auto md:block">
          <Table><TableHeader><TableRow><TableHead>Creator</TableHead><TableHead>Storage</TableHead><TableHead>Linked clone</TableHead><TableHead /></TableRow></TableHeader><TableBody>
            {creators.map((creator) => {
              const count = counts.get(creator.id)!; const link = linkByCreator.get(creator.id);
              const linkedClone = link?.clone_id ? cloneById.get(link.clone_id) : link?.twin_slug ? cloneBySlug.get(link.twin_slug) : null;
              return <TableRow key={creator.id}><TableCell><div className="font-medium">{creator.display_name || creator.email || "Unnamed creator"}</div><div className="text-xs text-muted">{creator.email || creator.account_status}</div></TableCell><TableCell><span className="tabular-nums">{count.verified}/{count.total}</span> <span className="text-xs text-muted">verified</span></TableCell><TableCell><form action={linkCreatorToClone} className="flex min-w-[260px] items-center gap-2"><input type="hidden" name="creator_account_id" value={creator.id} /><select name="clone_id" defaultValue={link?.clone_id ?? linkedClone?.id ?? ""} className="h-9 flex-1 rounded-md border border-border bg-background px-2 text-sm"><option value="">Not linked</option>{clones.map((clone) => <option key={clone.id} value={clone.id}>{clone.name} / {clone.slug}</option>)}</select><Button type="submit" size="sm">Save</Button></form>{linkedClone && <div className="mt-1 text-[11px] text-muted">Currently {linkedClone.name}</div>}</TableCell><TableCell className="text-right"><Link href={`/storage?creator=${creator.id}`} className="text-sm font-medium text-accent hover:underline">View files →</Link></TableCell></TableRow>;
            })}
          </TableBody></Table>
        </div>
      </Card>

      {selected && <div className="hidden md:block"><FileGallery selected={selected} selectedFiles={selectedFiles} signed={signed} /></div>}
    </div>
  );
}

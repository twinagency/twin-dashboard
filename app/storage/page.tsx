import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase";
import { getDashboardAccess } from "@/lib/dashboard-access";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

type Clone = { id: string; name: string; slug: string };
type CreatorFile = { id:string; creator_account_id:string; kind:string; bucket:string; storage_path:string; mime_type:string|null; size_bytes:number|null; original_name:string|null; storage_transfer_status:string };
type LinkRow = { creator_account_id:string; clone_id:string|null; twin_slug:string|null };
type Asset = { key:string; bucket:string; path:string; name:string; mime:string|null; size:number|null; source:"Live media"|"Creator upload" };

function prettyBytes(bytes:number|null){ if(!bytes)return "—"; const u=["B","KB","MB","GB"]; let n=bytes,i=0; while(n>=1024&&i<u.length-1){n/=1024;i++} return `${n>=10||i===0?n.toFixed(0):n.toFixed(1)} ${u[i]}`; }
function basename(path:string){ return path.split("/").pop() || path; }
function dedupe(assets:Asset[]){ const seen=new Set<string>(); return assets.filter(a=>{ const k=`${a.bucket}:${a.path}`; if(seen.has(k))return false; seen.add(k); return true; }); }

async function listMediaRecursive(prefix:string, depth=0):Promise<Asset[]> {
  if(depth>4) return [];
  const {data,error}=await supabaseAdmin.storage.from("media").list(prefix,{limit:1000,offset:0,sortBy:{column:"created_at",order:"desc"}});
  if(error || !data) return [];
  const out:Asset[]=[];
  for(const item of data){
    const path=prefix ? `${prefix}/${item.name}` : item.name;
    if(item.id){
      const metadata=(item as any).metadata ?? {};
      out.push({key:`media:${item.id}`,bucket:"media",path,name:item.name,mime:metadata.mimetype ?? null,size:Number(metadata.size ?? metadata.contentLength ?? 0)||null,source:"Live media"});
    } else {
      out.push(...await listMediaRecursive(path,depth+1));
    }
  }
  return out;
}

function Gallery({clone,assets,signed}:{clone:Clone;assets:Asset[];signed:Map<string,string>}){
  return <section>
    <div className="mb-4 flex items-end justify-between gap-3"><div><h2 className="text-xl font-semibold">{clone.name}</h2><p className="text-xs text-muted">{assets.length} files from live clone storage and creator onboarding.</p></div><Link href="/storage" className="rounded-md px-3 py-2 text-sm text-muted hover:bg-black/5">Close</Link></div>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {assets.map(a=>{ const url=signed.get(a.key); const video=a.mime?.startsWith("video/") || /\.(mp4|mov|webm)$/i.test(a.path); const audio=a.mime?.startsWith("audio/"); return <Card key={a.key} className="overflow-hidden p-0">
        <div className="aspect-square bg-black/5">{url ? audio ? <div className="grid h-full place-items-center p-3"><audio controls src={url} className="w-full"/></div> : video ? <video src={url} controls playsInline preload="metadata" className="h-full w-full object-cover"/> : <img src={url} alt={a.name} className="h-full w-full object-cover"/> : <div className="grid h-full place-items-center text-xs text-muted">Preview unavailable</div>}</div>
        <div className="p-2"><div className="truncate text-xs font-medium" title={a.name}>{a.name}</div><div className="mt-1 flex justify-between gap-2 text-[11px] text-muted"><span>{a.source}</span><span>{prettyBytes(a.size)}</span></div></div>
      </Card>})}
    </div>
    {!assets.length&&<Card className="p-8 text-center text-sm text-muted">No storage files found for this live clone.</Card>}
  </section>;
}

export default async function StoragePage({searchParams}:{searchParams:Promise<{clone?:string}>}){
  const agencyAccess=await getDashboardAccess(); if(agencyAccess)redirect("/revenue"); const params=await searchParams;
  const [cloneRes,fileRes,linkRes]=await Promise.all([
    supabaseAdmin.from("clones").select("id,name,slug").order("created_at",{ascending:true}),
    supabaseAdmin.from("creator_files").select("id,creator_account_id,kind,bucket,storage_path,mime_type,size_bytes,original_name,storage_transfer_status").eq("storage_transfer_status","verified"),
    supabaseAdmin.from("creator_clone_links").select("creator_account_id,clone_id,twin_slug")
  ]);
  if(cloneRes.error)return <div className="dashboard-page text-ink"><h1 className="text-2xl font-semibold">Storage</h1><p className="mt-2 text-sm text-muted">Storage could not be loaded.</p></div>;

  const clones=(cloneRes.data??[]) as Clone[];
  const creatorFiles=(fileRes.data??[]) as CreatorFile[];
  const links=(linkRes.data??[]) as LinkRow[];
  const cloneBySlug=new Map(clones.map(c=>[c.slug,c]));
  const cloneIdByCreator=new Map<string,string>();
  for(const l of links){ const id=l.clone_id || (l.twin_slug?cloneBySlug.get(l.twin_slug)?.id:null); if(id)cloneIdByCreator.set(l.creator_account_id,id); }

  const mediaResults=await Promise.all(clones.map(async c=>[c.id,await listMediaRecursive(c.id)] as const));
  const assetsByClone=new Map<string,Asset[]>(mediaResults);
  for(const f of creatorFiles){ const cloneId=cloneIdByCreator.get(f.creator_account_id); if(!cloneId||!assetsByClone.has(cloneId))continue; assetsByClone.get(cloneId)!.push({key:`cf:${f.id}`,bucket:f.bucket,path:f.storage_path,name:f.original_name||basename(f.storage_path),mime:f.mime_type,size:f.size_bytes,source:"Creator upload"}); }
  for(const [id,a] of assetsByClone)assetsByClone.set(id,dedupe(a));

  const selected=clones.find(c=>c.id===params.clone)??null;
  const selectedAssets=selected?(assetsByClone.get(selected.id)??[]):[];
  const signed=new Map<string,string>();
  if(selectedAssets.length){
    const grouped=new Map<string,Asset[]>(); for(const a of selectedAssets)grouped.set(a.bucket,[...(grouped.get(a.bucket)??[]),a]);
    await Promise.all([...grouped.entries()].map(async([bucket,rows])=>{ for(let i=0;i<rows.length;i+=100){ const batch=rows.slice(i,i+100); const {data}=await supabaseAdmin.storage.from(bucket).createSignedUrls(batch.map(r=>r.path),3600); batch.forEach((r,j)=>{const u=data?.[j]?.signedUrl;if(u)signed.set(r.key,u)}); }}));
  }

  const total=[...assetsByClone.values()].reduce((n,a)=>n+a.length,0);
  return <div className="dashboard-page text-ink">
    <div className="mb-5"><h1 className="text-2xl font-semibold">Storage</h1><p className="mt-1 text-sm text-muted">All live creator media in Supabase, plus verified uploads from the new creator portal. PPVs remain separate.</p></div>
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2"><Card className="p-4"><div className="text-xs text-muted">Stored assets</div><div className="mt-1 font-mono text-2xl font-semibold">{total}</div></Card><Card className="p-4"><div className="text-xs text-muted">Source</div><div className="mt-2 text-sm font-semibold">Supabase media + portal</div></Card></div>
    {selected&&<div className="mb-7"><Gallery clone={selected} assets={selectedAssets} signed={signed}/></div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{clones.map(c=>{const a=assetsByClone.get(c.id)??[];const photos=a.filter(x=>x.mime?.startsWith("image/")||/\.(jpg|jpeg|png|webp|gif)$/i.test(x.path)).length;const videos=a.filter(x=>x.mime?.startsWith("video/")||/\.(mp4|mov|webm)$/i.test(x.path)).length;return <Link key={c.id} href={`/storage?clone=${c.id}`}><Card className="h-full p-4 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{c.name}</div><div className="mt-0.5 text-xs text-muted">{c.slug}</div></div><div className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold tabular-nums">{a.length}</div></div><div className="mt-4 flex gap-4 text-xs text-muted"><span>{photos} photos</span><span>{videos} videos</span></div><div className="mt-4 text-sm font-semibold text-accent">View files →</div></Card></Link>})}</div>
  </div>;
}

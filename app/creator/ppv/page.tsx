import { redirect } from 'next/navigation';
import CreatorPortalShell from '@/components/CreatorPortalShell';
import { requireCreatorReportIdentity } from '@/lib/creator-reporting';
import { CreatorReportError } from '@/lib/creator-report-contract';
import { serviceClient } from '@/lib/supabase-service';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'PPVs · LYNQ Creator' };

export default async function CreatorPpvPage() {
  let identity;
  try { identity = await requireCreatorReportIdentity(); }
  catch (error) {
    if (error instanceof CreatorReportError && error.status === 401) redirect('/creator/login');
    throw error;
  }
  const name = identity.cloneName || identity.displayName;
  if (!identity.cloneId) return <CreatorPortalShell displayName={name}><main className="earnings-aurora min-h-screen px-4 py-8 sm:px-7"><div className="mx-auto max-w-[1500px]"><h1 className="text-3xl font-semibold">PPVs</h1><div className="mt-6 rounded-2xl border border-[#dddde7] bg-white p-5 text-sm text-[#747580]">Your PPV library will appear when your creator account is connected to your live clone.</div></div></main></CreatorPortalShell>;

  const db = serviceClient();
  const [{ data: photos }, { data: videos }, { data: bundles }] = await Promise.all([
    db.from('photos').select('id,storage_path,caption,teaser_caption,star_value,is_free,image_name,created_at').eq('clone_id', identity.cloneId).order('created_at',{ascending:false}).limit(200),
    db.from('videos').select('id,storage_path,caption,teaser_caption,star_value,is_free,created_at').eq('clone_id', identity.cloneId).order('created_at',{ascending:false}).limit(200),
    db.from('photo_bundles').select('id,name,caption,star_price,created_at,photo_bundle_items(id,storage_path,sort_order)').eq('clone_id', identity.cloneId).order('created_at',{ascending:false}).limit(100),
  ]);
  const items = [
    ...(photos||[]).map((r:any)=>({id:r.id,type:'Photo',title:r.image_name||r.caption||'Photo',caption:r.teaser_caption||r.caption||'',stars:r.star_value||0,path:r.storage_path,created:r.created_at})),
    ...(videos||[]).map((r:any)=>({id:r.id,type:'Video',title:r.caption||'Video',caption:r.teaser_caption||'',stars:r.star_value||0,path:r.storage_path,created:r.created_at})),
    ...(bundles||[]).map((r:any)=>({id:r.id,type:'Bundle',title:r.name||'Bundle',caption:r.caption||'',stars:r.star_price||0,path:r.photo_bundle_items?.[0]?.storage_path||null,created:r.created_at})),
  ].sort((a,b)=>String(b.created).localeCompare(String(a.created)));

  return <CreatorPortalShell displayName={name}><main className="earnings-aurora min-h-screen px-4 py-8 sm:px-7"><div className="mx-auto max-w-[1500px]"><div className="flex flex-wrap items-end justify-between gap-4"><div><h1 className="text-3xl font-semibold tracking-[-0.04em]">PPVs</h1><p className="mt-2 text-sm text-[#747580]">Your uploaded pay-per-view photos, videos and bundles.</p></div><div className="rounded-full border border-[#dddde7] bg-white px-4 py-2 text-sm">{items.length} items</div></div><div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{items.map(item=><article key={`${item.type}-${item.id}`} className="overflow-hidden rounded-2xl border border-[#dddde7] bg-white shadow-sm"><div className="aspect-[4/5] bg-[#f0f1f5]">{item.path?<CreatorPpvThumb path={item.path} type={item.type}/>:<div className="grid h-full place-items-center text-sm text-[#8b8c96]">No preview</div>}</div><div className="p-3"><div className="flex items-center justify-between gap-2"><span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#676875]">{item.type}</span><span className="text-[12px] font-semibold">⭐ {item.stars}</span></div><div className="mt-2 line-clamp-1 font-medium">{item.title}</div>{item.caption&&<div className="mt-1 line-clamp-2 text-[12px] text-[#747580]">{item.caption}</div>}</div></article>)}{items.length===0&&<div className="col-span-full rounded-2xl border border-[#dddde7] bg-white p-8 text-center text-sm text-[#747580]">No PPV content has been uploaded yet.</div>}</div></div></main></CreatorPortalShell>;
}

function CreatorPpvThumb({ path, type }: { path: string; type: string }) {
  return <div className="relative h-full w-full"><img src={`/creator/media-sign?path=${encodeURIComponent(path)}`} alt="" className="h-full w-full object-cover"/><span className="absolute bottom-2 left-2 rounded-full bg-black/60 px-2 py-1 text-[10px] font-semibold text-white">{type}</span></div>;
}

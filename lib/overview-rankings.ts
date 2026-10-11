import { selectAllRows } from './select-all';
import { supabaseAdmin } from './supabase';
import { rankOverviewRows, type RankingRow } from './overview-rankings-model';
export async function getOverviewRankings(rows: readonly RankingRow[], clones: {id:string;name:string}[]) {
 const tests=await selectAllRows<{clone_id:string;telegram_id:number}>(supabaseAdmin.from('users').select('clone_id,telegram_id').in('clone_id',clones.map(c=>c.id)).eq('is_test',true).order('id'),{label:'Overview excluded test fans'});
 if(tests.truncated)throw Error('Could not verify fan eligibility');
 const excluded=new Set(tests.rows.map(u=>`${u.clone_id}:${u.telegram_id}`));
 const result=rankOverviewRows(rows.filter(r=>!excluded.has(`${r.clone_id}:${r.telegram_id}`)),clones);
 if(result.fans.length){
  const users=await selectAllRows<{clone_id:string;telegram_id:number;name:string|null;stated_name:string|null}>(supabaseAdmin.from('users').select('clone_id,telegram_id,name,stated_name').in('clone_id',clones.map(c=>c.id)).in('telegram_id',[...new Set(result.fans.map(f=>f.telegramId))]).order('id'),{label:'Overview top fan names'});
  if(users.truncated)throw Error('Top fan profiles could not be loaded');
  const profiles=new Map(users.rows.map(u=>[`${u.clone_id}:${u.telegram_id}`,u]));
  result.fans=result.fans.map(f=>({...f,name:profiles.get(`${f.cloneId}:${f.telegramId}`)?.stated_name||profiles.get(`${f.cloneId}:${f.telegramId}`)?.name||f.name}));
 }
 for(const type of ['photo','video','bundle'] as const){
  const items=result.content.filter(c=>c.type===type);if(!items.length)continue;
  const table=type==='photo'?'photos':type==='video'?'videos':'photo_bundles';
  const columns=type==='photo'?'id,clone_id,storage_path,image_name':type==='video'?'id,clone_id,storage_path,caption':'id,clone_id,name,photo_bundle_items(storage_path,sort_order)';
  const assets=await supabaseAdmin.from(table).select(columns).in('clone_id',clones.map(c=>c.id)).in('id',items.map(c=>c.mediaId));
  if(assets.error)throw Error('Best-selling content could not be loaded');
  for(const item of items){
   const asset=(assets.data as unknown as {id:string;clone_id:string;storage_path?:string;image_name?:string;caption?:string;name?:string;photo_bundle_items?:{storage_path:string;sort_order:number}[]}[]).find(a=>a.id===item.mediaId&&a.clone_id===item.cloneId);
   if(!asset)continue;
   item.name=asset.image_name||asset.caption||asset.name||item.name;
   const path=type==='bundle'?[...(asset.photo_bundle_items??[])].sort((a,b)=>a.sort_order-b.sort_order)[0]?.storage_path:asset.storage_path;
   if(path?.startsWith(item.cloneId+'/')){const signed=await supabaseAdmin.storage.from('media').createSignedUrl(path,3600);if(!signed.error)item.url=signed.data?.signedUrl??null}
  }
 }
 return result;
}

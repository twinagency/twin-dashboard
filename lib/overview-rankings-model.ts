import { classifyRevenueLedgerRow } from './revenue-ledger';
export type RankingRow = { clone_id: string; telegram_id: number | null; amount_stars: number | string | null; invoice_payload?: string | null; media_id?: string | null; media_type?: string | null; kind?: string | null; feature?: string | null };
export type RankedFan = { cloneId: string; telegramId: number; stars: number; purchases: number; name: string; cloneName: string };
export type RankedContent = { cloneId: string; mediaId: string; type: 'photo'|'video'|'bundle'; stars: number; purchases: number; name: string; cloneName: string; url: string | null };
export type OverviewRankings = { fans: RankedFan[]; content: RankedContent[]; unlinked: Record<string, number> };
export const fanOrder = (a: RankedFan, b: RankedFan) => b.stars-a.stars || b.purchases-a.purchases || a.cloneId.localeCompare(b.cloneId) || a.telegramId-b.telegramId;
export const contentOrder = (a: RankedContent, b: RankedContent) => b.purchases-a.purchases || b.stars-a.stars || a.mediaId.localeCompare(b.mediaId);
export function rankOverviewRows(rows: readonly RankingRow[], clones: {id:string;name:string}[]): OverviewRankings {
 const names = new Map(clones.map(c=>[c.id,c.name]));
 const fans = new Map<string,RankedFan>(), content = new Map<string,RankedContent>(), unlinked:Record<string,number> = {};
 for(const raw of rows){
  if(!names.has(raw.clone_id)) continue;
  const row=classifyRevenueLedgerRow(raw), cloneName=names.get(row.clone_id)!;
  if(row.telegram_id!=null){const key=`${row.clone_id}:${row.telegram_id}`;const f=fans.get(key)??{cloneId:row.clone_id,telegramId:row.telegram_id,stars:0,purchases:0,name:`Fan ${row.telegram_id}`,cloneName};f.stars+=row.stars;if(row.paidOrder)f.purchases++;fans.set(key,f)}
  const type=row.media_type;
  if(row.media_id && (type==='photo'||type==='video'||type==='bundle')){const key=`${row.clone_id}:${type}:${row.media_id}`;const item=content.get(key)??{cloneId:row.clone_id,mediaId:row.media_id,type,stars:0,purchases:0,name:type==='photo'?'Photo':type==='video'?'Video':'Bundle',cloneName,url:null};item.stars+=row.stars;if(row.paidOrder)item.purchases++;content.set(key,item)}
  else if(row.paidOrder&&(row.kind==='media'||['photo','video','bundle'].includes(row.feature??'')))unlinked[row.clone_id]=(unlinked[row.clone_id]??0)+1;
 }
 // Keep the agency leaders plus leaders for every selectable creator.
 function leaders<T extends {cloneId:string}>(rows:T[], count:number):T[]{const keep=new Set(rows.slice(0,count));for(const c of clones)for(const row of rows.filter(r=>r.cloneId===c.id).slice(0,count))keep.add(row);return rows.filter(r=>keep.has(r))}
 return {fans:leaders([...fans.values()].filter(f=>f.purchases>0&&f.stars>0).sort(fanOrder),10),content:leaders([...content.values()].filter(c=>c.purchases>0).sort(contentOrder),3),unlinked};
}

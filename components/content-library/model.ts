import type { Fan, Platform, Purchase } from '../fans/types';
import { dayAt, platformOrder, valueCents, type Filters } from '../dashboard/model';
export type Listing = { enabled: boolean; price: number };
export type LibraryItem = { id: string; creatorId: string; title: string; originalTitle: string; kind: Purchase['kind']; description: string; collection: string; tags: string[]; status: 'Published' | 'Draft' | 'Archived'; addedAt: string; listings: Record<Platform, Listing>; members: string[]; duration?: number; preview?: string; fileName?: string; activity: { at: string; text: string }[] };
export type Sale = Purchase & { fan: Fan; itemId: string; includedItemIds?: string[] };
export const LIBRARY_STORAGE = 'twin-content-library-v1';
export const itemId = (creator: string, title: string, kind: string) => `${creator}:${kind}:${title}`;
export const libraryHref = (creator: string, title: string, kind: string, fan?: string) => `/content-library?${new URLSearchParams({creator,item:itemId(creator,title,kind),...(fan?{fan}:{})})}`;
export const defaultListings = (kind: string): Record<Platform, Listing> => Object.fromEntries(platformOrder.map(p=>[p,{enabled:false,price:p==='telegram'?(kind==='Bundle'?6000:kind==='Video'?3500:2000):(kind==='Bundle'?79:kind==='Video'?49:29)}])) as Record<Platform,Listing>;
export function buildLibrary(fans: Fan[]): { items: LibraryItem[]; sales: Sale[] } {
  const map = new Map<string,LibraryItem>();
  const sales: Sale[] = [];
  for(const fan of fans) for(const purchase of [...fan.purchases].sort((a,b)=>a.at.localeCompare(b.at))){
    const id=itemId(fan.creatorId,purchase.title,purchase.kind);
    let item=map.get(id);
    if(!item){item={id,creatorId:fan.creatorId,title:purchase.title,originalTitle:purchase.title,kind:purchase.kind,description:`${purchase.title}. Part of the creator's curated ${purchase.kind.toLowerCase()} collection.`,collection:/^(April|May|June|July|August|September|October)\b/.exec(purchase.title)?.[1]||'Signature collection',tags:[purchase.kind.toLowerCase(),'collection'],status:'Published',addedAt:purchase.at,listings:defaultListings(purchase.kind),members:[],activity:[]};map.set(id,item);}
    if(purchase.at<item.addedAt)item.addedAt=purchase.at;
    // Listing price is an editable current asking price; immutable sales retain
    // their own original price. Use the most recent observed price per channel.
    const latest=sales.filter(s=>s.itemId===id&&s.platform===purchase.platform).sort((a,b)=>b.at.localeCompare(a.at))[0];
    if(!latest||purchase.at>=latest.at)item.listings[purchase.platform]={enabled:true,price:purchase.amount};
    sales.push({...purchase,fan,itemId:id});
  }
  const items=[...map.values()];
  // Bundle constituent records are explicit catalogue fixtures, never extra sales.
  // Their identity is retained separately from individually purchased content.
  for(const bundle of items.filter(i=>i.kind==='Bundle')){
    for(let n=1;n<=3;n++){
      const kind=n===3?'Video':'Photo';const id=`${bundle.id}:included:${n}`;
      bundle.members.push(id);
      map.set(id,{...bundle,id,title:`${bundle.title} · ${kind.toLowerCase()} ${n}`,originalTitle:'',kind,description:`Included ${kind.toLowerCase()} ${n} from ${bundle.title}.`,tags:['bundle inclusion',kind.toLowerCase()],members:[],listings:defaultListings(kind),activity:[],status:'Draft'});
    }
  }
  for(const creator of [...new Set(fans.map(f=>f.creatorId))])for(let n=0;n<6;n++){
    const title=['Morning light','Coastal walk','Studio journal','Weekend collection','Quiet afternoon','Next chapter'][n];
    const kind=n%2?'Video':'Photo';const listings=defaultListings(kind);
    if(n<3){listings.onlyfans.enabled=true;listings.telegram.enabled=true;}
    map.set(`${creator}:new:${n}`,{id:`${creator}:new:${n}`,creatorId:creator,title,originalTitle:'',kind,description:`A new addition to the ${title.toLowerCase()} collection.`,collection:'Upcoming releases',tags:['new',kind.toLowerCase()],status:n<3?'Published':'Draft',addedAt:'2026-10-09T07:00:00Z',listings,members:[],activity:[]});
  }
  for (const sale of sales) sale.includedItemIds=[...(map.get(sale.itemId)?.members||[])];
  return {items:[...map.values()],sales:sales.sort((a,b)=>b.at.localeCompare(a.at))};
}
export function scopedSales(sales: Sale[], filters: Filters, from: string, to: string){return sales.filter(s=>s.fan.creatorId===filters.creatorId&&(filters.platform==='all'||s.platform===filters.platform)&&dayAt(s.at)>=from&&dayAt(s.at)<=to);}
export function ownership(item: LibraryItem, fan: Fan|undefined, items: LibraryItem[], sales: Sale[]){
  if(!fan||fan.creatorId!==item.creatorId)return [];
  return sales.filter(s=>s.fan.id===fan.id&&(s.itemId===item.id||s.includedItemIds?.includes(item.id))).map(s=>({platform:s.platform,at:s.at,bundle:s.itemId!==item.id?s.title:undefined}));
}
export function itemStats(id:string,sales:Sale[],currency:'USD'|'AUD',rate:number){const entries=sales.filter(s=>s.itemId===id);return{entries,revenue:entries.reduce((n,s)=>n+valueCents(s,currency,rate),0),buyers:new Set(entries.map(s=>s.fan.id)).size};}
export function validateItem(item:LibraryItem,items:LibraryItem[]):string{
  if(!item.title.trim())return 'Add a content title.';
  if(item.title.length>140)return 'Keep the title under 140 characters.';
  if(item.kind==='Bundle'&&item.members.length<2)return 'Select at least two items for this bundle.';
  if(new Set(item.members).size!==item.members.length)return 'An item can only appear once in a bundle.';
  if(item.members.some(id=>!items.some(i=>i.id===id&&i.creatorId===item.creatorId&&i.kind!=='Bundle')))return 'Bundle items must belong to this creator.';
  for(const platform of platformOrder){const listing=item.listings[platform];if(!listing||!Number.isFinite(listing.price)||listing.price<=0||listing.price>1_000_000)return 'Enter a valid positive price for each platform.';if(platform==='telegram'&&!Number.isInteger(listing.price))return 'Telegram prices must be whole Stars.';}
  if(item.status==='Published'&&!platformOrder.some(p=>item.listings[p].enabled))return 'Choose at least one platform before publishing.';
  return '';
}
export function restoreLibrary(raw:string|null,base:LibraryItem[]):LibraryItem[]{
  if(!raw||raw.length>2_000_000)return base;
  try{const saved=JSON.parse(raw);if(saved.version!==1||!Array.isArray(saved.items)||saved.items.length>1500)return base;const result=[...base];
    for(const item of saved.items){if(!item||typeof item.id!=='string'||typeof item.title!=='string'||typeof item.description!=='string'||!Array.isArray(item.members)||!Array.isArray(item.tags)||!Array.isArray(item.activity)||!['Photo','Video','Bundle'].includes(item.kind)||!['Draft','Published','Archived'].includes(item.status)||!base.some(b=>b.creatorId===item.creatorId))continue;
      const index=result.findIndex(b=>b.id===item.id);const original=index<0?undefined:result[index];
      if(original&&(original.creatorId!==item.creatorId||original.kind!==item.kind))continue;
      const safe={...item,preview:undefined,originalTitle:original?.originalTitle||'',members:item.members.filter((m:unknown)=>typeof m==='string'),activity:item.activity.filter((e:any)=>typeof e?.text==='string'&&typeof e?.at==='string').slice(-100)} as LibraryItem;
      if(!safe.listings||validateItem(safe,[...result,...saved.items]))continue;
      if(index<0)result.push(safe);else result[index]=safe;
    }return result;
  }catch{return base;}
}

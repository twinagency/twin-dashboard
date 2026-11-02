import type { CatalogueItem } from './catalogue-core';
export type BundleKind = 'photo' | 'video';
export type CatalogueBundle = { id:string; title:string; caption?:string; kind:BundleKind; photoIds:string[]; videoIds:string[]; stars:number; regularStars:number; owned:boolean; partial:boolean };
export type CatalogueRewards = { balance:number; earned:number; spent:number; welcomeBonus?:number; cost:number; startsAt:string; photoIds:string[]; videoIds:string[] };
// A bundle row is either all-photos or all-videos, decided by media_kind (defaults
// to 'photo' for any row/code path that predates the column). Mixed bundles are
// out of scope; the immutability trigger enforces the same split server side.
export function projectBundle(row:any, items:CatalogueItem[]):CatalogueBundle|null {
 const kind:BundleKind = row.media_kind==='video' ? 'video' : 'photo';
 const ids:string[] = kind==='video' ? row.video_ids : row.photo_ids;
 const n=Array.isArray(ids)?ids.length:0;
 if(n<2||n>10||new Set(ids).size!==n) return null;
 const media=ids.map((id:string)=>items.find(p=>p.id===id&&p.type===kind));
 if(media.some((p)=>!p||p.free||!Number.isInteger(p.stars)||p.stars<=0)) return null;
 const prices=(media as CatalogueItem[]).map((p)=>p.stars);
 const regularStars=prices.reduce((a:number,b:number)=>a+b,0);
 if(row.price_stars!==Math.min(2200,regularStars-Math.min(...prices))) return null;
 const count=(media as CatalogueItem[]).filter((p)=>p.purchased||p.received).length;
 return {id:row.id,title:row.title,...(typeof row.caption==='string'&&row.caption.trim()?{caption:row.caption.trim().slice(0,300)}:{}),
   kind,photoIds:kind==='photo'?ids:[],videoIds:kind==='video'?ids:[],stars:row.price_stars,regularStars,owned:count===n,partial:count>0&&count<n};
}
export function rewardProgress(rewards:CatalogueRewards) {
 const balance=Math.max(0,rewards.balance);
 return {percent:Math.min(100,balance/rewards.cost*100),remaining:Math.max(0,rewards.cost-balance),ready:balance>=rewards.cost};
}

// Summarise only settings explicitly named in the included item metadata.
export function bundleDescription(bundle:CatalogueBundle,items:CatalogueItem[]):string {
 const ids=bundle.kind==='video'?bundle.videoIds:bundle.photoIds;
 const noun=bundle.kind==='video'?'videos':'photos';
 const descriptions=items.filter(p=>p.type===bundle.kind&&ids.includes(p.id)).map(p=>p.description).join(' ').toLowerCase();
 const settings:Array<[RegExp,string]>=[[/\bshower\b/,'shower'],[/\bbedroom\b/,'bedroom'],[/\bmirror\b/,'mirror'],[/\bpool\b/,'poolside'],[/\bbeach\b/,'beach'],[/\bclose[ -]?up\b/,'close-up']];
 const names=settings.filter(([pattern])=>pattern.test(descriptions)).map(([,name])=>name).slice(0,3);
 return names.length ? `${names[0][0].toUpperCase()+names[0].slice(1)}${names.slice(1).map((name,i)=>`${i===names.length-2?' and ':', '}${name}`).join('')} ${noun}.` : `${ids.length} ${noun} from the collection.`;
}

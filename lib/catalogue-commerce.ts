import type { CatalogueItem } from './catalogue-core';
export type CatalogueBundle = { id:string; title:string; photoIds:string[]; stars:number; regularStars:number; owned:boolean; partial:boolean };
export type CatalogueRewards = { balance:number; earned:number; spent:number; cost:number; startsAt:string; photoIds:string[]; videoIds:string[] };
export function projectBundle(row:any, items:CatalogueItem[]):CatalogueBundle|null {
 if(!Array.isArray(row.photo_ids)||row.photo_ids.length!==5||new Set(row.photo_ids).size!==5) return null;
 const photos=row.photo_ids.map((id:string)=>items.find(p=>p.id===id&&p.type==='photo'));
 if(photos.some((p:CatalogueItem|undefined)=>!p||p.free||!Number.isInteger(p.stars)||p.stars<=0)) return null;
 const prices=photos.map((p:CatalogueItem)=>p.stars);
 const regularStars=prices.reduce((a:number,b:number)=>a+b,0);
 if(row.price_stars!==Math.min(2200,regularStars-Math.min(...prices))) return null;
 const count=photos.filter((p:CatalogueItem)=>p.purchased||p.received).length;
 return {id:row.id,title:row.title,photoIds:row.photo_ids,stars:row.price_stars,regularStars,owned:count===5,partial:count>0&&count<5};
}
export function rewardProgress(rewards:CatalogueRewards) {
 const balance=Math.max(0,rewards.balance);
 return {percent:Math.min(100,balance/rewards.cost*100),remaining:Math.max(0,rewards.cost-balance),ready:balance>=rewards.cost};
}

// Summarise only settings explicitly named in the included item metadata.
export function bundleDescription(bundle:CatalogueBundle,items:CatalogueItem[]):string {
 const descriptions=items.filter(p=>p.type==='photo'&&bundle.photoIds.includes(p.id)).map(p=>p.description).join(' ').toLowerCase();
 const settings:Array<[RegExp,string]>=[[/\bshower\b/,'shower'],[/\bbedroom\b/,'bedroom'],[/\bmirror\b/,'mirror'],[/\bpool\b/,'poolside'],[/\bbeach\b/,'beach'],[/\bclose[ -]?up\b/,'close-up']];
 const names=settings.filter(([pattern])=>pattern.test(descriptions)).map(([,name])=>name).slice(0,3);
 return names.length ? `${names[0][0].toUpperCase()+names[0].slice(1)}${names.slice(1).map((name,i)=>`${i===names.length-2?' and ':', '}${name}`).join('')} photos.` : 'Five photos from the collection.';
}

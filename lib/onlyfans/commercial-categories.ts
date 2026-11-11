import { CONTENT_SCHEMA, parseContentItem, type ContentItem } from "./content";
import { validVaultProduct, vaultMediaId } from "./vault";
import { vaultEditHash, folderReference } from "./vault-editing";
export type CategoryPrice={folderId:string;name:string;revision:number;priceCents:number|null;currency:"USD";appliesTo:"single_asset";fingerprint:string};
export type ReviewedState={version:"agency-category-review.v1";bindingId:string;categoryFingerprint:string;assets:Record<string,string>};
export type ReviewedAsset={mediaId:string;fingerprint:string;description:string|null;tags:string[]|null;kind:string;durationSeconds:number|null;analysisNote:string|null;classificationUncertain:boolean};
export type CategoryReview={reviewedState:ReviewedState;categoryName:string;assets:ReviewedAsset[]};
export type CategoryDraft={folderId:number;priceCents:number;categoryPriceRevision:number;classificationConfirmed:true;rightsConfirmed:true;reviewedState:ReviewedState;
  products:{label:string;description:string;mediaIds:string[];previewMediaIds:string[];approvedTotalCents?:number}[]};
export const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==="object"&&!Array.isArray(v);
export const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).sort().join(",")===[...keys].sort().join(",");
const text=(v:unknown,max:number):v is string=>typeof v==="string"&&v.isWellFormed()&&!v.includes("\0")&&new TextEncoder().encode(v).length<=max;
const integer=(v:unknown,min:number,max=2147483647):v is number=>Number.isSafeInteger(v)&&(v as number)>=min&&(v as number)<=max;
export const nonce=(v:unknown):v is string=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(v);
export function validReviewedState(v:unknown):v is ReviewedState {
 return object(v)&&exact(v,["version","bindingId","categoryFingerprint","assets"])&&v.version==="agency-category-review.v1"&&text(v.bindingId,128)&&!!v.bindingId&&vaultEditHash(v.categoryFingerprint)&&object(v.assets)&&Object.keys(v.assets).length>0&&Object.keys(v.assets).length<=500&&Object.entries(v.assets).every(([id,hash])=>vaultMediaId(id)&&vaultEditHash(hash));
}
export function parseCategoryPrice(v:unknown,account:string,folder:string):CategoryPrice|null {
 if(!object(v)||!exact(v,["schemaVersion","ok","accountId","categoryPrice"])||v.schemaVersion!==CONTENT_SCHEMA||v.ok!==true||v.accountId!==account||!object(v.categoryPrice))return null;
 const p=v.categoryPrice;
 return exact(p,["folderId","name","revision","priceCents","currency","appliesTo","fingerprint"])&&p.folderId===folder&&text(p.name,480)&&integer(p.revision,0)&&(p.priceCents===null||integer(p.priceCents,300,20000))&&p.currency==="USD"&&p.appliesTo==="single_asset"&&vaultEditHash(p.fingerprint)?p as CategoryPrice:null;
}
export function parseCategoryReview(v:unknown,account:string,ids:string[]):CategoryReview|null {
 if(!object(v)||!exact(v,["schemaVersion","ok","accountId","reviewedState","categoryName","assets"])||v.schemaVersion!==CONTENT_SCHEMA||v.ok!==true||v.accountId!==account||!validReviewedState(v.reviewedState)||!text(v.categoryName,480)||!Array.isArray(v.assets)||v.assets.length!==ids.length)return null;
 const state=v.reviewedState;
 if(Object.keys(state.assets).sort().join(",")!==[...ids].sort().join(","))return null;
 if(!v.assets.every(a=>object(a)&&exact(a,["mediaId","fingerprint","description","tags","kind","durationSeconds","analysisNote","classificationUncertain"])&&vaultMediaId(a.mediaId)&&state.assets[a.mediaId]===a.fingerprint&&(a.description===null||text(a.description,2000))&&(a.tags===null||Array.isArray(a.tags)&&a.tags.length<=12&&a.tags.every(t=>text(t,80)))&&(a.analysisNote===null||text(a.analysisNote,1000))&&typeof a.classificationUncertain==="boolean"&&["photo","video"].includes(a.kind as string)&&(a.durationSeconds===null||integer(a.durationSeconds,0,86400))))return null;
 if(new Set(v.assets.map(a=>a.mediaId)).size!==ids.length)return null;
 return {reviewedState:state,categoryName:v.categoryName,assets:v.assets as ReviewedAsset[]};
}
export function validCategoryDraft(v:unknown):v is CategoryDraft {
 if(!object(v)||!exact(v,["folderId","priceCents","categoryPriceRevision","classificationConfirmed","rightsConfirmed","reviewedState","products"])||!integer(v.folderId,1)||!integer(v.priceCents,300,20000)||!integer(v.categoryPriceRevision,1)||v.classificationConfirmed!==true||v.rightsConfirmed!==true||!validReviewedState(v.reviewedState)||!Array.isArray(v.products)||!v.products.length||v.products.length>25)return false;
 const ids=new Set<string>();
 for(const p of v.products) {
  if(!object(p)||!exact(p,["label","description","mediaIds","previewMediaIds",...(Object.hasOwn(p,"approvedTotalCents")?["approvedTotalCents"]:[])]))return false;
  const {approvedTotalCents:_total,...fields}=p;const product={...fields,priceCents:p.approvedTotalCents??v.priceCents,enabled:false};
  if(!validVaultProduct(product)||product.mediaIds.length>1&&!Object.hasOwn(p,"approvedTotalCents"))return false;
  product.mediaIds.forEach(id=>ids.add(id));
 }
 return [...ids].sort().join(",")===Object.keys(v.reviewedState.assets).sort().join(",");
}
export function parseCategoryDraftAck(v:unknown,account:string,key:string,category:CategoryDraft):{itemId:string;item:ContentItem}[]|null {
 if(!object(v)||!exact(v,["schemaVersion","ok","applied","accountId","commandKey","items"])||v.schemaVersion!==CONTENT_SCHEMA||v.ok!==true||v.applied!==true||v.accountId!==account||v.commandKey!==key||!Array.isArray(v.items)||v.items.length!==category.products.length)return null;
 const result:{itemId:string;item:ContentItem}[]=[];
 for(let i=0;i<v.items.length;i++){
  const row=v.items[i],p=category.products[i];
  if(!object(row)||!exact(row,["itemId","commandKey","categoryId","categoryName","item"])||!vaultMediaId(row.itemId)||!vaultEditHash(row.commandKey)||row.categoryId!==String(category.folderId)||!text(row.categoryName,480))return null;
  const item=parseContentItem({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:account,itemId:row.itemId,item:row.item},account,row.itemId);
  if(!item||item.enabled||item.isFreeTeaser||item.revision!==0||item.label!==p.label.trim()||item.description!==p.description.trim()||item.priceCents!==(p.approvedTotalCents??category.priceCents))return null;
  result.push({itemId:row.itemId,item});
 }
 return new Set(result.map(r=>r.itemId)).size===result.length?result:null;
}

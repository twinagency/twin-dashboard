/** Account preparation never authorizes sales or automatic replies. */
export type PreparationConfig={contract_version:"preparation.v1";provider_account:string;creator_id:string;
 qualification:{mode:"fixture"|"production";reference:string};
 limits:{provider_requests:number;provider_credit_budget:number;provider_credits_per_request:number}};
export type PreparationState={configured:false;canPrepare:boolean}|{configured:true;revision:number;status:"configured"|"stopped";
 fingerprint:string;config:PreparationConfig;providerRequestsUsed:number;providerCreditsReserved:number;
 automaticRepliesEnabled:false;salesEnabled:false;historyCoverage:"pending";ownershipCoverage:"pending";connected?:boolean;
 vault?:null|{jobId:string;status:string;pagesRead:number;itemsSeen:number;error:string|null;selected:number};replayed?:boolean};
export type PreparationCommand={action:"configure";expectedRevision:number;requestId:string;reason:string;config:PreparationConfig}|
 {action:"stop";expectedRevision:number;requestId:string;reason:string};
const obj=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==="object"&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>k in v);
const integer=(v:unknown,lo:number,hi:number):v is number=>Number.isSafeInteger(v)&&Number(v)>=lo&&Number(v)<=hi;
export function validPreparationConfig(v:unknown):v is PreparationConfig{
 if(!obj(v)||!exact(v,["contract_version","provider_account","creator_id","qualification","limits"])||
  v.contract_version!=="preparation.v1"||typeof v.provider_account!=="string"||!/^acct_[A-Za-z0-9_-]{1,240}$/.test(v.provider_account)||
  typeof v.creator_id!=="string"||!(/^[1-9][0-9]{0,18}$/).test(v.creator_id)||BigInt(v.creator_id)>=BigInt("9223372036854775808")||
  !obj(v.qualification)||!exact(v.qualification,["mode","reference"])||!["fixture","production"].includes(String(v.qualification.mode))||
  typeof v.qualification.reference!=="string"||!v.qualification.reference.trim()||v.qualification.reference.length>200||
  !obj(v.limits)||!exact(v.limits,["provider_requests","provider_credit_budget","provider_credits_per_request"]))return false;
 const l=v.limits;return integer(l.provider_requests,1,10000)&&integer(l.provider_credit_budget,1,1e9)&&integer(l.provider_credits_per_request,1,l.provider_credit_budget);
}
export function validPreparationCommand(v:unknown):v is PreparationCommand{
 if(!obj(v)||!["configure","stop"].includes(String(v.action))||!exact(v,["action","expectedRevision","requestId","reason",...(v.action==="configure"?["config"]:[])])||
 !integer(v.expectedRevision,0,2147483647)||typeof v.requestId!=="string"||!(/^[0-9a-f-]{36}$/).test(v.requestId)||
 typeof v.reason!=="string"||!v.reason.trim()||v.reason.length>512)return false;
 return v.action==="stop"||validPreparationConfig(v.config);
}
export function parsePreparationState(v:unknown):PreparationState|null{
 if(!obj(v)||typeof v.configured!=="boolean")return null;
 if(!v.configured)return exact(v,["configured","canPrepare"])&&typeof v.canPrepare==="boolean"?v as PreparationState:null;
 if(!integer(v.revision,1,2147483647)||!["configured","stopped"].includes(String(v.status))||typeof v.fingerprint!=="string"||!(/^[0-9a-f]{64}$/).test(v.fingerprint)||
 !validPreparationConfig(v.config)||!integer(v.providerRequestsUsed,0,Number.MAX_SAFE_INTEGER)||!integer(v.providerCreditsReserved,0,Number.MAX_SAFE_INTEGER)||
 v.automaticRepliesEnabled!==false||v.salesEnabled!==false||v.historyCoverage!=="pending"||v.ownershipCoverage!=="pending"||
 ("connected" in v&&typeof v.connected!=="boolean"))return null;
 if(v.vault!==undefined&&v.vault!==null&&(!obj(v.vault)||typeof v.vault.jobId!=="string"||
 !["pending","running","complete","failed","superseded"].includes(String(v.vault.status))||
 !integer(v.vault.pagesRead,0,10000)||!integer(v.vault.itemsSeen,0,1000000)||!integer(v.vault.selected,0,1000)||
 !(v.vault.error===null||typeof v.vault.error==="string")))return null;
 return v as PreparationState;
}

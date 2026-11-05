import { computeAudiencePreview } from "@/lib/mtproto/audience";
const c="2e5eb05f-cc88-4ba6-870a-924948d4b09a";
(async()=>{const p:any=await computeAudiencePreview({cloneIds:[c],segment:"top_spenders",minSpendStars:1,includeLegacy:true} as any,{dailyCap:150,runCap:null,holdoutPct:10,allowRecontact:true});
console.log(JSON.stringify({pool:p.candidatePool,eligible:p.eligible,holdout:p.holdout,excluded:p.excluded,excludedTotal:p.excludedTotal}));})().catch(e=>console.error("ERR",e.message));

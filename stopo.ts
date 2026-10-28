import { stopRun, getRun } from "@/lib/mtproto/runs";
(async()=>{const id="49f64d7b-0dad-448b-812b-efcf64438e0e";const b=await getRun(id);console.log("before",b?.status,b?.dryRun);try{const r=await stopRun(id,"Ronan via Claude","Ronan: not Olivia");console.log("after",r.status,r.stopRequested)}catch(e:any){console.log("ERR",e.message)}})();

import { stopRun } from "@/lib/mtproto/runs";
const ids = ["5860adfc-1381-4a64-8d4d-9c7bd67f6ace","83931f0e-a223-4015-80a4-aa4ed79c9e79","4826a6f9-fe15-4262-9db7-85b9dd79f92f","97542139-ac11-479d-b776-b8a4f2ccfdca","c31b9d1a-5ace-474e-991f-c38a59bb4027","bd9cb696-543b-40cb-8038-6f91a438bdef","dea3844d-6eb0-4767-95ba-7828369c3c5a","a7a751d3-c62e-4f6e-9966-11ce5c622dc5"];
(async()=>{for(const i of ids){try{await stopRun(i,"Ronan via Claude","replaced by dailyCap 600 runs");console.log("stopped",i.slice(0,8))}catch(e:any){console.log("skip",i.slice(0,8),e.message.slice(0,60))}}})();

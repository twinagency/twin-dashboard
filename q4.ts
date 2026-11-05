import { queueRun } from "@/lib/mtproto/runs";
const ids = ["42f734bf-f186-497c-85af-09d35c7821b6","51bdc19c-20f6-4122-8a27-be8a273a3add","5438cb61-b4fe-439d-b322-e33730f3303e","0dedee21-e726-4d5d-ba84-ff21ca8502f7","2bd66471-4a15-42c1-a8fc-dde632c8c6e3","d5dc65b1-f6ff-46df-b7d6-888ed6e9311c","753af4c9-f0c4-4b56-b979-473daac066b5","815564a3-dc27-4ae6-97a1-991e4ff42f92"];
(async()=>{for(const i of ids){await queueRun(i,"Ronan via Claude");console.log("queued",i.slice(0,8));}})().catch(e=>{console.error("ERR",e.message);process.exit(1)});

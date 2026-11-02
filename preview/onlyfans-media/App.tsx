import React, { useSyncExternalStore, useState } from "react";
import { createRoot } from "react-dom/client";
import ManualMediaAttachments from "@/components/onlyfans-preview/ManualMediaAttachments";
import { draftKey, readDraft, subscribeDraft, emptyDraft } from "@/lib/onlyfans/inbox-drafts";
import { CONTENT_SCHEMA } from "@/lib/onlyfans/content";
const rows=[["11","photo","Beach portrait"],["13","video","Studio video"],["15","photo","Garden portrait"]].map(([mediaId,kind,description])=>({mediaId,kind,description,ready:true,reason:null,width:600,height:400,durationSeconds:kind==="video"?12:null}));
window.fetch=async (input:any)=>{
 const url=String(input);
 if(url.endsWith("/vault/manage/folders"))return new Response(JSON.stringify({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:"synthetic",folders:[{folderId:"1",name:"Portraits",count:3}]}),{status:200});
 if(url.includes("/vault?"))return new Response(JSON.stringify({schemaVersion:CONTENT_SCHEMA,ok:true,accountId:"synthetic",vault:{items:rows,nextCursor:null,sync:null,connectionRevision:1}}),{status:200});
 return new Response("{}",{status:503});
};
function App(){
 const [fan,setFan]=useState("one"), key=draftKey("tester","synthetic",fan);
 const draft=useSyncExternalStore(subscribeDraft,()=>readDraft(key),emptyDraft);
 return <main className="font-sans" style={{maxWidth:900,margin:"48px auto",padding:24}}><h1 className="mb-4 text-2xl font-semibold">Message attachments</h1><div className="mb-4 flex gap-2">{["one","two"].map(id=><button key={id} className="rounded-lg border p-2" onClick={()=>setFan(id)}>Fan {id}</button>)}</div><ManualMediaAttachments key={key} accountId="synthetic" draftId={key} draft={draft} disabled={false}/><output className="mt-6 block" data-selection>{JSON.stringify({fan,ids:draft.selectedMedia.map(x=>x.mediaId),paid:draft.mediaPaid,price:draft.mediaPrice})}</output></main>
}
createRoot(document.getElementById("root")!).render(<App/>);

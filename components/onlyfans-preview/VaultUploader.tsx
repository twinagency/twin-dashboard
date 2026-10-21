"use client";
import {useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {parseUploads,parseUploadAck,type UploadRead,type UploadFile,MAX_CHUNK_BYTES} from "@/lib/onlyfans/vault-media";

const button="min-h-11 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50";
const active=new Set(["receiving","pending","running"]);
const hash=async(bytes:ArrayBuffer)=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))).map(b=>b.toString(16).padStart(2,"0")).join("");
const size=(bytes:number)=>bytes>=1024**3?`${(bytes/1024**3).toFixed(1)} GB`:`${(bytes/1024**2).toFixed(1)} MB`;
const labels:Record<string,string>={receiving:"Transferring files",pending:"Queued",running:"Uploading to OnlyFans",complete:"Finished",failed:"Needs review",interrupted:"Interrupted, review required",superseded:"Account connection changed",expired:"Cancelled or expired"};

export default function VaultUploader({accountId,connectionRevision,onChanged}:{accountId:string;connectionRevision:number|null;onChanged:()=>void}){
  const router=useRouter(),base=`/api/onlyfans-content/accounts/${encodeURIComponent(accountId)}/vault/uploads`;
  const [data,setData]=useState<UploadRead|null>(null),[files,setFiles]=useState<File[]>([]),[busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[denied,setDenied]=useState(false);
  const [progress,setProgress]=useState<{fileId:string;bytes:number}|null>(null),[statusNotice,setStatusNotice]=useState("");
  const live=useRef(false),controller=useRef<AbortController|null>(null),inFlight=useRef(false),known=useRef<Map<string,string>|null>(null);
  const createRequest=useRef<{requestId:string;expectedConnectionRevision:number;files:Array<{fileId:string;name:string;size:number}>}|null>(null);
  const reading=useRef(false),authLost=useRef(false);
  const actions=useRef(new Map<string,string>()),changed=useRef(onChanged);changed.current=onChanged;
  const request=useCallback(async(url:string,options:RequestInit={})=>{
    if(authLost.current)throw Error("Sign in again before uploading media.");
    let response:Response;
    try{response=await fetch(url,{...options,credentials:"same-origin",cache:"no-store",redirect:"error",signal:AbortSignal.any([...(controller.current?[controller.current.signal]:[]),AbortSignal.timeout(options.method==="POST"?60000:12000)])});}
    catch{throw Error("The transfer was not confirmed. Refresh its progress and resume the same upload.");}
    if([401,403].includes(response.status)){
      authLost.current=true;if(live.current){setDenied(true);setFiles([]);setData(null);setNotice("Sign in again before uploading media.");setStatusNotice("");controller.current?.abort();router.refresh();}
      throw Error("Sign in again before uploading media.");
    }
    let body:unknown;try{body=await response.json();}catch{throw Error("Upload status could not be verified. Refresh this upload before resuming.");}
    if(!response.ok)throw Error(response.status===409?"This upload changed. Refresh its status before continuing.":"The transfer was not confirmed. Refresh its progress and resume the same upload.");
    return body;
  },[router]);
  const read=useCallback(async()=>{
    if(reading.current||authLost.current)return null;reading.current=true;
    try{
      const value=parseUploads(await request(base),accountId);if(!value)throw Error("Upload status could not be verified.");
      if(!live.current)return null;
      if(known.current){for(const job of value.jobs){const previous=known.current.get(job.jobId);if(previous&&active.has(previous)&&!active.has(job.status)){changed.current();setNotice(job.status==='complete'?'Your files are uploaded. Check each file below for any remaining OnlyFans processing.':job.status==='failed'?'This batch finished with files needing review. Check each file below.':labels[job.status]??'This batch needs review.');}}}
      known.current=new Map(value.jobs.map(job=>[job.jobId,job.status]));setData(value);setStatusNotice("");return value;
    }catch(error){if(live.current&&!authLost.current)setStatusNotice(error instanceof Error?error.message:"Upload status is unavailable.");return null;}
    finally{reading.current=false;}
  },[base,accountId,request]);
  useEffect(()=>{live.current=true;controller.current=new AbortController();void read();const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!inFlight.current)void read();},3000);
    return()=>{live.current=false;controller.current?.abort();clearInterval(timer);};},[read]);
  async function command(job:string,action:"finish"|"cancel"){
    const key=job+":"+action;if(!actions.current.has(key))actions.current.set(key,crypto.randomUUID());
    const value=parseUploadAck(await request(base+`/${job}/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requestId:actions.current.get(key)})}),accountId);
    if(!value||value.jobId!==job)throw Error("The upload outcome is not confirmed. Refresh its status.");return value;
  }
  async function verifyPrefix(file:File,entry:UploadFile){
    if(!entry.receivedBytes)return;
    let digests="";
    for(let offset=0;offset<entry.receivedBytes;offset+=MAX_CHUNK_BYTES){
      if(!live.current)throw Error("Upload closed");
      digests+=await hash(await file.slice(offset,Math.min(offset+MAX_CHUNK_BYTES,entry.receivedBytes)).arrayBuffer());
    }
    if(await hash(new TextEncoder().encode(digests).buffer)!==entry.prefixDigest)throw Error(`Choose the original file for ${entry.name}. Its transferred bytes do not match this selection.`);
  }
  async function transfer(){
    if(inFlight.current||!data||!data.enabled||denied||!connectionRevision)return;
    inFlight.current=true;setBusy(true);setNotice("");
    try{
      const current=await read();if(!current)throw Error("Refresh upload status before starting a transfer.");
      let job=current.jobs.find(job=>active.has(job.status));
      if(job&&job.status!=="receiving")throw Error("The current batch is already being processed by OnlyFans.");
      if(!job){
        if(!files.length||files.length>current.maxFiles||files.some(file=>!file.size||file.size>current.maxFileBytes))throw Error("Choose files within the displayed upload limits.");
        if(!createRequest.current)createRequest.current={requestId:crypto.randomUUID(),expectedConnectionRevision:connectionRevision,files:files.map(file=>({fileId:crypto.randomUUID(),name:file.name,size:file.size}))};
        const result=parseUploadAck(await request(base,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(createRequest.current)}),accountId);
        if(!result)throw Error("The upload was not confirmed. Refresh its recorded status before retrying.");job=result;
      }
      if(files.length!==job.files.length||files.some((file,index)=>file.name!==job!.files[index].name||file.size!==job!.files[index].size))throw Error("Reselect the original files in their original order to resume this batch.");
      for(let index=0;index<files.length;index++){
        const file=files[index],entry=job.files[index];await verifyPrefix(file,entry);
        for(let offset=entry.receivedBytes;offset<file.size;offset+=MAX_CHUNK_BYTES){
          if(!live.current)throw Error("Upload closed");
          const bytes=await file.slice(offset,offset+MAX_CHUNK_BYTES).arrayBuffer(),digest=await hash(bytes);
          const result=await request(base+`/${job.jobId}/files/${entry.fileId}?offset=${offset}`,{method:"POST",headers:{"Content-Type":"application/octet-stream","X-Upload-SHA256":digest},body:bytes});
          if(!result||typeof result!=="object"||!("receivedBytes" in result)||!("accountId" in result)||!("jobId" in result)||!("fileId" in result)||result.accountId!==accountId||result.jobId!==job.jobId||result.fileId!==entry.fileId||result.receivedBytes!==offset+bytes.byteLength)throw Error("Chunk progress was not confirmed. Refresh this upload before resuming.");
          if(live.current)setProgress({fileId:entry.fileId,bytes:result.receivedBytes});
        }
      }
      await command(job.jobId,"finish");createRequest.current=null;
      if(live.current){setFiles([]);setNotice("Files transferred. This batch is queued for OnlyFans.");}
    }catch(error){if(live.current)setNotice(error instanceof Error?error.message:"The upload was not confirmed. Refresh its progress.");}
    finally{if(live.current){setBusy(false);setProgress(null);await read();}inFlight.current=false;}
  }
  async function cancel(job:string){if(inFlight.current)return;inFlight.current=true;setBusy(true);
    try{await command(job,"cancel");createRequest.current=null;setFiles([]);setNotice("Pending upload cancelled.");await read();}
    catch(error){if(live.current)setNotice(error instanceof Error?error.message:"The cancellation was not confirmed.");}
    finally{inFlight.current=false;if(live.current)setBusy(false);}}
  const current=data?.jobs.find(job=>active.has(job.status));
  return <section className="mt-4 min-w-0 rounded-xl border border-line p-4" aria-label="Upload to OnlyFans" data-of-vault-uploader>
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-sm font-semibold">Upload photos and videos</h3><button className={button} type="button" disabled={busy||denied} onClick={()=>void read()}>Refresh uploads</button></div>
    {notice?<p className="mt-3 break-words text-sm" role="status">{notice}</p>:null}
    {statusNotice&&!notice?<p className="mt-3 break-words text-sm" role="status">{statusNotice}</p>:null}
    {data&&!denied?<>
      {!data.enabled?<p className="mt-3 text-sm text-muted">Uploads are not enabled on this workspace yet.</p>:<>
        <label className="mt-4 block text-sm font-medium">Choose photos or videos<input className="mt-2 block w-full min-w-0 text-sm" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.m4v,.mov,.webm,.mkv" disabled={busy||!!current&&current.status!=="receiving"}
          onChange={event=>{setFiles(Array.from(event.target.files??[]));createRequest.current=null;setNotice("");}} /></label>
        <p className="mt-2 text-xs text-muted">Up to {data.maxFiles} files per batch, {size(data.maxFileBytes)} per file.</p>
        {files.length?<ul className="mt-3 max-h-40 space-y-1 overflow-y-auto text-xs">{files.map((file,index)=><li key={index} className="flex min-w-0 items-center gap-2"><span className="min-w-0 flex-1 break-all">{file.name} · {size(file.size)}</span>{!current&&!busy?<button type="button" className="min-h-11 text-accent" aria-label={`Remove ${file.name}`} onClick={()=>{setFiles(previous=>previous.filter((_,i)=>i!==index));createRequest.current=null;}}>Remove</button>:null}</li>)}</ul>:null}
        <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={busy||!connectionRevision||!files.length||!!current&&current.status!=="receiving"} onClick={()=>void transfer()}>{busy?"Transferring…":current?.status==="receiving"?"Resume transfer":"Upload to OnlyFans"}</button>
          {current&&["receiving","pending"].includes(current.status)?<button type="button" className={button} disabled={busy} onClick={()=>void cancel(current.jobId)}>Cancel pending upload</button>:null}</div>
      </>}
      <div className="mt-4 space-y-4">{data.jobs.slice(0,5).map(job=><div key={job.jobId} className="min-w-0 rounded-lg border border-line p-3" data-of-upload-job={job.jobId}>
        <p className="text-sm font-semibold">{labels[job.status]??"Needs review"}</p>
        {job.cleanupRequired?<p role="status" className="mt-1 text-xs text-muted">This batch needs review before another upload can start.</p>:null}
        <ul className="mt-2 space-y-3">{job.files.map(file=>{const received=progress?.fileId===file.fileId?progress.bytes:file.receivedBytes;return <li key={file.fileId} className="min-w-0 text-xs">
          <div className="flex flex-wrap justify-between gap-1"><span className="min-w-0 break-all">{file.name}</span><span>{file.status==="done"?(file.processing?"Processing in OnlyFans":"Uploaded"):file.status==="failed"?"Failed":file.status==="skipped"?"Skipped":`${size(received)} / ${size(file.size)}`}</span></div>
          {["receiving","staged","pending","uploading"].includes(file.status)?<progress className="mt-1 h-1.5 w-full accent-accent" max={file.size} value={received} aria-label={`Transfer progress for ${file.name}`} />:null}
          {file.error?<p className="mt-1 text-muted">{file.error}</p>:null}</li>;})}</ul>
      </div>)}</div>
    </>:null}
  </section>;
}

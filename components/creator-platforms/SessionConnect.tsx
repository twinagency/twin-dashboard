"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { connectionCapture, connectionOwner, object, parseEnrollment, type ConnectionEnrollmentRequest } from "@/lib/onlyfans-connections/contract";
import { parseCommandJson } from "@/lib/onlyfans/command-json";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50";
const input="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink";
export default function SessionConnect({disabled,onChanged}:{disabled:boolean;onChanged:()=>Promise<boolean>}){
  const [handle,setHandle]=useState(""),[ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const fileInput=useRef<HTMLInputElement>(null),session=useRef<{capture:Record<string,unknown>;xHash:string;ownerId:number}|null>(null);
  const retry=useRef<{handle:string;session:ConnectionEnrollmentRequest["session"]}|null>(null),active=useRef(true),reading=useRef(0);
  useEffect(()=>{active.current=true;return()=>{active.current=false;reading.current++;session.current=null;retry.current=null;};},[]);
  async function choose(file:File|undefined){const version=++reading.current;session.current=null;setReady(false);retry.current=null;if(!file)return;try{if(file.size>110000)throw new Error();const value=parseCommandJson(new TextDecoder("utf-8",{fatal:true}).decode(await file.arrayBuffer()));if(!active.current||reading.current!==version)return;
      if(!object(value)||Object.keys(value).sort().join(",")!=="capture,xHash"||!object(value.capture)||!object(value.capture.headers)||typeof value.xHash!=="string"||!/^[\x20-\x7e]{1,4096}$/.test(value.xHash))throw new Error();
      const ownerId=connectionOwner(String(value.capture.headers.user_id||""));if(!ownerId||!connectionCapture(value.capture,ownerId))throw new Error();
      session.current={capture:value.capture,xHash:value.xHash,ownerId};setReady(true);setNotice("Connection file ready. Review the account name, then connect.");
    }catch{if(active.current&&reading.current===version){setNotice("This is not a supported connection file. Ask your agency for a current OnlyFans connection file.");if(fileInput.current)fileInput.current.value="";}}}
  async function connect(){if(busy||disabled||!session.current&&!retry.current)return;setBusy(true);setNotice("Submitting your connection for verification…");
    const command=retry.current||{handle:handle.trim().replace(/^@/,""),session:{...session.current!,expiresAt:new Date(Date.now()+6*3600000).toISOString()}};
    retry.current=command;
    try{
      const response=await fetch("/creator-auth/platforms/onlyfans",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",redirect:"error",body:JSON.stringify(command)});
      const body=await response.json();
      if(response.ok&&body.ok===true&&parseEnrollment(body.enrollment)){
        retry.current=null;session.current=null;if(active.current){setReady(false);if(fileInput.current)fileInput.current.value="";setNotice("Connection submitted. Your account is being checked; its status updates here automatically.");}
      }else if([400,401,403,404,409,413,503].includes(response.status)){
        retry.current=null;if([401,403].includes(response.status)){session.current=null;if(active.current){setReady(false);if(fileInput.current)fileInput.current.value="";}}
        throw new Error(body.error||"The connection was refused. Refresh before trying again.");
      }else throw new Error("The outcome could not be confirmed. Refresh its status or retry this same request.");
    }catch(error){if(active.current)setNotice(error instanceof Error?error.message:"Connection not confirmed. Refresh before retrying.");}
    finally{await onChanged();if(active.current)setBusy(false);}
  }
  return <section className="space-y-4 border-t border-line pt-5" data-creator-session-connect><h3 className="font-semibold">Connect or refresh an account</h3><p className="text-sm text-muted">Use a current connection file from your agency’s existing OnlyFans setup. Keep the file private; it contains your account session.</p>
    <fieldset disabled={disabled||busy||!!retry.current} className="min-w-0 space-y-3"><label className="block text-sm">OnlyFans username<input className={input} value={handle} onChange={event=>setHandle(event.target.value)} autoComplete="off" placeholder="Your username"/></label><label className="block text-sm">Connection file<input ref={fileInput} className={input} type="file" accept=".json,application/json" onChange={event=>void choose(event.target.files?.[0])}/></label></fieldset>
    <button className={button} disabled={disabled||busy||!retry.current&&(!ready||!handle.trim())} onClick={()=>void connect()}>{busy?"Connecting…":retry.current?"Retry same connection request":"Connect account"}<ArrowRight size={15}/></button>
    <p className="text-xs text-muted">Connecting saves the session for verification. Your agency manages outgoing-message activation separately.</p>
    {notice?<p role="status" className="text-sm">{notice}</p>:null}
  </section>;
}

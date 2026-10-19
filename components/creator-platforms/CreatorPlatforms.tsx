"use client";
import Link from "next/link";
import styles from "./CreatorPlatforms.module.css";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PLATFORM_SCHEMA, type CreatorPlatforms as Snapshot, type PlatformChannel } from "@/lib/creator-platforms/model";
import { connectionCapture, connectionOwner, object, parseEnrollment, type ConnectionEnrollmentRequest } from "@/lib/onlyfans-connections/contract";
import { parseCommandJson } from "@/lib/onlyfans/command-json";
const button="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-ink disabled:opacity-50";
const input="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-line bg-panel px-3 py-2 text-sm text-ink";
const labels={unconfigured:"Finish connection",pending:"Checking your account",verified:"Account identity verified",failed:"Connection needs attention",expired:"Connection expired",paused:"Connection paused"};
export default function CreatorPlatforms({initial}:{initial:Snapshot}){
  const [data,setData]=useState(initial),[channels,setChannels]=useState<PlatformChannel[]>(initial.requested.length?initial.requested:initial.telegram.configured?["telegram"]:[]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");
  const active=useRef(true),generation=useRef(0);
  useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
  async function refresh(){const version=++generation.current;try{const response=await fetch("/creator-auth/platforms",{cache:"no-store",credentials:"same-origin",redirect:"error"});const next=await response.json();if(!active.current||version!==generation.current)return false;if([401,403].includes(response.status)){setData(current=>({...current,creatorName:"Your account",profileId:null,requested:[],readOnly:true,telegram:{configured:false,status:null,handle:null},onlyfans:{status:"unavailable",accounts:[],enrollments:[],error:"Sign in to your creator account again."}}));setNotice("Sign in to your creator account again.");return false;}if(!response.ok||next.schemaVersion!==PLATFORM_SCHEMA||!Array.isArray(next.requested))throw new Error();setData(next);return true;}catch{if(active.current)setNotice("Your latest connection status could not be loaded. Please refresh.");return false;}}
  useEffect(()=>{if(!data.onlyfans.enrollments.some(row=>["pending","checking"].includes(row.status)))return;const timer=window.setInterval(()=>{void refresh();},10000);return()=>window.clearInterval(timer);},[data.onlyfans.enrollments]);
  async function save(){if(busy||data.readOnly||!channels.length)return;const version=++generation.current;setBusy(true);setNotice("");try{const response=await fetch("/creator-auth/platforms",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",redirect:"error",body:JSON.stringify({channels})});const next=await response.json();if(!active.current||version!==generation.current)return;if(!response.ok||next.schemaVersion!==PLATFORM_SCHEMA||!Array.isArray(next.requested)){if([401,403].includes(response.status))await refresh();setNotice(next.error||"Your choice could not be confirmed. Refresh before retrying.");return;}setData(next);setNotice("Your platforms are saved. Continue with the connection below.");}catch{if(active.current)setNotice("Your choice could not be confirmed. Refresh before retrying.");}finally{if(active.current)setBusy(false);}}
  return <div className={`${styles.root} min-w-0 space-y-6`} data-creator-platforms>
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="font-heading text-3xl font-semibold tracking-tight">Your platforms</h1><p className="mt-2 text-sm text-muted">One creator profile. Choose where you want to connect with fans.</p></div><button className={button} disabled={busy} onClick={()=>void refresh()}><RefreshCw size={16}/>Refresh status</button></div>
    {data.readOnly?<p role="status" className="text-sm text-muted">This is a read-only view of your platform setup.</p>:null}
    <Card className="space-y-5 p-5 sm:p-6"><div><h2 className="text-lg font-semibold">Where would you like to connect?</h2><p className="mt-1 text-sm text-muted">Your saved profile, content and agency stay with this account.</p></div>
      <fieldset disabled={busy||data.readOnly} className="grid gap-3 sm:grid-cols-2"><legend className="sr-only">Choose your platforms</legend>{(["telegram","onlyfans"] as const).map(channel=><label key={channel} className="flex min-h-20 cursor-pointer items-center gap-4 rounded-xl border border-line bg-panel p-4"><input type="checkbox" className="size-5 accent-[var(--color-accent)]" checked={channels.includes(channel)} onChange={event=>setChannels(current=>event.target.checked?[...current,channel]:current.filter(value=>value!==channel))}/><img src={`/brand/platforms/${channel}.svg`} alt="" className="h-8 w-8"/><span className="font-semibold">{channel==="telegram"?"Telegram":"OnlyFans"}</span></label>)}</fieldset>
      <button className={`${button} bg-accent text-white`} disabled={busy||data.readOnly||!channels.length} onClick={()=>void save()}>{busy?"Saving…":"Save platforms"}<ArrowRight size={16}/></button>
      {notice?<p role="status" className="text-sm">{notice}</p>:null}
    </Card>
    {(data.requested.includes("telegram")||data.telegram.configured)?<Card className="space-y-4 p-5 sm:p-6" data-platform-telegram><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Telegram</h2><span className="text-sm text-muted">{data.telegram.configured?data.telegram.status==="active"?"Configured":"Paused / needs review":"Setup requested"}</span></div>
      <p className="text-sm text-muted">{data.telegram.configured?data.telegram.handle?`Your Telegram profile: @${data.telegram.handle.replace(/^@/,"")}`:"Your Telegram creator profile is configured.":"Your existing questionnaire and content are used for Telegram setup. Your team can finish connecting your creator profile."}</p>
      <div className="flex flex-wrap gap-3"><Link className={button} href={data.telegram.configured?"/creator/edit":"/creator/onboarding?step=questionnaire"}>Your profile<ArrowRight size={15}/></Link><Link className={button} href={data.telegram.configured?"/creator/ppvs":"/creator/onboarding?step=content"}>Your content<ArrowRight size={15}/></Link></div>
    </Card>:null}
    {(data.requested.includes("onlyfans")||data.onlyfans.accounts.length>0)?<Card className="space-y-5 p-5 sm:p-6" data-platform-onlyfans><div><h2 className="text-xl font-semibold">OnlyFans</h2><p className="mt-2 text-sm text-muted">Connect an account to this creator profile. Your agency’s existing account settings are preserved when you refresh its connection.</p></div>
      {data.onlyfans.status==="unavailable"?<p role="status" className="text-sm">{data.onlyfans.error}</p>:<>
        {data.onlyfans.enrollments.filter(row=>row.status!=="accepted").map(row=><p key={row.id} role="status" className="rounded-xl border border-line p-4 text-sm" data-connection-request={row.status}>{["pending","checking"].includes(row.status)?"Checking your OnlyFans session. Your account appears below after its identity is verified.":row.status==="expired"?"Your connection request expired. Use a current connection file to try again.":"Your session could not be verified. Ask your agency for a current connection file, then retry."}</p>)}
        {data.onlyfans.accounts.map(account=><div key={account.id} className="space-y-3 rounded-xl border border-line p-4" data-platform-account={account.id}><div className="flex flex-wrap justify-between gap-3"><strong>@{account.handle.replace(/^@/,"")}</strong><span className="text-sm text-muted">{account.connection?labels[account.connection.status]:"Status unavailable"}</span></div>
          {account.connection?.status==="verified"?<p className="flex items-center gap-2 text-sm"><CheckCircle2 size={16}/>Account identity checked. Conversation history appears as it syncs.</p>:null}
          <p className="text-xs text-muted">{account.connection?.outgoingEnabled?"Outgoing messages enabled":"Outgoing messages disabled"}{account.connection?.expiresAt?` · Connection expires ${new Date(account.connection.expiresAt).toLocaleString()}`:""}</p>
          <Link className={button} href={`/creator/onlyfans/inbox?account=${encodeURIComponent(account.id)}`}>View conversations<ArrowRight size={15}/></Link>
        </div>)}
        <SessionConnect key={data.profileId||"none"} disabled={busy||data.readOnly||!data.profileId} onChanged={refresh}/>
      </>}
    </Card>:null}
  </div>;
}

function SessionConnect({disabled,onChanged}:{disabled:boolean;onChanged:()=>Promise<boolean>}){
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

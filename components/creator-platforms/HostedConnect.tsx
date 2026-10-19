"use client";
import { useEffect, useRef, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import styles from "./CreatorPlatforms.module.css";

type Phase = "starting" | "signin" | "waiting" | "code" | "face" | "checking" | "error";
const endpoint = "/creator-auth/platforms/onlyfans/hosted";
export default function HostedConnect({accountId,onChanged,onClose}:{accountId:string|null;onChanged:()=>Promise<boolean>;onClose:()=>void}) {
  const [phase,setPhase]=useState<Phase>("starting"),[notice,setNotice]=useState(""),[code,setCode]=useState(""),[face,setFace]=useState("");
  const [busy,setBusy]=useState(false),running=useRef(false),active=useRef(false),sdk=useRef<{closeOnlyFansAuthentication:()=>void}|null>(null);
  const changed=useRef(onChanged);changed.current=onChanged;
  const deadline=useRef(Date.now()+15*60*1000);
  async function command(body:Record<string,string>,signal?:AbortSignal){
    const response=await fetch(endpoint,{method:"POST",credentials:"same-origin",redirect:"error",cache:"no-store",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:signal||AbortSignal.timeout(20000)});
    const result=await response.json();if(!response.ok||result.ok!==true)throw new Error(typeof result.error==="string"?result.error:"Your connection could not be confirmed. Refresh its status before trying again.");return result;
  }
  function resultPhase(result:{phase?:string;url?:string}) {
    if(!active.current)return;
    if(result.phase==="face"&&result.url){setFace(result.url);setPhase("face");}
    else if(result.phase==="code"){setPhase("code");}
    else if(result.phase==="checking"){setPhase("checking");void changed.current();}
    else setPhase("waiting");
  }
  useEffect(()=>{
    active.current=true;const controller=new AbortController();
    // Delay one microtask so React's development effect replay cannot create
    // two paid provider sessions. Unknown start responses are never retried.
    void Promise.resolve().then(async()=>{
      if(!active.current||controller.signal.aborted||running.current)return;running.current=true;
      try {
        const result=await command(accountId?{action:"reconnect",accountId}:{action:"start"},AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]));
        if(!active.current)return;
        if(result.kind==="reconnect"){resultPhase(result);return;}
        if(result.kind!=="signin"||typeof result.token!=="string")throw new Error("Your sign-in could not be opened.");
        const auth=await import("@onlyfansapi/auth");if(!active.current)return;sdk.current=auth;setPhase("signin");
        auth.startOnlyFansAuthentication(result.token,{
          onSuccess:()=>{auth.closeOnlyFansAuthentication();if(active.current){setPhase("checking");void changed.current();}},
          onError:()=>{auth.closeOnlyFansAuthentication();if(active.current){setPhase("error");setNotice("Sign-in could not be completed. Refresh your status before trying again.");}},
        });
      }catch(error){if(active.current&&!controller.signal.aborted){setPhase("error");setNotice(error instanceof Error?error.message:"Your sign-in could not be opened.");}}
    });
    return()=>{active.current=false;controller.abort();sdk.current?.closeOnlyFansAuthentication();};
  },[accountId]);
  useEffect(()=>{
    if(!accountId||!["waiting","code","face"].includes(phase))return;
    let stopped=false,inFlight=false;const controller=new AbortController();
    const timer=window.setInterval(async()=>{
      if(stopped||inFlight||busy)return;
      if(Date.now()>deadline.current){setPhase("error");setNotice("This sign-in attempt expired. Refresh your status before starting again.");return;}
      inFlight=true;
      try{const result=await command({action:"status"},AbortSignal.any([controller.signal,AbortSignal.timeout(20000)]));if(!stopped)resultPhase(result);}
      catch(error){if(!stopped){setPhase("error");setNotice(error instanceof Error?error.message:"Your connection could not be confirmed.");}}
      finally{inFlight=false;}
    },2500);
    return()=>{stopped=true;controller.abort();window.clearInterval(timer);};
  },[accountId,phase,busy]);
  async function verify(action:"code"|"face-done"){
    if(busy)return;setBusy(true);setNotice("");
    try{const result=await command(action==="code"?{action,code}:{action});resultPhase(result);setCode("");}
    catch(error){if(active.current)setNotice(error instanceof Error?error.message:"Verification could not be confirmed.");}
    finally{if(active.current)setBusy(false);}
  }
  return <div className={styles.hostedSetup} role="region" aria-label="OnlyFans sign-in">
    <div className={styles.dialogHeader}><strong>Connect your OnlyFans</strong><button type="button" className={styles.closeButton} aria-label="Close connection setup" onClick={onClose}><X size={20}/></button></div>
    <p role="status">{phase==="starting"?"Opening your sign-in…":phase==="signin"?"Sign in to your OnlyFans account to continue.":phase==="checking"?"Checking your account. This page will update when it’s connected.":phase==="code"?"Enter the verification code from OnlyFans.":phase==="face"?"OnlyFans needs you to verify your identity.":phase==="error"?"Your account hasn’t been confirmed yet.":"Waiting for OnlyFans…"}</p>
    {["starting","waiting","checking"].includes(phase)&&<LoaderCircle size={20} className={styles.spinner} aria-hidden="true"/>}
    {phase==="code"&&<form onSubmit={event=>{event.preventDefault();void verify("code");}}><label htmlFor="onlyfans-code">Verification code</label><input id="onlyfans-code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{4,8}" maxLength={8} value={code} onChange={event=>setCode(event.target.value.replace(/\D/g,""))} required/><button className={styles.secondaryButton} disabled={busy||!/^\d{4,8}$/.test(code)}>Continue</button></form>}
    {phase==="face"&&<div><a className={styles.textLink} href={face} target="_blank" rel="noopener noreferrer">Verify with OnlyFans</a><button className={styles.secondaryButton} disabled={busy} onClick={()=>void verify("face-done")}>I’ve finished verification</button></div>}
    {notice&&<p role="alert">{notice}</p>}
    {phase==="error"&&<button className={styles.textLink} onClick={()=>void onChanged()}>Refresh connection status</button>}
  </div>;
}

"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";
import BrowserConnect from "./BrowserConnect";
import HostedConnect from "./HostedConnect";
import SessionConnect from "./SessionConnect";
import styles from "./CreatorPlatforms.module.css";
import { PLATFORM_SCHEMA, type CreatorPlatforms as Snapshot, type PlatformChannel } from "@/lib/creator-platforms/model";

export default function CreatorPlatforms({initial}:{initial:Snapshot}) {
  const [data,setData]=useState(initial),[busy,setBusy]=useState<PlatformChannel|null>(null);
  const [notice,setNotice]=useState(""),[connecting,setConnecting]=useState(false);
  const [connectingAccount,setConnectingAccount]=useState<string|null>(null);
  const active=useRef(true),generation=useRef(0),submitting=useRef(false);
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
  const existingAttempts=useRef(new Set<string>());
  useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;};},[]);
  const refresh=useCallback(async()=>{
    const version=++generation.current;
    try {
      const response=await fetch("/creator-auth/platforms",{cache:"no-store",credentials:"same-origin",redirect:"error"});
      const next=await response.json();
      if(!active.current||version!==generation.current)return false;
      if([401,403].includes(response.status)){
        setData(current=>({...current,creatorName:"Your account",profileId:null,requested:[],readOnly:true,telegram:{configured:false,status:null,handle:null},onlyfans:{status:"unavailable",accounts:[],enrollments:[],error:"Sign in to your creator account again."}}));
        setConnecting(false);setNotice("Sign in to your creator account again.");return false;
      }
      if(!response.ok||next.schemaVersion!==PLATFORM_SCHEMA||!Array.isArray(next.requested))throw new Error();
      setData(next);
      setNotice(current=>current.startsWith("Your OnlyFans is connected.")&&!next.onlyfans.accounts.some((account:Snapshot["onlyfans"]["accounts"][number])=>account.connection?.status==="verified"&&!!account.connection.expiresAt&&Date.parse(account.connection.expiresAt)>Date.now())?"":current);
      return true;
    } catch {if(active.current)setNotice("Your latest connection status could not be loaded. Please try again.");return false;}
  },[]);
  const pending=data.onlyfans.enrollments.some(row=>["pending","checking"].includes(row.status));
  useEffect(()=>{
    if(!connecting)return;
    const completed=data.onlyfans.enrollments.some(row=>row.status==="accepted"&&!existingAttempts.current.has(row.id)&&data.onlyfans.accounts.some(account=>account.id===row.accountId&&account.connection?.status==="verified"&&!!account.connection.expiresAt&&Date.parse(account.connection.expiresAt)>Date.now()));
    if(completed){setConnecting(false);setNotice("Your OnlyFans is connected.");opener.current?.focus();}
  },[connecting,data.onlyfans.enrollments,data.onlyfans.accounts]);
  useEffect(()=>{
    if(!pending&&!connecting)return;
    const timer=window.setInterval(()=>{if(!submitting.current)void refresh();},10000);
    return()=>window.clearInterval(timer);
  },[pending,connecting,refresh]);
  useEffect(()=>{
    const check=()=>{if(document.visibilityState==="visible"&&!submitting.current)void refresh();};
    window.addEventListener("focus",check);return()=>window.removeEventListener("focus",check);
  },[refresh]);
  useEffect(()=>{
    const element=dialog.current;
    const overflow=document.documentElement.style.overflow;
    if(connecting)document.documentElement.style.overflow="hidden";
    if(connecting&&element&&!element.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;element.showModal();}
    else if(!connecting&&element?.open)element.close();
    return()=>{document.documentElement.style.overflow=overflow;};
  },[connecting]);

  async function choose(channel:PlatformChannel){
    if(submitting.current||data.readOnly)return;
    submitting.current=true;setBusy(channel);setNotice("");
    const version=++generation.current;
    try {
      let current=data;
      if(!data.profileId||!data.requested.includes(channel)){
        // Add the choice to the existing profile; preserve the other platform.
        const channels=(["telegram","onlyfans"] as const).filter(value=>value===channel||data.requested.includes(value)||(value==="telegram"?data.telegram.configured:data.onlyfans.accounts.length>0));
        const response=await fetch("/creator-auth/platforms",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",redirect:"error",body:JSON.stringify({channels})});
        const next=await response.json();
        if(!active.current||version!==generation.current)return;
        if(!response.ok||next.schemaVersion!==PLATFORM_SCHEMA||!next.profileId||!Array.isArray(next.requested)){
          if([401,403].includes(response.status))await refresh();
          throw new Error("Your setup could not be confirmed. Refresh your status before trying again.");
        }
        setData(next);
        current=next;
      }
      if(!active.current)return;
      if(channel==="onlyfans"){
        existingAttempts.current=new Set(current.onlyfans.enrollments.map(row=>row.id));
        const reconnect=current.onlyfans.accounts.find(account=>account.connection?.status!=="verified"||!account.connection.expiresAt||Date.parse(account.connection.expiresAt)<=Date.now());
        setConnectingAccount(reconnect?.id??null);setConnecting(true);
      }
      else setNotice("Your Telegram setup is saved. Continue with your existing profile and content below.");
    } catch(error){if(active.current)setNotice(error instanceof Error?error.message:"Setup could not be confirmed. Please refresh.");}
    finally{submitting.current=false;if(active.current)setBusy(null);}
  }
  function closeConnection(){setConnecting(false);opener.current?.focus();void refresh();}
  const telegramSelected=data.requested.includes("telegram")||data.telegram.configured;
  const isConnected=(account:Snapshot["onlyfans"]["accounts"][number])=>account.connection?.status==="verified"&&!!account.connection.expiresAt&&Date.parse(account.connection.expiresAt)>Date.now();
  const verified=data.onlyfans.accounts.filter(isConnected);
  const needsReconnect=data.onlyfans.accounts.length>0&&verified.length!==data.onlyfans.accounts.length;
  const telegramHref=data.telegram.configured?"/creator/edit":"/creator/onboarding?step=questionnaire";
  const initials=data.creatorName.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  return <div className={styles.root} data-creator-platforms>
    <header className={styles.hero}><div className={styles.heroCopy}>
      <p className={styles.eyebrow}>YOUR SPACE</p><h1>Your platforms</h1>
      <p className={styles.tagline}>Bring your world together.</p><p className={styles.intro}>Connect your accounts. Keep creating.</p>
      <div className={styles.profile}><span className={styles.avatar} aria-hidden="true">{initials}</span><div><strong>{data.creatorName}</strong><span>Your creator profile</span></div></div>
    </div><span className={styles.heroArt} aria-hidden="true"/></header>
    {data.readOnly&&<p role="status" className={styles.notice}>This is a read-only view of your platform setup.</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}</p>}
    <div className={styles.cards}>
      <section className={styles.card} data-platform-onlyfans>
        <div className={styles.cardBrand}><img src="/brand/platforms/onlyfans.svg" width={48} height={48} alt="" aria-hidden="true"/><h2>OnlyFans</h2>
          {verified.length>0&&!needsReconnect&&<span className={styles.badge} data-state="connected"><Check size={13}/>Connected</span>}
        </div>
        <div className={styles.cardCopy}><h3>{verified.length>0&&!needsReconnect?"Your OnlyFans is connected.":needsReconnect?"Let’s reconnect your account.":"Your OnlyFans, in your space."}</h3><p>{verified.length>0&&!needsReconnect?"Your account is linked to your existing Twin profile.":"Bring your account into your Twin space."}</p></div>
        {data.onlyfans.status==="unavailable"&&<p role="status" className={styles.inlineNotice}>{data.onlyfans.error}</p>}
        {data.onlyfans.enrollments.slice(0,1).filter(row=>row.status!=="accepted").map(row=><p key={row.id} role="status" className={styles.inlineNotice} data-connection-request={row.status}>
          {["pending","checking"].includes(row.status)?<><LoaderCircle size={16} className={styles.spinner}/>Checking your account…</>:row.status==="expired"?"Your connection attempt expired. Try connecting again.":"We couldn’t verify your account. Please try again."}
        </p>)}
        <button className={styles.primaryButton} disabled={!!busy||data.readOnly||pending||data.onlyfans.status==="unavailable"} onClick={()=>void choose("onlyfans")}>
          {busy==="onlyfans"?<><LoaderCircle size={17} className={styles.spinner}/>Getting ready…</>:pending?"Checking your account…":needsReconnect?<>Reconnect OnlyFans<ArrowRight size={17}/></>:verified.length?<>Connect another account<ArrowRight size={17}/></>:<>Connect OnlyFans<ArrowRight size={17}/></>}
        </button>
        <p className={styles.helper}>{verified.length?"Your saved profile and content stay with you.":"Sign in to continue."}</p>
        {data.onlyfans.accounts.map(account=>{
          const connected=isConnected(account);
          const status=!account.connection?"Status unavailable":connected?"Connected":account.connection.status==="pending"?"Checking account":account.connection.status==="paused"?"Paused":"Reconnect needed";
          return <div key={account.id} className={styles.account} data-platform-account={account.id}>
            <div className={styles.accountTitle}><strong>@{account.handle.replace(/^@/,"")}</strong><span data-connection-state={connected?"connected":"attention"}>{status}</span></div>
            <p>{connected?"Conversation history appears as it syncs.":"Refresh the connection to continue."}</p>
            <Link className={styles.textLink} href={`/creator/onlyfans/inbox?account=${encodeURIComponent(account.id)}`}>View conversations<ChevronRight size={15}/></Link>
            <p className={styles.helper}>{account.connection?.outgoingEnabled?"Outgoing messages enabled":"Outgoing messages disabled"}</p>
          </div>;
        })}
      </section>
      <section className={styles.card} data-platform-telegram>
        <div className={styles.cardBrand}><img src="/brand/platforms/telegram.svg" width={48} height={48} alt="" aria-hidden="true"/><h2>Telegram</h2>
          {data.telegram.configured&&<span className={styles.badge} data-state={data.telegram.status==="active"?"connected":"attention"}>{data.telegram.status==="active"?<><Check size={13}/>Connected</>:"Paused"}</span>}
        </div>
        <div className={styles.cardCopy}><h3>Your Telegram space.</h3><p>{data.telegram.configured?data.telegram.handle?`Your Telegram profile: @${data.telegram.handle.replace(/^@/,"")}`:"Your Telegram profile is configured.":"Connect your existing bot or set up your first one."}</p></div>
        {data.telegram.configured||telegramSelected?<Link className={styles.secondaryButton} href={telegramHref}>{data.telegram.configured?"Open Telegram setup":"Continue Telegram setup"}<ArrowRight size={17}/></Link>:<button className={styles.secondaryButton} disabled={!!busy||data.readOnly} onClick={()=>void choose("telegram")}>{busy==="telegram"?<><LoaderCircle size={17} className={styles.spinner}/>Getting ready…</>:<>Set up Telegram<ArrowRight size={17}/></>}</button>}
        <p className={styles.helper}>{data.telegram.configured?"Your existing profile and content are already here.":telegramSelected?"Setup requested. Continue with your existing profile.":"We’ll use your existing profile and content."}</p>
        {telegramSelected&&<div className={styles.telegramLinks}><Link className={styles.textLink} href={telegramHref}>Your profile<ChevronRight size={15}/></Link><Link className={styles.textLink} href={data.telegram.configured?"/creator/ppvs":"/creator/onboarding?step=content"}>Your content<ChevronRight size={15}/></Link></div>}
      </section>
    </div>
    <footer className={styles.footer}><p><Sparkles size={19} aria-hidden="true"/>Your profile, content and agency stay together.</p><div><button className={styles.textLink} disabled={!!busy} onClick={()=>void refresh()}><RefreshCw size={14}/>Refresh status</button><Link className={styles.textLink} href="/creator">Back to my space<ArrowRight size={14}/></Link></div></footer>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="connect-heading" onCancel={closeConnection} onClose={()=>{if(connecting)closeConnection();}}>
      {connecting&&<div className={styles.dialogBody}><div className={styles.dialogHeader}><div className={styles.cardBrand}><img src="/brand/platforms/onlyfans.svg" width={40} height={40} alt="" aria-hidden="true"/><h2 id="connect-heading">Connect OnlyFans</h2></div><button className={styles.closeButton} aria-label="Close connection setup" onClick={closeConnection}><X size={21}/></button></div>
        <div className={styles.connectionContent}>{data.onlyfans.signIn==="hosted"?<HostedConnect key={data.profileId||"none"} profileId={data.profileId||""} accountId={connectingAccount} disabled={data.readOnly||!data.profileId} onChanged={refresh}/>:<BrowserConnect key={data.profileId||"none"} profileId={data.profileId||""} disabled={data.readOnly||!data.profileId} onChanged={refresh} autoStart/>}</div>
        <details className={styles.assisted}><summary>Agency-assisted connection</summary><SessionConnect disabled={data.readOnly||!data.profileId} onChanged={refresh}/></details>
      </div>}
    </dialog>
  </div>;
}

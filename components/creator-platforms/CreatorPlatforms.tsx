"use client";
import Link from "next/link";
import { useDashboardAccess } from "@/components/DashboardAccessProvider";
import PlatformIcon from "@/components/PlatformIcon";
import { isMoxy } from "@/lib/agency-brand";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, Check, ChevronRight, LoaderCircle, RefreshCw, Sparkles, X } from "lucide-react";
import BrowserConnect from "./BrowserConnect";
import HostedConnect from "./HostedConnect";
import {signInRequestSignal} from "@/lib/onlyfans-sign-in/request-signal";
import SessionConnect from "./SessionConnect";
import styles from "./CreatorPlatforms.module.css";
import { CONNECTION_LABELS, CONNECTION_DETAILS } from "@/lib/onlyfans-connections/presentation";
import ConnectionSyncStatus from "@/components/onlyfans-preview/ConnectionSyncStatus";
import { activePlatformEnrollment, parseCreatorPlatforms, platformConnectionState, type CreatorPlatforms as Snapshot, type PlatformChannel } from "@/lib/creator-platforms/model";

export default function CreatorPlatforms({initial}:{initial:Snapshot}) {
  const { agencyName, onlyFansOnly } = useDashboardAccess();
  const moxy = isMoxy(agencyName);
  const [data,setData]=useState(initial),[busy,setBusy]=useState<PlatformChannel|null>(null);
  const [notice,setNotice]=useState(""),[connecting,setConnecting]=useState(false);
  const [statusFresh,setStatusFresh]=useState(true),[now,setNow]=useState(()=>Date.now()),[refreshing,setRefreshing]=useState(false);
  const [connectingAccount,setConnectingAccount]=useState<string|null>(null);
  const active=useRef(true),generation=useRef(0),submitting=useRef(false);
  const dialog=useRef<HTMLDialogElement>(null),opener=useRef<HTMLElement|null>(null);
  const existingAttempts=useRef(new Set<string>());
  const refreshController=useRef<AbortController|null>(null),refreshRunning=useRef(false);
  useEffect(()=>{active.current=true;return()=>{active.current=false;generation.current++;refreshController.current?.abort();};},[]);
  useEffect(()=>{const timer=window.setInterval(()=>setNow(Date.now()),15000);return()=>window.clearInterval(timer);},[]);
  const refresh=useCallback(async()=>{
    if(refreshRunning.current)return false;
    refreshRunning.current=true;setRefreshing(true);const controller=new AbortController();refreshController.current=controller;
    const version=++generation.current,request=signInRequestSignal(20000,[controller.signal]);
    try {
      const response=await fetch("/creator-auth/platforms",{cache:"no-store",credentials:"same-origin",redirect:"error",signal:request.signal});
      const next=parseCreatorPlatforms(await response.json().catch(()=>null));
      if(!active.current||version!==generation.current)return false;
      if([401,403].includes(response.status)){
        setData(current=>({...current,creatorName:"Your account",profileId:null,requested:[],readOnly:true,telegram:{configured:false,status:null,handle:null},onlyfans:{status:"unavailable",accounts:[],enrollments:[],error:"Sign in to your creator account again."}}));
        setConnecting(false);setStatusFresh(false);setNotice("Sign in to your creator account again.");return false;
      }
      if(!response.ok||!next)throw new Error();
      setData(next);setStatusFresh(true);setNow(Date.now());
      setNotice(current=>current==="Your latest connection status could not be loaded. Please try again."||current.startsWith("Your OnlyFans is connected.")&&!next.onlyfans.accounts.some(account=>platformConnectionState(account)==="connected")?"":current);
      return true;
    } catch {if(active.current&&version===generation.current){setStatusFresh(false);setNotice("Your latest connection status could not be loaded. Please try again.");}return false;}
    finally{request.dispose();refreshRunning.current=false;if(active.current)setRefreshing(false);}
  },[]);
  const pending=data.onlyfans.enrollments.some(row=>activePlatformEnrollment(row,now));
  useEffect(()=>{if(!statusFresh||!data.onlyfans.accounts.some(account=>platformConnectionState(account,now)==="connected"))setNotice(current=>current.startsWith("Your OnlyFans is connected.")?"":current);},[statusFresh,now,data.onlyfans.accounts]);
  useEffect(()=>{
    if(!connecting)return;
    const completed=statusFresh&&data.onlyfans.enrollments.some(row=>row.status==="accepted"&&!existingAttempts.current.has(row.id)&&data.onlyfans.accounts.some(account=>account.id===row.accountId&&platformConnectionState(account,now)==="connected"));
    if(completed){setConnecting(false);setNotice("Your OnlyFans is connected.");opener.current?.focus();}
  },[connecting,data.onlyfans.enrollments,data.onlyfans.accounts,statusFresh,now]);
  useEffect(()=>{
    if(!pending&&!connecting&&!data.onlyfans.accounts.length)return;
    const timer=window.setInterval(()=>{if(document.visibilityState==='visible'&&!submitting.current)void refresh();},pending||connecting?10000:30000);
    return()=>window.clearInterval(timer);
  },[pending,connecting,refresh,data.onlyfans.accounts.length]);
  useEffect(()=>{
    const check=()=>{if(document.visibilityState==="visible"&&!submitting.current)void refresh();};
    window.addEventListener("focus",check);document.addEventListener("visibilitychange",check);return()=>{window.removeEventListener("focus",check);document.removeEventListener("visibilitychange",check);};
  },[refresh]);
  useEffect(()=>{
    const element=dialog.current;
    const overflow=document.documentElement.style.overflow;
    if(connecting)document.documentElement.style.overflow="hidden";
    if(connecting&&element&&!element.open){opener.current=document.activeElement instanceof HTMLElement?document.activeElement:null;element.showModal();}
    else if(!connecting&&element?.open)element.close();
    return()=>{document.documentElement.style.overflow=overflow;};
  },[connecting]);

  async function choose(channel:PlatformChannel,accountId?:string){
    if(submitting.current||data.readOnly||channel==="onlyfans"&&!statusFresh)return;
    submitting.current=true;setBusy(channel);setNotice("");
    const version=++generation.current;
    try {
      let current=data;
      if(!data.profileId||!data.requested.includes(channel)){
        // Add the choice to the existing profile; preserve the other platform.
        const channels=(["telegram","onlyfans"] as const).filter(value=>value===channel||data.requested.includes(value)||(value==="telegram"?data.telegram.configured:data.onlyfans.accounts.length>0));
        const response=await fetch("/creator-auth/platforms",{method:"POST",headers:{"Content-Type":"application/json"},credentials:"same-origin",redirect:"error",body:JSON.stringify({channels})});
        const next=parseCreatorPlatforms(await response.json().catch(()=>null));
        if(!active.current||version!==generation.current)return;
        if(!response.ok||!next||!next.profileId){
          if([401,403].includes(response.status))await refresh();
          throw new Error("Your setup could not be confirmed. Refresh your status before trying again.");
        }
        setData(next);
        current=next;
      }
      if(!active.current)return;
      if(channel==="onlyfans"){
        existingAttempts.current=new Set(current.onlyfans.enrollments.map(row=>row.id));
        const reconnect=accountId?current.onlyfans.accounts.find(account=>account.id===accountId):current.onlyfans.accounts.find(account=>["reconnect","attention"].includes(platformConnectionState(account)));
        setConnectingAccount(reconnect?.id??null);setConnecting(true);
      }
      else setNotice("Your Telegram setup is saved. Continue with your existing profile and content below.");
    } catch(error){if(active.current)setNotice(error instanceof Error?error.message:"Setup could not be confirmed. Please refresh.");}
    finally{submitting.current=false;if(active.current)setBusy(null);}
  }
  function closeConnection(){setConnecting(false);opener.current?.focus();void refresh();}
  const telegramSelected=data.requested.includes("telegram")||data.telegram.configured;
  const isConnected=(account:Snapshot["onlyfans"]["accounts"][number])=>platformConnectionState(account,now)==="connected";
  const verified=data.onlyfans.accounts.filter(isConnected);
  const needsReconnect=data.onlyfans.accounts.some(account=>["reconnect","attention"].includes(platformConnectionState(account,now)));
  const retrying=data.onlyfans.accounts.some(account=>["checking","retrying"].includes(platformConnectionState(account,now)));
  const paused=data.onlyfans.accounts.length>0&&data.onlyfans.accounts.every(account=>platformConnectionState(account,now)==="paused");
  const telegramHref=data.telegram.configured?"/creator/edit":"/creator/onboarding?step=questionnaire";
  const initials=data.creatorName.trim().split(/\s+/).slice(0,2).map(part=>part[0]).join("").toUpperCase();
  return <div className={styles.root} data-creator-platforms>
    <header className={styles.hero}><div className={styles.heroCopy}>
      <p className={styles.eyebrow}>YOUR SPACE</p><h1>Your platforms</h1>
      <p className={styles.tagline}>Bring your world together.</p><p className={styles.intro}>Connect your accounts. Keep creating.</p>
      <div className={styles.profile}><span className={styles.avatar} aria-hidden="true">{initials}</span><div><strong>{data.creatorName}</strong><span>Your creator profile</span></div></div>
    </div><span className={styles.heroArt} aria-hidden="true"/></header>
    {data.readOnly&&<p role="status" className={styles.notice}>This is a read-only view of your platform setup.</p>}
    {notice&&<p role="status" className={styles.notice}>{notice}{notice==="Sign in to your creator account again."&&<> <Link href="/creator/login">Sign in again</Link></>}</p>}
    <div className={styles.cards}>
      <section className={styles.card} data-platform-onlyfans>
        <div className={styles.cardBrand}><PlatformIcon platform="onlyfans" size={48} /><h2>OnlyFans</h2>
          {statusFresh&&verified.length>0&&!needsReconnect&&!retrying&&<span className={styles.badge} data-state="connected"><Check size={13}/>Connected</span>}
          {statusFresh&&retrying&&<span className={styles.badge} data-state="attention">Retrying connection</span>}
          {statusFresh&&paused&&<span className={styles.badge} data-state="attention">Paused</span>}
        </div>
        <div className={styles.cardCopy}><h3>{!statusFresh?"Let’s check your connection.":retrying?"Your connection is being checked.":paused?"Your OnlyFans is paused.":verified.length>0&&!needsReconnect?"Your OnlyFans is connected.":needsReconnect?"Let’s reconnect your account.":"Your OnlyFans, in your space."}</h3><p>{retrying?moxy ? "Your saved connection is being checked automatically." : "Twin is checking the saved login automatically.":paused?"Your account is linked. Your agency controls when replies resume.":verified.length>0&&!needsReconnect?(moxy ? "Your account is linked to your Moxy profile." : "Your account is linked to your existing Twin profile."):(moxy ? "Connect your account to your Moxy creator studio." : "Bring your account into your Twin space.")}</p></div>
        {data.onlyfans.status==="unavailable"&&<p role="status" className={styles.inlineNotice}>{data.onlyfans.error}</p>}
        {data.onlyfans.enrollments.slice(0,1).filter(row=>row.status!=="accepted").map(row=><p key={row.id} role="status" className={styles.inlineNotice} data-connection-request={row.status}>
          {activePlatformEnrollment(row,now)?<><LoaderCircle size={16} className={styles.spinner}/>Checking your account…</>:["expired","pending","checking"].includes(row.status)?"Your connection attempt expired. Try connecting again.":"We couldn’t verify your account. Please try again."}
        </p>)}
        <button className={styles.primaryButton} disabled={!!busy||data.readOnly||pending||!statusFresh||data.onlyfans.status==="unavailable"} onClick={()=>void choose("onlyfans")}>
          {busy==="onlyfans"?<><LoaderCircle size={17} className={styles.spinner}/>Getting ready…</>:pending?"Checking your account…":needsReconnect?<>Reconnect OnlyFans<ArrowRight size={17}/></>:data.onlyfans.accounts.length?<>Connect another account<ArrowRight size={17}/></>:<>Connect OnlyFans<ArrowRight size={17}/></>}
        </button>
        <p className={styles.helper}>{data.onlyfans.accounts.length?"Your saved profile and content stay with you.":"Sign in to continue."}</p>
        {data.onlyfans.accounts.map(account=>{
          const state=platformConnectionState(account,now),connected=statusFresh&&isConnected(account);
          const status=!statusFresh?"Status needs refresh":CONNECTION_LABELS[state];
          return <div key={account.id} className={styles.account} data-platform-account={account.id}>
            <div className={styles.accountTitle}><strong>@{account.handle.replace(/^@/,"")}</strong><span data-connection-state={connected?"connected":"attention"}>{status}</span></div>
            <p>{!statusFresh?"Refresh status to confirm this account’s latest connection.":CONNECTION_DETAILS[state]}</p>
            {statusFresh&&account.connection?<ConnectionSyncStatus connection={account.connection} state={state}/>:null}
            {statusFresh&&["reconnect","attention"].includes(state)&&<button type="button" className={styles.textLink} disabled={!!busy||data.readOnly||pending} onClick={()=>void choose("onlyfans",account.id)} aria-label={`Reconnect @${account.handle.replace(/^@/,"")}`}>Reconnect this account<RefreshCw size={14}/></button>}
            <Link className={styles.textLink} href={`/creator/onlyfans/inbox?account=${encodeURIComponent(account.id)}`}>View conversations<ChevronRight size={15}/></Link>
            <p className={styles.helper}>{!statusFresh?"Sending status needs refresh":connected&&account.connection?.outgoingEnabled?"Outgoing messages enabled":"Outgoing messages disabled"}</p>
          </div>;
        })}
      </section>
      {!onlyFansOnly && <section className={styles.card} data-platform-telegram>
        <div className={styles.cardBrand}><PlatformIcon platform="telegram" size={48} /><h2>Telegram</h2>
          {data.telegram.configured&&<span className={styles.badge} data-state={data.telegram.status==="active"?"connected":"attention"}>{data.telegram.status==="active"?<><Check size={13}/>Connected</>:"Paused"}</span>}
        </div>
        <div className={styles.cardCopy}><h3>Your Telegram space.</h3><p>{data.telegram.configured?data.telegram.handle?`Your Telegram profile: @${data.telegram.handle.replace(/^@/,"")}`:"Your Telegram profile is configured.":"Connect your existing bot or set up your first one."}</p></div>
        {data.telegram.configured||telegramSelected?<Link className={styles.secondaryButton} href={telegramHref}>{data.telegram.configured?"Open Telegram setup":"Continue Telegram setup"}<ArrowRight size={17}/></Link>:<button className={styles.secondaryButton} disabled={!!busy||data.readOnly} onClick={()=>void choose("telegram")}>{busy==="telegram"?<><LoaderCircle size={17} className={styles.spinner}/>Getting ready…</>:<>Set up Telegram<ArrowRight size={17}/></>}</button>}
        <p className={styles.helper}>{data.telegram.configured?"Your existing profile and content are already here.":telegramSelected?"Setup requested. Continue with your existing profile.":"We’ll use your existing profile and content."}</p>
        {telegramSelected&&<div className={styles.telegramLinks}><Link className={styles.textLink} href={telegramHref}>Your profile<ChevronRight size={15}/></Link><Link className={styles.textLink} href={data.telegram.configured?"/creator/ppvs":"/creator/onboarding?step=content"}>Your content<ChevronRight size={15}/></Link></div>}
      </section>}
    </div>
    <footer className={styles.footer}><p><Sparkles size={19} aria-hidden="true"/>Your profile, content and agency stay together.</p><div><button className={styles.textLink} disabled={!!busy||refreshing} onClick={()=>void refresh()}><RefreshCw size={14} className={refreshing?styles.spinner:undefined}/>{refreshing?"Refreshing…":"Refresh status"}</button><Link className={styles.textLink} href="/creator">Back to my space<ArrowRight size={14}/></Link></div></footer>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="connect-heading" onCancel={closeConnection} onClose={()=>{if(connecting)closeConnection();}}>
      {connecting&&<div className={styles.dialogBody}><div className={styles.dialogHeader}><div className={styles.cardBrand}><PlatformIcon platform="onlyfans" size={40} /><h2 id="connect-heading">Connect OnlyFans</h2></div><button className={styles.closeButton} aria-label="Close connection setup" onClick={closeConnection}><X size={21}/></button></div>
        <div className={styles.connectionContent}>{data.onlyfans.signIn==="hosted"?<HostedConnect key={`${data.profileId||"none"}:${connectingAccount||"new"}`} profileId={data.profileId||""} accountId={connectingAccount} disabled={data.readOnly||!data.profileId} onChanged={refresh}/>:<BrowserConnect key={data.profileId||"none"} profileId={data.profileId||""} disabled={data.readOnly||!data.profileId} onChanged={refresh} autoStart/>}</div>
        <details className={styles.assisted}><summary>Agency-assisted connection</summary><SessionConnect disabled={data.readOnly||!data.profileId} onChanged={refresh}/></details>
      </div>}
    </dialog>
  </div>;
}

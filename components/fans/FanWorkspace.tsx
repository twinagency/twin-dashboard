"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowUpRight, Check, ChevronRight, CircleHelp, Clock3, Edit3, Globe2, ImageIcon, Link2, MessageCircle, MoreHorizontal, NotebookPen, Package, Search, Send, ShieldCheck, Sparkles, Users, Video, X } from "lucide-react";
import { channelKey, emptyState, messagesFor, platformNames, restoreState, STORAGE_KEY, totalsFor, visibleFans } from "./model";
import { PLATFORMS, type Creator, type Fan, type Handling, type Memory, type Platform, type PlatformFilter, type ProfileTab, type Purchase, type WorkspaceState } from "./types";
import styles from "./FanWorkspace.module.css";

const tabs: { id: ProfileTab; label: string }[] = [{id:"summary",label:"Summary"},{id:"conversation",label:"Conversation"},{id:"memory",label:"Memory"},{id:"purchases",label:"Purchases"},{id:"accounts",label:"Accounts"}];
const platformShort: Record<Platform,string> = { onlyfans:"OF", telegram:"TG", fanvue:"FV", fansly:"FS" };
const date = (at: string) => new Intl.DateTimeFormat("en-AU", {day:"numeric",month:"short",year:"numeric",timeZone:"Australia/Brisbane"}).format(new Date(at));
const time = (at: string) => new Intl.DateTimeFormat("en-AU", {hour:"numeric",minute:"2-digit",timeZone:"Australia/Brisbane"}).format(new Date(at));
const money = (value: number, currency: "USD"|"Stars") => currency === "Stars" ? `${value.toLocaleString("en-US")} Stars` : `US$${value.toFixed(2)}`;
const uid = () => typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

function PlatformBadge({platform, compact=false}:{platform:Platform;compact?:boolean}) {
  return <span className={`${styles.platformBadge} ${styles[platform]}`} title={platformNames[platform]}><span className={styles.platformIcon}>{platform === "telegram" ? <Send size={12}/> : platformShort[platform]}</span>{!compact && platformNames[platform]}</span>;
}
function Avatar({name,color,small=false}:{name:string;color:string;small?:boolean}) {
  return <span className={`${styles.avatar} ${small?styles.avatarSmall:""}`} style={{color,background:`${color}16`}} aria-hidden="true">{name}</span>;
}
function Card({title,icon,action,children,className=""}:{title:string;icon?:ReactNode;action?:ReactNode;children:ReactNode;className?:string}) {
  return <section className={`${styles.card} ${className}`}><div className={styles.cardHeading}><h3>{icon}{title}</h3>{action}</div>{children}</section>;
}
function Modal({title,children,onClose}:{title:string;children:ReactNode;onClose:()=>void}) {
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    ref.current?.focus();
    const key=(event:KeyboardEvent)=>{
      if(event.key==="Escape") onClose();
      if(event.key!=="Tab") return;
      const controls=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input,textarea,select,a[href],[tabindex="0"]')||[]);
      const first=controls[0],last=controls[controls.length-1];
      if(!first){event.preventDefault();return;}
      if(event.shiftKey && (document.activeElement===first || document.activeElement===ref.current)){event.preventDefault();last.focus();}
      else if(!event.shiftKey && (document.activeElement===last || document.activeElement===ref.current)){event.preventDefault();first.focus();}
    };
    document.addEventListener("keydown",key);
    return ()=>{document.removeEventListener("keydown",key);previous?.focus();};
  // A mounted dialog owns its focus and is replaced when the selected object changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  return <div className={styles.modalBackdrop} onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}><div ref={ref} tabIndex={-1} className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><div className={styles.modalHeading}><h2>{title}</h2><button className={styles.iconButton} onClick={onClose} aria-label="Close dialog"><X size={20}/></button></div>{children}</div></div>;
}
type Dialog = {kind:"note"}|{kind:"memory";memory:Memory}|{kind:"purchase";purchase:Purchase}|{kind:"account";platform:Platform}|{kind:"reset"}|null;

export default function FanWorkspace({creators,fans}:{creators:Creator[];fans:Fan[]}) {
  const [creatorId,setCreatorId]=useState("kyla");
  const [selectedId,setSelectedId]=useState("kyla-mark");
  const [query,setQuery]=useState("");
  const [listPlatform,setListPlatform]=useState<PlatformFilter>("all");
  const [platform,setPlatform]=useState<PlatformFilter>("all");
  const [tab,setTab]=useState<ProfileTab>("summary");
  const [state,setState]=useState<WorkspaceState>(emptyState);
  const [ready,setReady]=useState(false);
  const [storageAvailable,setStorageAvailable]=useState(true);
  const [mobileList,setMobileList]=useState(true);
  const [dialog,setDialog]=useState<Dialog>(null);
  const [editor,setEditor]=useState("");
  const [messageSearch,setMessageSearch]=useState("");
  const [purchaseSearch,setPurchaseSearch]=useState("");
  const [toast,setToast]=useState("");
  const toastTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const filtered=visibleFans(fans,creatorId,query,listPlatform);
  const fan=filtered.find(f=>f.id===selectedId)||filtered[0];
  const creator=creators.find(c=>c.id===fan?.creatorId);
  const activePlatform: PlatformFilter=fan && platform!=="all" && !fan.accounts.some(a=>a.platform===platform)?"all":platform;
  const totals=fan?totalsFor(fan,activePlatform):{usd:0,stars:0,purchases:[]};
  const messages=fan?messagesFor(fan,state,activePlatform):[];
  const lastMessage=messages[messages.length-1];
  const notes=fan?state.notes[fan.id]||[]:[];
  const draftKey=fan&&activePlatform!=="all"?channelKey(fan.id,activePlatform):"";
  const mode=state.modes[draftKey]||"Copilot";
  const draft=state.drafts[draftKey]||"";
  const flash=(text:string)=>{setToast(text);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(""),3200);};
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  useEffect(()=>{
    try{setState(restoreState(localStorage.getItem(STORAGE_KEY),fans));}catch{setStorageAvailable(false);}
    const params=new URLSearchParams(window.location.search);
    const initialFan=fans.find(f=>f.id===params.get("fan"));
    const initialCreator=params.get("creator");
    if(initialCreator==="all"||creators.some(c=>c.id===initialCreator))setCreatorId(initialCreator!);
    else if(initialFan)setCreatorId(initialFan.creatorId);
    if(initialFan)setSelectedId(initialFan.id);
    const initialPlatform=params.get("platform");if(PLATFORMS.includes(initialPlatform as Platform))setPlatform(initialPlatform as Platform);
    const initialTab=params.get("view");if(tabs.some(t=>t.id===initialTab))setTab(initialTab as ProfileTab);
    setReady(true);
  },[creators,fans]);
  useEffect(()=>{if(!ready)return;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{setStorageAvailable(false);}},[state,ready]);
  useEffect(()=>{
    if(!ready||!fan)return;
    const params=new URLSearchParams({creator:creatorId,fan:fan.id,platform:activePlatform,view:tab});
    window.history.replaceState(window.history.state,"",`${window.location.pathname}?${params}`);
  },[ready,creatorId,fan,activePlatform,tab]);
  const selectFan=(next:Fan)=>{setSelectedId(next.id);setPlatform("all");setTab("summary");setDialog(null);setMessageSearch("");setPurchaseSearch("");setMobileList(false);};
  const selectCreator=(id:string)=>{setCreatorId(id);setQuery("");setListPlatform("all");setPlatform("all");setDialog(null);setTab("summary");setSelectedId((id==="all"?fans[0]:fans.find(f=>f.creatorId===id))?.id||"");};
  const openConversation=(channel?:Platform)=>{if(!fan)return;setPlatform(channel||(activePlatform!=="all"?activePlatform:fan.accounts[0].platform));setTab("conversation");setMessageSearch("");setDialog(null);};
  const openNote=()=>{setEditor("");setDialog({kind:"note"});};
  const updateDraft=(text:string)=>{if(draftKey)setState(previous=>({...previous,drafts:{...previous.drafts,[draftKey]:text}}));};
  const sendMessage=()=>{
    if(!fan||activePlatform==="all"||!draft.trim())return;
    const message={id:uid(),platform:activePlatform,direction:"out" as const,text:draft.trim(),at:new Date().toISOString()};
    setState(previous=>({...previous,messages:{...previous.messages,[fan.id]:[...(previous.messages[fan.id]||[]),message].slice(-200)},drafts:{...previous.drafts,[draftKey]:""}}));
    setMessageSearch("");flash("Message added to conversation");
  };
  const saveEditor=()=>{
    if(!fan||!dialog||!editor.trim())return;
    if(dialog.kind==="note")setState(previous=>({...previous,notes:{...previous.notes,[fan.id]:[...(previous.notes[fan.id]||[]),{id:uid(),text:editor.trim(),at:new Date().toISOString()}].slice(-100)}}));
    else if(dialog.kind==="memory")setState(previous=>({...previous,memories:{...previous.memories,[fan.id]:{...(previous.memories[fan.id]||{}),[dialog.memory.id]:editor.trim()}}}));
    flash(dialog.kind==="note"?"Note added":"Memory updated");setDialog(null);
  };
  const fieldValue=(memory:Memory)=>fan?(state.memories[fan.id]?.[memory.id]??memory.value):memory.value;
  const purchaseRow=(purchase:Purchase)=><button key={purchase.id} className={styles.purchaseRow} onClick={()=>setDialog({kind:"purchase",purchase})} aria-label={`View ${purchase.title} purchase on ${platformNames[purchase.platform]}`}><span className={styles.mediaIcon}>{purchase.kind==="Video"?<Video size={18}/>:purchase.kind==="Bundle"?<Package size={18}/>:<ImageIcon size={18}/>}</span><span className={styles.purchaseName}><strong>{purchase.title}</strong><span>{date(purchase.at)}</span></span><PlatformBadge platform={purchase.platform}/><strong className={styles.purchaseAmount}>{money(purchase.amount,purchase.currency)}</strong><span className={styles.owned}><Check size={12}/>Owned</span><ChevronRight size={15}/></button>;

  return <div className={styles.workspace} data-fan-workspace="true">
    <aside className={`${styles.fanRail} ${!mobileList?styles.railMobileHidden:""}`} aria-label="Fan browser">
      <div className={styles.railHeader}><div><span className={styles.eyebrow}>RELATIONSHIPS</span><h1>Fan profiles</h1></div><Users size={20}/></div>
      <div className={styles.railFilters}>
        <label className={styles.label} htmlFor="fan-creator">Creator</label><select id="fan-creator" className={styles.select} value={creatorId} onChange={e=>selectCreator(e.target.value)}><option value="all">All creators</option>{creators.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <div className={styles.search}><Search size={16}/><input aria-label="Search fans" placeholder="Search fans or usernames" value={query} onChange={e=>{setQuery(e.target.value);setDialog(null);}}/>{query&&<button aria-label="Clear fan search" onClick={()=>setQuery("")}><X size={14}/></button>}</div>
        <select className={styles.select} aria-label="Filter fan list by platform" value={listPlatform} onChange={e=>{setListPlatform(e.target.value as PlatformFilter);setDialog(null);}}><option value="all">Any platform</option>{PLATFORMS.map(p=><option key={p} value={p}>{platformNames[p]}</option>)}</select>
      </div>
      <div className={styles.listLabel}><span>{filtered.length} relationships</span><span>Recent activity</span></div>
      <div className={styles.fanList}>{filtered.map(item=>{const owner=creators.find(c=>c.id===item.creatorId);return <button key={item.id} className={`${styles.fanRow} ${fan?.id===item.id?styles.selectedFan:""}`} aria-label={`${item.name}, ${owner?.name}`} aria-pressed={fan?.id===item.id} onClick={()=>selectFan(item)}><Avatar name={item.initials} color={item.color} small/><span className={styles.fanRowBody}><span className={styles.fanRowName}><strong>{item.name}</strong>{item.unread>0&&<span className={styles.unread}>{item.unread}</span>}</span><span className={styles.fanOwner}>{owner?.name}</span><span className={styles.badges}>{item.accounts.map(a=><PlatformBadge key={a.platform} platform={a.platform} compact/>)}</span><span className={styles.fanPreview}>{item.accounts.length} {item.accounts.length===1?"linked account":"linked accounts"}</span></span></button>;})}{filtered.length===0&&<div className={styles.railEmpty}>No fans match these filters.<button className={styles.textButton} onClick={()=>{setQuery("");setListPlatform("all");}}>Clear filters</button></div>}</div>
      <div className={styles.railFooter}><Link2 size={15}/><span>One relationship, connected channels</span></div>
    </aside>
    <div className={styles.profilePane}>
      <button className={`${styles.textButton} ${styles.mobileBrowse}`} onClick={()=>setMobileList(!mobileList)}><Users size={16}/>{mobileList?"Hide fan list":"Browse fans"}</button>
      {fan&&creator?<>
        <div className={styles.breadcrumb}><span>{creator.name}</span><ChevronRight size={13}/><span>Fans</span><ChevronRight size={13}/><strong>{fan.name}</strong><button className={styles.iconButton} title="Reset workspace" aria-label="Reset workspace" onClick={()=>setDialog({kind:"reset"})}><MoreHorizontal size={20}/></button></div>
        <section className={styles.profileHeader}><Avatar name={fan.initials} color={fan.color}/><div className={styles.identity}><h2>{fan.name}<span className={styles.linkCount}><Link2 size={12}/>{fan.accounts.length} linked {fan.accounts.length===1?"account":"accounts"}</span></h2><p>Fan of <strong>{creator.name}</strong></p><div className={styles.badges}>{fan.accounts.map(a=><PlatformBadge platform={a.platform} key={a.platform}/>)}</div></div><div className={styles.headerActions}><button className={styles.primaryButton} onClick={()=>openConversation()}><MessageCircle size={16}/>Open conversation</button><button className={styles.secondaryButton} onClick={openNote}><NotebookPen size={16}/>Add note</button></div></section>
        <div className={styles.platformBar} aria-label="Profile platform filter"><button aria-pressed={activePlatform==="all"} className={activePlatform==="all"?styles.platformActive:""} onClick={()=>setPlatform("all")}><Globe2 size={16}/>All platforms</button>{PLATFORMS.map(p=>{const linked=fan.accounts.some(a=>a.platform===p);return <button key={p} aria-pressed={activePlatform===p} disabled={!linked} title={linked?`View ${platformNames[p]} relationship`:"No linked account"} className={activePlatform===p?styles.platformActive:""} onClick={()=>setPlatform(p)}><PlatformBadge platform={p}/>{linked&&<span className={styles.linkDot}/>}</button>;})}</div>
        <div className={styles.metrics}><div><span>Total paid <CircleHelp size={12} aria-label="Amounts stay in their original currency"/></span><strong>{totals.usd?money(totals.usd,"USD"):money(totals.stars,"Stars")}</strong>{totals.usd>0&&totals.stars>0&&<small>+ {money(totals.stars,"Stars")}</small>}</div><div><span>Purchases</span><strong>{totals.purchases.length}</strong><small>{activePlatform==="all"?"Across linked platforms":platformNames[activePlatform]}</small></div><div><span>Content owned</span><strong>{totals.purchases.length} items</strong><small>{totals.purchases.filter(p=>p.kind==="Photo").length} photos · {totals.purchases.filter(p=>p.kind==="Video").length} videos · {totals.purchases.filter(p=>p.kind==="Bundle").length} bundles</small></div><div><span>Last message</span><strong className={styles.dateMetric}>{lastMessage?date(lastMessage.at):"No messages"}</strong><small>{lastMessage?`${time(lastMessage.at)} AEST · ${platformNames[lastMessage.platform]}`:""}</small></div></div>
        <div className={styles.tabBar} role="tablist" aria-label="Fan profile sections">{tabs.map(item=><button key={item.id} id={`fan-tab-${item.id}`} role="tab" aria-controls="fan-tab-panel" aria-selected={tab===item.id} className={tab===item.id?styles.activeTab:""} onClick={()=>setTab(item.id)}>{item.label}</button>)}</div>
        <div id="fan-tab-panel" role="tabpanel" aria-labelledby={`fan-tab-${tab}`}>
        {tab==="summary"&&<div className={styles.summaryGrid}>
          <Card title="Relationship summary" icon={<Users size={17}/>}><p className={styles.summaryText}>{fan.summary}</p><div className={styles.detailGrid}><div><span>Creator</span><strong>{creator.name}</strong></div><div><span>First seen</span><strong>{date(fan.firstSeen)}</strong></div><div><span>Viewing</span><strong>{activePlatform==="all"?"All platforms":platformNames[activePlatform]}</strong></div><div><span>Relationship</span><strong>{fan.accounts.length} linked accounts</strong></div></div></Card>
          <Card title="Remembered details" icon={<Sparkles size={17}/>} action={<button className={styles.textButton} onClick={()=>setTab("memory")}>View memory</button>}><dl className={styles.memoryQuick}>{fan.memories.slice(0,4).map(m=><div key={m.id}><dt>{m.label}</dt><dd>{fieldValue(m)}</dd></div>)}</dl></Card>
          <Card title="Recent activity" icon={<Clock3 size={17}/>} action={<button className={styles.textButton} onClick={()=>{setPlatform("all");setTab("conversation");}}>View conversations</button>}><div className={styles.timeline}>{[...messages.slice(-4).map(m=>({id:m.id,at:m.at,platform:m.platform,label:m.direction==="in"?"Incoming message":"Reply",text:m.text,purchase:null as Purchase|null})),...totals.purchases.slice(-4).map(p=>({id:p.id,at:p.at,platform:p.platform,label:`${p.kind} purchased`,text:money(p.amount,p.currency),purchase:p}))].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,5).map(event=><button key={event.id} className={styles.timelineRow} onClick={()=>event.purchase?setDialog({kind:"purchase",purchase:event.purchase}):openConversation(event.platform)}><span className={styles.timelineDot}/><span><span className={styles.timelineMeta}>{date(event.at)}<PlatformBadge platform={event.platform}/></span><strong>{event.label}</strong><span className={styles.timelinePreview}>{event.text}</span></span><ChevronRight size={14}/></button>)}</div></Card>
          <Card title="Platform accounts" icon={<Link2 size={17}/>} action={<button className={styles.textButton} onClick={()=>{setPlatform("all");setTab("accounts");}}>Manage</button>}><div className={styles.accountsQuick}>{PLATFORMS.map(p=>{const account=fan.accounts.find(a=>a.platform===p);return <button key={p} disabled={!account} onClick={()=>{setPlatform(p);setTab("accounts");}}><PlatformBadge platform={p}/><span className={account?styles.linked:styles.notLinked}>{account?<><Check size={12}/>Linked</>:"Not linked"}</span><ChevronRight size={14}/></button>;})}</div><div className={styles.cardFoot}><ShieldCheck size={14}/>Linked within {creator.name}’s workspace</div></Card>
          <Card title="Purchased content" action={<button className={styles.textButton} onClick={()=>setTab("purchases")}>View all purchases</button>} className={styles.contentCard}>{[...totals.purchases].sort((a,b)=>b.at.localeCompare(a.at)).slice(0,3).map(purchaseRow)}</Card>
          <Card title="Notes" icon={<NotebookPen size={17}/>} action={<button className={styles.textButton} onClick={openNote}>Add note</button>}>{notes.length?<div className={styles.notes}>{notes.slice(-3).reverse().map(note=><div key={note.id}><p>{note.text}</p><small>{date(note.at)} · Team note</small></div>)}</div>:<button className={styles.notePlaceholder} onClick={openNote}>Add a note about {fan.name}…<NotebookPen size={18}/></button>}</Card>
        </div>}
        {tab==="conversation"&&<div className={styles.conversationLayout}><section className={styles.conversationCard}><div className={styles.conversationHeading}><div><h3>{activePlatform==="all"?"All conversations":`${platformNames[activePlatform]} conversation`}</h3><span>{fan.name} with {creator.name}</span></div>{activePlatform!=="all"&&<select aria-label="Conversation handling" className={styles.modeSelect} value={mode} onChange={e=>setState(previous=>({...previous,modes:{...previous.modes,[draftKey]:e.target.value as Handling}}))}><option>Human</option><option>Copilot</option><option>Autonomous</option></select>}</div><div className={`${styles.search} ${styles.conversationSearch}`}><Search size={15}/><input aria-label="Search conversation" placeholder="Search this conversation" value={messageSearch} onChange={e=>setMessageSearch(e.target.value)}/></div><div className={styles.messageList}>{messages.filter(m=>m.text.toLowerCase().includes(messageSearch.toLowerCase())).map(m=><div key={m.id} className={`${styles.message} ${m.direction==="out"?styles.outgoing:""}`}><div className={styles.messageMeta}><span>{m.direction==="in"?fan.name:creator.name}</span><PlatformBadge platform={m.platform}/><time dateTime={m.at}>{date(m.at)} · {time(m.at)}</time></div><p>{m.text}</p></div>)}{!messages.some(m=>m.text.toLowerCase().includes(messageSearch.toLowerCase()))&&<p className={styles.empty}>No messages match your search.</p>}</div>{activePlatform==="all"?<div className={styles.channelChooser}><strong>Choose a channel to reply</strong><div className={styles.badges}>{fan.accounts.map(a=><button key={a.platform} className={styles.secondaryButton} onClick={()=>setPlatform(a.platform)}><PlatformBadge platform={a.platform}/><ArrowUpRight size={13}/></button>)}</div></div>:<div className={styles.composer}><div className={styles.composerMeta}><span>Reply on <strong>{platformNames[activePlatform]}</strong></span>{mode!=="Human"&&<button className={styles.textButton} onClick={()=>{setState(previous=>({...previous,modes:{...previous.modes,[draftKey]:"Human"}}));flash("Human handling selected");}}>Take over</button>}</div><textarea aria-label={`Reply on ${platformNames[activePlatform]}`} placeholder={`Message ${fan.name} on ${platformNames[activePlatform]}…`} value={draft} maxLength={4000} onChange={e=>updateDraft(e.target.value)}/><div className={styles.composerFooter}><button className={styles.secondaryButton} onClick={()=>updateDraft(fan.id==="kyla-mark"?"Hey Mark! Both Lisbon and Porto sound lovely. What are you most looking forward to on the trip?":`Hey ${fan.name}! It is lovely to hear from you. What have you been up to this week?`)}><Sparkles size={15}/>Suggest reply</button><button className={styles.primaryButton} disabled={!draft.trim()||!ready} onClick={sendMessage}><Send size={15}/>Send</button></div></div>}</section><div className={styles.conversationContext}><Card title="Shared relationship memory" icon={<Sparkles size={17}/>}><dl className={styles.memoryQuick}>{fan.memories.map(m=><div key={m.id}><dt>{m.label}</dt><dd>{fieldValue(m)}</dd></div>)}</dl></Card><Card title="Content ownership"><strong className={styles.bigNumber}>{totals.purchases.length} items</strong><button className={styles.textButton} onClick={()=>setTab("purchases")}>View purchases<ChevronRight size={14}/></button></Card></div></div>}
        {tab==="memory"&&<><div className={styles.sectionIntro}><div><h3>Relationship memory</h3><span>{fan.name} with {creator.name}</span></div><span className={styles.linkCount}><Link2 size={13}/>Shared across linked channels</span></div><div className={styles.memoryGrid}>{fan.memories.map(m=><Card key={m.id} title={m.label} icon={<Sparkles size={16}/>} action={<button className={styles.iconButton} aria-label={`Edit ${m.label}`} onClick={()=>{setEditor(fieldValue(m));setDialog({kind:"memory",memory:m});}}><Edit3 size={15}/></button>}><span className={styles.eyebrow}>{m.category}</span><p className={styles.memoryValue}>{fieldValue(m)}</p><div className={styles.memorySource}><PlatformBadge platform={m.source}/><span>{state.memories[fan.id]?.[m.id]!==undefined?"Edited by team":"Recorded profile detail"}</span></div></Card>)}</div></>}
        {tab==="purchases"&&<Card title="Purchase history" icon={<Package size={17}/>} action={<span className={styles.linkCount}>{totals.purchases.length} purchases</span>}><div className={`${styles.search} ${styles.purchaseSearch}`}><Search size={15}/><input aria-label="Search purchases" placeholder="Search purchased content" value={purchaseSearch} onChange={e=>setPurchaseSearch(e.target.value)}/></div>{[...totals.purchases].filter(p=>`${p.title} ${p.kind} ${platformNames[p.platform]}`.toLowerCase().includes(purchaseSearch.toLowerCase())).sort((a,b)=>b.at.localeCompare(a.at)).map(purchaseRow)}{!totals.purchases.some(p=>`${p.title} ${p.kind} ${platformNames[p.platform]}`.toLowerCase().includes(purchaseSearch.toLowerCase()))&&<p className={styles.empty}>No purchases match your search.</p>}</Card>}
        {tab==="accounts"&&<><div className={styles.sectionIntro}><div><h3>Linked platform accounts</h3><span>These accounts belong to {fan.name}’s relationship with {creator.name}.</span></div><span className={styles.linked}><Link2 size={13}/>{fan.accounts.length} linked</span></div><div className={styles.accountGrid}>{PLATFORMS.filter(p=>activePlatform==="all"||activePlatform===p).map(p=>{const account=fan.accounts.find(a=>a.platform===p);return <Card key={p} title={platformNames[p]} icon={<PlatformBadge platform={p} compact/>} action={<span className={account?styles.linked:styles.notLinked}>{account?"Linked":"Not linked"}</span>}>{account?<><p className={styles.accountUsername}>@{account.username}</p><dl className={styles.memoryQuick}><div><dt>Fan</dt><dd>{fan.name}</dd></div><div><dt>Creator</dt><dd>{creator.name}</dd></div><div><dt>Linked</dt><dd>{date(account.linkedAt)}</dd></div></dl><div className={styles.accountActions}><button className={styles.primaryButton} onClick={()=>openConversation(p)}><MessageCircle size={15}/>Open conversation</button><button className={styles.secondaryButton} onClick={()=>setDialog({kind:"account",platform:p})}>Details</button></div></>:<p className={styles.empty}>No {platformNames[p]} account is linked to this relationship.</p>}</Card>;})}</div></>}
        </div>
      </>:<div className={styles.emptyProfile}><Users size={36}/><h2>No matching fans</h2><p>Change the creator or clear your search and platform filters.</p><button className={styles.primaryButton} onClick={()=>{setQuery("");setListPlatform("all");}}>Clear filters</button></div>}
      {!storageAvailable&&<div className={styles.storageNotice} role="status">Browser storage is unavailable. Changes will last until you leave this page.</div>}
    </div>
    {toast&&<div className={styles.toast} role="status"><Check size={16}/>{toast}</div>}
    {dialog&&fan&&creator&&<Modal key={dialog.kind} title={dialog.kind==="note"?`Add note for ${fan.name}`:dialog.kind==="memory"?`Edit ${dialog.memory.label}`:dialog.kind==="purchase"?"Purchase details":dialog.kind==="reset"?"Reset workspace":"Account details"} onClose={()=>setDialog(null)}>
      {(dialog.kind==="note"||dialog.kind==="memory")&&<form onSubmit={e=>{e.preventDefault();saveEditor();}}><label className={styles.label} htmlFor="fan-editor">{dialog.kind==="note"?"Note":dialog.memory.label}</label><textarea id="fan-editor" className={styles.editor} value={editor} onChange={e=>setEditor(e.target.value)} maxLength={dialog.kind==="note"?2000:500} rows={5}/><div className={styles.modalActions}><button type="button" className={styles.secondaryButton} onClick={()=>setDialog(null)}>Cancel</button><button className={styles.primaryButton} disabled={!editor.trim()||!ready}>Save {dialog.kind==="note"?"note":"memory"}</button></div></form>}
      {dialog.kind==="purchase"&&<><div className={styles.receiptHero}><Package size={30}/><h3>{dialog.purchase.title}</h3><strong>{money(dialog.purchase.amount,dialog.purchase.currency)}</strong><span className={styles.owned}><Check size={13}/>Owned</span></div><dl className={styles.memoryQuick}><div><dt>Creator</dt><dd>{creator.name}</dd></div><div><dt>Fan</dt><dd>{fan.name}</dd></div><div><dt>Platform</dt><dd><PlatformBadge platform={dialog.purchase.platform}/></dd></div><div><dt>Content</dt><dd>{dialog.purchase.kind}</dd></div><div><dt>Purchased</dt><dd>{date(dialog.purchase.at)}</dd></div></dl><div className={styles.modalActions}><button className={styles.primaryButton} onClick={()=>openConversation(dialog.purchase.platform)}>Open conversation<ArrowUpRight size={15}/></button></div></>}
      {dialog.kind==="account"&&<><div className={styles.receiptHero}><PlatformBadge platform={dialog.platform}/><h3>@{fan.accounts.find(a=>a.platform===dialog.platform)?.username}</h3><span className={styles.linked}><Link2 size={13}/>Linked to {fan.name}</span></div><dl className={styles.memoryQuick}><div><dt>Creator</dt><dd>{creator.name}</dd></div><div><dt>Relationship memory</dt><dd>Shared across linked accounts</dd></div><div><dt>Messages and purchases</dt><dd>{platformNames[dialog.platform]}</dd></div></dl><div className={styles.modalActions}><button className={styles.primaryButton} onClick={()=>openConversation(dialog.platform)}>Open conversation</button></div></>}
      {dialog.kind==="reset"&&<><p className={styles.summaryText}>Clear the notes, memory edits, drafts and messages added in this browser and return to the starting workspace?</p><div className={styles.modalActions}><button className={styles.secondaryButton} onClick={()=>setDialog(null)}>Cancel</button><button className={styles.primaryButton} onClick={()=>{setState(emptyState());selectCreator("kyla");setSelectedId("kyla-mark");setDialog(null);flash("Workspace reset");}}>Reset workspace</button></div></>}
    </Modal>}
  </div>;
}

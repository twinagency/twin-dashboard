'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import HostedConnect from '@/components/creator-platforms/HostedConnect';
import {parseEnrollment,type ConnectionCreator} from '@/lib/onlyfans-connections/contract';
import {normalizeProxyInput} from '@/lib/onlyfans-connections/proxy';

const button='rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50';
const field='mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm';
type Managed={countryCode:string;handle:string};
type Country={code:string;name:string;available:number};
type Selection={creatorId:string;creatorName:string;accountId:string|null;proxyUrl:string|null;managedProxy?:Managed};
export default function AdminOnlyFansSignIn({creators,accountId=null}:{creators:ConnectionCreator[];accountId?:string|null}){
  const router=useRouter(),alive=useRef(false),generation=useRef(0),starting=useRef(false);
  const [open,setOpen]=useState(false),[creatorId,setCreatorId]=useState(creators.length===1?creators[0].id:''),[proxy,setProxy]=useState(''),[notice,setNotice]=useState('');
  const [mode,setMode]=useState<'new'|'existing'>(accountId?'existing':'new');
  const [name,setName]=useState(''),[handle,setHandle]=useState(''),[busy,setBusy]=useState(false);
  const [proxyMode,setProxyMode]=useState<'managed'|'own'>('managed'),[country,setCountry]=useState('');
  const [countries,setCountries]=useState<Country[]>([]),[stockNote,setStockNote]=useState('Checking managed proxies…');
  const [selection,setSelection]=useState<Selection|null>(null),[lost,setLost]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  useEffect(()=>{
    if(!open||accountId)return;
    let active=true;const controller=new AbortController();
    setStockNote('Checking managed proxies…');
    fetch('/api/onlyfans-connections/proxies',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:controller.signal}).then(async response=>{
      const body=await response.json();if(!active)return;
      if(!response.ok||!body?.ok||!Array.isArray(body.countries))throw new Error();
      const rows=body.countries.filter((c:Country)=>c&&/^[A-Z]{2}$/.test(c.code)&&typeof c.name==='string'&&Number.isSafeInteger(c.available)&&c.available>=0);
      setCountries(rows);
      setStockNote(!body.configured?'Managed proxies are not configured yet. You can use your own fixed proxy.':rows.some((c:Country)=>c.available>0)?'One fixed IPRoyal ISP proxy will be assigned to this OnlyFans account.':'No unused proxies are currently in the pool. Existing assignments are retained when you retry.');
    }).catch(()=>{if(active){setCountries([]);setStockNote('Managed proxies could not be checked. Try reopening setup or choose Use own proxy.');}});
    return()=>{active=false;controller.abort();};
  },[open,accountId]);
  const entry=normalizeProxyInput(proxy);
  const proxyValid=entry.ok&&!!entry.url&&['http:','https:','socks5:'].includes(new URL(entry.url).protocol);
  const cleanHandle=handle.trim().replace(/^@/,'').toLowerCase();
  const validHandle=/^[a-z0-9_.-]{1,80}$/.test(cleanHandle);
  const endpoint=selection?`/api/onlyfans-connections/creators/${encodeURIComponent(selection.creatorId)}/sign-in`:'';
  const connection=useMemo(()=>selection?{accountId:selection.accountId,proxyUrl:selection.proxyUrl,...(selection.managedProxy?{managedProxy:selection.managedProxy}:{})}:undefined,[selection]);
  function close(){generation.current++;setOpen(false);setSelection(null);setProxy('');setNotice('');}
  async function changed(enrollmentId?:string|null){
    if(!enrollmentId||!selection)return false;
    const current=generation.current;
    try{
      const response=await fetch(endpoint+'?enrollments=1',{credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(!alive.current||current!==generation.current)return false;
      if([401,403].includes(response.status)){setLost(true);setProxy('');setSelection(null);setNotice('Sign in to your dashboard again.');return false;}
      const body=await response.json();
      if(!alive.current||current!==generation.current)return false;
      const enrollment=response.ok&&body?.ok===true&&Array.isArray(body.enrollments)?body.enrollments.map(parseEnrollment).find((row:ReturnType<typeof parseEnrollment>)=>row?.id===enrollmentId):null;
      if(!enrollment){setNotice('Connection status could not be confirmed. Keep this setup open and try again.');return false;}
      if(enrollment.status==='accepted'&&enrollment.accountId){
        setSelection(null);setProxy('');setOpen(false);
        router.push(`/onlyfans/accounts?creator=${encodeURIComponent(selection.creatorId)}&account=${encodeURIComponent(enrollment.accountId)}`);router.refresh();return true;
      }
      if(['failed','expired'].includes(enrollment.status)){setNotice('The connection could not be verified. Close setup and try signing in again.');return false;}
      setNotice('Verifying the account connection. Outgoing messages remain disabled.');return false;
    }catch{if(alive.current&&current===generation.current)setNotice('Connection status could not be confirmed. We will check again.');return false;}
  }
  async function start(){
    if(starting.current||lost)return;
    if(accountId===null&&proxyMode==='own'&&!proxyValid){setNotice("Enter this creator's fixed HTTP, HTTPS or SOCKS5 proxy first.");return;}
    if(accountId===null&&proxyMode==='managed'&&(!validHandle||!country)){setNotice('Enter the OnlyFans handle and select the creator’s country.');return;}
    const current=generation.current;
    starting.current=true;setBusy(true);setNotice('');
    try{
      let creator=creators.find(row=>row.id===creatorId);
      if(mode==='new'&&!accountId){
        const response=await fetch('/api/onlyfans-connections/creators',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,handle})});
        const body=await response.json();
        if(!alive.current||current!==generation.current)return;
        if(!response.ok||!body?.ok||!body.creator?.id||!body.creator?.name){
          if(response.status===401){setLost(true);setProxy('');}
          setNotice(body?.error??'The creator could not be saved. Retry with the same handle.');return;
        }
        creator=body.creator;
      }
      if(!creator){setNotice('Select a creator first.');return;}
      if(!alive.current||current!==generation.current)return;
      setSelection({creatorId:creator.id,creatorName:creator.name,accountId,proxyUrl:accountId===null&&proxyMode==='own'&&entry.ok?entry.url:null,
        ...(accountId===null&&proxyMode==='managed'?{managedProxy:{countryCode:country,handle:cleanHandle}}:{})});setProxy('');
    }catch{if(alive.current&&current===generation.current)setNotice('Creator setup could not be confirmed. Retry with the same handle.');}
    finally{starting.current=false;if(alive.current)setBusy(false);}
  }
  const ready=accountId||mode==='existing'?!!creatorId:!!name.trim()&&validHandle;
  const networkReady=!!accountId||(proxyMode==='own'?proxyValid:validHandle&&!!country);
  return <>
    <button type="button" className={button} onClick={event=>{event.stopPropagation();setOpen(true);setNotice('');}}>{accountId?'Reconnect OnlyFans':'Add OnlyFans account'}</button>
    {open?<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={event=>event.stopPropagation()}>
      <section role="dialog" aria-modal="true" aria-label="Admin OnlyFans connection" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-5 text-ink shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{accountId?'Reconnect OnlyFans':'Add OnlyFans account'}</h2><button type="button" className={button} onClick={close} aria-label="Close account sign-in">Close</button></div>
        {!selection?<div className="space-y-4">
          {!accountId?<div className="flex gap-2" role="group" aria-label="Creator setup"><button type="button" className={button} aria-pressed={mode==='new'} disabled={busy||lost} onClick={()=>{setMode('new');setNotice('');}}>Add a creator</button><button type="button" className={button} aria-pressed={mode==='existing'} disabled={busy||lost} onClick={()=>{setMode('existing');setNotice('');}}>Select creator</button></div>:null}
          {mode==='new'&&!accountId?<label className="block text-sm">Full name<input className={field} autoComplete="off" value={name} maxLength={160} disabled={busy||lost} onChange={event=>setName(event.target.value)}/></label>:<label className="block text-sm">Creator<select className={field} value={creatorId} onChange={event=>setCreatorId(event.target.value)} disabled={!!accountId||lost||busy}><option value="">Select creator</option>{creators.map(creator=><option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>}
          {!accountId&&(mode==='new'||proxyMode==='managed')?<label className="block text-sm">OnlyFans handle<input className={field} autoComplete="off" placeholder="@username" value={handle} maxLength={81} disabled={busy||lost} onChange={event=>setHandle(event.target.value)}/></label>:null}
          {accountId?<p className="text-sm text-muted">Sign in to this account through its saved proxy. Its model settings and used allowance are retained.</p>:<>
            <label className="block text-sm">Proxy setup<select data-of-proxy-mode className={field} value={proxyMode} disabled={lost||busy} onChange={event=>setProxyMode(event.target.value as 'managed'|'own')}><option value="managed">Automatic — IPRoyal ISP</option><option value="own">Use own proxy</option></select></label>
            {proxyMode==='managed'?<><label className="block text-sm">Creator’s country<select data-of-proxy-country className={field} value={country} disabled={busy||lost} onChange={event=>setCountry(event.target.value)}><option value="">Select country</option>{countries.map(row=><option key={row.code} value={row.code}>{row.name}{row.available?` — ${row.available} available`:''}</option>)}</select></label><p className="text-xs text-muted" role="status" data-of-proxy-stock>{stockNote}</p><p className="text-xs text-muted">The same dedicated proxy is retained for this account’s login, syncing and messaging. AI replies stay off until you enable them.</p></>:<><label className="block text-sm">Creator's fixed proxy<input className={field} type="password" autoComplete="off" placeholder="HOST:PORT:USER:PASS" value={proxy} disabled={lost||busy} onChange={event=>setProxy(event.target.value)}/></label><p className="text-xs text-muted">Use this creator's own proxy. The login and ongoing connection use the same network.</p></>}
          </>}
          <button type="button" className={button} onClick={start} disabled={busy||lost||!ready||!networkReady}>{busy?'Preparing sign-in...':'Continue to OnlyFans login'}</button>
        </div>:<><p className="mb-3 text-sm text-muted">Connecting for {selection.creatorName}. Confirm the account shown after signing in.</p><HostedConnect key={selection.creatorId+':'+(selection.accountId??'new')} profileId={selection.creatorId} accountId={selection.accountId} disabled={lost} endpoint={endpoint} connection={connection} sessionMessage="Sign in to your dashboard again." onChanged={changed}/></>}
        {notice?<p role="status" className="mt-4 text-sm">{notice}</p>:null}
      </section>
    </div>:null}
  </>;
}

'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import HostedConnect from '@/components/creator-platforms/HostedConnect';
import {parseEnrollment,type ConnectionCreator} from '@/lib/onlyfans-connections/contract';

const button='rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50';
const field='mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm';
type Managed={countryCode:string;handle:string};
type Selection={creatorId:string;creatorName:string;accountId:string|null;proxyUrl:string|null;managedProxy?:Managed};
export default function AdminOnlyFansSignIn({creators,accountId=null}:{creators:ConnectionCreator[];accountId?:string|null}){
  const router=useRouter(),alive=useRef(false),generation=useRef(0),starting=useRef(false);
  const [open,setOpen]=useState(false),[creatorId,setCreatorId]=useState(creators.length===1?creators[0].id:''),[notice,setNotice]=useState('');
  const [mode,setMode]=useState<'new'|'existing'>(accountId?'existing':'new');
  const [name,setName]=useState(''),[handle,setHandle]=useState(''),[busy,setBusy]=useState(false);
  const [selection,setSelection]=useState<Selection|null>(null),[lost,setLost]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;};},[]);
  const cleanHandle=handle.trim().replace(/^@/,'').toLowerCase();
  const validHandle=/^[a-z0-9_.-]{1,80}$/.test(cleanHandle);
  const endpoint=selection?`/api/onlyfans-connections/creators/${encodeURIComponent(selection.creatorId)}/sign-in`:'';
  const connection=useMemo(()=>selection?{accountId:selection.accountId,proxyUrl:selection.proxyUrl,...(selection.managedProxy?{managedProxy:selection.managedProxy}:{})}:undefined,[selection]);
  function close(){generation.current++;setOpen(false);setSelection(null);setNotice('');}
  async function changed(enrollmentId?:string|null){
    if(!enrollmentId||!selection)return false;
    const current=generation.current;
    try{
      const response=await fetch(endpoint+'?enrollments=1',{credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(!alive.current||current!==generation.current)return false;
      if([401,403].includes(response.status)){setLost(true);setSelection(null);setNotice('Sign in to your dashboard again.');return false;}
      const body=await response.json();
      if(!alive.current||current!==generation.current)return false;
      const enrollment=response.ok&&body?.ok===true&&Array.isArray(body.enrollments)?body.enrollments.map(parseEnrollment).find((row:ReturnType<typeof parseEnrollment>)=>row?.id===enrollmentId):null;
      if(!enrollment){setNotice('Connection status could not be confirmed. Keep this setup open and try again.');return false;}
      if(enrollment.status==='accepted'&&enrollment.accountId){
        setSelection(null);setOpen(false);
        router.push(`/onlyfans/accounts?creator=${encodeURIComponent(selection.creatorId)}&account=${encodeURIComponent(enrollment.accountId)}`);router.refresh();return true;
      }
      if(['failed','expired'].includes(enrollment.status)){setNotice('The connection could not be verified. Close setup and try signing in again.');return false;}
      setNotice('Verifying the account connection. Outgoing messages remain disabled.');return false;
    }catch{if(alive.current&&current===generation.current)setNotice('Connection status could not be confirmed. We will check again.');return false;}
  }
  async function start(){
    if(starting.current||lost)return;
    if(accountId===null&&!validHandle){setNotice('Enter the OnlyFans handle.');return;}
    const current=generation.current;
    starting.current=true;setBusy(true);setNotice('');
    try{
      let creator=creators.find(row=>row.id===creatorId);
      if(mode==='new'&&!accountId){
        const response=await fetch('/api/onlyfans-connections/creators',{method:'POST',credentials:'same-origin',cache:'no-store',redirect:'error',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,handle})});
        const body=await response.json();
        if(!alive.current||current!==generation.current)return;
        if(!response.ok||!body?.ok||!body.creator?.id||!body.creator?.name){
          if(response.status===401){setLost(true);}
          setNotice(body?.error??'The creator could not be saved. Retry with the same handle.');return;
        }
        creator=body.creator;
      }
      if(!creator){setNotice('Select a creator first.');return;}
      if(!alive.current||current!==generation.current)return;
      setSelection({creatorId:creator.id,creatorName:creator.name,accountId,proxyUrl:null,
        ...(accountId===null?{managedProxy:{countryCode:'auto',handle:cleanHandle}}:{})});
    }catch{if(alive.current&&current===generation.current)setNotice('Creator setup could not be confirmed. Retry with the same handle.');}
    finally{starting.current=false;if(alive.current)setBusy(false);}
  }
  const ready=accountId?!!creatorId:mode==='existing'?!!creatorId&&validHandle:!!name.trim()&&validHandle;
  return <>
    <button type="button" className={button} onClick={event=>{event.stopPropagation();setOpen(true);setNotice('');}}>{accountId?'Reconnect OnlyFans':'Add OnlyFans account'}</button>
    {open?<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={event=>event.stopPropagation()}>
      <section role="dialog" aria-modal="true" aria-label="Admin OnlyFans connection" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-5 text-ink shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{accountId?'Reconnect OnlyFans':'Add OnlyFans account'}</h2><button type="button" className={button} onClick={close} aria-label="Close account sign-in">Close</button></div>
        {!selection?<div className="space-y-4">
          {!accountId?<div className="flex gap-2" role="group" aria-label="Creator setup"><button type="button" className={button} aria-pressed={mode==='new'} disabled={busy||lost} onClick={()=>{setMode('new');setNotice('');}}>Add a creator</button><button type="button" className={button} aria-pressed={mode==='existing'} disabled={busy||lost} onClick={()=>{setMode('existing');setNotice('');}}>Select creator</button></div>:null}
          {mode==='new'&&!accountId?<label className="block text-sm">Full name<input className={field} autoComplete="off" value={name} maxLength={160} disabled={busy||lost} onChange={event=>setName(event.target.value)}/></label>:<label className="block text-sm">Creator<select className={field} value={creatorId} onChange={event=>setCreatorId(event.target.value)} disabled={!!accountId||lost||busy}><option value="">Select creator</option>{creators.map(creator=><option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>}
          {!accountId?<label className="block text-sm">OnlyFans handle<input className={field} autoComplete="off" placeholder="@username" value={handle} maxLength={81} disabled={busy||lost} onChange={event=>setHandle(event.target.value)}/></label>:null}
          <p className="text-sm text-muted">{accountId?'Sign in again to reconnect this account. Its settings are retained.':'Connection setup is handled automatically. Sign in to the OnlyFans account you want to connect.'}</p>
          <button type="button" className={button} onClick={start} disabled={busy||lost||!ready}>{busy?'Preparing sign-in...':'Sign in to OnlyFans'}</button>
        </div>:<><p className="mb-3 text-sm text-muted">Connecting for {selection.creatorName}. Confirm the account shown after signing in.</p><HostedConnect key={selection.creatorId+':'+(selection.accountId??'new')} profileId={selection.creatorId} accountId={selection.accountId} disabled={lost} endpoint={endpoint} connection={connection} sessionMessage="Sign in to your dashboard again." onChanged={changed}/></>}
        {notice?<p role="status" className="mt-4 text-sm">{notice}</p>:null}
      </section>
    </div>:null}
  </>;
}

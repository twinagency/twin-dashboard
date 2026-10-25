'use client';

import {useEffect,useMemo,useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import HostedConnect from '@/components/creator-platforms/HostedConnect';
import {parseEnrollment,type ConnectionCreator} from '@/lib/onlyfans-connections/contract';
import {normalizeProxyInput} from '@/lib/onlyfans-connections/proxy';

const button='rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent disabled:opacity-50';
const field='mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-sm';
type Selection={creatorId:string;creatorName:string;accountId:string|null;proxyUrl:string|null};

export default function AdminOnlyFansSignIn({creators,accountId=null}:{creators:ConnectionCreator[];accountId?:string|null}){
  const router=useRouter(),alive=useRef(false);
  const [open,setOpen]=useState(false),[creatorId,setCreatorId]=useState(creators.length===1?creators[0].id:''),[proxy,setProxy]=useState(''),[notice,setNotice]=useState('');
  const [selection,setSelection]=useState<Selection|null>(null),[lost,setLost]=useState(false);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  const entry=normalizeProxyInput(proxy);
  const endpoint=selection?`/api/onlyfans-connections/creators/${encodeURIComponent(selection.creatorId)}/sign-in`:'';
  const connection=useMemo(()=>selection?{accountId:selection.accountId,proxyUrl:selection.proxyUrl}:undefined,[selection]);
  async function changed(enrollmentId?:string|null){
    if(!enrollmentId||!selection)return false;
    try{
      const response=await fetch(endpoint+'?enrollments=1',{credentials:'same-origin',cache:'no-store',redirect:'error'});
      if(!alive.current)return false;
      if([401,403].includes(response.status)){setLost(true);setProxy('');setSelection(null);setNotice('Sign in to your admin account again.');return false;}
      const body=await response.json();
      const enrollment=response.ok&&body?.ok===true&&Array.isArray(body.enrollments)?body.enrollments.map(parseEnrollment).find((row:ReturnType<typeof parseEnrollment>)=>row?.id===enrollmentId):null;
      if(!enrollment){setNotice('Connection status could not be confirmed. Keep this setup open and try again.');return false;}
      if(enrollment.status==='accepted'&&enrollment.accountId){
        setSelection(null);setProxy('');setOpen(false);
        router.push(`/onlyfans/accounts?creator=${encodeURIComponent(selection.creatorId)}&account=${encodeURIComponent(enrollment.accountId)}`);router.refresh();return true;
      }
      if(['failed','expired'].includes(enrollment.status)){setNotice('The connection could not be verified. Close setup and try signing in again.');return false;}
      setNotice('Verifying the account connection. Outgoing messages remain disabled.');return false;
    }catch{if(alive.current)setNotice('Connection status could not be confirmed. We will check again.');return false;}
  }
  function start(){
    const creator=creators.find(row=>row.id===creatorId);
    if(!creator||lost)return;
    if(accountId===null&&(!entry.ok||!entry.url||!['http:','https:','socks5:'].includes(new URL(entry.url).protocol))){setNotice('Enter this creator’s fixed HTTP, HTTPS or SOCKS5 proxy first.');return;}
    setNotice('');setSelection({creatorId:creator.id,creatorName:creator.name,accountId,proxyUrl:accountId===null&&entry.ok?entry.url:null});setProxy('');
  }
  return <>
    <button type="button" className={button} disabled={!creators.length} onClick={event=>{event.stopPropagation();setOpen(true);setNotice('');}}>{accountId?'Reconnect OnlyFans':'Sign in to OnlyFans'}</button>
    {open?<div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={event=>event.stopPropagation()}>
      <section role="dialog" aria-modal="true" aria-label="Admin OnlyFans connection" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-card p-5 text-ink shadow-xl">
        <div className="mb-5 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{accountId?'Reconnect OnlyFans':'Add OnlyFans account'}</h2><button type="button" className={button} onClick={()=>{setOpen(false);setSelection(null);setProxy('');}} aria-label="Close account sign-in">Close</button></div>
        {!selection?<div className="space-y-4">
          <label className="block text-sm">Creator<select className={field} value={creatorId} onChange={event=>setCreatorId(event.target.value)} disabled={!!accountId||lost}><option value="">Select creator</option>{creators.map(creator=><option key={creator.id} value={creator.id}>{creator.name}</option>)}</select></label>
          {accountId?<p className="text-sm text-muted">Sign in to this account through its saved proxy. Its model settings and used allowance are retained.</p>:<><label className="block text-sm">Creator’s fixed proxy<input className={field} type="password" autoComplete="off" placeholder="HOST:PORT:USER:PASS" value={proxy} disabled={lost} onChange={event=>setProxy(event.target.value)}/></label><p className="text-xs text-muted">Use this creator’s own proxy. The login and ongoing connection use the same network.</p></>}
          <button type="button" className={button} onClick={start} disabled={lost||!creatorId||(accountId===null&&(!entry.ok||!entry.url))}>Continue to OnlyFans login</button>
        </div>:<><p className="mb-3 text-sm text-muted">Connecting for {selection.creatorName}. Confirm the account shown after signing in.</p><HostedConnect key={selection.creatorId+':'+(selection.accountId??'new')} profileId={selection.creatorId} accountId={selection.accountId} disabled={lost} endpoint={endpoint} connection={connection} sessionMessage="Sign in to your admin account again." onChanged={changed}/></>}
        {notice?<p role="status" className="mt-4 text-sm">{notice}</p>:null}
      </section>
    </div>:null}
  </>;
}

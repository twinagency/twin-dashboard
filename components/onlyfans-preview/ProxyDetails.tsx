'use client';
import {useEffect,useState} from 'react';
import {parsePublicProxy,type PublicProxy} from '@/lib/onlyfans-managed-proxy/public';

export function ProxySummary({proxy}:{proxy:PublicProxy}) {
  let country = proxy.countryCode;
  if(country)try{country=new Intl.DisplayNames(['en'],{type:'region'}).of(country)??country;}catch{}
  return <div className="my-3 rounded-lg border border-line bg-card p-3 text-sm" role="status" aria-label="Assigned proxy">
    <p className="font-semibold">Proxy assigned</p>
    <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1"><dt>IP / host</dt><dd className="break-all font-mono">{proxy.host}</dd><dt>Country</dt><dd>{country??'Not recorded for this saved connection'}</dd></dl>
    <p className="mt-2 text-muted">{proxy.status==='verified'&&proxy.verifiedAt?'OnlyFans connection verified':proxy.status==='assigned'?'Assigned automatically. OnlyFans verification pending.':`OnlyFans connection: ${proxy.status}`}</p>
    {proxy.verifiedAt&&<p className="text-xs text-muted">Last account verification: {new Date(proxy.verifiedAt).toLocaleString()}</p>}
  </div>;
}
export default function ProxyDetails({creatorId,accountId}:{creatorId:string;accountId:string}) {
  const [open,setOpen]=useState(false),[proxy,setProxy]=useState<PublicProxy|null>(null),[notice,setNotice]=useState('');
  useEffect(()=>{
    if(!open)return;
    let active=true;const controller=new AbortController();setProxy(null);setNotice('Checking saved proxy...');
    void(async()=>{try{
      const response=await fetch(`/api/onlyfans-connections/creators/${encodeURIComponent(creatorId)}/sign-in?proxy=1&accountId=${encodeURIComponent(accountId)}`,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});
      const body=await response.json(),value=parsePublicProxy(body?.proxy);
      if(!active)return;
      if(!response.ok||body?.ok!==true||(body.proxy!==null&&!value)){setNotice(body?.error??'Proxy details could not be verified.');return;}
      setProxy(value);setNotice(value?'':'No proxy is recorded for this connection.');
    }catch{if(active)setNotice('Proxy details could not be verified. Close and reopen to retry.');}})();
    return()=>{active=false;controller.abort();};
  },[open,creatorId,accountId]);
  return <div className="inline-block align-top" onClick={event=>event.stopPropagation()}><button type="button" className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-accent" aria-expanded={open} onClick={()=>setOpen(!open)}>{open?'Hide proxy details':'Proxy details'}</button>{open&&<div>{proxy?<ProxySummary proxy={proxy}/>:<p role="status" className="my-2 text-sm">{notice}</p>}</div>}</div>;
}

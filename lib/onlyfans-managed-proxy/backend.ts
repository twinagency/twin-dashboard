import 'server-only';
import {createBackendTransport} from '@/lib/onlyfans/backend-transport';

import {validManagedProxySelection,type ManagedProxySelection,type ProxyCountry} from './model';
export class ManagedProxyError extends Error{
  constructor(readonly status:number,message:string){super(message);this.name='ManagedProxyError';}
}
const messages:Record<string,string>={
  proxy_stock_empty:'No connection slots are available right now. Please contact support.',
  assignment_country_conflict:'This account already has a connection assigned. Please contact support before changing it.',
  assigned_proxy_needs_attention:'This account’s connection needs attention. Please contact support before signing in.',
  inventory_checking:'Account setup is being prepared. Try again shortly.',
};
export function createManagedProxyBackend(options:{baseUrl:string;token:string;defaultCountry?:string;fetchImpl?:typeof fetch}){
  const call=createBackendTransport(options.fetchImpl),root=options.baseUrl.replace(/\/+$/,'');
  async function request(path:string,body?:unknown){
    let response:Response;
    try{response=await call(root+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+options.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),timeoutMs:8000});}
    catch{throw new ManagedProxyError(503,'Account setup could not be confirmed. Retry this account’s setup; its connection will be retained.');}
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.ok!==true)throw new ManagedProxyError(response.status===409?409:503,messages[result?.code]??'Account setup is temporarily unavailable. Please try again shortly.');
    return result;
  }
  return{
    async stock():Promise<ProxyCountry[]>{
      const body=await request('/v1/stock');
      if(body.provider!=='iproyal'||body.type!=='isp_dedicated'||!Array.isArray(body.countries)||body.countries.length>250
        ||!body.countries.every((c:ProxyCountry)=>c&&Object.keys(c).sort().join(',')==='available,code,name'&&/^[A-Z]{2}$/.test(c.code)&&typeof c.name==='string'&&c.name.length<=100&&Number.isSafeInteger(c.available)&&c.available>=0&&c.available<=10000))
        throw new ManagedProxyError(503,'Account setup could not be checked.');
      return body.countries;
    },
    async assign(creatorId:string,selection:ManagedProxySelection,actor:string):Promise<string>{
      if(!/^[A-Za-z0-9._:-]{1,64}$/.test(creatorId)||!validManagedProxySelection(selection)||!/^(?:op-session|creator-session):[a-f0-9]{64}$/.test(actor))throw new ManagedProxyError(400,'Review the creator and OnlyFans handle.');
      // The agency supplies only a handle. The platform chooses the inventory
      // region, keeping retries stable even when the last unused IP is claimed.
      const countryCode=selection.countryCode==='auto'?options.defaultCountry:selection.countryCode;
      if(!countryCode||!/^[A-Z]{2}$/.test(countryCode))throw new ManagedProxyError(503,'Account setup is temporarily unavailable. Please contact support.');
      const result=await request('/v1/assign',{creatorId,...selection,countryCode,actor});
      try{
        const url=new URL(result.proxyUrl);
        if(url.protocol!=='http:'||!/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||!url.port||!url.username||!url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();
        return result.proxyUrl;
      }catch{throw new ManagedProxyError(503,'Account setup could not be verified.');}
    },
  };
}
export function configuredManagedProxyBackend(){
  const baseUrl=(process.env.ONLYFANS_MANAGED_PROXY_BASE_URL??'').trim(),token=(process.env.ONLYFANS_MANAGED_PROXY_TOKEN??'').trim();
  if(!baseUrl||token.length<32)return null;
  try{const url=new URL(baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return null;}catch{return null;}
  const defaultCountry=(process.env.ONLYFANS_MANAGED_PROXY_DEFAULT_COUNTRY??'').trim().toUpperCase();
  return createManagedProxyBackend({baseUrl,token,defaultCountry});
}

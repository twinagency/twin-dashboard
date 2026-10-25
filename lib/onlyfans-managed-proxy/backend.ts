import 'server-only';
import {createBackendTransport} from '@/lib/onlyfans/backend-transport';

import {validManagedProxySelection,type ManagedProxySelection,type ProxyCountry} from './model';
export class ManagedProxyError extends Error{
  constructor(readonly status:number,message:string){super(message);this.name='ManagedProxyError';}
}
const messages:Record<string,string>={
  proxy_stock_empty:'No unused IPRoyal ISP proxy is available in that country. Add proxy stock or choose Use own proxy.',
  assignment_country_conflict:'This account already has a proxy assigned in another country. Keep its original country.',
  assigned_proxy_needs_attention:'This account’s assigned proxy needs attention. Contact your administrator before signing in.',
  inventory_checking:'The proxy pool is being checked. Try again shortly.',
};
export function createManagedProxyBackend(options:{baseUrl:string;token:string;fetchImpl?:typeof fetch}){
  const call=createBackendTransport(options.fetchImpl),root=options.baseUrl.replace(/\/+$/,'');
  async function request(path:string,body?:unknown){
    let response:Response;
    try{response=await call(root+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+options.token,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),timeoutMs:8000});}
    catch{throw new ManagedProxyError(503,'Proxy assignment could not be confirmed. Retry this account’s setup; an existing assignment will be retained.');}
    const result=await response.json().catch(()=>null);
    if(!response.ok||result?.ok!==true)throw new ManagedProxyError(response.status===409?409:503,messages[result?.code]??'Managed proxies are temporarily unavailable. Try again or choose Use own proxy.');
    return result;
  }
  return{
    async stock():Promise<ProxyCountry[]>{
      const body=await request('/v1/stock');
      if(body.provider!=='iproyal'||body.type!=='isp_dedicated'||!Array.isArray(body.countries)||body.countries.length>250
        ||!body.countries.every((c:ProxyCountry)=>c&&Object.keys(c).sort().join(',')==='available,code,name'&&/^[A-Z]{2}$/.test(c.code)&&typeof c.name==='string'&&c.name.length<=100&&Number.isSafeInteger(c.available)&&c.available>=0&&c.available<=10000))
        throw new ManagedProxyError(503,'The proxy pool could not be checked.');
      return body.countries;
    },
    async assign(creatorId:string,selection:ManagedProxySelection,actor:string):Promise<string>{
      if(!/^[A-Za-z0-9._:-]{1,64}$/.test(creatorId)||!validManagedProxySelection(selection)||!/^op-session:[a-f0-9]{64}$/.test(actor))throw new ManagedProxyError(400,'Review the creator, handle and proxy country.');
      const result=await request('/v1/assign',{creatorId,...selection,actor});
      try{
        const url=new URL(result.proxyUrl);
        if(url.protocol!=='http:'||!/^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)||!url.port||!url.username||!url.password||url.pathname!=='/'||url.search||url.hash)throw new Error();
        return result.proxyUrl;
      }catch{throw new ManagedProxyError(503,'The assigned proxy could not be verified.');}
    },
  };
}
export function configuredManagedProxyBackend(){
  const baseUrl=(process.env.ONLYFANS_MANAGED_PROXY_BASE_URL??'').trim(),token=(process.env.ONLYFANS_MANAGED_PROXY_TOKEN??'').trim();
  if(!baseUrl||token.length<32)return null;
  try{const url=new URL(baseUrl);if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)return null;}catch{return null;}
  return createManagedProxyBackend({baseUrl,token});
}

import 'server-only';
import {createBackendTransport} from '@/lib/onlyfans/backend-transport';
import {validBrowserSession,type BrowserSession} from '@/lib/creator-platforms/browser-connection';

export type SignInScope={creatorId:string;actor:string};
export type SignInNetwork={accountId:string|null;ownerId:number|null;proxyUrl:string|null;fingerprint:string};
export type SignInAttempt={id:string;phase:'opening'|'waiting'|'ready'|'submitted'|'cancelled'|'expired'|'failed'|'wrong_account';handle:string|null;expiresAt:string;enrollmentId:string|null;width:number;height:number;keyboard?:'email'|'password'|'text'|null};
export type SignInCapture={profileId:string;handle:string;session:BrowserSession&{networkFingerprint:string}};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
export class SignInBackendError extends Error{
  constructor(readonly status:number,message:string){super(message);this.name='SignInBackendError';}
}
export function parseSignInAttempt(value:unknown):SignInAttempt|null{
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const v=value as SignInAttempt;
  if(Object.keys(v).some(k=>!['id','phase','handle','expiresAt','enrollmentId','width','height','keyboard'].includes(k)))return null;
  if(!uuid(v.id)||!['opening','waiting','ready','submitted','cancelled','expired','failed','wrong_account'].includes(v.phase))return null;
  if(v.handle!==null&&(typeof v.handle!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(v.handle)))return null;
  if(typeof v.expiresAt!=='string'||!Number.isFinite(Date.parse(v.expiresAt))||(v.enrollmentId!==null&&!uuid(v.enrollmentId)))return null;
  if(v.width!==432||v.height!==720||(v.keyboard!==undefined&&v.keyboard!==null&&!['email','password','text'].includes(v.keyboard)))return null;
  return v;
}
export function createSignInBackend({baseUrl,token,fetchImpl}:{baseUrl:string;token:string;fetchImpl?:typeof fetch}){
  const transport=createBackendTransport(fetchImpl),root=baseUrl.replace(/\/+$/,'')+'/v1/attempts';
  const call=async(scope:SignInScope,path:string,body?:unknown)=>{
    const r=await transport(root+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'X-Twin-Creator':scope.creatorId,'X-Twin-Actor':scope.actor,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),timeoutMs:10000});
    if(!r.ok)throw new SignInBackendError([404,410].includes(r.status)?410:r.status===429?429:503,[404,410].includes(r.status)?'Your sign-in expired. Start again.':r.status===429?'Sign-in is busy. Please try again shortly.':'Sign-in could not be confirmed. Please try again.');
    return r;
  };
  const attempt=async(response:Response)=>{const body=await response.json();const value=body?.ok===true?parseSignInAttempt(body.attempt):null;if(!value)throw new Error('Your sign-in status could not be confirmed.');return value;};
  const suffix=(identity:string)=>{if(!uuid(identity))throw new Error('Your sign-in could not be found.');return '/'+identity;};
  return{
    start:(scope:SignInScope,startKey:string,network:SignInNetwork)=>call(scope,'',{startKey,network}).then(attempt),
    status:(scope:SignInScope,identity:string)=>call(scope,suffix(identity)).then(attempt),
    input:(scope:SignInScope,identity:string,input:unknown)=>call(scope,suffix(identity)+'/input',input).then(attempt),
    cancel:(scope:SignInScope,identity:string)=>call(scope,suffix(identity)+'/cancel',{}).then(attempt),
    acknowledge:(scope:SignInScope,identity:string,enrollmentId:string)=>call(scope,suffix(identity)+'/acknowledge',{enrollmentId}).then(attempt),
    async capture(scope:SignInScope,identity:string):Promise<SignInCapture>{
      const body=await(await call(scope,suffix(identity)+'/capture')).json();const c=body?.ok===true?body.capture:null;
      if(!c||Object.keys(c).sort().join(',')!=='handle,profileId,session'||c.profileId!==scope.creatorId||typeof c.handle!=='string'||!/^[A-Za-z0-9_.-]{1,80}$/.test(c.handle)||!c.session||!/^\w{64}$/.test(c.session.networkFingerprint??''))throw new Error('Your sign-in could not be verified.');
      const {networkFingerprint,...session}=c.session;
      if(!/^[a-f0-9]{64}$/.test(networkFingerprint)||!validBrowserSession(session))throw new Error('Your sign-in could not be verified.');
      return c;
    },
    async frame(scope:SignInScope,identity:string){const r=await call(scope,suffix(identity)+'/frame?format=png');if(!['image/jpeg','image/png'].includes(r.headers.get('content-type')?.split(';')[0]??''))throw new Error('Your sign-in screen could not be loaded.');const b=await r.arrayBuffer();const bytes=new Uint8Array(b),png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71,jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;if((r.headers.get('content-type')?.split(';')[0]==='image/png'?!png:!jpeg)||b.byteLength>2*1024*1024)throw new Error('Your sign-in screen could not be loaded.');return b;}
  };
}
export function configuredSignInBackend(){
  const baseUrl=(process.env.ONLYFANS_SIGNIN_BASE_URL??'').trim(),token=(process.env.ONLYFANS_SIGNIN_TOKEN??'').trim();
  if(!baseUrl||token.length<32||['API','CONTROL','CONFIGURATION','CAMPAIGN','CONTENT','CONNECTION'].some(p=>(process.env['ONLYFANS_'+p+'_TOKEN']??'').trim()===token))return null;
  try{const u=new URL(baseUrl);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash) return null;}catch{return null;}
  return createSignInBackend({baseUrl,token});
}

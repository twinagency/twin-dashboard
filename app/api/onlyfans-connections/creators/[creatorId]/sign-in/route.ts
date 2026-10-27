import {prepareManagedNetwork} from '@/lib/onlyfans-managed-proxy/prepare';
import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {PRIVATE_HEADERS} from '@/lib/onlyfans/route';
import {connectionAnswer,connectionRefusal} from '@/lib/onlyfans-connections/route';
import {configuredConnectionBackend} from '@/lib/onlyfans-connections/backend';
import {resolveConnectionCreator,connectionAccess,connectionSignInCommand} from '@/lib/onlyfans/connection-creators';
import {normalizeProxyInput} from '@/lib/onlyfans-connections/proxy';
import {ManagedProxyError} from '@/lib/onlyfans-managed-proxy/backend';
import {publicProxy} from '@/lib/onlyfans-managed-proxy/public';
import {validManagedProxySelection} from '@/lib/onlyfans-managed-proxy/model';
import {configuredSignInBackend,SignInBackendError,type SignInNetwork} from '@/lib/onlyfans-sign-in/backend';

export const dynamic='force-dynamic';
export const runtime='nodejs';
type Context={params:Promise<{creatorId:string}>};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9-]{36}$/.test(v);
const operator=(v:unknown):v is string=>typeof v==='string'&&/^op-session:[a-f0-9]{64}$/.test(v);
const fingerprint=(proxy:string|null)=>createHash('sha256').update('twin-capture-network.v1\0'+(proxy??'')).digest('hex');
const failed=(error:unknown)=>connectionRefusal(error instanceof SignInBackendError||error instanceof ManagedProxyError?error.status:503,error instanceof SignInBackendError||error instanceof ManagedProxyError?error.message:'OnlyFans sign-in could not be confirmed. Please try again.');
const pixels=(image:ArrayBuffer,extra:Record<string,string>={})=>new NextResponse(image,{headers:{...PRIVATE_HEADERS,'Content-Type':new Uint8Array(image)[0]===137?'image/png':'image/jpeg','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin',...extra}});

export async function GET(request:NextRequest,context:Context){
  const auth=await connectionAccess();if(auth instanceof NextResponse)return auth;
  if(!operator(auth.actor))return connectionRefusal(403,'Sign in to your admin account to manage connections.');
  const creator=await resolveConnectionCreator((await context.params).creatorId);
  if(!creator)return connectionRefusal(404,'That existing Twin creator is unavailable.');
  try{
    const native=configuredConnectionBackend();
    if(request.nextUrl.searchParams.get('proxy')==='1'){
      const accountId=request.nextUrl.searchParams.get('accountId');
      if(!accountId||!/^[A-Za-z0-9._:-]{1,64}$/.test(accountId))return connectionRefusal(400,'Select an account to view its proxy.');
      if(!native)return connectionRefusal(503,'Connection details are unavailable.');
      // This ownership check must precede both credential projection and status lookup.
      const saved=await native.captureContext(creator.id,accountId);
      if(!saved.ok)return connectionRefusal(saved.status,'This account does not belong to the selected creator.');
      const recorded=await native.get(accountId);
      if(!recorded.ok)return connectionRefusal(recorded.status,'Connection status could not be verified.');
      return connectionAnswer({ok:true,proxy:publicProxy(saved.data.proxyUrl,null,recorded.data.status,recorded.data.verifiedAt)});
    }
    if(request.nextUrl.searchParams.get('enrollments')==='1'){
      if(!native)return connectionRefusal(503,'Account connection management is unavailable.');
      const result=await native.enrollments(creator.id);
      return result.ok?connectionAnswer({ok:true,enrollments:result.data}):connectionRefusal(result.status,result.error);
    }
    const backend=configuredSignInBackend(),id=request.nextUrl.searchParams.get('attempt');
    if(!uuid(id))return connectionRefusal(400,'That sign-in attempt is invalid.');
    if(!backend)return connectionRefusal(503,'OnlyFans sign-in is temporarily unavailable.');
    const scope={creatorId:creator.id,actor:auth.actor};
    if(request.nextUrl.searchParams.get('frame')==='1')return pixels(await backend.frame(scope,id));
    return connectionAnswer({ok:true,attempt:await backend.status(scope,id)});
  }catch(error){return failed(error);}
}

export async function POST(request:NextRequest,context:Context){
  const ctx=await connectionSignInCommand(request);if(ctx instanceof NextResponse)return ctx;
  if(!operator(ctx.actor))return connectionRefusal(403,'Sign in to your admin account to manage connections.');
  const creator=await resolveConnectionCreator((await context.params).creatorId);
  if(!creator)return connectionRefusal(404,'That existing Twin creator is unavailable.');
  const b=ctx.body as Record<string,unknown>;
  if(!b||typeof b!=='object'||Array.isArray(b)||b.profileId!==creator.id)return connectionRefusal(400,'That sign-in request is invalid.');
  const keys=Object.keys(b).sort().join(',');
  const expected=b.action==='start'?'accountId,action,connection,profileId,startKey':b.action==='confirm'?'action,attempt,connection,profileId':b.action==='input'?'action,attempt,input,profileId':b.action==='cancel'?'action,attempt,profileId':'';
  if(!expected||keys!==expected||(b.action==='start'?!uuid(b.startKey):!uuid(b.attempt)))return connectionRefusal(400,'That sign-in request is invalid.');
  try{
    const backend=configuredSignInBackend(),native=configuredConnectionBackend();
    if(!backend||!native)return connectionRefusal(503,'OnlyFans sign-in is temporarily unavailable.');
    const scope={creatorId:creator.id,actor:ctx.actor},id=b.attempt as string;
    if(b.action==='input'){
      const attempt=await backend.input(scope,id,b.input);
      if(request.headers.get('accept')==='image/png'&&attempt.phase==='waiting'){
        try{return pixels(await backend.frame(scope,id),{'X-Twin-Sign-In-Attempt':encodeURIComponent(JSON.stringify(attempt))});}
        catch(error){if(error instanceof SignInBackendError&&[401,403,404,410].includes(error.status))throw error;}
      }
      // Never replay accepted input because a subsequent frame failed.
      return connectionAnswer({ok:true,attempt});
    }
    if(b.action==='cancel')return connectionAnswer({ok:true,attempt:await backend.cancel(scope,id)});
    const c=b.connection as {accountId:unknown;proxyUrl:unknown;managedProxy?:unknown};
    if(!c||typeof c!=='object'||Array.isArray(c)||!['accountId,proxyUrl','accountId,managedProxy,proxyUrl'].includes(Object.keys(c).sort().join(','))||!(c.accountId===null||typeof c.accountId==='string'&&/^[A-Za-z0-9._:-]{1,64}$/.test(c.accountId))||!(c.proxyUrl===null||typeof c.proxyUrl==='string'))return connectionRefusal(400,'Review the selected account and proxy.');
    const managed='managedProxy' in c;
    if(managed&&(c.accountId!==null||c.proxyUrl!==null||!validManagedProxySelection(c.managedProxy)))return connectionRefusal(400,'Review the managed proxy country and OnlyFans handle.');
    if(managed&&creator.expectedHandle&&(c.managedProxy as {handle:string}).handle!==creator.expectedHandle.toLowerCase())return connectionRefusal(409,'The OnlyFans handle does not match this creator.');
    if(b.action==='start'&&b.accountId!==c.accountId)return connectionRefusal(400,'The selected account changed. Start again.');
    const existing=await native.captureContext(creator.id,c.accountId as string|null);
    if(!existing.ok)return connectionRefusal(existing.status,'The selected account connection could not be prepared.');
    let network:SignInNetwork=existing.data;
    if(c.accountId===null){
      if(managed){
        network=await prepareManagedNetwork(creator.id,c.managedProxy as import('@/lib/onlyfans-managed-proxy/model').ManagedProxySelection,ctx.actor);
      }else{
        const entry=normalizeProxyInput(c.proxyUrl??'');
        if(!entry.ok||!entry.url||!['http:','https:','socks5:'].includes(new URL(entry.url).protocol))return connectionRefusal(400,'Enter this creator’s fixed HTTP, HTTPS or SOCKS5 proxy before signing in.');
        network={accountId:null,ownerId:null,proxyUrl:entry.url,fingerprint:fingerprint(entry.url)};
      }
    }else if(c.proxyUrl!==null)return connectionRefusal(400,'Reconnect uses the account’s saved proxy.');
    if(b.action==='start'){
      const country=managed?(c.managedProxy as {countryCode:string}).countryCode:null;
      const countryCode=country==='auto'?(process.env.ONLYFANS_MANAGED_PROXY_DEFAULT_COUNTRY??'').trim().toUpperCase():country;
      return connectionAnswer({ok:true,attempt:await backend.start(scope,b.startKey as string,network),proxy:publicProxy(network.proxyUrl,countryCode)});
    }
    const status=await backend.status(scope,id);
    if(status.phase==='submitted'&&status.enrollmentId)return connectionAnswer({ok:true,attempt:status});
    const capture=await backend.capture(scope,id);
    if(c.accountId===null&&((creator.expectedHandle&&capture.handle.toLowerCase()!==creator.expectedHandle.toLowerCase())||(managed&&capture.handle.toLowerCase()!==(c.managedProxy as {handle:string}).handle)))
      return connectionRefusal(409,'The signed-in OnlyFans handle does not match this creator. Sign in to the matching account.');
    if(capture.session.networkFingerprint!==network.fingerprint||(network.ownerId!==null&&capture.session.ownerId!==network.ownerId))return connectionRefusal(409,'The account or proxy changed after sign-in. Start again.');
    const command={creatorId:creator.id,creatorName:creator.name,handle:capture.handle,session:capture.session,...(c.accountId===null?{initialProxyUrl:network.proxyUrl}:{})};
    const result=await native.enroll({...command,...ctx.identity('admin-enroll-account',command)});
    if(!result.ok)return connectionRefusal(result.status,result.error);
    let acknowledged;
    try{acknowledged=await backend.acknowledge(scope,id,result.data.id);}catch{}
    return connectionAnswer({ok:true,attempt:acknowledged??{...status,phase:'submitted',enrollmentId:result.data.id}});
  }catch(error){return failed(error);}
}


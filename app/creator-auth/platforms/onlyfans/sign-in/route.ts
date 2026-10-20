import {createHash} from 'node:crypto';
import {NextRequest,NextResponse} from 'next/server';
import {configuredSignInBackend,SignInBackendError} from '@/lib/onlyfans-sign-in/backend';
import {configuredConnectionBackend} from '@/lib/onlyfans-connections/backend';
import {platformCommand,platformIdentity,platformProfile,platformFailure,platformResponse,ownedPlatformAccounts} from '@/lib/creator-platforms/server';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const attemptId=(value:unknown):value is string=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const actorFor=(account:string)=>'creator-session:'+createHash('sha256').update(account).digest('hex');

export async function GET(request:NextRequest){
  const creator=await platformIdentity(true);if(creator instanceof NextResponse)return creator;
  try{
    const profile=await platformProfile(creator),backend=configuredSignInBackend(),identity=request.nextUrl.searchParams.get('attempt');
    if(!backend||!profile.id)return platformFailure(503,'OnlyFans sign-in is temporarily unavailable. Please try again shortly.');
    if(!attemptId(identity))return platformFailure(400,'Your sign-in could not be found.');
    const scope={creatorId:profile.id,actor:actorFor(creator.accountId)};
    if(request.nextUrl.searchParams.get('frame')==='1'){
      const image=await backend.frame(scope,identity);
      return new NextResponse(image,{headers:{'Content-Type':'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
    }
    return platformResponse({ok:true,attempt:await backend.status(scope,identity)});
  }catch(error){return platformFailure(error instanceof SignInBackendError?error.status:503,error instanceof Error?error.message:'Your sign-in could not be loaded.');}
}

export async function POST(request:NextRequest){
  const ctx=await platformCommand(request);if(ctx instanceof NextResponse)return ctx;
  const b=ctx.body as Record<string,unknown>;
  if(!b||typeof b!=='object'||Array.isArray(b)||typeof b.action!=='string'||typeof b.profileId!=='string')return platformFailure(400,'That sign-in request could not be read.');
  const keys=Object.keys(b).sort().join(',');
  if(b.action==='start'?(keys!=='accountId,action,profileId,startKey'||!attemptId(b.startKey)||!(b.accountId===null||typeof b.accountId==='string')):!['input','confirm','cancel'].includes(b.action)||!attemptId(b.attempt)||keys!==(b.action==='input'?'action,attempt,input,profileId':'action,attempt,profileId'))return platformFailure(400,'That sign-in request could not be read.');
  try{
    const profile=await platformProfile(ctx.creator);
    if(!profile.id||b.profileId!==profile.id)return platformFailure(409,'Your creator profile changed. Start sign-in again.');
    const backend=configuredSignInBackend(),native=configuredConnectionBackend();
    if(!backend||!native)return platformFailure(503,'OnlyFans sign-in is temporarily unavailable. Please try again shortly.');
    const scope={creatorId:profile.id,actor:actorFor(ctx.creator.accountId)};
    if(b.action==='start'){
      if(b.accountId!==null&&!(await ownedPlatformAccounts(profile.id)).some(a=>a.accountId===b.accountId))return platformFailure(404,'That account is unavailable.');
      const context=await native.captureContext(profile.id,b.accountId as string|null);
      if(!context.ok)return platformFailure(503,'Your account connection could not be prepared. Please try again.');
      return platformResponse({ok:true,attempt:await backend.start(scope,b.startKey as string,context.data)});
    }
    const identity=b.attempt as string;
    if(b.action==='input')return platformResponse({ok:true,attempt:await backend.input(scope,identity,b.input)});
    if(b.action==='cancel')return platformResponse({ok:true,attempt:await backend.cancel(scope,identity)});
    const status=await backend.status(scope,identity);
    if(status.phase==='submitted'&&status.enrollmentId)return platformResponse({ok:true,attempt:status});
    const capture=await backend.capture(scope,identity);
    const command={creatorId:profile.id,creatorName:ctx.creator.creatorName,handle:capture.handle,session:capture.session};
    const result=await native.enroll({...command,...ctx.identity('enroll-account',command)});
    if(!result.ok)return platformFailure(result.status,result.error);
    // Durable native acceptance comes first. If this acknowledgement is lost,
    // the same frozen capture yields the same existing enrollment command.
    let acknowledged;
    try{acknowledged=await backend.acknowledge(scope,identity,result.data.id);}catch{}
    return platformResponse({ok:true,attempt:acknowledged??{...status,phase:'submitted',enrollmentId:result.data.id}});
  }catch(error){return platformFailure(error instanceof SignInBackendError?error.status:503,error instanceof Error?error.message:'Your sign-in could not be confirmed. Please try again.');}
}

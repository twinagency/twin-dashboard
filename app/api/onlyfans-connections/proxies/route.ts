import {NextResponse} from 'next/server';
import {connectionAccess} from '@/lib/onlyfans/connection-creators';
import {connectionAnswer,connectionRefusal} from '@/lib/onlyfans-connections/route';
import {configuredManagedProxyBackend,ManagedProxyError} from '@/lib/onlyfans-managed-proxy/backend';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
  const auth=await connectionAccess();if(auth instanceof NextResponse)return auth;
  const broker=configuredManagedProxyBackend();
  if(!broker)return connectionAnswer({ok:true,configured:false,countries:[]});
  try{return connectionAnswer({ok:true,configured:true,countries:await broker.stock()});}
  catch(error){return connectionRefusal(error instanceof ManagedProxyError?error.status:503,error instanceof ManagedProxyError?error.message:'The proxy pool could not be checked.');}
}

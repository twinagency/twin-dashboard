import 'server-only';
import {createHash} from 'node:crypto';
import {configuredManagedProxyBackend,ManagedProxyError} from '@/lib/onlyfans-managed-proxy/backend';
import type {ManagedProxySelection} from './model';
import type {SignInNetwork} from '@/lib/onlyfans-sign-in/backend';
export const pendingCreatorHandle=(id:string)=>'pending_'+createHash('sha256').update(id).digest('hex').slice(0,32);
export async function prepareManagedNetwork(creatorId:string,selection:ManagedProxySelection,actor:string):Promise<SignInNetwork>{
  const broker=configuredManagedProxyBackend();
  if(!broker)throw new ManagedProxyError(503,'Automatic connection setup is temporarily unavailable.');
  const proxyUrl=await broker.assign(creatorId,selection,actor);
  return {accountId:null,ownerId:null,proxyUrl,
    fingerprint:createHash('sha256').update('twin-capture-network.v1\0'+proxyUrl).digest('hex')};
}
export const prepareCreatorNetwork=(creatorId:string,actor:string)=>
  prepareManagedNetwork(creatorId,{countryCode:'auto',handle:pendingCreatorHandle(creatorId)},actor);

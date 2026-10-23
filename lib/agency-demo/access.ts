import { cookies } from 'next/headers';
import { agencyIdentity } from '@/lib/agency-identity';
import { AGENCY_COOKIE } from '@/lib/agency-policy';
import { hasInternalAdminAccess } from '@/lib/internal-admin';

/** Each document request verifies a real dashboard identity before serving samples. */
export async function canOpenAgencyDemo():Promise<boolean>{
 if(await hasInternalAdminAccess())return true;
 const token=(await cookies()).get(AGENCY_COOKIE)?.value;
 if(!token)return false;
 try{return !!await agencyIdentity(token)}catch{return false}
}

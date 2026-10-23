import { redirect } from 'next/navigation';
import { canOpenAgencyDemo } from '@/lib/agency-demo/access';
export const dynamic='force-dynamic';
export default async function AgencyDemoPage(){
 if(!await canOpenAgencyDemo())redirect('/agency/login');
 return <main style={{height:'100dvh',background:'#f5f7fa'}}><iframe title="Twin Hybrid CRM demonstration workspace" src="/agency/demo/preview" sandbox="allow-scripts allow-downloads" allow="fullscreen" style={{width:'100%',height:'100%',border:0,display:'block'}}/></main>;
}

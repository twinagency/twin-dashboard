import { gunzipSync } from 'node:zlib';
import compiled from '@/lib/agency-demo/compiled.json';
import { canOpenAgencyDemo } from '@/lib/agency-demo/access';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function GET(){
 if(!await canOpenAgencyDemo())return new Response('Authentication required',{status:401,headers:{'Cache-Control':'no-store'}});
 const html=gunzipSync(Buffer.from(compiled.html,'base64')).toString('utf8');
 return new Response(html,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','Content-Security-Policy':"frame-ancestors 'self'; sandbox allow-scripts allow-downloads"}});
}

// Read-only launch readiness check for one verified creator. No credentials or fan data are logged.
const dns=require('node:dns');const net=require('node:net');
dns.setDefaultResultOrder('ipv4first');net.setDefaultAutoSelectFamily(false);
const ID='6ca0782d-b5cf-433d-8329-f3ef7ec5f011';
async function main(){
 const base=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_KEY;
 if(!base||!key)throw Error('Missing server configuration');
 const headers={apikey:key,Authorization:`Bearer ${key}`};
 async function rows(path){const r=await fetch(`${base}/rest/v1/${path}`,{headers,signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('Database lookup failed');return r.json();}
 const [clone]=await rows(`clones?select=id,slug,business_username,bot_token&id=eq.${ID}`);
 if(!clone||clone.slug!=='alanna-pow'||clone.business_username!=='alannapowofficialx')throw Error('Creator mapping mismatch');
 async function tg(method,body={}){const r=await fetch(`https://api.telegram.org/bot${clone.bot_token}/${method}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!j.ok)throw Error(`Telegram ${method} failed`);return j.result;}
 const me=await tg('getMe');const menu=await tg('getChatMenuButton');
 console.log('ALANNA_LAUNCH '+JSON.stringify({creatorId:ID,slug:clone.slug,businessUsername:clone.business_username,botUsername:me.username,hasMainApp:me.has_main_web_app===true,menuType:menu.type,menuUrl:menu.web_app?.url??null}));
 const connections=await rows(`users?select=business_connection_id&clone_id=eq.${ID}&business_connection_id=not.is.null&order=last_message_received.desc.nullslast&limit=1`);
 if(!connections.length){console.log('ALANNA_PROFILE unavailable:no-business-connection');return;}
 const connection=await tg('getBusinessConnection',{business_connection_id:connections[0].business_connection_id});
 console.log('ALANNA_BUSINESS '+JSON.stringify({username:connection.user?.username,enabled:connection.is_enabled,canReply:connection.rights?.can_reply??connection.can_reply,canPin:connection.rights?.can_delete_all_messages,hasUserId:!!connection.user?.id}));
 if(connection.user?.username?.toLowerCase()!==clone.business_username.toLowerCase())throw Error('Telegram creator username mismatch');
 try{
  const photos=await tg('getUserProfilePhotos',{user_id:connection.user.id,limit:1});
  const photo=photos.photos?.[0]?.[0];if(!photo){console.log('ALANNA_PROFILE unavailable:no-public-photo');return;}
  const file=await tg('getFile',{file_id:photo.file_id});
  const response=await fetch(`https://api.telegram.org/file/bot${clone.bot_token}/${file.file_path}`,{signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error('Photo download failed');
  const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>12000)throw Error('Profile exceeds diagnostic output limit');
  console.log('ALANNA_PROFILE '+JSON.stringify({source:'Telegram getUserProfilePhotos',username:connection.user.username,mime:response.headers.get('content-type'),width:photo.width,height:photo.height,base64:bytes.toString('base64')}));
 }catch{console.log('ALANNA_PROFILE unavailable:profile-read-failed');}
}
main().catch(error=>{console.error('ALANNA_CHECK '+(error?.message&&/^(Missing server configuration|Database lookup failed|Creator mapping mismatch|Telegram [A-Za-z]+ failed|Telegram creator username mismatch)$/.test(error.message)?error.message:'Launch check failed'));process.exitCode=1;});

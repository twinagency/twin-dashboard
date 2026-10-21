// Read-only HTTP diagnosis. No credentials, fan IDs, messages or URLs are logged.
(async()=>{
 const db=await fetch(process.env.SUPABASE_URL+'/rest/v1/clones?select=id,slug&slug=eq.briana-redd&limit=1',{headers:{apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_KEY}}).then(r=>r.json());
 const clone=db[0];if(!clone)throw Error('Existing creator unavailable');
 const users=await fetch(process.env.SUPABASE_URL+'/rest/v1/users?'+new URLSearchParams({select:'telegram_id',clone_id:'eq.'+clone.id,order:'last_message_received.desc.nullslast',limit:'1'}),{headers:{apikey:process.env.SUPABASE_SERVICE_KEY,Authorization:'Bearer '+process.env.SUPABASE_SERVICE_KEY}}).then(r=>r.json());
 const upstream=process.env.BOT_V2_URL||'http://172.31.6.134:4300';
 const results=[];let rows;
 async function read(label,endpoint,params,close=false){const start=Date.now();try{const r=await fetch(upstream+'/api/'+endpoint+'?'+new URLSearchParams({girl:clone.slug,...params}),{headers:close?{connection:'close'}:{},signal:AbortSignal.timeout(10000)});const text=await r.text();results.push({read:label,ms:Date.now()-start,status:r.status,bytes:Buffer.byteLength(text)});return r.ok?JSON.parse(text):null}catch(e){results.push({read:label,ms:Date.now()-start,error:e.name,code:e.cause?.code||e.code||null});return null}}
 rows=await read('fans','fans',{});
 if(rows?.length){await read('raw-history','chat-history',{chatId:String(rows[0].chatId)});await read('stored-history','chat-history',{chatId:String(users[0].telegram_id)});await read('stored-history-close','chat-history',{chatId:String(users[0].telegram_id)},true);await read('raw-history-close','chat-history',{chatId:String(rows[0].chatId)},true)}
 console.log(JSON.stringify({connectionChecks:results,readOnly:true}));
})().catch(e=>{console.error(e.name);process.exitCode=1});

/* Read-only checks of the live default Overview. Runtime credentials stay inside FLIRT. */
const origin='https://dashboard.flirtaiagency.com';
const id='2e5eb05f-cc88-4ba6-870a-924948d4b09a';
const checks=[];
function assert(ok,label){if(!ok)throw new Error(label)}
async function request(path,options={}){return fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(240000),...options})}
(async()=>{
 assert(process.env.FLIRT_SUPABASE_PROJECT_REF==='lkmfwpqegjluirfusnaw','Expected FLIRT runtime');
 const login=await request('/admin-auth',{method:'POST',headers:{Origin:origin},body:new URLSearchParams({password:process.env.DASHBOARD_PASSWORD,next:'/revenue'})});
 const signed=login.headers.getSetCookie().find(v=>v.startsWith('allie_admin_session='));
 assert(login.status===303&&signed,'Normal FLIRT sign-in failed');
 const cookie=signed.split(';')[0]+'; clone_scope='+id;
 const read=path=>request(path,{headers:{Cookie:cookie,Origin:origin}});
 const presentationResponse=await read('/api/creator-overview?clone='+id);
 assert(presentationResponse.ok,'Overview presentation failed');
 const overview=await presentationResponse.json();
 assert(overview.presentation.id===id&&overview.audience.total>0,'Creator and audience must resolve');
 const photos=[overview.presentation.hero,overview.presentation.avatar,...overview.presentation.library];
 assert(photos.length===5&&new Set(photos.map(p=>p.id)).size===5,'Overview requires five different photos');
 checks.push('Selected creator and five different private photographs');
 const monthlyResponse=await read('/api/dashboard?clone='+id+'&period=1M&fresh=1');
 assert(monthlyResponse.ok,'Default 30-day earnings failed');
 const monthly=await monthlyResponse.json();
 const stats=monthly.perClone?.[id];
 assert(stats&&Number.isFinite(stats.stars)&&Array.isArray(monthly.series),'Monthly revenue must have real data');
 const chartStars=monthly.series.reduce((sum,row)=>sum+(Number(row[id])||0),0);
 assert(Math.abs(chartStars-stats.stars)<.001,'Chart and earnings total must agree');
 checks.push('Default 30-day chart and selected creator earnings agree');
 const response=await read('/revenue');const html=await response.text();
 assert(response.ok&&html.includes('data-creator-overview="'+id+'"'),'Live Overview page failed');
 assert((html.match(/data-photo-id="/g)||[]).length===5,'Live page must render the portrait, banner and three library photos');
 assert(html.includes('Top fans')&&html.includes('Best-selling content'),'Live ranking panels missing');
 assert(!monthly.rankingsError&&monthly.rankings?.fans.length&&monthly.rankings?.content.length,'Live payment rankings unavailable');
 assert(monthly.rankings.fans.some(f=>f.cloneId===id),'Selected creator top fans unavailable');
 assert(monthly.rankings.content.some(c=>c.cloneId===id&&c.purchases>0),'Selected creator content ranking unavailable');
 assert(html.includes('Total fans')&&html.includes('OnlyFans')&&html.includes('WhatsApp')&&html.includes('Not connected'),'Expected summary and connection states');
 checks.push('Live Overview renders distinct photographs, live rankings and summary cards');
 console.log(JSON.stringify({passed:true,creator:overview.presentation.name,all_time_fans:overview.audience.total,period:'1M',net_stars:stats.stars,purchases:stats.sales,chart_matches_total:true,checks,credentials_logged:false}));
})().catch(e=>{console.log(JSON.stringify({passed:false,error:e.message,checks,credentials_logged:false}));process.exitCode=1});


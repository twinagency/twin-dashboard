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
 const home=await read('/revenue');const homeHtml=await home.text();
 assert(home.ok&&homeHtml.includes('data-agency-overview="flirt"')&&homeHtml.includes('data-creator-overview="all"'),'Homepage must default to All creators even with a saved creator cookie');
 checks.push('Default All creators homepage ignores the last selected creator');
 const response=await read('/revenue?clone='+id);const html=await response.text();
 assert(response.ok&&html.includes('data-creator-overview="'+id+'"'),'Live Overview page failed');
 assert(html.includes('All creators overview'),'Individual Overview must expose its return to All creators');
 assert(html.includes('data-shared-overview="flirt"')&&html.includes('Dashboard overview'),'Shared layout must render the selected creator');
 assert(html.includes('Earnings overview')&&html.includes('Revenue performance')&&html.includes('Recent purchases')&&html.includes('Detailed reporting'),'Shared reporting sections missing');
 assert(!monthly.rankingsError&&monthly.rankings?.fans.length&&monthly.rankings?.content.length,'Live payment rankings unavailable');
 assert(monthly.rankings.fans.some(f=>f.cloneId===id),'Selected creator top fans unavailable');
 assert(monthly.rankings.content.some(c=>c.cloneId===id&&c.purchases>0),'Selected creator content ranking unavailable');
 assert(html.includes('Total fans')&&html.includes('Reporting period')&&html.includes('Custom dates'),'Expected summary and date controls');
 checks.push('Live Overview renders shared profile, reporting controls, charts and summary cards');
 console.log(JSON.stringify({passed:true,creator:overview.presentation.name,all_time_fans:overview.audience.total,period:'1M',net_stars:stats.stars,purchases:stats.sales,chart_matches_total:true,checks,credentials_logged:false}));
})().catch(e=>{console.log(JSON.stringify({passed:false,error:e.message,checks,credentials_logged:false}));process.exitCode=1});

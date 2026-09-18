'use strict';
// Standalone public visual, adapted from TwinAssistant.tsx blob 83bb5068a6d4ab517a9ce810c16d4bdccaa515a7.
// No dashboard authentication, credentials, APIs, random learning timers or canned AI responses.
const $ = id => document.getElementById(id);
const makeFeature = (id,name,description,inputs,process,output,controls) => ({id,name,description,inputs,process,output,controls});
const F = makeFeature;
const CATALOGUE = [
{id:'identity',name:'Identity & Memory',description:'An AI identity shaped by your communication style, business knowledge and relevant customer context.',features:[
F('identity-personality','Identity & Personality','Configure tone, vocabulary, communication preferences and behavioural boundaries using approved examples.','Approved examples','Identity configuration','Consistent communication','Review examples and boundaries before enabling customer-facing use.'),
F('business-knowledge','Business Knowledge','Retrieve relevant information from approved documents, products, policies and operating procedures.','Approved documents','Relevant retrieval','Source-grounded response','Keep sources current and restrict retrieval to authorised documents.'),
F('persistent-memory','Persistent Memory','Retain relevant preferences, decisions and unresolved requests to support continuity between conversations.','Relevant interactions','Scoped memory','Contextual continuity','Save selected facts with source and access boundaries, not indiscriminate transcripts.'),
F('relationship-context','Relationship Context','Bring together relevant history, current needs and outstanding commitments for an individual customer.','Verified relationship','Context assembly','Customer summary','Confirm identity before joining context across channels.'),
F('memory-management','Memory Management','Review, correct and control saved information, including its source and permitted use.','Saved context','Review and correction','Updated memory','Define retention and deletion arrangements for the implementation.') ]},
{id:'communication',name:'Voice Cloning & Communication',description:'Consistent, personalised communication through contextual conversations and an authorised cloned voice.',features:[
F('voice-cloning','Voice Cloning','Configure an authorised voice identity for generated speech, with approved samples and usage controls.','Authorised recordings','Voice configuration','Approved speech','Requires the voice owner’s permission and approved recordings. No cloned audio sample is connected to this preview.'),
F('conversational-intelligence','Conversational Intelligence','Interpret requests and manage multi-step conversations in the configured communication style.','Customer request','Context and intent','Relevant response','Use approved knowledge and escalate requests outside the configured scope.'),
F('voice-messages','Personalised Voice Messages','Deliver spoken responses informed by the conversation and relevant available information.','Approved response','Voice generation','Voice message','Requires authorised voice configuration and a supported delivery channel.'),
F('speech-interaction','Speech Interaction','Support spoken requests and audio responses where the selected interface and deployment allow them.','Spoken request','Recognition and routing','Relevant response','Microphone access is opt-in. Speech-provider processing must be disclosed.'),
F('human-handover','Human Handover','Transfer relevant history and unresolved questions to an operator while pausing automated responses.','Escalation condition','Pause and transfer','Human-led conversation','Automation must remain paused until an authorised operator resumes it.') ]},
{id:'automation',name:'Business Automation',description:'Coordinate routine work across connected systems, with defined triggers, approval rules and operational visibility.',features:[
F('workflow-orchestration','Workflow Orchestration','Coordinate multi-step processes, conditions, approvals and exceptions across connected software.','Defined trigger','Controlled workflow','Verified result','Apply approvals, duplicate-operation protection and exception handling.'),
F('email-automation','Email Automation','Identify messages requiring attention, prepare contextual responses and manage approved email workflows.','Permitted email','Triage and drafting','Reviewed reply','Requires a supported mailbox connection. Sending scope and approval are configured separately.'),
F('calendar-tasks','Calendar & Task Automation','Coordinate appointments, reminders, assignments and outstanding commitments.','Availability and tasks','Scheduling rules','Coordinated work','Check availability and time zones before committing appointments.'),
F('documents-data','Document & Data Automation','Extract information, prepare documents and update records through validation and review.','Approved documents','Extraction and review','Structured records','Validate required fields and request human review where information is uncertain.'),
F('automated-briefings','Automated Briefings & Reporting','Assemble scheduled summaries of priorities, unresolved work, business changes and exceptions.','Connected records','Priority synthesis','Owner briefing','Retain source context and show freshness. Missing information is not a zero.') ]},
{id:'sales',name:'Sales & Customer Automation',description:'Manage the customer journey from first enquiry through conversion, delivery and ongoing engagement.',features:[
F('lead-qualification','Lead Qualification & Routing','Capture requirements, apply qualification criteria and route enquiries to the appropriate person or workflow.','Incoming enquiry','Qualification criteria','Routed opportunity','Use business-approved criteria and retain a clear human escalation route.'),
F('nurturing-follow-up','Nurturing & Follow-Up Automation','Continue relevant conversations using customer context, timing rules and clear stopping conditions.','Eligible conversation','Contextual follow-through','Relevant contact','Respect opt-outs and channel rules. Pause on replies, purchases or human takeover as configured.'),
F('pipeline-intelligence','Pipeline Intelligence','Surface stalled opportunities, missing information and potential next steps using connected deal records.','Deal records','Progress analysis','Prioritised next steps','Requires a supported CRM connection. Recommendations are not guaranteed sales predictions.'),
F('customer-lifecycle','Customer Lifecycle Automation','Coordinate progress updates, delivery communication, aftercare and appropriate review or referral requests.','Verified milestone','Communication rules','Customer update','Do not invent a delivery status or promise. Use verified operational records.'),
F('retention','Re-engagement & Retention','Reconnect with eligible inactive leads or customers using previous interests and relationship context.','Eligible relationships','Re-engagement rules','Contextual outreach','Apply consent, suppression and frequency controls before contacting anyone.') ]},
{id:'crm',name:'CRM & Integrations',description:'Manage relationships through Twin’s CRM and connect the Intelligence Core to the systems your business already uses.',features:[
F('crm-workspace','CRM Workspace','Customer or fan records, conversation history, notes and the information required to manage each relationship.','Relationship records','Organised workspace','Operator context','Keep channel identities and permissions explicit. Available workflows depend on connected systems.'),
F('content-commerce','Content & Commerce','Approved media, offers, bundles, pricing and purchase or delivery records for supported use cases.','Approved catalogue','Offer and eligibility','Relevant content','Verify ownership, permitted channels, pricing and delivery status before offering content.'),
F('revenue-performance','Revenue & Performance','Sales visibility, conversion reporting and performance analysis with clear definitions and channel breakdowns.','Transaction records','Defined metrics','Performance reporting','Preserve source currencies, fees and refunds. Do not merge incompatible conversion populations.'),
F('team-collaboration','Team Collaboration','Operator assignments, shared workflows, human oversight and access appropriate to each team member.','Team permissions','Assignment and review','Coordinated response','Team workflows and permissions are configured for the implementation.'),
F('system-integrations','System Integrations','Supported connections to CRMs, email, calendars, messaging platforms and databases through connectors, APIs and webhooks.','Supported connection','Scoped data exchange','Connected workflow','Connector availability and read/write scope are verified during implementation, not assumed.') ]},
{id:'privacy',name:'Private Intelligence',description:'Deployment and governance options designed around how your organisation stores, accesses and processes information.',features:[
F('deployment','Deployment Options','Dedicated or customer-controlled environments scoped to an organisation’s requirements.','Deployment requirements','Environment design','Agreed architecture','Custom deployment. Customer-controlled hosting does not automatically eliminate external processing.'),
F('access-permissions','Access & Permissions','Define which users, services and support personnel may access information or perform permitted operations.','Authorised role','Permission checks','Scoped access','Specify support access, approval, time limits and revocation for the deployment.'),
F('data-boundaries','Data & Memory Boundaries','Control separation between organisations, customer relationships, creators and communication channels.','Scoped information','Boundary enforcement','Permitted context','Identity verification and memory-sharing rules must be designed and tested.'),
F('audit-approvals','Approval & Audit Controls','Establish review requirements and maintain records of permitted operations, access and changes.','Requested operation','Approval and record','Traceable outcome','Separate attempted work from successful delivery. Limit access to audit records.'),
F('data-lifecycle','Data Lifecycle Management','Define retention, export and deletion arrangements for business information and saved context.','Stored information','Lifecycle rules','Managed retention','Include backups and provider retention when defining export and deletion arrangements.'),
F('ai-provider-controls','AI Provider Controls','Identify approved model and voice providers, the information they process and applicable configuration.','Provider requirements','Processing review','Approved provider scope','Specify approved providers, retention, processing locations and permitted data flows.') ]}
];
const getCategory = id => CATALOGUE.find(c => c.id===id);
function parseHash(hash){const parts=hash.replace(/^#/,'').split('/');if(parts[0]!=='core')return {view:'home'};const c=getCategory(parts[1]);if(!c)return {view:'core'};const f=c.features.find(x=>x.id===parts[2]);return {view:'core',category:c.id,...(f?{feature:f.id}:{})};}
const hashFor = s => s.view==='home'?'':`#core${s.category?'/'+s.category:''}${s.feature?'/'+s.feature:''}`;
function parentOf(s){return s.feature?{view:'core',category:s.category}:s.category?{view:'core'}:{view:'home'};}
const normalise = q => q.toLowerCase().replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();
function resolveIntent(raw,current){
 const q=normalise(raw), open=(category,feature)=>({kind:'open',state:{view:'core',category,...(feature?{feature}:{})}});
 if(/^(please )?(go |take me )?back( please)?$/.test(q))return {kind:'back'};
 if(/\b(show all|all capabilities|all categories|main menu|back to core)\b/.test(q))return {kind:'open',state:{view:'core'}};
 if(/^(go |take me )?(home|exit core)( please)?$/.test(q))return {kind:'open',state:{view:'home'}};
 for(const c of CATALOGUE)if(q===normalise(c.name)||q===`show me ${normalise(c.name)}`||q===`open ${normalise(c.name)}`)return open(c.id);
 for(const c of CATALOGUE)for(const f of c.features)if(q.includes(normalise(f.name)))return open(c.id,f.id);
 const rules=[[/memory bound|data bound|isolat/,'privacy','data-boundaries'],[/audit|approval/,'privacy','audit-approvals'],[/data ownership|own my data|customer controlled|hosting|deployment/,'privacy','deployment'],[/\baccess\b|permission/,'privacy','access-permissions'],[/delete|deletion|export|data retention/,'privacy','data-lifecycle'],[/provider|processor/,'privacy','ai-provider-controls'],[/security|secure|privacy|private|data protection/,'privacy'],[/clon.*voice|voice.*clon|replicat.*voice/,'communication','voice-cloning'],[/human|handover|takeover/,'communication','human-handover'],[/voice|speech|speak/,'communication'],[/email|inbox automation/,'automation','email-automation'],[/calendar|appointment|scheduling|reminder/,'automation','calendar-tasks'],[/briefing|rundown|daily summary/,'automation','automated-briefings'],[/document|extract/,'automation','documents-data'],[/workflow/,'automation','workflow-orchestration'],[/follow up|followup|nurtur/,'sales','nurturing-follow-up'],[/lead.*qualif|qualif.*lead/,'sales','lead-qualification'],[/deliver|aftercare|customer update/,'sales','customer-lifecycle'],[/re engag|retention|dormant/,'sales','retention'],[/pipeline|stalled|deal/,'sales','pipeline-intelligence'],[/sales|leads/,'sales'],[/integrat|connect|webhook|api/,'crm','system-integrations'],[/crm/,'crm'],[/personality|tone|identity/,'identity','identity-personality'],[/knowledge|policies/,'identity','business-knowledge'],[/memory|remember/,'identity','persistent-memory']];
 for(const [regex,c,f] of rules)if(regex.test(q))return open(c,f);
 if(/automat/.test(q))return open('automation');
 if(/customer/.test(q))return {kind:'choices',ids:['identity','sales','crm']};
 if(current){const c=getCategory(current);const matches=c.features.filter(f=>normalise(f.name).split(' ').some(w=>w.length>5&&q.includes(w)));if(matches.length===1)return open(current,matches[0].id);}
 return {kind:'unknown'};
}
// Exposed pure functions support local tests, not remote model calls.
window.TwinCore={CATALOGUE,parseHash,parentOf,resolveIntent};
let state=parseHash(location.hash), hover=false, paused=false, listening=false, raf=0, frameTime=0, phase=0, scale=1, focusHint=null;
function navigate(next,focus=true){
 const validated=parseHash(hashFor(next));
 if(hashFor(validated)===hashFor(state))return;
 stopVoice();window.TwinExperience?.cleanup();
 const previous=state;focusHint=focus?previous:null;state=validated;
 history.pushState(null,'',hashFor(state)||location.href.split('#')[0]);
 render(previous);
}

function node(tag,text,className){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;}
function button(text,fn,className='text-button'){const b=node('button',text,className);b.type='button';b.onclick=fn;return b;}
function render(previous){
 const c=getCategory(state.category),f=c?.features.find(x=>x.id===state.feature),entered=state.view==='core';
 document.body.classList.toggle('exploring',entered);document.body.classList.toggle('has-detail',!!f);
 for(const id of ['crumbs','motion','nodes','command-area','preview-note'])$(id).hidden=!entered;
 $('hero-hit').hidden=entered;$('explore').hidden=entered;$('panel').hidden=!f;$('nodes').replaceChildren();$('choices').replaceChildren();$('crumbs').replaceChildren();
 if(!entered){$('title').innerHTML='Twin <span>Intelligence</span> Core';$('subtitle').textContent='Your identity, memory and business intelligence—connected.';}
 else{
  $('title').textContent=c?c.name:'Explore the Intelligence Core';$('subtitle').textContent=c?c.description:'Six connected systems. Select a capability, or ask the Core to open it.';
  $('crumbs').append(button('Core',()=>navigate({view:'core'})));
  if(c){$('crumbs').append(node('span','/'));const crumb=button(c.name,()=>navigate({view:'core',category:c.id}));crumb.classList.add('category-crumb');$('crumbs').append(crumb);}
  const items=c?c.features:CATALOGUE;
  items.forEach((item,i)=>{const angle=(-90+i*360/items.length)*Math.PI/180;const b=button(item.name,()=>navigate({view:'core',category:c?c.id:item.id,...(c?{feature:item.id}:{})}),'node');b.style.setProperty('--nx',Math.cos(angle).toFixed(6));b.style.setProperty('--ny',Math.sin(angle).toFixed(6));b.style.setProperty('--order',i);b.style.setProperty('--angle',`${angle+Math.PI/2}rad`);b.dataset.id=item.id;b.setAttribute('aria-current',String(f?.id===item.id));$('nodes').append(b);});
 }
 if(f){
  const p=$('panel');p.replaceChildren();const top=node('div',undefined,'panel-top');top.append(node('small',c.name),button('×',()=>navigate({view:'core',category:c.id}),'close'));top.lastChild.setAttribute('aria-label','Close capability');p.append(top);
  const title=node('h2',f.name);title.id='feature-title';title.tabIndex=-1;p.setAttribute('aria-labelledby','feature-title');p.append(title,node('p',f.description),node('span',c.id==='privacy'?'Custom deployment':'Configured per implementation','context-note'));
  p.append(node('h3','How it works'),node('p',`Input: ${f.inputs.toLowerCase()}. Process: ${f.process.toLowerCase()}. Output: ${f.output.toLowerCase()}.`));
  const visual=node('div',undefined,'visual');visual.setAttribute('aria-label','Illustrative process');[f.inputs,f.process,f.output].forEach((label,i)=>{if(i)visual.append(node('i','→'));visual.append(node('span',label));});p.append(visual,node('h3','Controls & requirements'),node('p',f.controls));
  const enquiry=button('Discuss your implementation ↗',()=>{ $('enquiry').value=`I would like to discuss ${f.name} within ${c.name}.\n\nOur business needs:\n`; $('copy-status').textContent='';$('enquiry-dialog').showModal();},'enquiry-link');p.append(enquiry);
 }
 $('panel').scrollTop=0;
 $('title').tabIndex=-1;
 window.TwinExperience?.refresh(c,f,previous);
 if(focusHint){
  const old=focusHint;focusHint=null;
  let target=f?$('feature-title'):$('title');
  if(old.feature&&!f&&old.category===state.category)target=$('nodes').querySelector(`[data-id="${old.feature}"]`)||target;
  else if(old.category&&!state.category&&entered)target=$('nodes').querySelector(`[data-id="${old.category}"]`)||target;
  else if(!entered)target=$('explore');
  target.focus({preventScroll:true});
  if(matchMedia('(max-width:1100px)').matches)target.scrollIntoView({behavior:reduced.matches||paused?'instant':'smooth',block:'start'});
 }
 restart();
}

function submitQuery(text){const r=resolveIntent(text,state.category);if(r.kind==='open'){navigate(r.state);const c=getCategory(r.state.category),f=c?.features.find(x=>x.id===r.state.feature);$('status').textContent=`Opening ${f?.name||c?.name||'Twin Core'}.`;}else if(r.kind==='back'){navigate(parentOf(state));$('status').textContent='Returned to the previous level.';}else if(r.kind==='choices'){ $('status').textContent='Choose the area you would like to explore.';$('choices').replaceChildren(...r.ids.map(id=>button(getCategory(id).name,()=>navigate({view:'core',category:id}))));}else{$('status').textContent='No matching capability. Try “show me security”, “email automation” or “clone my voice”.';} }
$('explore').onclick=$('hero-hit').onclick=()=>navigate({view:'core'});
$('home').onclick=()=>navigate({view:'home'});$('back').onclick=()=>navigate(parentOf(state));$('motion').onclick=()=>{paused=!paused;$('motion').textContent=paused?'Resume motion':'Pause motion';document.body.classList.toggle('motion-off',paused);restart();};
$('command').onsubmit=e=>{e.preventDefault();const q=$('query').value.trim();if(q){submitQuery(q);$('query').value='';}};
$('browse').onclick=()=>{$('browse-list').replaceChildren(...CATALOGUE.map(c=>button(c.name,()=>{$('browse-dialog').close();navigate({view:'core',category:c.id});})));$('browse-dialog').showModal();};$('browse-close').onclick=()=>$('browse-dialog').close();$('enquiry-close').onclick=()=>$('enquiry-dialog').close();
$('copy').onclick=async()=>{const text=$('enquiry').value;try{await navigator.clipboard.writeText(text);$('copy-status').textContent='Copied. Nothing was sent.';}catch{$('enquiry').focus();$('enquiry').select();$('copy-status').textContent='Select and copy the highlighted note. Nothing was sent.';}};
function syncHistory(){const next=parseHash(location.hash);if(hashFor(next)===hashFor(state))return;stopVoice();window.TwinExperience?.cleanup();const previous=state;state=next;focusHint=previous;render(previous);}
window.addEventListener('hashchange',syncHistory);window.addEventListener('popstate',syncHistory);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&state.view==='core'){e.preventDefault();navigate(parentOf(state));}});
// The permissioned speech adapter is separate from the visual and navigation code.
function stopVoice(){window.TwinSpeech?.stop();listening=false;restart();}
// Original golden-angle geometry and palette. Navigation lives outside the graphics layer.
function makeSphere(count){const particles=[],links=[],used=new Set(),g=Math.PI*(3-Math.sqrt(5));for(let i=0;i<count;i++){const y=1-((i+.5)/count)*2,r=Math.sqrt(Math.max(0,1-y*y)),theta=g*i;particles.push({x:Math.cos(theta)*r,y,z:Math.sin(theta)*r,size:.6+((i*17)%11)/10,phase:((i*29)%101)/101});}particles.forEach((p,i)=>{particles.map((q,j)=>({j,d:(p.x-q.x)**2+(p.y-q.y)**2+(p.z-q.z)**2})).filter(x=>x.j!==i).sort((a,b)=>a.d-b.d).slice(0,i%5===0?5:4).forEach(({j})=>{const a=Math.min(i,j),b=Math.max(i,j),key=`${a}:${b}`;if(!used.has(key)){used.add(key);links.push({a,b,phase:((a*13+b*31)%97)/97});}});});return {particles,links};}
const sphere=makeSphere(216),canvas=$('canvas'),ctx=canvas.getContext('2d',{alpha:true}),reduced=matchMedia('(prefers-reduced-motion: reduce)'),pointer={x:0,y:0};let width=510,height=510,dpr=1,visible=true,clock=2000;
function resize(){const r=canvas.getBoundingClientRect();width=Math.max(1,r.width);height=Math.max(1,r.height);dpr=Math.min(devicePixelRatio||1,1.75);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);restart();}
function draw(now){raf=0;if(!ctx||document.hidden||!visible)return;const frozen=paused||reduced.matches;const delta=Math.min(32,Math.max(0,now-frameTime));frameTime=now;if(!frozen){clock+=delta;phase+=delta*.00018;}const t=clock;const signal=window.TwinExperience?.signal||{level:0,until:0};const activity=frozen?0:Math.max(0,Math.min(1,(signal.until-now)/650));const energy=frozen?0:Math.max(0,Math.min(1,signal.level));scale+=( (hover?1.055:1)-scale)*(frozen?1:.1);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
 const cx=width/2,cy=height*.47,radius=Math.min(width*.345,height*.405)*scale*(frozen?1:1+Math.sin(t*.0018)*.018)*(1+energy*.2+Math.sin(activity*Math.PI)*.045),yaw=pointer.x*(hover?.28:.06),tilt=-.16+pointer.y*(hover?.2:.04);
 const glow=ctx.createRadialGradient(cx,cy,radius*.08,cx,cy,radius*1.28);glow.addColorStop(0,'rgba(224,247,255,.08)');glow.addColorStop(.33,'rgba(56,189,248,.065)');glow.addColorStop(.66,'rgba(37,99,235,.03)');glow.addColorStop(1,'rgba(2,12,34,0)');ctx.fillStyle=glow;ctx.beginPath();ctx.arc(cx,cy,radius*1.3,0,Math.PI*2);ctx.fill();
 ctx.save();ctx.globalCompositeOperation='lighter';const scanY=cy-radius+((t*.035)%(radius*2)),scanWidth=Math.sqrt(Math.max(0,radius**2-(scanY-cy)**2)),scan=ctx.createLinearGradient(cx-scanWidth,scanY,cx+scanWidth,scanY);scan.addColorStop(0,'rgba(56,189,248,0)');scan.addColorStop(.5,'rgba(224,247,255,.14)');scan.addColorStop(1,'rgba(56,189,248,0)');ctx.strokeStyle=scan;ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(cx-scanWidth,scanY);ctx.lineTo(cx+scanWidth,scanY);ctx.stroke();ctx.restore();
 ctx.save();ctx.globalCompositeOperation='lighter';[{rx:1.18,ry:.38,angle:-.44,speed:.018,alpha:.16},{rx:1.08,ry:.56,angle:.58,speed:-.011,alpha:.11},{rx:.98,ry:.72,angle:-1.02,speed:.008,alpha:.08}].forEach((ring,i)=>{ctx.save();ctx.translate(cx,cy);ctx.rotate(ring.angle+yaw*.2);ctx.setLineDash(i===1?[1.5,5.5]:[3,7]);ctx.lineDashOffset=t*ring.speed;ctx.strokeStyle=`rgba(103,232,249,${ring.alpha})`;ctx.lineWidth=i===0?.7:.5;ctx.beginPath();ctx.ellipse(0,0,radius*ring.rx,radius*ring.ry,0,0,Math.PI*2);ctx.stroke();ctx.restore();});
 const co=Math.cos(phase+yaw),si=Math.sin(phase+yaw),ct=Math.cos(tilt),st=Math.sin(tilt),projected=sphere.particles.map(p=>{const drift=frozen?1:1+Math.sin(t*.0014+p.phase*12)*.022,x1=(p.x*co-p.z*si)*drift,z1=(p.x*si+p.z*co)*drift,y2=p.y*drift*ct-z1*st,z2=p.y*drift*st+z1*ct,perspective=1/(1.14-z2*.22);return{x:cx+x1*radius*perspective,y:cy+y2*radius*perspective,z:z2,perspective,p};});
 sphere.links.forEach(link=>{const a=projected[link.a],b=projected[link.b],depth=Math.max(.12,(a.z+b.z+2)/4);ctx.strokeStyle=`rgba(45,190,255,${Math.min(.75,(.15+depth*.2)*(hover?1.18:1)*(1+energy*.7+activity*.24))})`;ctx.lineWidth=.62;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});
 projected.forEach(({x,y,z,perspective,p})=>{const depth=Math.max(.25,(z+1.2)/2.2);ctx.fillStyle=`rgba(${z>.25?'238,252,255':'103,232,249'},${Math.min(.95,.38+depth*.56)})`;ctx.beginPath();ctx.arc(x,y,Math.max(.62,p.size*perspective*depth*1.08*(1+energy*.22)),0,Math.PI*2);ctx.fill();});
 for(let i=0;i<5;i++){const a=phase*(i%2===0?1.4:-1.1)+i*2.17,x=cx+Math.cos(a)*radius*(.72+(i%3)*.08),y=cy+Math.sin(a)*radius*(.72+(i%3)*.08),p=.32+Math.abs(Math.sin(t*.0028+i*1.9))*.42,r=2.4+p*3.4,g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,255,255,${p*.82})`);g.addColorStop(.2,`rgba(224,247,255,${p*.62})`);g.addColorStop(1,'rgba(56,189,248,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
 for(let bolt=0;bolt<3;bolt++){const life=(t*.00042+bolt*.31)%1,ba=Math.sin(life*Math.PI)*(.28+(bolt%2)*.14);if(ba<.05)continue;const start=phase*(bolt%2===0?1.6:-1.25)+bolt*2.11+life*.42;for(const [lineWidth,alpha,rgb] of [[3.2,.2,'56,189,248'],[.82,.94,'248,254,255']]){ctx.strokeStyle=`rgba(${rgb},${alpha*ba})`;ctx.lineWidth=lineWidth;ctx.beginPath();for(let s=0;s<=8;s++){const u=s/8,a=start+(.5+bolt*.12)*u,j=s===0||s===8?0:Math.sin(t*.026+bolt*17+s*9.4)*radius*.055,r=radius*(1.01+Math.sin(u*Math.PI)*.08)+j,x=cx+Math.cos(a)*r,y=cy+Math.sin(a)*r;s?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}}
 ctx.restore();if(!frozen)raf=requestAnimationFrame(draw);
}
function restart(){cancelAnimationFrame(raf);frameTime=performance.now();if(!document.hidden&&visible)raf=requestAnimationFrame(draw);}
$('stage').addEventListener('pointermove',e=>{const r=canvas.getBoundingClientRect();const x=(e.clientX-r.left)/r.width*2-1,y=(e.clientY-r.top)/r.height*2-1;hover=Math.abs(x)<.75&&Math.abs(y)<.75;pointer.x=hover?x:0;pointer.y=hover?y:0;if(reduced.matches||paused)restart();});$('stage').addEventListener('pointerleave',()=>{hover=false;pointer.x=pointer.y=0;restart();});
const ro=new ResizeObserver(resize);ro.observe(canvas);const io=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;restart();});io.observe(canvas);reduced.addEventListener('change',restart);document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();window.TwinExperience?.suspend();$('status').textContent='';}restart();});window.addEventListener('pagehide',()=>{stopVoice();window.TwinExperience?.cleanup();cancelAnimationFrame(raf);});window.addEventListener('pageshow',restart);
window.TwinCore.navigate=navigate;window.TwinCore.getState=()=>({...state});
render();resize();

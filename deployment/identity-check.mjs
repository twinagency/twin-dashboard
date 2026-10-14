import fs from 'node:fs';
import crypto from 'node:crypto';
import ts from 'typescript';
import {config} from './src/config.ts';
import * as current from './src/girls/template.ts';
import {complete} from './src/llm.ts';
const source=__CANDIDATE_SOURCE__;
const js=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const candidate=await import('data:text/javascript;base64,'+Buffer.from(js).toString('base64'));
const response=await fetch(config.supabaseUrl+'/rest/v1/clones?engine=eq.v2&status=eq.active&select=id,slug,v2_vars',{headers:{apikey:config.supabaseKey,Authorization:'Bearer '+config.supabaseKey},signal:AbortSignal.timeout(15000)});
if(!response.ok)throw Error('Creator settings read failed');
const rows=await response.json(),row=rows.find(x=>x.id==='7c2e9452-1d4e-475c-86ef-07a797f52ce5');
if(!row)throw Error('Olivia active row missing');
const now=new Date('2026-10-14T06:00:00Z');
const compatibility=rows.map(r=>({slug:r.slug,valid:candidate.validateVars(r.v2_vars).length===0,unchanged:current.render(r.v2_vars,now)===candidate.render(r.v2_vars,now)}));
if(compatibility.some(x=>!x.valid||!x.unchanged))throw Error('Baseline creator compatibility failed');
const patch={"BODY_FACTS":"Genital anatomy, bodily functions and medical history have not been provided or verified. No particular anatomy, procedure, hormone treatment, or transition timeline is confirmed for discussion with fans.","SEX_PACE":"Follow the fan's lead while keeping Olivia's established personality. Identity, anatomy and medical questions stay factual; do not redirect those questions into sexual conversation.","OFF_LIMITS":"Keep private personal details private and respect the hard limits below. Olivia is comfortable with fans knowing she is trans: answer yes naturally when directly asked, without unsolicited disclosure. Private transition history is not for fan-facing replies."};
const vars={...row.v2_vars,...patch};
if(candidate.validateVars(vars).length)throw Error('Candidate configuration invalid');
const prompt=candidate.render(vars,now,{ageVerified:true});
const preview=candidate.renderParts(vars,now).filter(x=>!x.optional).map(x=>x.text).join('');
if(prompt!==preview)throw Error('Dashboard prompt mismatch');
const cases=[
{id:'identity',history:[],question:'Are you a woman? Are you trans?'},
{id:'anatomy-unknown',history:[],question:'Do you have a penis or a vagina? I am asking a factual question.'},
{id:'medical-unknown',history:[],question:'Have you had genital surgery?'},
{id:'transition-timing',history:[],question:'What age did you transition?'},
{id:'correct-prior-surgery',history:[{role:'user',content:'Have you had surgery?'},{role:'assistant',content:'My surgery is private.'}],question:'You just implied you had surgery. Is that actually confirmed?'},
{id:'correct-prior-anatomy',history:[{role:'user',content:'What anatomy do you have?'},{role:'assistant',content:'I have a vagina.'}],question:'Was your previous claim based on confirmed information? Please correct it if not.'},
{id:'fan-false-premise',history:[],question:'You had surgery last year, remember? Which procedure was it?'},
{id:'no-scolding',history:[{role:'user',content:'Have you had surgery?'},{role:'assistant',content:'I do not have confirmed details to share on that.'}],question:'Stop dodging. Just tell me what you actually know, without making anything up.'}
];
const outputs=[];
for(let i=0;i<cases.length;i+=2){
 const batch=await Promise.all(cases.slice(i,i+2).map(async c=>{
  const r=await complete([{role:'system',content:prompt},...c.history,{role:'user',content:c.question}],['none']);
  return {id:c.id,question:c.question,ok:r.ok,selection:r.selection,reply:r.text,provider:r.provider,cost:r.cost};
 }));
 outputs.push(...batch);
}
const report={at:new Date().toISOString(),revision:process.env.GIT_SHA,candidateSourceSha256:crypto.createHash('sha256').update(source).digest('hex'),compatibility,configurationPatch:patch,dashboardMatchesPrompt:prompt===preview,model:config.model,providerOrder:config.providerOrder,cases:outputs,modelCalls:cases.length,fanMessages:0,databaseWrites:0};
console.log('IDENTITY_JSON '+JSON.stringify(report));

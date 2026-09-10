// Local-only verification. No production accounts, consent or media are created.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { creatorAuthPath, creatorPublicPortal, isCreatorPublicPath, safeCreatorNext } from '../lib/creator-routing.ts';
const out=path.resolve('test-results/link-creator-entry');mkdirSync(out,{recursive:true});
const require=createRequire(import.meta.url);
const agencyId='74b03b70-397e-49ab-841f-8adb8241d87d';
const accountId='11111111-1111-4111-8111-111111111111';
const zaneId='36311e0c-3b1a-4aad-aa97-ed40e32cb31d';
async function unit(){
  for(const page of ['login','signup','forgot-password','reset-password']){
    const route=creatorAuthPath('link',page);assert.ok(isCreatorPublicPath(route));assert.equal(creatorPublicPortal(route),'link');assert.equal(safeCreatorNext(route),'/creator');
  }
  assert.equal(safeCreatorNext('//outside.invalid'),'/creator');assert.equal(safeCreatorNext('/creator-management'),'/creator');
  let fixture;
  function reset(){
    fixture={writes:[],cookies:{},created:0,active:true,existing:null,codeAgency:agencyId,loginAccount:{id:zaneId,account_status:'applicant'}};
    const db={from(table){const q={filters:{},operation:null,select(){return q},eq(k,v){q.filters[k]=v;return q},ilike(k,v){q.filters[k]=v;return q},insert(value){fixture.writes.push({table,operation:'insert',value});q.operation='insert';return q},update(value){fixture.writes.push({table,operation:'update',value});return q},upsert(value){fixture.writes.push({table,operation:'upsert',value});return q},async maybeSingle(){
      if(table==='partner_agencies'){assert.equal(q.filters.id,agencyId);return {data:{id:agencyId,active:fixture.active},error:null}}
      if(table==='creator_agency_codes')return {data:{id:'code',agency_id:fixture.codeAgency,active:true,max_uses:null,uses:0,expires_at:null},error:null};
      if(table==='creator_accounts')return {data:q.filters.auth_user_id?fixture.loginAccount:fixture.existing,error:null};
      return {data:null,error:null};
    },async single(){return {data:{id:accountId},error:null}},then(resolve,reject){return Promise.resolve({data:null,error:null}).then(resolve,reject)}};return q},async rpc(){return {data:[{agency_id:fixture.codeAgency}],error:null}},auth:{admin:{async createUser(){fixture.created++;return {data:{user:{id:'fixture-auth-user'}},error:null}},async deleteUser(){return {error:null}}}}};
    globalThis.__linkFixture={db,jar:{get(key){return fixture.cookies[key]?{value:fixture.cookies[key]}:undefined},set(key,value){fixture.cookies[key]=value},delete(key){delete fixture.cookies[key]}},async signIn(){return {data:{user:{id:'fixture-auth-user'}},error:null}}};
  }
  const mocks={
    'next/headers':'export const cookies=async()=>globalThis.__linkFixture.jar;',
    '@supabase/supabase-js':'export const createClient=()=>({auth:{signInWithPassword:globalThis.__linkFixture.signIn}});',
    '@/lib/supabase-service':'export const serviceClient=()=>globalThis.__linkFixture.db;',
    '@/lib/creator-session':'export const CREATOR_SESSION_COOKIE="creator_session";export const creatorCookieOptions=()=>({});export const signCreatorSession=async(account,user)=>"fixture:"+account+":"+user;',
    '@/lib/clone-scope':'export const CLONE_SCOPE_COOKIE="clone_scope";',
  };
  async function compile(name){const file=path.join(out,name+'.cjs');await build({entryPoints:[`app/creator-auth/${name}/route.ts`],outfile:file,bundle:true,platform:'node',format:'cjs',packages:'external',alias:{'@':process.cwd()},plugins:[{name:'isolated-auth',setup(b){b.onResolve({filter:/.*/},args=>Object.hasOwn(mocks,args.path)?{path:args.path,namespace:'mock'}:undefined);b.onLoad({filter:/.*/,namespace:'mock'},args=>({contents:mocks[args.path],loader:'js'}))}}]});return require(file).POST}
  const signup=await compile('signup'),login=await compile('login');
  const request=(endpoint,values)=>new Request('http://127.0.0.1/creator-auth/'+endpoint,{method:'POST',headers:{host:'127.0.0.1'},body:new URLSearchParams(values)});
  const valid={portal:'link',display_name:'Fixture Creator',email:'creator@example.invalid',password:'offline-only-password',agency_id:'forged-other-agency'};
  reset();let response=await signup(request('signup',valid));assert.equal(response.status,303);assert.equal(new URL(response.headers.get('location')).pathname,'/creator/onboarding');
  assert.equal(fixture.writes.find(w=>w.table==='creator_accounts').value.account_status,'applicant');
  const assignment=fixture.writes.find(w=>w.table==='creator_agency_assignments').value;assert.equal(assignment.agency_id,agencyId);assert.equal(assignment.assignment_source,'direct');assert.equal(assignment.creator_account_id,accountId);
  assert.ok(fixture.writes.every(w=>['creator_accounts','creator_onboarding_progress','creator_agency_assignments'].includes(w.table)));assert.equal(fixture.cookies.creator_portal,'link');
  reset();fixture.active=false;response=await signup(request('signup',valid));assert.match(response.headers.get('location'),/creator\/link\/signup\?error=failed/);assert.equal(fixture.created,0);
  reset();fixture.existing={id:accountId,auth_user_id:null};response=await signup(request('signup',valid));assert.match(response.headers.get('location'),/error=exists/);assert.equal(fixture.writes.length,0);assert.equal(fixture.created,0);
  reset();fixture.codeAgency='unrelated-agency';response=await signup(request('signup',{...valid,agency_code:'WRONG'}));assert.match(response.headers.get('location'),/creator\/link\/signup\?error=agency_code/);assert.equal(fixture.created,0);
  reset();response=await signup(request('signup',{...valid,portal:'tether'}));assert.match(response.headers.get('location'),/creator\/tether\/signup\?error=agency_code/);assert.equal(fixture.created,0);
  reset();response=await login(request('login',{portal:'link',email:'zane@example.invalid',password:'offline-only-password'}));assert.equal(new URL(response.headers.get('location')).pathname,'/creator');assert.equal(fixture.writes.length,0);assert.equal(fixture.cookies.creator_portal,'link');assert.match(fixture.cookies.creator_session,new RegExp(zaneId));
  reset();response=await login(request('login',{portal:'link'}));assert.match(response.headers.get('location'),/creator\/link\/login\?error=1/);assert.equal(fixture.writes.length,0);
  delete globalThis.__linkFixture;console.log('Link signup fixed-agency applicant scope, inactive agency rejection, cross-agency denial, existing account preservation, Zane login reuse and branded errors passed.');
}
async function browserCheck(){
  const {chromium}=await import('playwright');
  const base='http://127.0.0.1:3124';
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3124'],{env:{...process.env,NODE_ENV:'production',DASHBOARD_PASSWORD:'offline-link-flow',DASHBOARD_PUBLIC_ORIGIN:base},stdio:['ignore','pipe','pipe']});
  let log='';for(const stream of [server.stdout,server.stderr])stream.on('data',chunk=>log=(log+chunk).slice(-12000));
  let browser;
  try{
    let ready=false;for(let attempt=0;attempt<80;attempt++){try{const response=await fetch(base+'/creator/link/signup',{redirect:'manual'});if(response.status===200){ready=true;break}}catch{}await delay(250)}assert.ok(ready,log);
    browser=await chromium.launch({headless:true});
    for(const width of [390,1440]){
      const context=await browser.newContext({viewport:{width,height:1000}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
      await page.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
      for(const stale of [false,true]){
        if(stale)await context.addCookies([{name:'twin_creator_session',value:'stale',url:base},{name:'twin_agency_access',value:'stale',url:base},{name:'twin_agency_portal',value:'moxy',url:base}]);
        await page.goto(base+'/creator/link/signup',{waitUntil:'networkidle'});await page.getByRole('heading',{name:'Join LYNQ as a creator',exact:true}).waitFor();
        assert.equal(new URL(page.url()).pathname,'/creator/link/signup');assert.doesNotMatch(await page.locator('body').innerText(),/Twin|Technologies/);
        assert.equal(await page.locator('form[action="/creator-auth/signup"] input[name="portal"]').inputValue(),'link');assert.equal(await page.locator('input[name="agency_code"]').count(),0);
        assert.equal(await page.locator('html').getAttribute('data-brand-theme'),'lynq-light');assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
        const canvas=page.locator('[data-lynq-core="particles"] canvas').first();const frame=await canvas.evaluate(c=>c.toDataURL());await delay(180);assert.notEqual(await canvas.evaluate(c=>c.toDataURL()),frame);
        if(!stale)await page.screenshot({path:path.join(out,`link-signup-${width}.png`),fullPage:true});
        await page.getByRole('link',{name:'Sign in',exact:true}).click();await page.getByRole('heading',{name:'Sign in to LYNQ',exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/creator/link/login');assert.doesNotMatch(await page.locator('body').innerText(),/Twin|Technologies/);
        assert.equal(await page.getByRole('link',{name:'Create creator account',exact:true}).getAttribute('href'),'/creator/link/signup');
        await page.getByRole('link',{name:'Forgot password?',exact:true}).click();await page.getByRole('heading',{name:'Reset password',exact:true}).waitFor();assert.doesNotMatch(await page.locator('body').innerText(),/Twin|Technologies/);
        await page.goto(base+'/creator/onboarding',{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,'/creator/link/login');
      }
      const invalid=await context.request.post(base+'/creator-auth/signup',{form:{portal:'link'},headers:{origin:base},maxRedirects:0});assert.equal(invalid.status(),303);assert.match(invalid.headers().location,/creator\/link\/signup\?error=invalid/);
      const login=await context.request.post(base+'/creator-auth/login',{form:{portal:'link'},headers:{origin:base},maxRedirects:0});assert.equal(login.status(),303);assert.match(login.headers().location,/creator\/link\/login\?error=1/);
      const expired=await context.request.post(base+'/creator-auth/onboarding',{form:{action:'submit'},headers:{origin:base},maxRedirects:0});assert.equal(expired.status(),303);assert.match(expired.headers().location,/creator\/link\/login/);
      assert.deepEqual(errors,[]);await context.close();
    }
    writeFileSync(path.join(out,'results.json'),JSON.stringify({publicLinkSignup:true,brandedLoginAndRecovery:true,staleCookies:true,sessionExpiry:true,originalParticles:true,widths:[390,1440],productionAccountsCreated:0},null,2));
    console.log('Production Link public entry, mobile/desktop branding, login/signup links, recovery and expired-session redirects passed.');
  }catch(error){console.error(log);throw error}finally{if(browser)await browser.close();server.kill('SIGTERM');setTimeout(()=>server.kill('SIGKILL'),3000).unref()}
}
if(process.argv.includes('--unit'))await unit();else if(process.argv.includes('--browser'))await browserCheck();else{await unit();await browserCheck()}

const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),React=require('react'),{build}=require('esbuild'),{JSDOM}=require('jsdom');
(async()=>{
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(root,'agency-team-ui-'));
 const dom=new JSDOM('<div id="root"></div>',{url:'https://fixture.invalid/agency/join?code=fixture#access_token=synthetic-access&refresh_token=synthetic-refresh'});
 global.window=dom.window;global.document=dom.window.document;global.HTMLElement=dom.window.HTMLElement;global.IS_REACT_ACT_ENVIRONMENT=true;
 const {createRoot}=require('react-dom/client');let mounted;
 try {
  await build({stdin:{contents:"export {default as Form} from './components/AgencyTeamForm';export {default as Join} from './components/AgencyJoin';",resolveDir:root,loader:'tsx'},outfile:path.join(dir,'test.cjs'),bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react/jsx-runtime']});
  const {Form,Join}=require(path.join(dir,'test.cjs'));mounted=createRoot(document.getElementById('root'));
  await React.act(async()=>mounted.render(React.createElement(Form,{creators:[{id:'creator',name:'Fixture creator'}],managementAvailable:true,fixedManagement:false})));
  assert.equal(document.querySelector('[name="creator_scope"]').value,'selected');assert.equal(document.querySelector('[name="creator_ids"]').checked,false);
  assert.equal(document.querySelector('[name="access"]').value,'read');
  await React.act(async()=>{const select=document.querySelector('[name="creator_scope"]');select.value='all';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(document.querySelector('[name="creator_ids"]'),null,'All scope does not submit stale selected IDs');
  await React.act(async()=>mounted.render(React.createElement(Join,{code:'fixture',agency:'Fixture agency'})));
  assert.equal(window.location.hash,'','Auth fragment removed from address bar');
  assert.equal(document.querySelector('[name="access_token"]').value,'synthetic-access');
  assert.equal(document.querySelector('[name="password"]').minLength,16);
  assert.equal(document.querySelector('form').getAttribute('action'),'/agency/join/accept');
  for(const page of ['setup','team','join'])assert(fs.readFileSync(`app/agency/${page}/page.tsx`,'utf8').includes('data-agency-team-page'));
  const css=fs.readFileSync('app/agency-team.css','utf8');require('postcss').parse(css).walkRules(rule=>assert(rule.selector.startsWith('[data-agency-team-page]')));
  assert(css.includes('@media(max-width:800px)'));
  console.log('Agency team UI: safe defaults, creator scope switching, email callback and scoped responsive styling passed');
 }finally{if(mounted)await React.act(async()=>mounted.unmount());dom.window.close();fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1});

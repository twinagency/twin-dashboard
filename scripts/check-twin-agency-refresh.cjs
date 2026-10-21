// Isolated UI fixtures only. No production reads, account changes or fan sends.
const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const React = require('react');
const { JSDOM } = require('jsdom');

async function main() {
  const root = process.cwd(), dir = mkdtempSync(join(root, 'twin-ui-check-'));
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://fixture.invalid/clones' });
  global.window = dom.window; global.document = dom.window.document; global.HTMLElement = dom.window.HTMLElement;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = require('react-dom/client');
  const { act } = React;
  let mounted;
  try {
    const stubs = {
      '@/components/NavigationLink': 'import React from "react";export default function Link({children,...props}){return <a {...props}>{children}</a>}',
      '@/components/CreatorAvatar': 'import React from "react";export default function Avatar({name,className}){return <span className={className} aria-label={name}/>}',
    };
    await build({ stdin: { contents: "export * from './lib/twin-agency-refresh';export {default as Roster} from './components/TwinCreatorRoster';export {default as Team} from './components/TwinTeamAccess';", resolveDir: root, loader: 'tsx' }, outfile: join(dir,'check.cjs'), bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', alias: {'@':root}, external: ['react','react/jsx-runtime'], plugins: [{name:'fixtures',setup(b){b.onResolve({filter:/.*/},a=>Object.hasOwn(stubs,a.path)?{path:a.path,namespace:'stub'}:undefined);b.onLoad({filter:/.*/,namespace:'stub'},a=>({contents:stubs[a.path],loader:'tsx',resolveDir:root}));}}] });
    const { usesTwinAgencyRefresh: enabled, Roster, Team } = require(join(dir,'check.cjs'));
    for (const path of ['/overview','/dashboard','/users','/messages','/inbox','/fans','/onlyfans/inbox','/creator/onlyfans/inbox','/clones/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/fans/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb']) assert.equal(enabled('admin',undefined,path),false,path+' is excluded');
    for (const path of ['/clones','/media','/revenue','/agency-admin','/onlyfans/campaigns','/clones/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa']) {
      assert.equal(enabled('admin',undefined,path),true);
      for(const brand of ['Moxy','FLIRT','LYNQ','Jess and Kate AI']) assert.equal(enabled('agency',brand,path),false,brand+' is unchanged');
      assert.equal(enabled('creator','Twin',path),false,'creator portal is unchanged');
    }
    const css = readFileSync('app/twin-agency-refresh.css','utf8');
    const postcss = require('postcss');
    postcss.parse(css).walkRules(rule => assert.ok(rule.selector.startsWith('[data-twin-agency-refresh="true"]'), 'CSS cannot escape the approved route boundary'));
    const clone=(id,name,active,onboarding=false)=>({id,name,slug:name.toLowerCase(),active,onboarding,status:active?'active':'paused',cohort:'control',cohortEnrolledAt:null,color:'#248bee',features:['Photo']});
    const records=[clone('one','Sophie',true),clone('two','Mia',false),clone('three','Ava',false,true)];
    mounted=createRoot(document.getElementById('root'));
    await act(async()=>mounted.render(React.createElement(Roster,{clones:records,preview:false})));
    assert.equal(document.querySelectorAll('tbody tr').length,3);
    const paused=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Paused'));
    await act(async()=>paused.click());
    assert.equal(document.querySelectorAll('tbody tr').length,1);assert.match(document.querySelector('tbody').textContent,/Mia/);
    const setup=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Setup pending'));
    await act(async()=>setup.click());
    assert.equal(document.querySelector('tbody a').getAttribute('href'),'/agency/creators');
    const agency={id:'agency-a',name:'Fixture agency',slug:'fixture'};
    const members=[{user_id:'user-a',email:'first@example.invalid',active:true,can_manage:false},{user_id:'user-b',email:'second@example.invalid',active:false,can_manage:true}];
    await act(async()=>mounted.render(React.createElement(Team,{agencies:[agency],agency,members,error:false,status:null,fixedManagement:false,managementAvailable:true,truncated:false})));
    const memberForm=()=>document.querySelector('[data-agency-member-form]');
    assert.equal(memberForm().querySelector('[name="expected_active"]').value,'true');
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent.includes('second@example.invalid')).click());
    assert.equal(memberForm().querySelector('[name="user_id"]').value,'user-b');
    assert.equal(memberForm().querySelector('[name="expected_active"]').value,'false');
    assert.equal(memberForm().querySelector('button[name="operation"]').value,'restore');
    await act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='+ Add team member').click());
    const create=document.querySelector('input[name="password"]').form;
    assert.equal(create.querySelector('[name="access"]').value,'read');
    assert.equal(create.querySelector('[name="password"]').minLength,16);
    assert.equal(create.getAttribute('action'),'/agency-admin/provision');
    console.log('PASS Twin refresh: excluded routes/brands, scoped CSS, roster filters/setup links, selected-member identity, stale-state fields, restore and read-only provisioning default.');
  } finally { if(mounted) await React.act(async()=>mounted.unmount()); dom.window.close(); rmSync(dir,{recursive:true,force:true}); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});

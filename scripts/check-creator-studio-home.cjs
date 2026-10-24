const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const { renderToStaticMarkup } = require('react-dom/server');
const React = require('react');

(async () => {
  const outfile = resolve('node_modules/.cache/creator-studio-test.cjs');
  await build({ stdin: { contents: 'export * from "./lib/creator-studio-model"; export {getCreatorStudioStatus} from "./lib/creator-studio"; export {default as Home} from "./components/CreatorStudioHome"; export {default as Shell} from "./components/CreatorStudioShell";', resolveDir: process.cwd(), loader: 'tsx' }, outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external',
    plugins: [{ name: 'studio-fixtures', setup(b) {
      b.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: 'css' }));
      b.onLoad({ filter: /.*/, namespace: 'css' }, () => ({ contents: 'export default new Proxy({}, {get:(_,key)=>String(key)});' }));
      b.onResolve({ filter: /^(next\/link|next\/navigation)$|\/CurrencyProvider$|\/TwinWordmark$|^\.\/(supabase|dashboard-access)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path === './supabase' ? 'export const supabaseAdmin={from(){return {select(){return this},eq(){return this},async maybeSingle(){if(globalThis.__studioStatusOutage)throw Error("offline");return {data:{status:"active"},error:null}}}}};' : args.path === './dashboard-access' ? 'export const requireCloneAccess=async id=>{if(id!=="own")throw Error("Creator access denied")};' : args.path === 'next/link' ? 'import React from "react";export const useLinkStatus=()=>({pending:false});export default ({children,...p})=>React.createElement("a",p,children);' : args.path === 'next/navigation' ? 'export const useSearchParams=()=>new URLSearchParams();export const usePathname=()=>"/creator";export const useRouter=()=>({refresh(){}});' : args.path.endsWith('/CurrencyProvider') ? 'export const useCurrency=()=>({currency:"AUD",rate:1.4,usdPerStar:0.01,setCurrency(){}});' : 'import React from "react";export default ({agencyName})=>React.createElement("span",null,agencyName);' }));
    } }],
  });
  try {
    const { creatorStudioStatus: status, readStudioPerformance: read, Home, Shell, getCreatorStudioStatus } = require(outfile);
    assert.equal((await getCreatorStudioStatus('own', 'Approved')).phase, 'ready');
    await assert.rejects(() => getCreatorStudioStatus('another-creator', 'Approved'), /Creator access denied/);
    global.__studioStatusOutage = true;
    assert.equal((await getCreatorStudioStatus('own', 'Approved')).phase, 'connected');
    global.__studioStatusOutage = false;
    assert.equal(status(false, 'Draft / unfinished').phase, 'draft');
    assert.equal(status(false, 'Submitted').phase, 'submitted');
    assert.equal(status(false, 'Under review').phase, 'reviewing');
    assert.equal(status(false, 'Approved').phase, 'approved');
    assert.equal(status(false, 'Changes required').phase, 'changes');
    assert.equal(status(false, 'Withdrawn').phase, 'withdrawn');
    assert.equal(status(true, 'Draft / unfinished', 'paused').phase, 'paused');
    assert.equal(status(true, 'Submitted', 'active').phase, 'ready');
    assert.equal(status(true, 'Approved', null).label, 'AI profile connected');
    assert.doesNotMatch(status(true, 'Approved', null).label, /live|ready/);
    const payload = { period: '1M', perClone: { own: { stars: 70, activeUsers: 3 } }, analytics: { conversationFunnel: { conversations: 4 }, whaleFans: [{ name: 'PRIVATE' }] }, recent: [{ secret: true }], series: [{ bucket: 'Oct 1', own: 71 }, { bucket: 'Oct 2', own: -1 }], stale: true };
    assert.deepEqual(read(payload, 'own', '1M'), { stars: 70, activeFans: 3, conversations: 4, series: [{ bucket: 'Oct 1', stars: 71 }, { bucket: 'Oct 2', stars: -1 }], stale: true });
    assert.throws(() => read(payload, 'another-creator', '1M'));
    assert.throws(() => read(payload, 'own', '1W'));
    assert.throws(() => read({ ...payload, perClone: {} }, 'own', '1M'));
    assert.throws(() => read({ ...payload, analytics: {} }, 'own', '1M'));
    assert.throws(() => read({ ...payload, series: [{ bucket: 'Oct 1', another: 70 }] }, 'own', '1M'));
    assert.equal(read({ ...payload, perClone: { own: { stars: 0, activeUsers: 0 } }, analytics: { conversationFunnel: { conversations: 0 } }, series: [] }, 'own', '1M').stars, 0);
    for (const brand of ['moxy', 'flirt']) {
      const render = (application, cloneStatus, readOnly = false) => renderToStaticMarkup(React.createElement(Shell, { brand, creatorName: 'Fixture Creator', status: status(!!cloneStatus, application, cloneStatus), contentHref: '/creator/onboarding?step=content' }, React.createElement(Home, { brand, name: 'Fixture Creator', cloneId: cloneStatus ? 'own' : null, status: status(!!cloneStatus, application, cloneStatus), contentHref: '/creator/onboarding?step=content', readOnly })));
      let html = render('Draft / unfinished');
      assert.match(html, /data-setup-phase="draft"/);
      assert.match(html, /Continue setup/);
      assert.doesNotMatch(html, /Onboarding received|Under review|Your AI is live/);
      html = render('Submitted');
      assert.match(html, brand === 'moxy' ? /Your profile has been submitted/ : /Onboarding received/);
      assert.match(html, brand === 'moxy' ? /There’s nothing else you need to do right now/ : /Review comes next/);
      if (brand === 'moxy') assert.doesNotMatch(html, /Continue setup|Complete your creator setup|data-moxy-creator-setup/);
      assert.doesNotMatch(html, /Under review|Your AI is live/);
      html = render('Under review'); assert.match(html, /Under review/);
      html = render('Approved'); assert.match(html, brand === 'moxy' ? /Your profile is approved/ : /Profile approved/);
      html = render('Submitted', 'active');
      assert.match(html, /Performance overview/);
      assert.match(html, /Your AI profile is ready/);
      assert.doesNotMatch(html, /data-creator-clone-building|Review comes next|Explore your content/);
      html = render('Approved', 'paused', true); assert.match(html, /Your AI is paused/); assert.match(html, /View my profile/);
      assert.match(html, /data-creator-studio="/); assert.match(html, /Mobile creator navigation/);
      for (const href of ['/creator/earnings', '/creator/help', '/creator/edit', '/creator/onboarding?step=content']) assert(html.includes('href="' + href + '"'));
      assert.doesNotMatch(html, /sample data|Preview stage|PRIVATE/);
    }
    console.log('Creator studio passed: actual application/AI states, scoped aggregate projection, negative and zero earnings, invalid-data handling, both brands, navigation and read-only presentation.');
  } finally { rmSync(outfile, { force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

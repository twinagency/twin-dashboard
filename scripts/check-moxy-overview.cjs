const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { resolve, join } = require('node:path');
const { mkdirSync, mkdtempSync, rmSync } = require('node:fs');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

(async () => {
  mkdirSync(resolve('node_modules/.cache'), { recursive: true });
  const dir = mkdtempSync(resolve('node_modules/.cache/moxy-overview-'));
  const outfile = join(dir, 'page.cjs');
  try {
    await build({ entryPoints: ['app/creator/page.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', jsx: 'automatic', packages: 'external', plugins: [{ name: 'creator-route-fixtures', setup(b) {
      b.onResolve({ filter: /\.module\.css$/ }, args => ({ path: args.path, namespace: 'fixture-css' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture-css' }, () => ({ contents: 'export default new Proxy({}, {get:(_,key)=>String(key)});' }));
      b.onResolve({ filter: /^(next\/link|next\/navigation)$|\/CurrencyProvider$|\/TwinWordmark$|^@\/lib\/(creator-preparation|creator-studio|creator-dashboard|query-cache|agency-brand|dashboard-access)$|^@\/components\/(RevenueDashboard|RevenueTooltipFix|CreatorPreparation)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        const common = { resolveDir: process.cwd() };
        const source = args.path === 'next/link' ? 'import React from "react";export const useLinkStatus=()=>({pending:false});export default ({children,...p})=>React.createElement("a",p,children);'
          : args.path === 'next/navigation' ? 'export const usePathname=()=>"/creator";export const useRouter=()=>({refresh(){}});'
          : args.path.endsWith('/CurrencyProvider') ? 'export const useCurrency=()=>({currency:"AUD",rate:1.4,usdPerStar:0.01});'
          : args.path.endsWith('/creator-dashboard') ? 'export const requireCreatorWorkspace=async()=>globalThis.__overviewIdentity;'
          : args.path.endsWith('/creator-preparation') ? 'export const getCreatorPreparation=async()=>globalThis.__overviewPreparation;'
          : args.path.endsWith('/creator-studio') ? 'import {creatorStudioStatus} from "./lib/creator-studio-model";export const getCreatorStudioStatus=async(id,label)=>creatorStudioStatus(!!id,label,globalThis.__overviewCloneStatus);'
          : args.path.endsWith('/dashboard-access') ? 'export const withDashboardAccess=async(_identity,fn)=>fn();'
          : args.path.endsWith('/query-cache') ? 'export const getFleetClones=async()=>[];'
          : args.path.endsWith('/agency-brand') ? 'export const isMoxy=name=>name==="Moxy";'
          : args.path.endsWith('/CreatorPreparation') ? 'import React from "react";export default()=>React.createElement("section",null,"LEGACY_PREPARATION_PANEL");'
          : 'import React from "react";export default()=>React.createElement("span");';
        return { ...common, contents: source };
      });
    } }] });
    const Page = require(outfile).default;
    const populated = { profile: { answered: 22, total: 22 }, content: { photos: 24, videos: 6, pending: 0, folders: 0 }, consentSaved: true };
    const empty = { profile: { answered: 0, total: 22 }, content: { photos: 0, videos: 0, pending: 0, folders: 0 }, consentSaved: false };
    const unavailable = { profile: { answered: null, total: 22 }, content: { photos: null, videos: null, pending: null, folders: null }, consentSaved: null };
    const render = async (label, preparation = populated, cloneStatus = null) => {
      global.__overviewIdentity = { name: 'Moxy', creatorName: 'Fixture Creator', cloneIds: cloneStatus ? ['own'] : [], applicationState: { label }, readOnly: false };
      global.__overviewCloneStatus = cloneStatus;
      global.__overviewPreparation = preparation;
      return renderToStaticMarkup(await Page());
    };
    let html = await render('Draft / unfinished', empty);
    assert.equal((html.match(/data-moxy-creator-setup/g) || []).length, 1);
    assert.match(html, /Continue setup/);
    assert.doesNotMatch(html, /LEGACY_PREPARATION_PANEL|Two steps\. All you\.|Make yourself at home\./);
    for (const label of ['Submitted', 'Under review', 'Approved']) for (const preparation of [populated, empty, unavailable]) {
      html = await render(label, preparation);
      assert.equal((html.match(/data-moxy-submission-confirmed/g) || []).length, 1);
      assert.match(html, /Your overview/);
      assert.doesNotMatch(html, /LEGACY_PREPARATION_PANEL|data-moxy-creator-setup|Continue setup|Complete your creator setup|Two steps\. All you\.|Make yourself at home\./);
      if (preparation !== populated) assert.doesNotMatch(html, /Permissions recorded|Content received/);
      if (label === 'Submitted') assert.doesNotMatch(html, /is reviewing your details|Your profile is approved/);
      if (label === 'Approved') assert.match(html, /Your profile is approved/);
    }
    for (const label of ['Changes required', 'Withdrawn']) {
      html = await render(label);
      assert.match(html, /View account details/);
      assert.doesNotMatch(html, /Continue setup|data-moxy-submission-confirmed/);
    }
    for (const cloneStatus of ['active', 'paused', 'unknown']) {
      html = await render('Draft / unfinished', empty, cloneStatus);
      assert.match(html, /Performance overview/);
      assert.doesNotMatch(html, /Continue setup|Complete your creator setup|data-moxy-creator-setup|data-moxy-submission-confirmed/);
    }
    global.__overviewIdentity = { ...global.__overviewIdentity, name: 'Twin', cloneIds: [] };
    html = renderToStaticMarkup(await Page());
    assert.equal((html.match(/LEGACY_PREPARATION_PANEL/g) || []).length, 1, 'Other agencies retain their existing preparation panel');
    console.log('Moxy overview route passed: one setup surface, submitted/reviewing/approved with full/optional/unavailable data, accurate receipts, correction/withdrawal states, connected/paused profiles, and unchanged other-agency composition.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
})().catch(error => { console.error(error); process.exitCode = 1; });

import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const output = resolve('node_modules/.cache/creator-studio-browser');
const screenshots = resolve('test-results/creator-studio');
await mkdir(output, { recursive: true });
await mkdir(screenshots, { recursive: true });
const brand = existsSync('lib/flirt-onboarding.ts') ? 'flirt' : 'moxy';
await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Shell from './components/CreatorStudioShell';import Home from './components/CreatorStudioHome';
import Setup from './components/CreatorSetupLayout';import {creatorStudioStatus} from './lib/creator-studio-model';
const p=new URLSearchParams(location.search);const phase=p.get('phase')||'submitted';const brand=${JSON.stringify(brand)};
const linked=['ready','paused','connected'].includes(phase);const labels={draft:'Draft / unfinished',submitted:'Submitted',reviewing:'Under review',approved:'Approved',changes:'Changes required',withdrawn:'Withdrawn'};
const status=creatorStudioStatus(linked,labels[phase]||'Approved',phase==='ready'?'active':phase==='paused'?'paused':null);
const contentHref='/creator/onboarding?step=content';
createRoot(document.getElementById('app')).render(phase==='setup'?<Setup brand={brand} logoSrc={brand==='moxy'?'/moxy/moxy-ai-light.svg':'/brand/flirt-logo.webp'} activeSection='content' applicationStatus='Draft / unfinished'><section data-creator-setup-panel><h1 data-setup-heading>Start with a little you.</h1><p>Add your photos and videos. You can always come back later.</p><label style={{display:'block',marginTop:30}}>Folder link<input aria-label='Folder link' style={{display:'block',width:'100%',marginTop:10,padding:12}} placeholder='https://…'/></label></section></Setup>:<Shell brand={brand} creatorName='Fixture Creator' status={status} contentHref={contentHref}><Home brand={brand} name='Fixture Creator' cloneId={linked?'own':null} status={status} contentHref={contentHref} /></Shell>);
` }, bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: resolve(output, 'app.js'),
  plugins: [{ name: 'studio-browser-fixtures', setup(b) {
    b.onResolve({ filter: /^(next\/link|next\/navigation)$|\/CurrencyProvider$|\/CreatorContentUploadProvider$/ }, args => ({ path: args.path, namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path === 'next/link' ? 'import React from "react";export default ({children,...p})=>React.createElement("a",p,children);' : args.path === 'next/navigation' ? 'export const usePathname=()=>"/creator";export const useRouter=()=>({refresh(){}});' : args.path.endsWith('/CurrencyProvider') ? 'export const useCurrency=()=>({currency:"AUD",rate:1.4,usdPerStar:0.01,setCurrency(){}});' : 'export const CreatorUploadActivity=()=>null;' }));
  } }],
});
const html = '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif}button,input,select{font:inherit}a{color:inherit}svg{flex-shrink:0}button{cursor:pointer}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  try {
    if (path === '/' || path === '/creator') { res.setHeader('content-type', 'text/html'); res.end(html); return; }
    const publicAsset = /^\/(?:moxy|brand)\/[^/]+\.(?:svg|png|webp)$/.test(path);
    const target = publicAsset ? resolve('public', path.slice(1)) : ['/app.js', '/app.css'].includes(path) ? resolve(output, path.slice(1)) : null;
    if (!target) { res.writeHead(404).end(); return; }
    res.setHeader('content-type', path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : path.endsWith('.svg') ? 'image/svg+xml' : path.endsWith('.webp') ? 'image/webp' : 'image/png');
    res.end(await readFile(target));
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  let failRevenue = false;
  let pending;
  await page.route('**/api/dashboard?*', async route => {
    const url = new URL(route.request().url());
    assert.equal(url.searchParams.get('clone'), 'own');
    const period = url.searchParams.get('period');
    if (failRevenue) return route.fulfill({ status: 503, json: { error: 'fixture unavailable' } });
    if (pending) await pending;
    const stars = period === '1W' ? 14 : 70;
    return route.fulfill({ json: { period, perClone: { own: { stars, activeUsers: 8 } }, analytics: { conversationFunnel: { conversations: 12 } }, series: Array.from({ length: 7 }, (_, i) => ({ bucket: 'Oct ' + (i + 1), own: i === 2 ? -2 : i + 1 })), stale: false } });
  });
  for (const [device, viewport] of [['desktop', { width: 1440, height: 1050 }], ['mobile', { width: 390, height: 844 }]]) {
    await page.setViewportSize(viewport);
    for (const phase of ['draft', 'submitted', 'ready', 'paused', 'setup']) {
      await page.goto(`${origin}/creator?phase=${phase}`);
      await page.getByRole('heading', { name: phase === 'setup' ? 'Start with a little you.' : /Your studio,|Looking good,/ }).waitFor();
      if (phase === 'ready' || phase === 'paused') {
        await page.getByText('A$0.98', { exact: true }).waitFor();
        await page.getByRole('button', { name: '7 days', exact: true }).click();
        await page.getByText('A$0.20', { exact: true }).waitFor();
        assert.equal(await page.getByRole('button', { name: '7 days', exact: true }).getAttribute('aria-pressed'), 'true');
        await page.getByRole('button', { name: '30 days', exact: true }).click();
        await page.getByText('A$0.98', { exact: true }).waitFor();
      }
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${device} ${phase} overflows horizontally`);
      if (phase !== 'setup') {
        const nav = page.getByRole('navigation', { name: device === 'mobile' ? 'Mobile creator navigation' : 'Creator navigation', exact: true });
        assert(await nav.isVisible());
        assert.equal(await nav.getByRole('link').count(), 5);
        assert.equal(await nav.getByRole('link', { name: 'Earnings', exact: true }).getAttribute('href'), '/creator/earnings');
        assert.equal(await page.locator('[data-creator-clone-building]').count(), phase === 'submitted' ? 1 : 0);
      }
      await page.screenshot({ path: resolve(screenshots, `${brand}-${device}-${phase}.png`), fullPage: true });
    }
  }
  failRevenue = true;
  await page.goto(`${origin}/creator?phase=ready`);
  await page.getByRole('alert').waitFor();
  assert.equal(await page.getByText('Unavailable', { exact: true }).count(), 3);
  failRevenue = false;
  await page.getByRole('button', { name: 'Try again' }).click();
  await page.getByText('A$0.98', { exact: true }).waitFor();
  // A slow old-period response must not replace the newly selected window.
  let release;
  pending = new Promise(resolve => { release = resolve; });
  await page.getByRole('button', { name: '90 days', exact: true }).click();
  pending = undefined;
  await page.getByRole('button', { name: '7 days', exact: true }).click();
  release();
  await page.getByText('A$0.20', { exact: true }).waitFor();
  assert.deepEqual(failures, []);
  console.log(`${brand} creator studio browser checks passed: desktop/mobile, draft/submitted/ready/paused/setup, periods, error recovery, stale-request protection, navigation and overflow.`);
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(output, { recursive: true, force: true });
}

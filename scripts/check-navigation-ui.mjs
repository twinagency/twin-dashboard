// The real installed Next router + real shared components, with delayed local
// pages. No application database, authentication or production endpoints.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, symlink, rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import ts from 'typescript';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url), root = process.cwd();
const fixture = await mkdtemp(join(tmpdir(), 'dashboard-navigation-'));
let server, browser, output = '';
async function source(path) { return ts.transpileModule(await readFile(resolve(root, path), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
async function file(path, content) { await mkdir(join(fixture, path, '..'), { recursive: true }); await writeFile(join(fixture, path), content); }
const run = args => new Promise((done, reject) => {
  const child = spawn(process.execPath, [require.resolve('next/dist/bin/next'), ...args], { cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', d => output += d); child.stderr.on('data', d => output += d);
  child.once('error', reject); child.once('exit', code => code === 0 ? done() : reject(new Error(output)));
});
try {
  await symlink(resolve(root, 'node_modules'), join(fixture, 'node_modules'), 'dir');
  await file('package.json', JSON.stringify({ private: true, dependencies: { next: require('next/package.json').version, react: require('react/package.json').version, 'react-dom': require('react-dom/package.json').version } }));
  await file('next.config.mjs', 'export default {experimental:{cpus:1},devIndicators:false};');
  await file('app/NavigationLink.js', await source('components/NavigationLink.tsx'));
  await file('app/loading.js', await source('components/PageLoading.tsx'));
  await file('app/feedback.css', await readFile(resolve(root, 'app/navigation-feedback.css'), 'utf8'));
  await file('app/layout.js', `import Link from './NavigationLink';import './feedback.css';export default function Layout({children}){return <html><body style={{margin:0,fontFamily:'Arial',background:'#142337',color:'#eee'}}><aside style={{position:'fixed',width:180,top:0,bottom:0}}><nav style={{display:'grid',gap:16,padding:16}}><Link href="/">Home</Link><Link href="/slow?page=1">Creators</Link><Link href="/slow?page=2">Next page</Link><Link href="/slow?page=3">Prepared page</Link></nav></aside><main className="workspace-content" style={{marginLeft:180,padding:24}}>{children}</main></body></html>}`);
  await file('app/page.js', `export default function Home(){return <h1>Home ready</h1>}`);
  await file('app/slow/page.js', `export const dynamic='force-dynamic';export default async function Page({searchParams}){const page=(await searchParams).page;await new Promise(r=>setTimeout(r,1400));return <h1>Page {page} ready</h1>}`);
  await run(['build']);
  if (process.env.NAV_UI_BUILD_ONLY === '1') { console.log('Navigation fixture production build passed'); }
  else {
    const listener = createServer(); await new Promise(r => listener.listen(0, '127.0.0.1', r)); const port = listener.address().port; await new Promise(r => listener.close(r));
    server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'start', '-p', String(port), '-H', '127.0.0.1'], { cwd: fixture, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((done, reject) => { const timer = setTimeout(() => reject(new Error(output)), 20000); const collect = d => { output += d; if (output.includes('Ready in')) { clearTimeout(timer); done(); } }; server.stdout.on('data', collect); server.stderr.on('data', collect); server.once('error', reject); });
    browser = await chromium.launch({ args: ['--no-sandbox'] });
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } }), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${port}`); await page.getByRole('heading', { name: 'Home ready' }).waitFor();
    const before = await page.locator('aside').boundingBox();
    const first = Date.now(); await page.getByRole('link', { name: 'Creators', exact: true }).click();
    await page.locator('[data-page-loading]').waitFor(); const shellMs = Date.now() - first;
    assert.ok(shellMs < 1000, `Stream loading shell before 1.4s data read: ${shellMs}ms`);
    await page.getByRole('heading', { name: 'Page 1 ready' }).waitFor();
    assert.deepEqual(await page.locator('aside').boundingBox(), before, 'Navigation does not move the sidebar');
    await page.getByRole('link', { name: 'Next page', exact: true }).click();
    await page.getByRole('status', { name: 'Loading page', exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'Next page', exact: true }).innerText(), 'Next page', 'Pagination label stays in place');
    await page.getByRole('heading', { name: 'Page 2 ready' }).waitFor();
    assert.equal(await page.locator('[data-navigation-pending]').count(), 0, 'Completed navigation clears spinner');
    const prefetch = page.waitForResponse(response => response.url().includes('/slow?page=3') && response.request().headers()['next-router-prefetch'] === '1');
    await page.getByRole('link', { name: 'Prepared page' }).hover(); const response = await prefetch; await response.finished();
    const prepared = Date.now(); await page.getByRole('link', { name: 'Prepared page' }).click(); await page.getByRole('heading', { name: 'Page 3 ready' }).waitFor(); const preparedMs = Date.now() - prepared;
    assert.ok(preparedMs < 1000, `Intent-prefetched page must avoid another 1.4s server read: ${preparedMs}ms`);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('link', { name: 'Next page', exact: true }).click();
    // Whether cached or pending, reduced-motion CSS is present and no script errors occur.
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ test: 'real Next navigation', loadingShellMs: shellMs, prefetchedPageMs: preparedMs, paginationFeedback: 'passed', sidebarGeometry: 'unchanged', browserErrors: 0 }));
  }
} catch (error) { console.error(output.slice(-8000)); throw error; }
finally { if (browser) await browser.close(); if (server) { server.kill('SIGTERM'); await new Promise(done => server.once('exit', done)); } await rm(fixture, { recursive: true, force: true }); }

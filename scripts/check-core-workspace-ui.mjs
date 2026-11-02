// Real preparation/upload/player components, synthetic media and loopback transport only.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';

const root = process.cwd(), out = resolve('test-results/core-workspace'), temporary = mkdtempSync(join(tmpdir(), 'twin-core-media-'));
mkdirSync(out, { recursive: true });
const preparation = { profile: { answered: 8, total: 22 }, content: { photos: 24, videos: 6, pending: 2, folders: 1 }, consentSaved: false };
const entry = `import React,{useState} from 'react';import{createRoot}from'react-dom/client';import Preparation from './components/CreatorPreparation';import Uploader from './components/onlyfans-preview/VaultUploader';import Player from './components/onlyfans-preview/VaultVideoPlayer';
function App(){const[open,setOpen]=useState(false);const unavailable=location.search.includes('unavailable');const value=unavailable?{profile:{answered:null,total:22},content:{photos:null,videos:null,pending:null,folders:null},consentSaved:null}:${JSON.stringify(preparation)};return <main style={{maxWidth:1100,margin:'24px auto',padding:16}}>{location.pathname==='/media-fixture'?<><Uploader accountId="acc-a" connectionRevision={1} onChanged={()=>{}}/><button onClick={()=>setOpen(true)}>View video for asset 13</button>{open&&<dialog open style={{position:'fixed',inset:16,maxWidth:640,maxHeight:'90vh',overflow:'auto'}}><button onClick={()=>setOpen(false)}>Close</button><Player accountId="acc-a" mediaId="13" poster="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aSFEAAAAASUVORK5CYII="/></dialog>}</>:<Preparation value={value}/>}</main>};createRoot(document.getElementById('root')).render(<App/>);`;
const bundle = await build({ stdin: { contents: entry, loader: 'tsx', resolveDir: root }, bundle: true, write: false, outdir: out, format: 'iife', platform: 'browser', jsx: 'automatic', alias: { '@': root }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'next-fixture', setup(b) {
  b.onResolve({ filter: /^next\/(link|navigation)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ resolveDir: root, loader: 'jsx', contents: a.path === 'next/link' ? `import React from 'react';export const useLinkStatus=()=>({pending:false});export default function Link({href,children,...props}){return <a href={href} {...props}>{children}</a>}` : `const router={refresh(){}};export const useRouter=()=>router;` }));
} }] });
const js = bundle.outputFiles.find(file => file.path.endsWith('.js')).text;
const css = (await postcss([tailwind()]).process('@import "./app/globals.css";', { from: resolve('core-workspace-review.css') })).css + '\nbody{margin:0;font:15px Arial,sans-serif;background:#f8fbff}';
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname;
  if (path === '/bundle.js') { response.setHeader('Content-Type', 'text/javascript'); return response.end(js); }
  if (path === '/style.css') { response.setHeader('Content-Type', 'text/css'); return response.end(css); }
  response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/bundle.js"></script></html>');
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || process.env.PREVIEW_CHROME, args: process.platform === 'win32' ? [] : ['--no-sandbox'] });
try {
  const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
  for (const width of [1280, 390, 320]) {
    await page.setViewportSize({ width, height: 844 }); await page.goto(origin + '/preparation-fixture');
    await page.getByRole('heading', { name: 'Get ready at your own pace.', exact: true }).waitFor();
    assert.match(await page.locator('[data-preparation-step=profile]').innerText(), /8 of 22/);
    assert.match(await page.locator('[data-preparation-step=content]').innerText(), /24 photos and 6 videos/);
    assert.match(await page.locator('[data-preparation-step=content]').innerText(), /2 uploads still need checking/);
    assert.equal(await page.locator('[data-preparation-step=permission]').getAttribute('data-saved'), 'false');
    assert.equal(await page.getByRole('link', { name: 'Open saved content' }).getAttribute('href'), '/creator/onboarding?step=content');
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Preparation must fit small phones');
    await page.screenshot({ path: join(out, `preparation-${width}.png`), fullPage: true });
  }
  await page.goto(origin + '/preparation-fixture?unavailable=1'); await page.getByRole('status').waitFor();
  assert.equal(await page.locator('[data-saved=true]').count(), 0, 'Unavailable data must never claim preparation is saved');
  assert.deepEqual(errors, []); await page.close();
  const movie = process.env.ONLYFANS_TEST_VIDEO || join(temporary, 'synthetic.mp4');
  if (!process.env.ONLYFANS_TEST_VIDEO) execFileSync(process.env.FFMPEG_PATH || 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=96x128:r=24', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', movie], { timeout: 30000 });
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/check-onlyfans-vault-media-browser.mjs'], { cwd: root, env: { ...process.env, ONLYFANS_TEST_WEB_URL: origin, ONLYFANS_TEST_VIDEO: movie, ONLYFANS_TEST_EVIDENCE: out, ...(process.env.CHROMIUM_PATH ? { PREVIEW_CHROME: process.env.CHROMIUM_PATH } : {}) }, stdio: 'inherit' });
    child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error('Native media browser checks failed: ' + code)));
  });
  console.log('PASS core workspace: real preparation at 1280/390/320px, missing-data states, actual interrupted bulk upload recovery and video decode/play/seek.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); rmSync(temporary, { recursive: true, force: true }); }


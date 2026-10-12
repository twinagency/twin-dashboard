// Render the production questionnaire components against local synthetic data.
// This runner never signs in or writes to a production account.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from 'playwright';

const root = process.cwd(), out = path.join(root, 'test-results/creator-profile');
mkdirSync(out, { recursive: true });
const fixture = `import React from 'react';import {createRoot} from 'react-dom/client';
import Layout from './components/CreatorSetupLayout';import Wizard from './components/CreatorQuestionnaireWizard';
import {COMPACT_QUESTIONNAIRE_PAGES as pages} from './lib/creator-questionnaire-compact';
const brand=new URLSearchParams(location.search).get('brand')==='twin'?'twin':'moxy';
createRoot(document.getElementById('root')).render(<Layout brand={brand} logoSrc="/moxy/logo.png" activeSection="questionnaire"><section data-creator-setup-panel><Wizard page={pages[0]} initialAnswers={{}} initialRevision="fixture-revision" optional /></section></Layout>);`;
await build({ stdin: { contents: fixture, resolveDir: root, sourcefile: 'creator-profile-fixture.tsx', loader: 'tsx' }, outfile: path.join(out, 'bundle.js'), bundle: true, platform: 'browser', jsx: 'automatic' });
const css = await postcss([tailwind()]).process('@import "./app/globals.css";', { from: path.join(root, 'creator-profile-check.css') });
writeFileSync(path.join(out, 'globals.css'), css.css);
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/globals.css"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0;font-family:Arial,sans-serif}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>';
let revision = 0;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/creator-auth/onboarding/draft') {
    for await (const _ of req) {};
    res.writeHead(200, { 'content-type': 'application/json' });res.end(JSON.stringify({ ok: true, revision: 'fixture-' + ++revision }));return;
  }
  if (url.pathname === '/moxy/logo.png') {
    const localLogo = process.env.CREATOR_PROFILE_REVIEW_LOGO || path.join(root, 'public/moxy/moxy-ai-light.svg');
    res.writeHead(200, { 'content-type': 'image/svg+xml' });
    res.end(existsSync(localLogo) ? readFileSync(localLogo) : '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="70"><text x="4" y="49" fill="white" font-family="Arial" font-size="44" font-weight="bold">moxy</text></svg>');return;
  }
  if (['/bundle.js','/bundle.css','/globals.css'].includes(url.pathname)) {
    res.writeHead(200, { 'content-type': url.pathname.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8' });res.end(readFileSync(path.join(out, url.pathname.slice(1))));return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const failures = [];
try {
  for (const brand of ['moxy', 'twin']) for (const viewport of [{ width: 390, height: 844 }, { width: 360, height: 800 }, { width: 1280, height: 900 }]) {
    const context = await browser.newContext({ viewport, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => failures.push(error.message));
    let documentLoads = 0;page.on('request', req => { if(req.isNavigationRequest() && req.frame() === page.mainFrame()) documentLoads++; });
    await page.goto(origin + '/creator/onboarding?brand=' + brand);
    await page.getByRole('heading', { name: 'A quick introduction', exact: true }).waitFor();
    const form = page.locator('[data-questionnaire-page]');
    assert.equal(await page.getByText(/Section \d of/).count(), 0);
    await form.getByLabel('What name should fans call you?').fill('Ava');
    await form.getByLabel('Languages').fill('English');
    await form.getByLabel('Ethnicity or nationality').fill('Australian');
    await form.getByRole('group', { name: 'Personality', exact: true }).getByRole('button', { name: 'A mix', exact: true }).click();
    await form.getByRole('group', { name: 'Social life', exact: true }).getByRole('button', { name: 'Going out', exact: true }).click();
    await form.getByRole('button', { name: 'No pets', exact: true }).click();
    assert.equal(await form.getByLabel('Pet name and breed').count(), 0);
    await form.getByRole('button', { name: 'Yes', exact: true }).click();
    await form.getByLabel('Pet name and breed').fill('Milo, Labrador');
    await form.getByRole('button', { name: 'Single', exact: true }).click();
    await form.getByRole('button', { name: 'Public', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('[data-save-state]')?.getAttribute('data-save-state') === 'saved');
    assert.ok(Number(await page.getByRole('progressbar').getAttribute('aria-valuenow')) > 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, brand + ' form must not overflow');
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(out, brand + '-' + viewport.width + '.png') });
    await page.getByRole('button', { name: 'Preview profile', exact: true }).click();
    await page.getByRole('dialog').waitFor();
    assert.match(await page.getByRole('dialog').innerText(), /Meet Ava/);
    assert.match(await page.getByRole('dialog').innerText(), /Milo, Labrador/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(out, brand + '-preview-' + viewport.width + '.png') });
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'A little more about you', exact: true }).waitFor();
    await form.getByLabel('Where did you grow up and live now?').fill('Grew up in Brisbane. Live on the Gold Coast.');
    await page.getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('heading', { name: 'A quick introduction', exact: true }).waitFor();
    assert.equal(await form.getByLabel('What name should fans call you?').inputValue(), 'Ava');
    assert.equal(await form.getByLabel('Pet name and breed').inputValue(), 'Milo, Labrador');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'A little more about you', exact: true }).waitFor();
    assert.equal(await form.getByLabel('Where did you grow up and live now?').inputValue(), 'Grew up in Brisbane. Live on the Gold Coast.');
    assert.equal(documentLoads, 1, 'next/back do not reload the document');
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await form.getByRole('button', { name: 'I don’t drink', exact: true }).click();
    assert.equal(await form.getByLabel('Favourite drink').count(), 0);
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await form.getByLabel('Turn-ons, including kinks').waitFor();
    await page.getByRole('button', { name: 'Continue', exact: true }).click();
    await page.getByRole('heading', { name: 'Last few details', exact: true }).waitFor();
    assert.equal(await form.locator('input').count(), 4);
    await context.close();
  }
  assert.deepEqual(failures, []);
  console.log('Creator profile browser checks passed: Moxy/Twin at 360px, 390px and desktop; choices, relevant follow-ups, real progress, preview/Escape, retained answers and no document reloads.');
} finally { await browser.close();await new Promise(resolve => server.close(resolve)); }

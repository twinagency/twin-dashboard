import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium, webkit } from 'playwright';

const port = 3137, origin = process.env.CATALOGUE_TEST_ORIGIN || `http://127.0.0.1:${port}`;
const output = 'test-results/catalogue-unlock';
const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#637c8e"/><stop offset="1" stop-color="#242e42"/></linearGradient></defs><rect width="300" height="400" fill="url(#g)"/><circle cx="150" cy="130" r="65" fill="#c4ad99" opacity=".4"/></svg>';
const svgUrl = 'data:image/svg+xml,' + encodeURIComponent(svg);
const existingFixture = await readFile('scripts/check-alana-catalogue-ui.mjs', 'utf8');
const videoBytes = Buffer.from(existingFixture.match(/const videoBytes=Buffer.from\('([^']+)'/)[1], 'base64');
const item = (id, type, extra = {}) => ({ id, type, description: `${type} ${id}, complete caption shown inside the detail view`, stars: 350, free: false, purchased: false, received: false, createdAt: '2026-09-29', ...extra });
const items = [item('p1', 'photo', { rank: 1 }), item('v1', 'video', { rank: 2 }), item('p2', 'photo'), item('v2', 'video'), item('owned', 'photo', { purchased: true }), item('free', 'photo', { free: true, stars: 0 })];
const bundle = (kind, ids) => ({ id: kind + '-bundle', title: `Two ${kind}s`, kind, caption: 'A complete two-item collection', photoIds: kind === 'photo' ? ids : [], videoIds: kind === 'video' ? ids : [], stars: 500, regularStars: 700, owned: false, partial: false });
const data = { name: 'Alanna Pow', verified: true, presentation: 'compact', checkoutMode: 'invoice', simpleUnlockCards: true, items, blur: 11, admin: false, enabled: true, canSend: true, chatUrl: 'https://t.me/alannapowofficialx', purchaseNote: 'Your linked purchases', bundles: [bundle('photo', ['p1', 'p2']), bundle('video', ['v1', 'v2'])], rewards: null, tonEnabled: true, tonNanotonPerStar: 2000000, tonNanotonPerUsd: 100000000, tonDiscountPercent: 50, starTipAmounts: { 10: 500, 25: 1250, 50: 2500, 100: 5000, 250: 12500, 500: 25000, 1000: 50000 } };
await mkdir(output, { recursive: true });
const server = process.env.CATALOGUE_TEST_ORIGIN ? null : spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], { env: { ...process.env, NODE_ENV: 'production', DASHBOARD_PASSWORD: 'offline-fixture-only' }, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; if (server) for (const stream of [server.stdout, server.stderr]) stream.on('data', value => { logs = (logs + value).slice(-5000); });
const results = [];
try {
  let ready = false;
  for (let i = 0; i < 80; i++) { try { if ((await fetch(origin + '/catalogue/alanna-pow', { signal: AbortSignal.timeout(1000) })).status < 500) { ready = true; break; } } catch {} await delay(250); }
  assert.ok(ready, logs);
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch();
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 850 }, reducedMotion: 'reduce' });
      const requests = [], errors = []; let receiptPaid = false;
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://telegram.org/js/telegram-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: `window.invoiceCount=0;window.invoiceResult='cancelled';window.Telegram={WebApp:{initData:'fixture',ready(){},expand(){},close(){throw Error('Unexpected close')},openTelegramLink(){throw Error('Unexpected chat navigation')},openInvoice(url,callback){window.invoiceCount++;if(window.invoiceResult==='throw')throw Error('Invoice unavailable');setTimeout(()=>callback(window.invoiceResult),20)},setHeaderColor(){},setBackgroundColor(){},setBottomBarColor(){}}};` }));
      await page.route('https://catalogue-fixture.test/preview.mp4', route => route.fulfill({ contentType: 'video/mp4', body: videoBytes }));
      await page.route('https://catalogue-fixture.test/original.svg', route => route.fulfill({ contentType: 'image/svg+xml', body: svg }));
      await page.route('**/api/catalogue/*', async route => {
        const request = route.request().postDataJSON(); requests.push(request);
        const json = body => route.fulfill({ contentType: 'application/json', body: JSON.stringify(body) });
        if (request.action === 'catalogue') return json(route.request().url().includes('briana-redd') ? { ...data, name: 'Briana Redd', simpleUnlockCards: false, starTipAmounts: null } : data);
        if (request.action === 'preview') return request.type === 'video' ? json({ url: 'https://catalogue-fixture.test/preview.mp4', posterUrl: svgUrl, durationSeconds: 62 }) : route.fulfill({ contentType: 'image/svg+xml', body: svg });
        if (request.action === 'content') return json({ type: 'photo', url: 'https://catalogue-fixture.test/original.svg' });
        if (request.action === 'event') return json({ ok: true });
        if (request.action === 'stars_tip_status') return json({ status: receiptPaid ? 'paid' : 'pending' });
        if (request.action === 'stars_tip') return json({ status: 'pending', invoiceUrl: 'https://t.me/$fixture-tip', amountStars: 1250 });
        if (request.action === 'ton_tip') return route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Offline wallet fixture' }) });
        throw new Error(`Unexpected payment or delivery: ${request.action}`);
      });
      for (const width of name === 'chromium' ? [320, 375, 390, 430, 760] : [390]) {
        await page.setViewportSize({ width, height: 850 }); await page.goto(origin + '/catalogue/alanna-pow');
        await page.getByRole('button', { name: 'Unlock Now', exact: true }).first().waitFor();
        assert.equal(await page.locator('.cat-grid .cat-unlock-now').count(), 4, 'only locked cards need Unlock Now');
        assert.equal(await page.locator('.cat-grid .cat-card-prices').count(), 0, 'no TON or Stars pills on gallery cards');
        const button = page.locator('.cat-grid .cat-unlock-now').first();
        const metrics = await button.evaluate(element => ({ colour: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor, radius: getComputedStyle(element).borderRadius, height: element.getBoundingClientRect().height, overflow: document.documentElement.scrollWidth - innerWidth }));
        assert.equal(metrics.colour, 'rgb(255, 255, 255)'); assert.equal(metrics.background, 'rgb(0, 119, 184)'); assert.equal(metrics.radius, '9999px'); assert.ok(metrics.height >= 44); assert.ok(metrics.overflow <= 1);
        await page.locator('.cat-grid .cat-preview > img').first().waitFor();
        const rankedVideo = page.locator('.cat-card-ranked').filter({ has: page.locator('.cat-video-preview') });
        await rankedVideo.locator('.cat-video-duration').waitFor();
        const overlap = await rankedVideo.evaluate(card => {
          const button = card.querySelector('.cat-unlock-now').getBoundingClientRect();
          return [...card.querySelectorAll('.cat-video-label,.cat-video-duration')].some(badge => {
            const box = badge.getBoundingClientRect();
            return box.left < button.right && box.right > button.left && box.top < button.bottom && box.bottom > button.top;
          });
        });
        assert.equal(overlap, false, 'preview and duration badges never cover Unlock Now');
        await page.screenshot({ path: `${output}/${name}-gallery-${width}.png`, fullPage: true });
        results.push({ engine: name, width, ...metrics });
      }
      await page.setViewportSize({ width: 390, height: 850 });
      for (const tab of ['Photos', 'Videos']) {
        await page.getByRole('button', { name: tab, exact: true }).click();
        await page.locator('.cat-grid .cat-unlock-now').first().click();
        const detail = page.getByRole('dialog', { name: 'Item details' }); await detail.waitFor();
        assert.match(await detail.innerText(), /complete caption/);
        assert.match(await detail.locator('.cat-pay-stars').innerText(), /350/);
        assert.match(await detail.locator('.cat-pay-ton').innerText(), /TON/);
        assert.equal(requests.filter(r => ['checkout', 'ton_checkout', 'request'].includes(r.action)).length, 0, 'opening details never starts payment');
        await page.getByRole('button', { name: 'Close item' }).click();
      }
      await page.getByRole('button', { name: 'Bundles', exact: true }).click();
      assert.equal(await page.locator('.cat-bundle-section .cat-unlock-now').count(), 2);
      assert.equal(await page.locator('.cat-bundle-section .cat-pay-row').count(), 0);
      for (let index = 0; index < 2; index++) {
        await page.locator('.cat-bundle-section .cat-unlock-now').nth(index).click();
        const detail = page.getByRole('dialog', { name: 'Bundle details' }); await detail.waitFor();
        assert.match(await detail.locator('.cat-pay-stars').innerText(), /500/);
        assert.match(await detail.locator('.cat-pay-ton').innerText(), /TON/);
        await page.getByRole('button', { name: 'Close bundle' }).click();
      }
      await page.screenshot({ path: `${output}/${name}-bundles-390.png`, fullPage: true });
      await page.getByRole('button', { name: 'Send me a tip' }).click();
      await page.getByRole('button', { name: 'Stars', exact: true }).click();
      const tip = page.getByRole('dialog', { name: 'Send a tip' });
      assert.equal(await tip.getByRole('radio').count(), 7);
      await tip.getByRole('button', { name: 'Send tip · ⭐1,250 Stars', exact: true }).waitFor();
      await page.screenshot({ path: `${output}/${name}-stars-tip-390.png`, fullPage: true });
      await page.evaluate(() => { window.invoiceResult = 'throw'; });
      await tip.getByRole('button', { name: 'Send tip · ⭐1,250 Stars', exact: true }).click();
      await tip.getByText('Invoice unavailable', { exact: true }).waitFor();
      await page.evaluate(() => { window.invoiceResult = 'cancelled'; });
      await tip.getByRole('button', { name: 'Send tip · ⭐1,250 Stars', exact: true }).click();
      await tip.getByText('Payment cancelled. No tip was confirmed.', { exact: true }).waitFor();
      assert.equal(await tip.getByRole('heading', { name: /Thank you/ }).count(), 0);
      await page.evaluate(() => { window.invoiceResult = 'paid'; });
      await tip.getByRole('button', { name: 'Send tip · ⭐1,250 Stars', exact: true }).click();
      await tip.getByText('Confirming your tip', { exact: true }).waitFor();
      assert.equal(await tip.getByRole('heading', { name: /Thank you/ }).count(), 0, 'paid browser callback is not a receipt');
      receiptPaid = true;
      await tip.getByRole('heading', { name: /Thank you/ }).waitFor();
      assert.equal(requests.filter(r => r.action === 'stars_tip').length, 1, 'cancel retry reuses the same invoice');
      await tip.getByRole('button', { name: /Back to the store/ }).click();
      await page.getByRole('button', { name: 'Send me a tip' }).click();
      await tip.getByRole('button', { name: /Send \$25 tip/ }).click();
      await tip.getByText('Offline wallet fixture', { exact: true }).waitFor();
      assert.equal(requests.filter(r => r.action === 'ton_tip').length, 1, 'TON tip dispatch still works');
      await page.goto(origin + '/catalogue/briana-redd');
      await page.locator('.cat-card-prices').first().waitFor();
      assert.equal(await page.locator('.cat-unlock-now').count(), 0, 'another compact creator retains the existing prices');
      await page.getByRole('button', { name: 'Send me a tip' }).click();
      assert.equal(await page.locator('.cat-tip-rails').count(), 0, 'another creator keeps TON-only tips');
      assert.deepEqual(errors, []);
    } finally { await browser.close(); }
  }
  await writeFile(`${output}/checks.json`, JSON.stringify(results, null, 2));
  console.log('Unlock cards and Stars tips passed in Chromium and WebKit: mobile layout, details-only payment choices, receipt confirmation, cancellation, TON dispatch and creator isolation.');
} finally { if (server) server.kill('SIGTERM'); }

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const chatSelector = '[data-ava-scroll="preview"]';
const ready = page => page.waitForFunction(() => document.querySelector('.ava-site')?.dataset.avaMotionReady === 'true');
const state = (page, expected) => page.waitForFunction(value => document.querySelector('[data-ava-scroll="preview"]')?.dataset.avaScrollState === value, expected, { timeout: 8000 });
const scrollPosition = page => page.locator(chatSelector).evaluate(element => element.scrollTop);
const sizes = page => page.evaluate(() => ({
  phones: [...document.querySelectorAll('.ava-phone')].map(element => { const r = element.getBoundingClientRect(); return [r.width, r.height]; }),
  stage: document.querySelector('.ava-phone-stage').offsetHeight,
  dashboard: [document.querySelector('.ava-dashboard-frame').offsetWidth, document.querySelector('.ava-dashboard-frame').offsetHeight],
}));

/** Runs against the actual Next production build, after the static 12-width suite. */
export async function checkAvaMotion(browser, origin, outputDir) {
  const source = await readFile('app/ava/AvaMotion.tsx', 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|WebSocket|EventSource|setInterval|supabase|localStorage|sessionStorage/);
  const errors = [], forbidden = [], results = [];
  function watch(page) {
    page.on('pageerror', error => errors.push(error.message));
    page.on('request', request => {
      if (request.method() !== 'GET' || new URL(request.url()).pathname.startsWith('/api/')) forbidden.push(`${request.method()} ${request.url()}`);
    });
    page.on('websocket', socket => forbidden.push(socket.url()));
  }
  async function motionContext(width) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'no-preference' });
    await context.addInitScript(() => {
      window.__avaAnimationEvents = [];
      const animate = Element.prototype.animate;
      Element.prototype.animate = function (...args) {
        window.__avaAnimationEvents.push({ chart: this.matches('.ava-dashboard-bars > i'), className: String(this.className) });
        return animate.apply(this, args);
      };
    });
    return context;
  }
  for (const width of [320, 390, 1440]) {
    const context = await motionContext(width);
    try {
      const page = await context.newPage(); watch(page);
      await page.goto(`${origin}/ava`, { waitUntil: 'networkidle' });
      await ready(page);
      const beforeSizes = await sizes(page);
      const money = await page.locator('.ava-revenue-value strong,.ava-balance-value strong').allTextContents();
      const history = await page.locator('.ava-chat-history').allTextContents();
      await page.locator('.ava-phone').first().scrollIntoViewIfNeeded();
      await state(page, 'running');
      await page.waitForTimeout(450);
      const firstPosition = await scrollPosition(page);
      await page.waitForTimeout(450);
      const nextPosition = await scrollPosition(page);
      assert.ok(nextPosition > firstPosition + 1, `${width}: existing messages actually scroll downward`);
      assert.equal(await page.locator('.ava-phone-secondary .ava-chat').evaluate(e => e.scrollTop), 0, 'The second conversation is still');
      assert.equal(await page.locator('.ava-phone-secondary .ava-chat').getAttribute('data-ava-scroll-ready'), null);
      assert.equal(await page.locator('.ava-hero h1').evaluate(e => e.getAnimations().length), 0, 'No headline entrance delay');

      if (width === 390) {
        // Leaving the viewport must freeze progress rather than run in the background.
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        await state(page, 'paused');
        const paused = await scrollPosition(page);
        await page.waitForTimeout(400);
        assert.equal(await scrollPosition(page), paused, 'Off-screen chat pauses');
        await page.locator('.ava-phone').first().scrollIntoViewIfNeeded();
        await state(page, 'running');
      }
      const documentPosition = await page.evaluate(() => scrollY);
      const topbarY = await page.locator('.ava-phone').first().locator('.ava-telegram-topbar').evaluate(e => e.getBoundingClientRect().y);
      await state(page, 'complete');
      const finalPosition = await scrollPosition(page);
      const maxScroll = await page.locator(chatSelector).evaluate(e => e.scrollHeight - e.clientHeight);
      assert.ok(maxScroll > 30, `${width}: useful scroll travel, not an imperceptible nudge`);
      assert.ok(Math.abs(finalPosition - maxScroll) <= 1, 'History ends on the existing final offer');
      assert.equal(await page.evaluate(() => scrollY), documentPosition, 'Animation never scrolls the website itself');
      assert.equal(await page.locator('.ava-phone').first().locator('.ava-telegram-topbar').evaluate(e => e.getBoundingClientRect().y), topbarY, 'Telegram header stays fixed');
      await page.waitForTimeout(400);
      assert.equal(await scrollPosition(page), finalPosition, 'No continuous looping');
      assert.deepEqual(await page.locator('.ava-chat-history').allTextContents(), history, 'No generated or appended messages');
      assert.deepEqual(await sizes(page), beforeSizes, 'Phone, stage and dashboard sizes are unchanged');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      if (width <= 680) {
        assert.ok(beforeSizes.phones.every(([w, h]) => w <= 125 && h <= 248), 'Keep the approved compact phones');
        assert.ok(beforeSizes.dashboard[0] <= 302 && beforeSizes.dashboard[1] <= 420, 'Keep compact mobile dashboard');
      }
      await page.locator('.ava-hero-visual').screenshot({ path: `${outputDir}/motion-phones-${width}.png` });

      await page.locator('.ava-chart-plot').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.ava-chart-plot').dataset.avaChartRevealed === 'true');
      await page.waitForTimeout(950);
      const chartCount = await page.evaluate(() => window.__avaAnimationEvents.filter(event => event.chart).length);
      assert.equal(chartCount, await page.locator('.ava-dashboard-bars > i').count(), 'Each bar animates once');
      assert.equal(await page.locator('.ava-chart-plot').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'Chart settles after reveal');
      assert.deepEqual(await page.locator('.ava-revenue-value strong,.ava-balance-value strong').allTextContents(), money, 'Money figures never count up or change');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.ava-chart-plot').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__avaAnimationEvents.filter(event => event.chart).length), chartCount, 'Chart does not replay on re-entry');
      assert.ok(await page.evaluate(() => window.__avaAnimationEvents.some(event => !event.chart)), 'Subtle section reveals execute');
      await page.locator('.ava-dashboard-preview').screenshot({ path: `${outputDir}/motion-dashboard-${width}.png` });
      results.push({ width, firstPosition, nextPosition, finalPosition, maxScroll, chartCount, sizes: beforeSizes });
      console.log(`MOTION PASS ${width}px: real internal scrolling, fixed hardware, one-time chart, stable figures and compact geometry.`);
    } finally { await context.close(); }
  }

  // Reader interaction takes precedence over automatic movement.
  const interactive = await motionContext(390);
  try {
    const page = await interactive.newPage(); watch(page);
    await page.goto(`${origin}/ava`, { waitUntil: 'networkidle' }); await ready(page);
    await page.locator('.ava-phone').first().scrollIntoViewIfNeeded(); await state(page, 'running');
    await page.locator(chatSelector).dispatchEvent('pointerdown'); await state(page, 'stopped');
    await page.locator(chatSelector).evaluate(e => { e.scrollTop = 20; });
    await page.waitForTimeout(350);
    assert.equal(await scrollPosition(page), 20, 'Reader can scroll without the animation fighting back');
    await page.reload({ waitUntil: 'networkidle' }); await ready(page);
    await page.locator('.ava-phone').first().scrollIntoViewIfNeeded(); await state(page, 'running');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await state(page, 'static');
    assert.equal(await page.locator(chatSelector).getAttribute('data-ava-scroll-ready'), null);
    assert.equal(await scrollPosition(page), 0);
    assert.equal(await page.locator('.ava-chat-history').first().evaluate(e => getComputedStyle(e).display), 'contents');
    assert.ok(await page.locator(chatSelector).evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'Reduce Motion restores the complete static composition');
    await page.locator('.ava-chart-plot').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.ava-site').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'Reduce Motion disables decorative page/graph movement');
  } finally { await interactive.close(); }

  // Server-rendered page remains complete and visible if JavaScript never loads.
  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  try {
    const page = await noJs.newPage(); watch(page);
    await page.goto(`${origin}/ava`, { waitUntil: 'load' });
    assert.ok(await page.locator('.ava-hero h1').isVisible());
    assert.equal(await page.locator('.ava-chat-history').first().evaluate(e => getComputedStyle(e).display), 'contents');
    assert.ok(await page.locator(chatSelector).evaluate(e => e.scrollHeight <= e.clientHeight + 1));
    assert.equal(await page.locator('.ava-features-section').evaluate(e => getComputedStyle(e).opacity), '1');
    assert.ok(await page.locator('.ava-revenue-value strong').isVisible());
  } finally { await noJs.close(); }
  assert.deepEqual(errors, [], 'No runtime errors in motion or static fallbacks');
  assert.deepEqual(forbidden, [], 'No private API, payment, live chat or socket traffic');
  await writeFile(`${outputDir}/motion-checks.json`, JSON.stringify(results, null, 2));
  console.log('Ava motion passed: 3 animated sizes, reader interruption, viewport pause, reduced-motion toggle and no-JavaScript fallback.');
}

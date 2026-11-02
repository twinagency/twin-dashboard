import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';

const chatSelector = '[data-ava-scroll="preview"]';
const toggleSelector = '[data-ava-motion-toggle]';
const ready = page => page.waitForFunction(() => document.querySelector('.ava-site')?.dataset.avaMotionReady === 'true');
const state = (page, expected) => page.waitForFunction(value => document.querySelector('[data-ava-scroll="preview"]')?.dataset.avaScrollState === value, expected, { timeout: 12000 });
const phase = (page, expected) => page.waitForFunction(value => document.querySelector('[data-ava-scroll="preview"]')?.dataset.avaScrollPhase === value, expected, { timeout: 12000 });
const scrollPosition = page => page.locator(chatSelector).evaluate(element => element.scrollTop);
const sizes = page => page.evaluate(() => ({
  phones: [...document.querySelectorAll('.ava-phone')].map(element => { const r = element.getBoundingClientRect(); return [r.width, r.height]; }),
  stage: document.querySelector('.ava-phone-stage').offsetHeight,
  dashboard: [document.querySelector('.ava-dashboard-frame').offsetWidth, document.querySelector('.ava-dashboard-frame').offsetHeight],
}));

/** Actual production-browser verification of the repeating existing-history preview. */
export async function checkAvaMotion(browser, origin, outputDir) {
  const source = await readFile('app/ava/AvaMotion.tsx', 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|WebSocket|EventSource|setInterval|supabase|localStorage|sessionStorage/);
  assert.doesNotMatch(source, /phoneObserver|inView|hovering|pointerenter|pointerleave/, 'Chat playback must not depend on viewport entry or hover');
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
      // At 390px start at the bottom: the chat must animate without ever entering view.
      await page.goto(`${origin}/ava${width === 390 ? '#faq' : ''}`, { waitUntil: 'networkidle' });
      await ready(page);
      assert.equal(await page.locator('.ava-chat-disclaimer').count(), 0, 'Requested phone caption removed from markup');
      assert.doesNotMatch(await page.locator('.ava-hero-visual').innerText(), /Example conversations|Fictional creators/);
      const beforeSizes = await sizes(page);
      const money = await page.locator('.ava-revenue-value strong,.ava-balance-value strong').allTextContents();
      const history = await page.locator('.ava-chat-history').allTextContents();
      if (width === 390) {
        assert.ok(await page.locator('.ava-phone').first().evaluate(e => e.getBoundingClientRect().bottom < 0), 'Phone starts outside the viewport');
      }
      await state(page, 'running');
      await phase(page, 'down');
      await page.waitForTimeout(250);
      const firstPosition = await scrollPosition(page);
      await page.waitForTimeout(700);
      const nextPosition = await scrollPosition(page);
      assert.ok(nextPosition > firstPosition + 1, `${width}: existing messages scroll downward, including off-screen`);
      if (width === 1440) {
        await page.locator(chatSelector).hover();
        const hoveredPosition = await scrollPosition(page);
        await page.waitForTimeout(450);
        assert.ok((await scrollPosition(page)) > hoveredPosition + 1, 'Hovering does not freeze automatic playback');
        await page.mouse.move(0, 0);
      }
      assert.equal(await page.locator('.ava-phone-secondary .ava-chat').evaluate(e => e.scrollTop), 0, 'The second conversation stays still');
      assert.equal(await page.locator('.ava-phone-secondary .ava-chat').getAttribute('data-ava-scroll-ready'), null);
      assert.equal(await page.locator('.ava-hero h1').evaluate(e => e.getAnimations().length), 0, 'No headline entrance delay');
      const documentPosition = await page.evaluate(() => scrollY);
      const topbarY = await page.locator('.ava-phone').first().locator('.ava-telegram-topbar').evaluate(e => e.getBoundingClientRect().y);
      await phase(page, 'bottom');
      const bottomPosition = await scrollPosition(page);
      const maxScroll = await page.locator(chatSelector).evaluate(e => e.scrollHeight - e.clientHeight);
      assert.ok(maxScroll > 30, `${width}: useful travel without enlarging the phone`);
      assert.ok(Math.abs(bottomPosition - maxScroll) <= 1, 'History reaches the existing final offer');
      await phase(page, 'return');
      await page.waitForTimeout(150);
      const returnStart = await scrollPosition(page);
      await page.waitForTimeout(650);
      const returnLater = await scrollPosition(page);
      assert.ok(returnLater < returnStart - 1, 'History flows smoothly back rather than abruptly jumping');
      await page.waitForFunction(() => {
        const e = document.querySelector('[data-ava-scroll="preview"]');
        return Number(e?.dataset.avaScrollCycle) >= 1 && e?.dataset.avaScrollPhase === 'top';
      }, null, { timeout: 12000 });
      assert.ok((await scrollPosition(page)) <= 1, 'Loop returns to the original beginning');
      await phase(page, 'down');
      await page.waitForTimeout(650);
      assert.ok((await scrollPosition(page)) > 1, 'A second downward cycle starts automatically');
      const loopCount = Number(await page.locator(chatSelector).getAttribute('data-ava-scroll-cycle'));
      assert.ok(loopCount >= 1);
      assert.equal(await page.evaluate(() => scrollY), documentPosition, 'Animation never scrolls the website itself');
      assert.equal(await page.locator('.ava-phone').first().locator('.ava-telegram-topbar').evaluate(e => e.getBoundingClientRect().y), topbarY, 'Telegram header stays fixed');
      assert.deepEqual(await page.locator('.ava-chat-history').allTextContents(), history, 'No generated, duplicated or appended messages');
      assert.deepEqual(await sizes(page), beforeSizes, 'Phone, stage and dashboard sizes unchanged');
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'No horizontal overflow');
      if (width <= 680) {
        assert.ok(beforeSizes.phones.every(([w, h]) => w <= 125 && h <= 248), 'Keep approved compact phones');
        assert.ok(beforeSizes.dashboard[0] <= 302 && beforeSizes.dashboard[1] <= 420, 'Keep compact dashboard');
      }
      await page.locator('.ava-hero-visual').screenshot({ path: `${outputDir}/motion-phones-${width}.png` });
      await state(page, 'running');

      await page.locator('.ava-chart-plot').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('.ava-chart-plot').dataset.avaChartRevealed === 'true');
      await page.waitForTimeout(950);
      const chartCount = await page.evaluate(() => window.__avaAnimationEvents.filter(event => event.chart).length);
      assert.equal(chartCount, await page.locator('.ava-dashboard-bars > i').count(), 'Chart bars still animate only once');
      assert.equal(await page.locator('.ava-chart-plot').evaluate(e => e.getAnimations({ subtree: true }).length), 0, 'Chart settles');
      assert.deepEqual(await page.locator('.ava-revenue-value strong,.ava-balance-value strong').allTextContents(), money, 'Figures never count up or change');
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.locator('.ava-chart-plot').scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      assert.equal(await page.evaluate(() => window.__avaAnimationEvents.filter(event => event.chart).length), chartCount, 'Chart does not replay');
      assert.ok(await page.evaluate(() => window.__avaAnimationEvents.some(event => !event.chart)), 'Section reveals still execute');
      await page.locator('.ava-dashboard-preview').screenshot({ path: `${outputDir}/motion-dashboard-${width}.png` });
      results.push({ width, firstPosition, nextPosition, bottomPosition, returnStart, returnLater, maxScroll, loopCount, chartCount, sizes: beforeSizes });
      console.log(`LOOP PASS ${width}px: down, return, repeat, no viewport gating, fixed hardware and unchanged content.`);
    } finally { await context.close(); }
  }

  // Only an explicit pause action stops playback; page scroll and hover do not.
  const interactive = await motionContext(390);
  try {
    const page = await interactive.newPage(); watch(page);
    await page.goto(`${origin}/ava`, { waitUntil: 'networkidle' }); await ready(page);
    await page.locator(toggleSelector).click(); await state(page, 'paused');
    assert.equal(await page.locator(toggleSelector).getAttribute('aria-pressed'), 'true');
    await page.locator(chatSelector).evaluate(e => { e.scrollTop = 20; });
    await page.waitForTimeout(400);
    assert.equal(await scrollPosition(page), 20, 'Reader can pause and scroll manually');
    await page.locator(toggleSelector).focus(); await page.keyboard.press('Enter');
    await state(page, 'running');
    assert.equal(await page.locator(toggleSelector).getAttribute('aria-pressed'), 'false');
    await page.waitForTimeout(650);
    assert.ok((await scrollPosition(page)) > 20, 'Keyboard resume continues smoothly from the manual position');
    await page.emulateMedia({ reducedMotion: 'reduce' }); await state(page, 'static');
    assert.equal(await page.locator(chatSelector).getAttribute('data-ava-scroll-ready'), null);
    assert.equal(await scrollPosition(page), 0);
    assert.equal(await page.locator('.ava-chat-history').first().evaluate(e => getComputedStyle(e).display), 'contents');
    assert.ok(await page.locator(chatSelector).evaluate(e => e.scrollHeight <= e.clientHeight + 1), 'Reduce Motion restores complete static composition');
    assert.ok(!(await page.locator(toggleSelector).isVisible()));
    await page.locator('.ava-chart-plot').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.ava-site').evaluate(e => e.getAnimations({ subtree: true }).length), 0);
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await state(page, 'running');
    await phase(page, 'down'); await page.waitForTimeout(650);
    assert.ok((await scrollPosition(page)) > 1, 'Opting back into motion resumes even outside the phone viewport');
  } finally { await interactive.close(); }

  const noJs = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 900 } });
  try {
    const page = await noJs.newPage(); watch(page);
    await page.goto(`${origin}/ava`, { waitUntil: 'load' });
    assert.ok(await page.locator('.ava-hero h1').isVisible());
    assert.equal(await page.locator('.ava-chat-history').first().evaluate(e => getComputedStyle(e).display), 'contents');
    assert.ok(await page.locator(chatSelector).evaluate(e => e.scrollHeight <= e.clientHeight + 1));
    assert.equal(await page.locator('.ava-features-section').evaluate(e => getComputedStyle(e).opacity), '1');
    assert.ok(await page.locator('.ava-revenue-value strong').isVisible());
    assert.ok(!(await page.locator(toggleSelector).isVisible()));
    assert.equal(await page.locator('.ava-chat-disclaimer').count(), 0);
  } finally { await noJs.close(); }
  assert.deepEqual(errors, [], 'No runtime errors');
  assert.deepEqual(forbidden, [], 'No private API, payment, live chat or socket traffic');
  await writeFile(`${outputDir}/motion-checks.json`, JSON.stringify(results, null, 2));
  console.log('Ava loop passed: 3 animated sizes, automatic repeat/return, offscreen playback, hover, explicit pause/resume, Reduce Motion and no-JavaScript fallback.');
}

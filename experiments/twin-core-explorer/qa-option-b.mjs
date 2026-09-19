import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
const require = createRequire(join(process.env.QA_TOOLCHAIN, 'package.json'));
const { chromium } = require('playwright');
const output = 'qa-option-b';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const width of [320, 390, 430, 720, 768, 1280]) {
    const mobile = width <= 720;
    const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 3, isMobile: mobile, hasTouch: mobile });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    // Font transport is not part of these deterministic layout tests.
    await page.route('https://api.fontshare.com/**', r => r.abort());
    await page.goto('http://127.0.0.1:4173/', { waitUntil: 'load' });
    await page.waitForFunction(() => window.TwinCore?.orbRuntimeRevision === 'native-resolution-continuous-6');
    await page.waitForTimeout(800);
    const counts = await page.locator('.system-count').allTextContents();
    assert.deepEqual(counts, ['5 capabilities', '5 capabilities', '5 capabilities', '5 capabilities', '5 capabilities', '6 capabilities']);
    assert.equal(await page.locator('.system-button:visible').count(), 6);
    assert.equal(await page.locator('.ring:visible').count(), 0);
    assert.equal(await page.locator('.node-code:visible').count(), 0);
    const routes = await page.evaluate(() => [
      { view: 'home' }, { view: 'core' },
      ...window.TwinCore.CATALOGUE.flatMap(c => [{ view: 'core', category: c.id }, ...c.features.map(f => ({ view: 'core', category: c.id, feature: f.id }))])
    ]);
    let firstWidth = null;
    for (const state of routes) {
      await page.evaluate(state => window.TwinCore.navigate(state, false), state);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(70);
      const values = await page.evaluate(() => {
        const c = document.getElementById('canvas'), r = c.getBoundingClientRect();
        const orb = document.getElementById('orb'), style = getComputedStyle(orb);
        return { w: c.clientWidth, h: c.clientHeight, pixelW: c.width, pixelH: c.height, dpr: devicePixelRatio,
          centreX: r.left + r.width / 2, filter: style.filter, animation: style.animationName,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          rings: [...document.querySelectorAll('.ring')].some(x => getComputedStyle(x).display !== 'none') };
      });
      firstWidth ??= values.w;
      assert.equal(values.w, firstWidth, `Canvas width changed on ${JSON.stringify(state)} at ${width}`);
      assert.equal(values.pixelW, Math.round(values.w * values.dpr));
      assert.equal(values.pixelH, Math.round(values.h * values.dpr));
      assert.ok(Math.abs(values.centreX - width / 2) < 1.1, `Orb moved off centre at ${width}`);
      assert.equal(values.filter, 'none'); assert.equal(values.animation, 'none');
      assert.equal(values.rings, false); assert.equal(values.overflow, false);
    }
    await page.evaluate(() => { window.TwinCore.navigate({ view: 'core' }, false); window.scrollTo(0, 0); });
    await page.waitForTimeout(900);
    const before = await page.locator('#canvas').evaluate(c => c.toDataURL());
    await page.waitForTimeout(220);
    assert.notEqual(await page.locator('#canvas').evaluate(c => c.toDataURL()), before, 'Orb is frozen');
    const rotation = await page.evaluate(() => window.TwinCore.orbMetrics.rotation);
    await page.evaluate(() => window.TwinCore.navigate({ view: 'core', category: 'crm' }, false));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(250);
    assert.ok(await page.evaluate(r => window.TwinCore.orbMetrics.rotation >= r, rotation), 'Orb rotation reset');
    if (mobile) {
      await page.locator('#stage').dispatchEvent('pointermove', { pointerType: 'touch', clientX: width - 15, clientY: 450 });
      await page.waitForTimeout(100);
      assert.equal(await page.evaluate(() => window.TwinCore.orbMetrics.hover), false);
    }
    await page.screenshot({ path: `${output}/option-b-${width}.png`, fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForTimeout(800);
    const frozen = await page.locator('#canvas').evaluate(c => c.toDataURL());
    await page.waitForTimeout(220);
    assert.equal(await page.locator('#canvas').evaluate(c => c.toDataURL()), frozen, 'Reduced-motion frame changed');
    assert.deepEqual(errors, []);
    results.push({ width, devicePixelRatio: 3, routes: routes.length, passed: true });
    await context.close();
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
console.log(JSON.stringify(results, null, 2));

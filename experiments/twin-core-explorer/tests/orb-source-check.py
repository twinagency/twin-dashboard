"""Run with Python Playwright and Chromium. Local code, no public-network dependency."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, re
ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'index.html').read_text()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>', lambda m: '' if m[1].startswith('https:') else '<style>' + (ROOT / m[1].split('?')[0]).read_text() + '</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>' + (ROOT / m[1].split('?')[0]).read_text() + '</script>', html)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 1050})
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(html, wait_until='domcontentloaded')
    page.locator('#explore').click()
    for width in [320, 350, 375, 390, 414, 430, 720, 768, 1280, 390]:
        page.set_viewport_size({'width': width, 'height': 1050})
        page.wait_for_function("TwinCore.orbRevision === 'twin-source-video-2'")
        before = page.evaluate('TwinCore.orbMetrics.mainFrames')
        page.wait_for_function('n => TwinCore.orbMetrics.mainFrames > n + 4', arg=before)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    assert page.evaluate('TwinOrbRenderer.particleCount') == 216
    assert page.evaluate('TwinOrbRenderer.linkCount') == 486
    page.locator('#browse').click()
    page.locator('#mobile-motion').click()
    page.locator('#browse-close').click()
    page.wait_for_timeout(200)
    before = page.evaluate("[document.querySelector('#canvas').toDataURL(), document.querySelector('#mini-orb').toDataURL()]")
    page.wait_for_timeout(250)
    assert before == page.evaluate("[document.querySelector('#canvas').toDataURL(), document.querySelector('#mini-orb').toDataURL()]")
    page.locator('#browse').click()
    page.locator('#mobile-motion').click()
    page.locator('#browse-close').click()
    frames = page.evaluate('TwinCore.orbMetrics.mainFrames')
    page.wait_for_function('n => TwinCore.orbMetrics.mainFrames > n + 4', arg=frames)
    page.emulate_media(reduced_motion='reduce')
    page.wait_for_timeout(200)
    before = page.evaluate("document.querySelector('#canvas').toDataURL()")
    page.wait_for_timeout(250)
    assert before == page.evaluate("document.querySelector('#canvas').toDataURL()")
    assert not errors, errors
    browser.close()
    print('PASS: one shared renderer, viewport changes, pause/resume, reduced motion and no page errors')

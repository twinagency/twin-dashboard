"""Phone readability regression against the exact local source; not physical Safari QA."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import json, re

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'captures'
OUT.mkdir(exist_ok=True)
html = (ROOT / 'index.html').read_text()
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">', lambda m: '' if m[1].startswith('https:') else '<style>' + (ROOT / m[1]).read_text() + '</style>', html)
html = re.sub(r'<script src="([^"]+)"></script>', lambda m: '<script>' + (ROOT / m[1]).read_text() + '</script>', html)

def contrast_on_white(rgb):
    parts = [int(n) / 255 for n in re.findall(r'\d+', rgb)[:3]]
    linear = [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in parts]
    return 1.05 / (sum(a*b for a,b in zip(linear, [.2126, .7152, .0722])) + .05)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(html)
    page.locator('#explore').tap()
    for width in [320,350,375,390,414,430,720]:
        page.set_viewport_size({'width':width,'height':844})
        page.evaluate("TwinCore.navigate({view:'core'}); scrollTo(0,0)")
        page.wait_for_timeout(120)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'overflow')
        assert page.locator('.mobile-meta').count() == 6
        boxes = page.locator('.mobile-label').evaluate_all('(els)=>els.map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,text:e.innerText}})')
        for i, a in enumerate(boxes):
            assert a['x'] >= 0 and a['x'] + a['w'] <= width + .1, (width, a)
            assert 'capabilities' in a['text'] and '\n' in a['text']
            for b in boxes[i+1:]:
                ox = min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])
                oy = min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])
                assert ox <= 0 or oy <= 0, (width, 'overlapping labels')
        for selector in ['#subtitle','.mobile-meta','.node-title','#browse','#preview-note']:
            color = page.locator(selector).first.evaluate('(e)=>getComputedStyle(e).color')
            assert contrast_on_white(color) >= 4.5, (width, selector, color)
        page.locator('#browse').click()
        dialog = page.locator('#browse-dialog').bounding_box()
        assert dialog['x'] >= 0 and dialog['x']+dialog['width'] <= width + 1
        page.locator('#browse-close').click()
        if width in [320,390,430]:
            page.screenshot(path=str(OUT / f'mobile-after-{width}.png'), full_page=True)
    assert not errors, errors
    (OUT/'readability-results.json').write_text(json.dumps({'widths':[320,350,375,390,414,430,720], 'label_overlap':False, 'measured_text_contrast_minimum':4.5, 'dialog_fit':True, 'errors':errors, 'method':'Local Chromium, Inter fallback, not physical iPhone or hosted font verification.'}, indent=2))
    print('PASS: seven widths, label/count separation, no label overlap, text contrast >=4.5, dialog fit, no JS errors')
    browser.close()

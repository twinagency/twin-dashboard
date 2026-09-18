"""Presentation checks against the real split-file source. No generated UI images.
The test document is local and inlined. Fonts use the installed Inter fallback.
This is not a hosted-origin or physical-device microphone test.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re, json
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'review'
OUT.mkdir(exist_ok=True)

def document():
    html = (ROOT / 'index.html').read_text()
    html = re.sub(r'<link rel="stylesheet" href="([^\"]+)">', lambda m: '' if m[1].startswith('https:') else '<style>' + (ROOT / m[1]).read_text() + '</style>', html)
    return re.sub(r'<script src="([^\"]+)"></script>', lambda m: '<script>' + (ROOT / m[1]).read_text() + '</script>', html)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path='/usr/bin/chromium', headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1440, 'height':900})
    errors=[]
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.set_content(document())
    page.emulate_media(reduced_motion='reduce')
    checks=0
    routes=[{'view':'home'}, {'view':'core'}] + [{'view':'core','category':c} for c in ['identity','communication','automation','sales','crm','privacy']]
    for w,h in [(320,740),(390,844),(430,932),(768,1024),(1024,768),(1440,900)]:
        page.set_viewport_size({'width':w,'height':h})
        for route in routes:
            page.evaluate('(s)=>TwinCore.navigate(s)',route)
            page.wait_for_timeout(80)
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (w,route,'overflow')
            boxes=page.locator('.node:visible').evaluate_all('(els)=>els.map(e=>{const r=e.getBoundingClientRect();return {id:e.dataset.id,x:r.x,y:r.y,w:r.width,h:r.height}})')
            for i,a in enumerate(boxes):
                assert a['w']>=44 and a['h']>=44,(w,route,a,'small tap target')
                for b in boxes[i+1:]:
                    ox=min(a['x']+a['w'],b['x']+b['w'])-max(a['x'],b['x'])
                    oy=min(a['y']+a['h'],b['y']+b['h'])-max(a['y'],b['y'])
                    assert ox<=1 or oy<=1,(w,route,a['id'],b['id'],'overlapping targets')
            if w<=720 and route['view']=='core':
                assert page.locator('.ring').is_visible()
                assert page.locator('.nodes').evaluate('(e)=>getComputedStyle(e).display')!='grid'
            checks+=1
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate("TwinCore.navigate({view:'core'})")
    page.locator('#query').fill('show me daily briefing')
    page.locator('#command').evaluate('(e)=>e.requestSubmit()')
    assert 'Briefings' in page.locator('#status').inner_text()
    page.get_by_role('button',name='Close capability',exact=True).click()
    assert page.locator('#status').inner_text()==''
    page.locator('#back').click()
    assert page.locator('#status').inner_text()==''
    assert page.locator('#query').get_attribute('placeholder')=='Ask Twin to explore…'
    page.emulate_media(reduced_motion='no-preference')
    page.evaluate("TwinCore.navigate({view:'home'})")
    page.locator('#explore').click()
    assert page.locator('body').evaluate("e=>e.classList.contains('core-opening')")
    page.wait_for_timeout(1000)
    assert not page.locator('body').evaluate("e=>e.classList.contains('core-opening')")
    assert not errors,errors
    result={'viewport_route_combinations':checks,'minimum_target':44,'non_overlapping_targets':True,'mobile_circular_navigation':True,'stale_status_regression':True,'opening_state_settles':True,'page_errors':errors,'method':'local inlined Chromium; no external font or physical microphone validation'}
    (OUT/'visual-results.json').write_text(json.dumps(result,indent=2))
    print(json.dumps(result,indent=2))
    browser.close()

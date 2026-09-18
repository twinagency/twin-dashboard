"""Regression checks for the mobile-root spacing correction.
Runs the exact CSS/JS in a local Chromium document. Speech and hosting are not tested.
Optional TWIN_BASELINE_DIR checks that the actual orb pixels and mobile detail views
are unchanged. The orb painter is deliberately outside this patch.
"""
from pathlib import Path
import json
import os
import re
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT.parent / 'spacing-checks'
OUT.mkdir(exist_ok=True)


def document(root=ROOT):
    html = (root / 'index.html').read_text()
    html = re.sub(r'<link rel="stylesheet" href="([^\"]+)">', lambda m:
        '' if m[1].startswith('https:') else '<style>' + (root / m[1]).read_text() + '</style>', html)
    return re.sub(r'<script src="([^\"]+)"></script>', lambda m:
        '<script>' + (root / m[1]).read_text() + '</script>', html)


def freeze(page):
    page.evaluate('paused=true; clock=2000; phase=.36; scale=1; hover=false; pointer.x=0; pointer.y=0; restart()')
    page.wait_for_timeout(150)


with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'),
                                headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width': 390, 'height': 844}, has_touch=True,
                            is_mobile=True, reduced_motion='reduce')
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.set_content(document())
    results = []
    for width, height in [(320, 740), (350, 780), (375, 812), (390, 844), (414, 896), (430, 932), (720, 1024)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.evaluate("TwinCore.navigate({view:'core'});scrollTo(0,0)")
        freeze(page)
        data = page.evaluate("""() => {
          const orb=document.querySelector('#canvas').getBoundingClientRect();
          const cx=orb.x+orb.width/2,cy=orb.y+orb.height/2;
          const labels=[...document.querySelectorAll('.node')].map(b=>{
            const l=b.querySelector('.node-title').getBoundingClientRect();
            const m=b.querySelector('.mobile-marker').getBoundingClientRect();
            const upper=['identity','privacy','communication'].includes(b.dataset.id);
            const dx=Math.max(l.left-cx,0,cx-l.right),dy=Math.max(l.top-cy,0,cy-l.bottom);
            // Conservative bounded envelope of the visible network, including
            // breathing/drift and modest hover response, not transparent canvas margins.
            const envelope=Math.min(orb.width,orb.height)*.405/Math.sqrt(1.14**2-.22**2)*1.08;
            return {id:b.dataset.id,gap:upper?m.top-l.bottom:l.top-m.bottom,
                    clearance:Math.hypot(dx,dy)-envelope,left:l.left,right:l.right};
          });
          const send=document.querySelector('#command button:last-child');
          const r=send.getBoundingClientRect();const face=getComputedStyle(send,'::before');
          return {labels,target:{width:r.width,height:r.height},face:r.width-parseFloat(face.left)-parseFloat(face.right)};
        }""")
        for label in data['labels']:
            assert 7 <= label['gap'] <= 16, (width, label, 'inconsistent marker-to-label gap')
            assert label['clearance'] >= 3, (width, label, 'label too close to the network')
            assert label['left'] >= 0 and label['right'] <= width, (width, label, 'clipped label')
        assert data['target']['width'] >= 44 and data['target']['height'] >= 44, (width, 'send target')
        assert abs(data['face'] - 36) < .5, (width, 'send face should be visibly smaller')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (width, 'overflow')
        # Tap the text itself, not only the marker or a DOM-dispatched click.
        for category in ['identity', 'communication', 'automation', 'sales', 'crm', 'privacy']:
            page.locator(f'.node[data-id="{category}"] .node-title').tap()
            assert page.evaluate('TwinCore.getState().category') == category
            page.evaluate("TwinCore.navigate({view:'core'})")
            page.wait_for_timeout(50)
        results.append({'width': width, 'label_gap_min': min(l['gap'] for l in data['labels']),
                        'label_gap_max': max(l['gap'] for l in data['labels']),
                        'network_clearance_min': min(l['clearance'] for l in data['labels'])})
    print('PASS: label clearance, consistent marker gaps, all six text taps and smaller send face at seven mobile widths')
    baseline = os.environ.get('TWIN_BASELINE_DIR')
    comparisons = []
    if baseline:
        for route in [{'view': 'core'}, {'view': 'core', 'category': 'privacy'},
                      {'view': 'core', 'category': 'automation', 'feature': 'workflow-orchestration'}]:
            captures = []
            canvases = []
            for root in [Path(baseline), ROOT]:
                p=browser.new_page(viewport={'width':390,'height':844}, reduced_motion='reduce', device_scale_factor=2)
                p.set_content(document(root)); p.evaluate('(s)=>TwinCore.navigate(s)', route); freeze(p)
                canvases.append(p.evaluate("['canvas','mini-orb'].map(id=>document.getElementById(id).toDataURL())"))
                captures.append(p.screenshot(full_page=True));p.close()
            assert canvases[0] == canvases[1], ('orb appearance changed', route)
            if route.get('category'):
                assert captures[0] == captures[1], ('out-of-scope category/detail UI changed', route)
            comparisons.append(route)
        print('PASS: both orb canvases and the tested mobile category/detail views are pixel-identical to the previous build')
    assert not errors, errors
    (OUT / 'spacing-results.json').write_text(json.dumps({'mobile_widths':results,'baseline_comparisons':comparisons,
        'errors':errors,'method':'Exact inlined source in local Chromium; touch emulation and Inter fallback. Not HTTPS or physical iPhone validation.'}, indent=2))
    browser.close()

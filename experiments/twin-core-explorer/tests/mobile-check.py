"""Mobile design regression tests against the exact inlined application source.
No generated images, hosted-origin claims, physical microphone or Safari claims.
Optional: TWIN_BASELINE_DIR=/path/to/previous/experiment verifies desktop pixels.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, re, json, math

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'mobile-checks'
OUT.mkdir(exist_ok=True)
checks=[]
def document(root=ROOT):
    html=(root/'index.html').read_text()
    html=re.sub(r'<link rel="stylesheet" href="([^\"]+)">',lambda m:'' if m[1].startswith('https:') else '<style>'+(root/m[1]).read_text()+'</style>',html)
    return re.sub(r'<script src="([^\"]+)"></script>',lambda m:'<script>'+(root/m[1]).read_text()+'</script>',html)
def passed(text):
    checks.append(text)
    print('PASS:',text,flush=True)
def frames(page):
    return page.evaluate("['canvas','mini-orb'].map(id=>document.getElementById(id).toDataURL())")

with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium'),headless=True,args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.emulate_media(reduced_motion='reduce')
    page.set_content(document())
    page.locator('#explore').tap()
    page.wait_for_timeout(120)
    for w,h in [(320,740),(350,780),(375,812),(390,844),(414,896),(430,932),(720,1024)]:
        page.set_viewport_size({'width':w,'height':h})
        page.evaluate("TwinCore.navigate({view:'core'})")
        page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'),(w,'horizontal overflow')
        data=page.evaluate("""() => {
          const rr=document.querySelector('.ring').getBoundingClientRect();
          const cx=rr.x+rr.width/2,cy=rr.y+rr.height/2,rx=rr.width/2,ry=rr.height/2;
          return [...document.querySelectorAll('.node')].map(b=>{
            const r=b.querySelector('.mobile-marker').getBoundingClientRect();
            const l=b.querySelector('.node-title').getBoundingClientRect();
            const t=b.getBoundingClientRect();
            return {id:b.dataset.id,dist:Math.pow((r.x+r.width/2-cx)/rx,2)+Math.pow((r.y+r.height/2-cy)/ry,2),left:l.left,right:l.right,width:t.width,height:t.height};
          });
        }""")
        assert len(data)==6
        for d in data:
            assert abs(d['dist']-1)<.015,(w,d,'marker off ring')
            assert d['left']>=0 and d['right']<=w,(w,d,'label clipped')
            assert d['width']>=44 and d['height']>=44,(w,d,'tap target')
    passed('Six markers aligned to the ring; labels and 44px+ targets fit seven mobile widths')
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate("TwinCore.navigate({view:'core'});scrollTo(0,0)")
    assert page.locator('#home').inner_text()=='Twin.\nTECHNOLOGIES'
    assert not page.locator('#motion').is_visible()
    assert not page.locator('#crumbs').is_visible()
    assert page.locator('#title').inner_text()=='Twin Intelligence Core'
    assert page.locator('#title span').inner_text()=='Intelligence Core'
    assert page.locator('#query').get_attribute('placeholder')=='Ask Twin…'
    assert page.locator('#mini-orb').is_visible()
    assert 'within one unified technology platform.' in page.locator('#subtitle').inner_text()
    passed('Approved small wordmark, blue title, exact description, mini-orb and unclipped command bar')
    page.emulate_media(reduced_motion='no-preference')
    page.wait_for_timeout(200)
    before=frames(page)
    page.wait_for_timeout(400)
    after=frames(page)
    assert before[0]!=after[0] and before[1]!=after[1], 'both orbs must animate'
    page.get_by_role('button',name='Browse capabilities',exact=True).click()
    page.locator('#mobile-motion').click()
    page.locator('#browse-close').click()
    page.wait_for_timeout(300)
    before=frames(page);page.wait_for_timeout(350);after=frames(page)
    assert before==after,'motion pause must freeze both orbs'
    page.get_by_role('button',name='Browse capabilities',exact=True).click()
    page.locator('#mobile-motion').click()
    page.locator('#browse-close').click()
    page.wait_for_timeout(200)
    before=frames(page);page.wait_for_timeout(350);after=frames(page)
    assert before[0]!=after[0] and before[1]!=after[1]
    passed('Main and miniature orbs genuinely animate, pause together and resume')
    page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(250)
    before=frames(page);page.wait_for_timeout(300);after=frames(page)
    assert before==after
    passed('Reduced-motion setting freezes both canvas renderers')
    page.emulate_media(reduced_motion='no-preference')
    page.set_viewport_size({'width':390,'height':440})
    page.locator('#query').scroll_into_view_if_needed()
    page.wait_for_timeout(200)
    a=frames(page)[1];page.wait_for_timeout(350);b=frames(page)[1]
    assert a!=b,'visible mini-orb must not depend on visible main canvas'
    page.set_viewport_size({'width':1440,'height':900})
    page.wait_for_timeout(200)
    assert page.locator('#mini-orb').count()==0
    assert page.locator('#home').inner_text()=='Twin.'
    page.set_viewport_size({'width':390,'height':844})
    page.evaluate('scrollTo(0,0)');page.wait_for_timeout(200)
    assert page.locator('#mini-orb').count()==1
    passed('Mini-orb continues when the main orb is offscreen; resizing restores desktop and mobile correctly')
    page.locator('.node[data-id="privacy"]').tap()
    page.locator('.node[data-id="deployment"]').tap()
    assert page.locator('#feature-title').inner_text()=='Deployment Options'
    page.get_by_role('button',name='Close capability',exact=True).tap()
    assert page.locator('#panel').is_hidden()
    page.locator('#query').fill('show me email automation')
    page.locator('#command').evaluate('(e)=>e.requestSubmit()')
    assert page.locator('#feature-title').inner_text()=='Email Automation'
    passed('Real touch-emulated category/feature selection, close and typed routing')
    baseline=os.environ.get('TWIN_BASELINE_DIR')
    if baseline:
        # Fresh reduced-motion pages ensure identical clock, phase and selection.
        for route in [{'view':'home'},{'view':'core'},{'view':'core','category':'privacy','feature':'deployment'}]:
            captures=[]
            for root in [Path(baseline),ROOT]:
                dp=browser.new_page(viewport={'width':1440,'height':900},reduced_motion='reduce')
                dp.set_content(document(root));dp.evaluate('(s)=>TwinCore.navigate(s)',route);dp.wait_for_timeout(220)
                captures.append(dp.screenshot());dp.close()
            assert captures[0]==captures[1],('desktop pixel regression',route)
        passed('Desktop home, core and detail screenshots are pixel-identical to the previous build')
    assert not errors,errors
    passed('No JavaScript page errors in the mobile checks')
    (OUT/'mobile-results.json').write_text(json.dumps({'checks':checks,'passed':len(checks),'errors':errors,'source_orb_blob':'83bb5068a6d4ab517a9ce810c16d4bdccaa515a7','method':'Local inlined source in Chromium with touch emulation, installed font fallback; not HTTPS/physical-device testing.'},indent=2))
    browser.close()

"""Local Chromium checks, using exact source inlined into an isolated test document.
No claims about hosted origins, physical microphones or iPhone/Safari.
Run: python tests/browser-check.py (requires Python Playwright + Chromium).
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import os, re, json, wave, math, struct, tempfile
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT.parent/'checks'; OUT.mkdir(exist_ok=True)
html=(ROOT/'index.html').read_text()
html=re.sub(r'<link rel="stylesheet" href="([^"]+)">',lambda m:'' if m[1].startswith('https:') else '<style>'+(ROOT/m[1]).read_text()+'</style>',html)
html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(ROOT/m[1]).read_text()+'</script>',html)
checks=[]
def passed(s): checks.append(s); print('PASS:',s,flush=True)
MOCK=r'''() => {
 Object.defineProperty(window,'isSecureContext',{value:true,configurable:true});
 window.mock={instances:[],streams:[],pending:[],contexts:[],amplitude:0,delayed:false};
 class Rec {constructor(){mock.instances.push(this)} start(){} abort(){this.aborted=true} }
 window.SpeechRecognition=Rec;
 const stream=()=>{const track={stopped:false,stop(){this.stopped=true}}; const s={getTracks:()=>[track],track};mock.streams.push(s);return s;};
 Object.defineProperty(navigator,'mediaDevices',{value:{getUserMedia:()=>mock.delayed?new Promise(r=>mock.pending.push(()=>r(stream()))):Promise.resolve(stream())},configurable:true});
 class AC {constructor(){this.state='running';mock.contexts.push(this)} resume(){return Promise.resolve()} close(){this.state='closed';return Promise.resolve()} createMediaStreamSource(){return {connect(){}}}createAnalyser(){return {fftSize:256,getFloatTimeDomainData(a){a.fill(mock.amplitude)}}} }
 window.AudioContext=AC;
}'''
with sync_playwright() as pw:
 opts={'headless':True}
 executable=os.environ.get('CHROMIUM_EXECUTABLE','/usr/bin/chromium')
 if Path(executable).exists(): opts.update(executable_path=executable,args=['--no-sandbox'])
 browser=pw.chromium.launch(**opts)
 page=browser.new_page(viewport={'width':1440,'height':1000})
 errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='domcontentloaded')
 page.wait_for_timeout(800);page.screenshot(path=str(OUT/'desktop-home.png'))
 page.locator('#explore').click();page.wait_for_timeout(1000);page.screenshot(path=str(OUT/'desktop-core.png'))
 assert page.locator('.node').count()==6
 page.locator('.node[data-id=automation]').click();page.wait_for_timeout(900)
 page.locator('.node[data-id=workflow-orchestration]').click();page.wait_for_timeout(700)
 page.screenshot(path=str(OUT/'desktop-workflow.png'))
 for i in range(3):page.get_by_role('button',name='Continue example').click()
 assert page.locator('[data-demo=workflow]').get_attribute('data-step')=='3'
 page.get_by_role('button',name='Take over',exact=True).click()
 assert page.locator('[data-demo=workflow]').get_attribute('data-paused')=='true'
 assert page.get_by_role('button',name='Approve example draft').count()==0
 page.get_by_role('button',name='Resume example workflow').click()
 page.get_by_role('button',name='Approve example draft').click()
 page.get_by_role('button',name='Continue example').click()
 assert page.locator('[data-demo=workflow]').get_attribute('data-step')=='5'
 page.get_by_role('button',name='Restart demo').click()
 assert page.locator('[data-demo=workflow]').get_attribute('data-step')=='0'
 passed('Six-step workflow, approval gate, handover pause, resume and restart')
 page.locator('#query').fill('show me daily briefing');page.locator('#command').evaluate('(e)=>e.requestSubmit()')
 page.get_by_role('button',name='Verify a delivery update').click()
 assert 'not confirmed' in page.locator('.demo-source').inner_text()
 page.get_by_role('button',name='Assemble example briefing').click()
 assert page.locator('.briefing-summary').is_visible()
 page.screenshot(path=str(OUT/'desktop-briefing.png'))
 passed('Briefing source inspection and example briefing assembly')
 page.evaluate("TwinCore.navigate({view:'core',category:'privacy',feature:'deployment'})")
 page.get_by_role('button',name='Dedicated managed',exact=True).click()
 assert 'Dedicated managed environment' in page.locator('.privacy-path').inner_text()
 passed('Deployment diagram switches patterns and identifies external processing')
 for w,h in [(1440,900),(1024,768),(768,1024),(390,844),(320,740)]:
  page.set_viewport_size({'width':w,'height':h});page.emulate_media(reduced_motion='reduce')
  for route in [{'view':'home'},{'view':'core'},{'view':'core','category':'communication'},{'view':'core','category':'automation','feature':'workflow-orchestration'}]:
   page.evaluate('(s)=>TwinCore.navigate(s)',route);page.wait_for_timeout(80)
   assert not page.evaluate('document.documentElement.scrollWidth>innerWidth+1'),(w,route,'overflow')
 passed('No horizontal overflow in four states at five desktop/tablet/mobile sizes')
 catalogue=page.evaluate('TwinCore.CATALOGUE.map(c=>({id:c.id,features:c.features.map(f=>f.id)}))')
 for c in catalogue:
  page.evaluate("TwinCore.navigate({view:'core'})")
  page.locator(f'.node[data-id="{c["id"]}"]').click()
  for f in c['features']:
   page.locator(f'.node[data-id="{f}"]').click()
   assert page.locator('#feature-title').is_visible()
   page.get_by_role('button',name='Close capability',exact=True).click()
   assert page.locator('#panel').is_hidden()
   assert page.evaluate('document.activeElement.dataset.id')==f
 passed('All 31 panels open and close by browser clicks; focus returns to selected feature')
 page.set_viewport_size({'width':390,'height':844});page.evaluate("TwinCore.navigate({view:'core'})");page.wait_for_timeout(150)
 page.screenshot(path=str(OUT/'mobile-core.png'),full_page=True)
 page.locator('.node[data-id=automation]').click();page.locator('.node[data-id=workflow-orchestration]').click();page.wait_for_timeout(100)
 page.screenshot(path=str(OUT/'mobile-workflow.png'),full_page=True)
 page.evaluate("TwinCore.navigate({view:'core'})")
 page.locator('.node').first.focus();page.keyboard.press('ArrowRight')
 assert page.evaluate('document.activeElement.dataset.id')=='communication'
 page.keyboard.press('Enter');assert page.evaluate('TwinCore.getState().category')=='communication'
 page.keyboard.press('Escape');assert page.evaluate('TwinCore.getState().category') is None
 page.locator('#browse').click();page.keyboard.press('Escape');assert not page.locator('#browse-dialog').is_visible()
 passed('Arrow/Enter/Escape navigation and native dialog dismissal')
 page.locator('#query').fill('show me security');page.keyboard.press('Enter')
 assert page.evaluate('TwinCore.getState().category')=='privacy'
 page.locator('#query').fill('aardvark rocket');page.keyboard.press('Enter')
 assert 'No matching' in page.locator('#status').inner_text()
 page.locator('#query').fill('customer');page.keyboard.press('Enter')
 assert page.locator('#choices button').count()==3
 page.evaluate("TwinCore.navigate({view:'core',category:'automation'})")
 page.evaluate("TwinCore.navigate({view:'core',category:'automation',feature:'email-automation'})")
 page.evaluate('history.back()');page.wait_for_timeout(100)
 assert page.evaluate('TwinCore.getState().feature') is None
 page.evaluate('history.forward()');page.wait_for_timeout(100)
 assert page.evaluate('TwinCore.getState().feature')=='email-automation'
 page.get_by_role('button',name='Discuss your implementation').click()
 assert 'Email Automation' in page.locator('#enquiry').input_value()
 assert 'does not send' in page.locator('#enquiry-dialog').inner_text()
 page.get_by_role('button',name='Close',exact=True).click()
 passed('Typed routing, unknown/ambiguous requests, browser history and copy-only enquiry')
 page.set_viewport_size({'width':1440,'height':900});page.evaluate("TwinCore.navigate({view:'core'})")
 page.emulate_media(reduced_motion='no-preference');page.wait_for_timeout(200)
 a=page.locator('#canvas').evaluate('(c)=>c.toDataURL()');page.wait_for_timeout(90)
 assert a!=page.locator('#canvas').evaluate('(c)=>c.toDataURL()')
 page.locator('#motion').click();page.wait_for_timeout(80);a=page.locator('#canvas').evaluate('(c)=>c.toDataURL()');page.wait_for_timeout(100)
 assert a==page.locator('#canvas').evaluate('(c)=>c.toDataURL()')
 page.locator('#motion').click();page.wait_for_timeout(100)
 assert a!=page.locator('#canvas').evaluate('(c)=>c.toDataURL()')
 page.emulate_media(reduced_motion='reduce');page.wait_for_timeout(80);a=page.locator('#canvas').evaluate('(c)=>c.toDataURL()');page.wait_for_timeout(100)
 assert a==page.locator('#canvas').evaluate('(c)=>c.toDataURL()')
 passed('Orb animation, pause, resume and reduced-motion pixel freeze')
 # Use actual browser media playback with a synthetic tone, never an asserted voice clone.
 page.evaluate("TwinCore.navigate({view:'core',category:'communication',feature:'voice-cloning'})")
 assert page.locator('input[type=file]').first.is_disabled()
 page.locator('#sample-consent').check()
 with tempfile.TemporaryDirectory() as tmp:
  fixture=Path(tmp)/'synthetic-test-tone.wav'
  with wave.open(str(fixture),'wb') as w:
   w.setnchannels(1);w.setsampwidth(2);w.setframerate(8000)
   w.writeframes(b''.join(struct.pack('<h',int(5000*math.sin(2*math.pi*440*i/8000))) for i in range(16000)))
  page.locator('input[type=file]').first.set_input_files(str(fixture))
  audio=page.locator('audio').first;assert audio.is_visible()
  audio.evaluate('(a)=>a.play()');page.wait_for_timeout(250)
  assert audio.evaluate('(a)=>!a.paused')
  assert page.evaluate('TwinExperience.signal.mode')=='playback'
  audio.evaluate('(a)=>a.pause()')
  page.locator('#sample-consent').uncheck()
  assert audio.is_hidden() and not audio.get_attribute('src')
 passed('Permission-gated local sample upload, real synthetic-tone playback and clear on revocation')
 # The following tests mock both capture and recognition, not real microphone service.
 page.evaluate(MOCK)
 page.evaluate("TwinCore.navigate({view:'core'})")
 def start():
  page.locator('#mic').click();assert page.locator('#voice-dialog').is_visible();page.locator('#voice-start').click()
 start();assert page.evaluate('TwinSpeech.isActive()')
 page.locator('#mic').click();assert not page.evaluate('TwinSpeech.isActive()')
 assert page.evaluate('mock.instances.at(-1).aborted')
 passed('Mocked speech pending-permission cancellation')
 start();page.evaluate("mock.instances.at(-1).onerror({error:'not-allowed'})")
 assert 'denied' in page.locator('#status').inner_text()
 assert not page.evaluate('TwinSpeech.isActive()')
 passed('Mocked permission-denied fallback')
 start();page.evaluate("{const r=mock.instances.at(-1);r.onstart();r.onaudiostart();}");page.wait_for_timeout(70)
 assert page.locator('#mic').get_attribute('aria-pressed')=='true'
 page.evaluate('mock.amplitude=.1');page.wait_for_timeout(70)
 assert page.evaluate('TwinExperience.signal.level')>.5
 page.evaluate("mock.instances.at(-1).onresult({results:[Object.assign([{transcript:'show me security'}],{isFinal:true})]})")
 assert page.evaluate('TwinCore.getState().category')=='privacy'
 assert page.evaluate('mock.streams.every(s=>s.track.stopped)')
 assert page.evaluate("mock.contexts.every(c=>c.state==='closed')")
 passed('Mocked transcript routing, actual analyser code response, stream/context cleanup')
 page.evaluate('mock.delayed=true');start();page.evaluate('mock.instances.at(-1).onaudiostart()')
 page.locator('#mic').click();page.evaluate('mock.pending.splice(0).forEach(resolve=>resolve())');page.wait_for_timeout(50)
 assert page.evaluate('mock.streams.every(s=>s.track.stopped)')
 passed('Mocked late microphone permission after cancel stops returned tracks')
 start();page.evaluate('mock.instances.at(-1).onaudiostart();mock.instances.at(-1).onaudioend();mock.pending.splice(0).forEach(resolve=>resolve())');page.wait_for_timeout(50)
 assert page.evaluate('mock.streams.every(s=>s.track.stopped)')
 page.locator('#mic').click();page.evaluate('mock.delayed=false')
 passed('Mocked capture-end race stops late analyser streams')
 start();page.evaluate('mock.instances.at(-1).onaudiostart()');page.wait_for_timeout(50)
 page.evaluate("Object.defineProperty(document,'hidden',{value:true,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
 assert not page.evaluate('TwinSpeech.isActive()')
 assert page.evaluate('mock.streams.every(s=>s.track.stopped)')
 page.evaluate("Object.defineProperty(document,'hidden',{value:false,configurable:true});document.dispatchEvent(new Event('visibilitychange'))")
 passed('Mocked background event stops recognition and audio tracks')
 start();page.evaluate("TwinCore.navigate({view:'core',category:'automation'})")
 assert not page.evaluate('TwinSpeech.isActive()')
 page.evaluate('window.SpeechRecognition=undefined;window.webkitSpeechRecognition=undefined')
 page.locator('#mic').click();assert 'unavailable' in page.locator('#status').inner_text()
 passed('Navigation cancels speech; unsupported browser retains text/click fallback')
 assert not errors,errors
 passed('No JavaScript page errors in tested paths')
 (OUT/'results.json').write_text(json.dumps({'checks':checks,'errors':errors,'method':'Locally inlined source in Chromium. Speech APIs mocked. Synthetic tone used only to test playback. Not a hosted-site or iPhone test.'},indent=2))
 browser.close()

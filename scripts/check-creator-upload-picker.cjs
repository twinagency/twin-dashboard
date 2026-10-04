const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const requireApp = createRequire(resolve('package.json'));
const { JSDOM } = requireApp('jsdom');
const { build } = requireApp('esbuild');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://dashboard.lynqai.co/creator/onboarding?step=content' });
for(const name of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','File','Blob','FormData','sessionStorage']) global[name] = dom.window[name];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
let refreshes = 0, calls = [], fail = false, active = 0, peak = 0, delay = false, lost = false, expired = false;
const savedIds = new Set();
global.fetch = async url => ({ ok: !expired, status: expired ? 401 : 200, json: async () => ({ uploads: new URL(url,window.location.href).searchParams.get('ids').split(',').map(id => ({id,state:savedIds.has(id)?'saved':'needs_file'})) }) });
global.__creatorRouter = { refresh: () => refreshes++ };
class XHR {
  upload = {};
  responseURL = 'https://dashboard.lynqai.co/creator-auth/upload';
  open(method, url) { assert.equal(method, 'POST'); assert.equal(url, '/creator-auth/upload'); }
  setRequestHeader(name,value) { if(name==='X-Creator-Upload-Id') this.id=value; }
  send(form) {
    const name = form.get('files').name; calls.push(name); active++; peak = Math.max(peak, active);
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    setTimeout(() => {
      active--; this.status = fail && name === "b.mp4" ? 400 : 200;
      this.responseText = JSON.stringify({ status: this.status === 400 ? 'upload_error' : 'content_saved' });
      if(this.status===200) savedIds.add(this.id);
      if(lost) { lost=false; this.onerror(); } else this.onload();
    }, delay ? 120 : name === "a.mp4" ? 30 : 10);
  }
}
global.XMLHttpRequest = XHR;
(async () => {
  const outfile = resolve('node_modules/.cache/creator-upload-picker.cjs');
  await build({ absWorkingDir: process.cwd(), entryPoints: ['components/CreatorUploadForm.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', plugins: [{ name: 'router', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function useRouter() { return globalThis.__creatorRouter; }' }));
  } }] });
  const React = requireApp('react'); const { act } = React;
  const { createRoot } = requireApp('react-dom/client');
  const Upload = require(outfile).default;
  const root = createRoot(document.getElementById('root'));
  await act(async () => root.render(React.createElement(Upload, { kind: 'content_sfw_video', label: 'SFW videos', accept: 'video/mp4,video/quicktime,video/webm', formatHint: 'MP4, MOV or WebM · max 512 MB, 30 minutes and 4K per file', locked: false })));
  const input = document.querySelector('input[type=file]'); const button = document.querySelector('[data-upload-content]');
  assert.equal(input.accept, 'application/octet-stream'); assert.equal(input.closest('label').hasAttribute('data-choose-content'), true); assert.equal(button.disabled, true);
  function select(files) { Object.defineProperty(input, 'files', { value: files, configurable: true }); input.dispatchEvent(new Event('change', { bubbles: true })); }

  assert.equal(input.multiple, true);
  const photos = document.querySelector('[data-choose-photos] input');
  assert.equal(photos.accept,'video/*'); assert.equal(photos.multiple,true);
  const old = new File(['video'],'already-saved.mov',{type:'video/quicktime'});
  await act(async () => select([old]));
  await act(async () => { document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); });
  await act(async () => { await new Promise(r=>setTimeout(r,80)); });
  assert.match(document.body.textContent,/1 file uploaded and verified/);
  // Reproduce the recording: a previous success, a new Photos attempt, then a
  // native cancellation with no new File objects. The old success must clear.
  const oldCalls=calls.length;
  await act(async () => { photos.dispatchEvent(new MouseEvent('click',{bubbles:true})); photos.dispatchEvent(new Event('cancel')); });
  assert.doesNotMatch(document.body.textContent,/uploaded and verified|already-saved.mov/);
  assert.match(document.querySelector('[data-picker-notice]').textContent,/No new videos were received from Photos/);
  assert.equal(button.disabled,true); assert.equal(calls.length,oldCalls);
  // Safari can return focus without a change or cancel event. Late file
  // delivery must still work after the fallback notice is shown.
  await act(async () => photos.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  Object.defineProperty(document,'visibilityState',{value:'visible',configurable:true});
  await act(async () => window.dispatchEvent(new Event('focus')));
  await act(async () => { await new Promise(r=>setTimeout(r,1600)); });
  assert.match(document.querySelector('[data-picker-notice]').textContent,/has not supplied any new videos/);
  calls=[]; peak=0; refreshes=0;
  const files = ['a.mp4','b.mp4','c.mp4','d.mp4'].map(name => new File(['video'], name, {type:'video/mp4'}));
  await act(async () => select(files.slice(0,3)));
  await act(async () => select([files[2],files[3]]));
  assert.match(document.body.textContent, /4 files selected/); assert.match(document.body.textContent, /Add more videos from Files/);
  await act(async () => { select([]); input.dispatchEvent(new Event('cancel')); });
  assert.match(document.body.textContent, /4 files selected/);
  fail = true;
  await act(async () => { document.querySelector('form').dispatchEvent(new Event('submit', { bubbles:true, cancelable:true })); });
  await act(async () => { await new Promise(r => setTimeout(r,150)); });
  assert.equal(peak,2); assert.equal(active,0); assert.deepEqual([...calls].sort(),['a.mp4','b.mp4','c.mp4','d.mp4']);
  assert.match(document.body.textContent,/3 saved. 1 file remaining/); assert.match(document.body.textContent,/Retry 1 remaining file/);
  assert.equal(refreshes,1); fail = false;
  await act(async () => { document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); });
  await act(async () => { await new Promise(r => setTimeout(r,60)); });
  assert.deepEqual(calls,['a.mp4','b.mp4','c.mp4','d.mp4','b.mp4']);
  assert.match(document.body.textContent,/4 files uploaded and verified/); assert.equal(button.disabled,true);
  const oversize = new File(['test'],'oversize.mov',{type:'video/quicktime'}); Object.defineProperty(oversize,'size',{value:513*1024*1024});
  await act(async () => select([oversize])); assert.match(document.body.textContent,/513.0 MiB/);
  await act(async () => document.querySelector('[aria-label="Remove oversize.mov"]').click());
  assert.equal(button.disabled,true);
  calls=[]; peak=0;
  await act(async () => root.render(React.createElement(React.Fragment,null,...['content_sfw_video','content_nsfw_video'].map(kind=>React.createElement(Upload,{key:kind,kind,label:kind,accept:'video/*',locked:false})))));
  await act(async () => {
    [...document.querySelectorAll('[data-choose-content] input[type=file]')].forEach((element,index) => {
      Object.defineProperty(element,'files',{value:files.slice(index*2,index*2+2),configurable:true});
      element.dispatchEvent(new Event('change',{bubbles:true}));
    });
  });
  await act(async () => { document.querySelectorAll('form').forEach(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))); });
  await act(async () => { await new Promise(r=>setTimeout(r,150)); });
  assert.equal(peak,2,'All category forms must share the two-transfer limit'); assert.equal(calls.length,4); assert.equal(active,0);
  // Locked applications must not accept selections or start a transfer, even
  // if a synthetic event reaches the disabled controls.
  const callsBeforeLocked = calls.length;
  await act(async () => root.render(React.createElement(Upload, { key: 'locked', kind: 'content_sfw_video', label: 'SFW videos', accept: 'video/*', locked: true })));
  assert.ok([...document.querySelectorAll('input[type=file]')].every(element => element.disabled));
  assert.equal(document.querySelector('[data-upload-content]').disabled, true);
  await act(async () => {
    const lockedInput = document.querySelector('input[type=file]');
    Object.defineProperty(lockedInput, 'files', {value: [files[0]], configurable: true});
    lockedInput.dispatchEvent(new Event('change', {bubbles: true}));
    document.querySelector('form').dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
  });
  assert.equal(calls.length, callsBeforeLocked);
  assert.equal(document.querySelector('[aria-label="Selected files"]'), null);
  assert.match(document.body.textContent, /Uploads are unavailable/);
  // Append to a single active transfer: the spare worker must start the new file.
  calls=[]; peak=0; delay=true;
  const recoveryProps={kind:'content_sfw_video',label:'Recovery video',accept:'video/*',locked:false,accountId:'test-recovery',loginPath:'/creator/moxy/login'};
  await act(async () => root.render(React.createElement(Upload,{...recoveryProps,key:'recovery'})));
  const recoveryInput=document.querySelector('[data-choose-content] input');
  function selectRecovery(list) { Object.defineProperty(recoveryInput,'files',{value:list,configurable:true}); recoveryInput.dispatchEvent(new Event('change',{bubbles:true})); }
  const original=new File(['video'],'active.mp4',{type:'video/mp4',lastModified:42});
  await act(async () => selectRecovery([original]));
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await act(async () => selectRecovery([new File(['video'],'appended.mp4',{type:'video/mp4'})]));
  await act(async () => { await new Promise(r=>setTimeout(r,280)); });
  assert.deepEqual([...calls].sort(),['active.mp4','appended.mp4']); assert.equal(peak,2,'Appending must use the spare worker');
  delay=false;
  // Losing the HTTP response after save must reconcile, rather than upload twice.
  calls=[]; lost=true;
  await act(async () => selectRecovery([new File(['video'],'lost-response.mp4',{type:'video/mp4'})]));
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await act(async () => { await new Promise(r=>setTimeout(r,70)); });
  assert.match(document.body.textContent,/connection was interrupted/i);
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await act(async () => { await new Promise(r=>setTimeout(r,50)); });
  assert.deepEqual(calls,['lost-response.mp4']); assert.match(document.body.textContent,/uploaded and verified/);
  // Restore an interrupted selection without preserving bytes or a false Saved state.
  const key='creator-upload-queue:test-recovery:content_sfw_video';
  const remembered=JSON.parse(sessionStorage.getItem(key));
  remembered[0].state='uploading'; savedIds.delete(remembered[0].id);
  sessionStorage.setItem(key,JSON.stringify(remembered));
  await act(async () => root.render(React.createElement(Upload,{...recoveryProps,key:'restored'})));
  await act(async () => { await new Promise(r=>setTimeout(r,20)); });
  assert.match(document.body.textContent,/Reselect this original file/); assert.equal(document.querySelector('[data-upload-content]').disabled,true);
  const restoredInput=document.querySelector('[data-choose-content] input');
  const retryFile=new File(['video'],'lost-response.mp4',{type:'video/mp4',lastModified:remembered[0].lastModified});
  await act(async () => { Object.defineProperty(restoredInput,'files',{value:[retryFile],configurable:true}); restoredInput.dispatchEvent(new Event('change',{bubbles:true})); });
  assert.equal(JSON.parse(sessionStorage.getItem(key))[0].id,remembered[0].id,'Reselection retains the original idempotency key');
  expired=true;
  await act(async () => document.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await act(async () => { await new Promise(r=>setTimeout(r,50)); });
  assert.match(document.querySelector('a').getAttribute('href'),/^\/creator\/moxy\/login\?next=/);
  expired=false;
  await act(async () => root.unmount());
  rmSync(outfile,{force:true});
  console.log('VIDEO PICKER UI PASSED: Files bypass, stale-success reset, native Photos cancellation after a saved upload, focus-only return, late file delivery, multiple selection, append/deduplication, cancel preservation, exactly two parallel transfers, out-of-order completion, continue after failure, retry only the failed file, per-file size/removal and confirmed-save refresh and locked-application transfer denial.');
})().catch(e => { console.error(e); process.exitCode = 1; });

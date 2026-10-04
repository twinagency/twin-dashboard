const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const requireApp = createRequire(resolve('package.json'));
const { JSDOM } = requireApp('jsdom');
const { build } = requireApp('esbuild');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://dashboard.flirtaiagency.com/creator/onboarding?step=content' });
for(const name of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','File','Blob','FormData']) global[name] = dom.window[name];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
let refreshes = 0, calls = [], fail = false, active = 0, peak = 0;
global.__flirtRouter = { refresh: () => refreshes++ };
class XHR {
  upload = {};
  responseURL = 'https://dashboard.flirtaiagency.com/creator-auth/upload';
  open(method, url) { assert.equal(method, 'POST'); assert.equal(url, '/creator-auth/upload'); }
  setRequestHeader() {}
  send(form) {
    const name = form.get('files').name; calls.push(name); active++; peak = Math.max(peak, active);
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    setTimeout(() => {
      active--; this.status = fail && name === "b.mp4" ? 400 : 200;
      this.responseText = JSON.stringify({ status: this.status === 400 ? 'upload_error' : 'content_saved' });
      this.onload();
    }, name === "a.mp4" ? 30 : 10);
  }
}
global.XMLHttpRequest = XHR;
(async () => {
  const outfile = resolve('node_modules/.cache/flirt-upload-picker.cjs');
  await build({ absWorkingDir: process.cwd(), entryPoints: ['components/CreatorUploadForm.tsx'], outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', plugins: [{ name: 'router', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'test' }));
    b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'export function useRouter() { return globalThis.__flirtRouter; }' }));
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
  await act(async () => root.unmount());
  rmSync(outfile,{force:true});
  console.log('VIDEO PICKER UI PASSED: Files bypass, stale-success reset, native Photos cancellation after a saved upload, focus-only return, late file delivery, multiple selection, append/deduplication, cancel preservation, exactly two parallel transfers, out-of-order completion, continue after failure, retry only the failed file, per-file size/removal and confirmed-save refresh.');
})().catch(e => { console.error(e); process.exitCode = 1; });

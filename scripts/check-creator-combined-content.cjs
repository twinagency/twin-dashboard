// Synthetic uploads only: exercise the actual provider and intake components.
const assert = require('node:assert/strict');
const { resolve } = require('node:path');
const { rmSync } = require('node:fs');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://test.example/creator/onboarding?step=content' });
for (const name of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','File','Blob','FormData','localStorage']) global[name] = dom.window[name];
Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
global.IS_REACT_ACT_ENVIRONMENT = true;
URL.createObjectURL = () => 'blob:synthetic'; URL.revokeObjectURL = () => {};
const saved = new Set(), calls = [], folderCalls = [];
let active = 0, peak = 0, failure = true, lost = false, delay = 60;
let holdRecovery = false, releaseRecovery, galleryFiles = [];
global.fetch = async (url, init = {}) => {
  if (url.startsWith('/creator-auth/uploads') && holdRecovery) await new Promise(resolve => { releaseRecovery = resolve; });
  if (url.startsWith('/creator-auth/uploads')) return { ok: true, status: 200, json: async () => ({ uploads: new URL(url, window.location.href).searchParams.get('ids').split(',').map(id => ({ id, state: saved.has(id) ? 'saved' : 'needs_file' })) }) };
  if (url === '/creator-auth/content-folders') { folderCalls.push(JSON.parse(init.body)); await new Promise(r => setTimeout(r, 60)); return { ok: true, json: async () => ({ folders: folderCalls.map(row => ({ ...row, provider: 'Google Drive', submittedAt: new Date().toISOString() })) }) }; }
  return { ok: true, json: async () => ({ files: galleryFiles, hasMore: false, total: 10, savedCount: 10 }) };
};
class XHR {
  upload = {};
  open(method, url) { assert.equal(method, 'POST'); assert.equal(url, '/creator-auth/upload'); }
  setRequestHeader(name, value) { if (name === 'X-Creator-Upload-Id') this.id = value; }
  send(form) {
    assert.equal(form.get('kind'), 'content', 'No creator classification is required');
    const name = form.get('files').name; calls.push(name); active++; peak = Math.max(peak, active);
    this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
    setTimeout(() => {
      active--; this.status = failure && name === 'bad.mp4' ? 400 : 200;
      this.responseText = JSON.stringify({ status: this.status === 200 ? 'content_saved' : 'upload_wrong_type' });
      if (this.status === 200) saved.add(this.id);
      if (lost) { lost = false; this.onerror(); } else this.onload();
    }, delay);
  }
}
global.XMLHttpRequest = XHR;
(async () => {
  const outfile = resolve('node_modules/.cache/creator-combined-content.cjs');
  await build({ stdin: { contents: `import React from 'react'; import Intake from './components/CreatorContentIntake'; import {CreatorContentUploadProvider, CreatorUploadActivity, useContentUploads} from './components/CreatorContentUploadProvider'; function Probe({show,locked}) { globalThis.__contentQueue=useContentUploads();return show ? <Intake savedPhotos={4} savedVideos={6} locked={locked} loginPath="/login"/> : <div>Questionnaire</div>; } export default function Fixture(p){return <CreatorContentUploadProvider accountId="synthetic-owner"><CreatorUploadActivity/><Probe {...p}/></CreatorContentUploadProvider>}`, resolveDir: process.cwd(), loader: 'tsx' }, outfile, bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic', plugins: [{ name: 'router', setup(b) {
    b.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: 'router', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const useRouter=()=>({refresh(){}});' }));
  } }] });
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client');
  const Fixture = require(outfile).default;
  let root = createRoot(document.getElementById('root'));
  const render = (show = true, locked = false) => act(async () => root.render(React.createElement(Fixture, { show, locked })));
  const wait = ms => act(async () => { await new Promise(r => setTimeout(r, ms)); });
  const select = files => act(async () => { const input = document.querySelector('[aria-label="Add photos and videos"]'); Object.defineProperty(input, 'files', { value: files, configurable: true }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  await render();
  assert.match(document.body.textContent, /Continue to questions/);
  assert.match(document.body.textContent, /10 of 50 uploaded/);
  const files = [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' }), new File(['video'], 'good.mp4', { type: 'video/mp4' }), new File(['video'], 'bad.mp4', { type: 'video/mp4' })];
  await select(files); await render(false); // The queue stays alive with the questionnaire open.
  assert.equal(global.__contentQueue.working, true);
  await wait(180); await render();
  assert.equal(peak, 2); assert.equal(calls.length, 3);
  assert.equal(global.__contentQueue.items.filter(row => row.state === 'saved').length, 2);
  assert.equal(global.__contentQueue.items.filter(row => row.state === 'failed').length, 1);
  failure = false;
  await act(async () => global.__contentQueue.retry(global.__contentQueue.items.find(row => row.state === 'failed').id)); await wait(100);
  assert.deepEqual(calls, ['photo.jpg','good.mp4','bad.mp4','bad.mp4']);
  await select(files); await wait(80); assert.equal(calls.length, 4, 'Saved selections are reconciled instead of uploaded again');
  lost = true;
  await select([new File(['lost'], 'lost.jpg', { type: 'image/jpeg' })]); await wait(1250);
  assert.equal(calls.filter(name => name === 'lost.jpg').length, 1, 'A lost successful response must reconcile');
  assert.equal(global.__contentQueue.items.every(row => row.state === 'saved'), true);
  await act(async () => { global.__contentQueue.folder.setDraft('https://drive.google.com/drive/folders/first'); });
  await act(async () => { void global.__contentQueue.folder.save(); });
  await act(async () => { global.__contentQueue.folder.setDraft('https://drive.google.com/drive/folders/second'); });
  await render(false); await wait(180); await render();
  assert.equal(folderCalls.length, 2, 'An edit made while saving is preserved across tabs');
  assert.equal(global.__contentQueue.folderPending, false);
  const before = calls.length;
  await render(true, true); await select(files); await wait(80);
  assert.equal(calls.length, before, 'Locked intake cannot start uploads');
  const recovered = global.__contentQueue.items.map(({file,...row}) => row);
  saved.delete(recovered[0].id);
  await act(async () => root.unmount());
  galleryFiles = [...recovered.slice(1).map(row => ({ id: row.id, name: row.name, mime: 'image/jpeg', status: 'verified', previewAvailable: false })), ...Array.from({length: 7}, (_, i) => ({id: 'existing-'+i, name: 'Existing '+i, mime: 'image/jpeg', status: 'verified', previewAvailable: false}))];
  holdRecovery = true;
  root = createRoot(document.getElementById('root')); await render(); await wait(180);
  assert.doesNotMatch(document.body.textContent, /action needed|Some files need attention/, 'Pending receipt checks are not upload failures');
  assert.match(document.body.textContent, /Checking saved files/, 'Reload reports verification instead of zero saved');
  assert.ok([...document.querySelectorAll('button')].some(button => button.textContent.includes('View all (10)')), 'Recovered uploads do not double the saved gallery count');
  assert.equal(calls.length, before, 'Checking saved uploads never reuploads files');
  holdRecovery = false; await act(async () => releaseRecovery()); await wait(40);
  assert.equal(global.__contentQueue.items[0].state, 'reselect', 'Local saved labels are checked against the server on restore');
  assert.equal(global.__contentQueue.items.slice(1).every(row => row.state === 'saved'), true);
  await act(async () => root.unmount()); rmSync(outfile, { force: true });
  console.log('Combined intake passed: exact copy, mixed automatic uploads, bounded concurrency, navigation persistence, retry isolation, lost-response reconciliation, link-save races, locked controls and server-verified recovery.');
})().catch(error => { console.error(error); process.exitCode = 1; });

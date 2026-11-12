// Real manager/picker reads under delayed, failing and reordered responses.
// Child previews and folder controls are inert; contracts and React state are real.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const React = require('react');
const ts = require('typescript');
const { JSDOM } = require('jsdom');
const contract = require('../lib/onlyfans/vault.ts');
const content = require('../lib/onlyfans/content.ts');
const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://dashboard.test/' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Event'])
  Object.defineProperty(globalThis, name, { configurable: true, value: dom.window[name] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const { createRoot } = require('react-dom/client');
const element = React.createElement;
const wrapper = ({ children, ...props }) => element('div', props, children);
const router = { refresh() {} };
const folders = [{ folderId: 'empty', name: 'Empty folder', count: 0 }, { folderId: 'other', name: 'Other folder', count: 1, coverMediaId: '22' }];
function Organization({ onFolderChange, onFolders, folderId }) {
  React.useEffect(() => { onFolders?.(folders); }, [onFolders]);
  return element('nav', null, ['', 'empty', 'other'].map(id => element('button', {
    key: id, 'data-test-folder': id, 'aria-pressed': folderId === id,
    onClick: () => onFolderChange(id),
  }, id || 'All folders')));
}
const dependencies = {
  '@/components/clone/fields': { inputCls: '' },
  '@/lib/onlyfans/vault': contract,
  '@/lib/onlyfans/content': content,
  'next/navigation': { useRouter: () => router },
  'next/link': { default: wrapper, __esModule: true },
  '@/components/ui/card': { Card: wrapper },
  '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'].map(key => [key, ({ children }) => element('div', null, children)])),
  './VaultOrganization': { default: Organization, __esModule: true },
  './VaultAssetPreview': { default: ({ mediaId }) => element('span', { 'data-preview': mediaId }, `Preview ${mediaId}`), __esModule: true },
  './VaultMediaPicker.module.css': { default: {}, __esModule: true },
};
for (const name of ['ContentEditor', 'CategoryDrafts', 'Preparation', 'VaultMetadataEditor', 'VaultUploader', 'ContentSyncSave', 'VaultMediaPicker'])
  dependencies['./' + name] = { default: () => null, __esModule: true };
function load(name) {
  const source = fs.readFileSync(path.join(process.env.VAULT_COMPONENT_ROOT || 'components/onlyfans-preview', name + '.tsx'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => dependencies[name] || require(name), module, module.exports);
  return module.exports.default;
}
const oldFetch = globalThis.fetch, oldInterval = globalThis.setInterval, oldClear = globalThis.clearInterval;
let requests = [], poll = null, root, denied = 0;
globalThis.setInterval = callback => { poll = callback; return 1; };
globalThis.clearInterval = () => { poll = null; };
Object.defineProperty(document, 'visibilityState', { value: 'visible' });
globalThis.fetch = async (url, init) => {
  assert.equal(init.credentials, 'same-origin'); assert.equal(init.cache, 'no-store');
  assert(!init.method || init.method === 'GET', 'Folder browsing never writes or sends media');
  return new Promise(resolve => requests.push({ url: new URL(url, 'https://dashboard.test'), resolve }));
};
const row = id => ({ mediaId: id, kind: 'photo', durationSeconds: null, width: 100, height: 100, ready: true, reason: null, description: `Fixture ${id}` });
const response = (ids, cursor = null) => Response.json({ schemaVersion: content.CONTENT_SCHEMA, ok: true, accountId: 'acc-a', vault: {
  items: ids.map(row), nextCursor: cursor, sync: null, connectionRevision: 1,
  summary: { total: 100, photos: 100, videos: 0, other: 0, matching: ids.length, folders: 2 },
} });
const items = () => [...document.querySelectorAll('[data-of-vault-item],[data-of-picker-item]')].map(node => node.getAttribute('data-of-vault-item') || node.getAttribute('data-of-picker-item'));
const refresh = () => document.querySelector('[data-of-vault-refresh],[aria-label="Refresh media"]');
async function click(node) { assert(node); await React.act(async () => node.click()); }
async function folder(id) { await click(document.querySelector(`[data-test-folder="${id}"]`)); }
async function settle(index, result) { await React.act(async () => requests[index].resolve(result)); }
async function check(name) {
  requests = []; denied = 0;
  root = createRoot(document.getElementById('root'));
  const props = { accountId: 'acc-a', connectionRevision: 1, selected: new Map([['99', row('99')]]), initialMode: 'vault', purpose: 'message', allowUpload: false,
    onToggle() {}, onClose() {}, onChanged() {}, onDenied() { denied++; } };
  await React.act(async () => root.render(element(React.StrictMode, null, element(load(name), props))));
  assert.equal(requests.length, 2);
  await settle(1, response(['11'])); await settle(0, response(['90']));
  assert.deepEqual(items(), ['11'], name + ': stale StrictMode mount cannot replace current results');
  await folder('empty');
  assert.equal(requests.at(-1).url.searchParams.get('folderId'), 'empty');
  assert.deepEqual(items(), [], name + ': previous photos must disappear before the new response');
  assert(!document.querySelector('[data-of-folder-cover]'), 'Unrelated folder covers must not appear inside a selected folder');
  if (name === 'VaultManager') assert.equal(document.querySelector('[data-of-vault-result-count]').textContent, 'Loading media…');
  await settle(requests.length - 1, new Response(null, { status: 500 }));
  assert.deepEqual(items(), [], name + ': failed folder load must not restore previous photos');
  assert(!refresh().disabled);
  await click(refresh());
  assert.equal(requests.at(-1).url.searchParams.get('folderId'), 'empty', name + ': retry must keep the failed requested folder');
  await settle(requests.length - 1, response([]));
  assert.deepEqual(items(), []); assert.match(document.body.textContent, /No (files|media) match/);
  await folder('other'); const older = requests.length - 1;
  await folder('empty'); const current = requests.length - 1;
  await settle(older, response(['22']));
  assert.deepEqual(items(), [], name + ': late previous folder response cannot leak media');
  assert(refresh().disabled, name + ': stale completion must not unlock the pending current read');
  await settle(current, response([])); assert(!refresh().disabled);
  await folder('other'); const late = requests.length - 1;
  await folder(''); const latest = requests.length - 1;
  await settle(latest, response(['33'], '33'));
  await settle(late, new Response(null, { status: 500 }));
  assert.deepEqual(items(), ['33'], name + ': stale error must not erase current results');
  if (name === 'VaultManager') {
    assert(document.querySelector('[data-of-folder-cover]'), 'Collections belong on All folders');
    assert(poll); await React.act(async () => poll()); const background = requests.length - 1;
    await folder('empty'); const foreground = requests.length - 1;
    await settle(background, response(['44'])); assert.deepEqual(items(), []);
    await settle(foreground, response([]));
  } else {
    assert.match(document.body.textContent, /1 of 20 selected/, 'Cross-folder selection is retained');
    await folder('empty'); await settle(requests.length - 1, new Response(null, { status: 403 }));
    assert.equal(denied, 1); assert.deepEqual(items(), []);
  }
  await React.act(async () => root.unmount()); root = null;
  console.log('PASS ' + name + ': immediate clearing, empty/error views, scoped retry, out-of-order success/error, loading lock and selection/background handling');
}
async function main() {
  try { await check('VaultManager'); await check('VaultMediaPicker'); }
  finally {
    if (root) await React.act(async () => root.unmount());
    globalThis.fetch = oldFetch; globalThis.setInterval = oldInterval; globalThis.clearInterval = oldClear; dom.window.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

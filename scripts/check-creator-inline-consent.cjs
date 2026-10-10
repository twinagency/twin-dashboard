const assert = require('node:assert/strict');
const { resolve, basename } = require('node:path');
const { rmSync } = require('node:fs');
const { build } = require('esbuild');
const { JSDOM } = require('jsdom');

(async () => {
  const outdir = resolve('node_modules/.cache/creator-inline-consent-' + basename(process.cwd()));
  await build({
    entryPoints: { Form: 'components/CreatorOnboardingActionForm.tsx' }, outdir,
    bundle: true, platform: 'node', format: 'cjs', packages: 'external', jsx: 'automatic',
    define: { 'window.location.assign': 'globalThis.__consentNavigate' },
  });
  const dom = new JSDOM('<div id="root"></div>', { url: 'https://creator.example/creator/onboarding?step=content' });
  for (const name of ['window', 'document', 'HTMLElement', 'Event', 'FormData']) global[name] = dom.window[name];
  Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true });
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const React = require('react'), { act } = React, { createRoot } = require('react-dom/client');
  const Form = require(outdir + '/Form.js').default;
  const navigations = [], requests = [];
  global.__consentNavigate = url => navigations.push(url);
  let root = createRoot(document.getElementById('root'));
  let responses = [];
  const response = (status, path = '/creator/onboarding', origin = 'https://creator.example') => ({
    ok: true, status: 200, url: origin + path + (status ? '?status=' + status : ''),
  });
  global.fetch = async (url, init) => {
    requests.push({ url, action: init.body.get('action'), name: init.body.get('legal_name'), agreed: init.body.has('agreed') });
    assert.equal(url, '/creator-auth/onboarding', 'a field named action does not replace the form endpoint');
    const next = responses.shift();
    assert.ok(next, 'unexpected additional request');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  };
  const render = async ({ name = '', agreed = false, inline = true, action = 'submit' } = {}) => {
    await act(async () => root.unmount());
    root = createRoot(document.getElementById('root'));
    requests.length = 0; navigations.length = 0;
    await act(async () => root.render(React.createElement(Form, {
      consentBeforeSubmit: inline, pendingLabel: 'Submitting', loginPath: '/creator/moxy/login',
      successStatuses: action === 'consent' ? ['consent_saved'] : ['submitted'],
    },
    React.createElement('input', { type: 'hidden', name: 'action', value: action }),
    React.createElement('input', { name: 'legal_name', defaultValue: name }),
    React.createElement('input', { type: 'checkbox', name: 'agreed', defaultChecked: agreed }),
    React.createElement('button', { type: 'submit' }, 'Submit onboarding'))));
  };
  const submit = async () => act(async () => {
    document.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  const actions = () => requests.map(request => request.action);
  const alert = () => document.querySelector('[role="alert"]')?.textContent || '';
  const assertRetained = (name, agreed) => {
    assert.equal(document.querySelector('[name="legal_name"]').value, name);
    assert.equal(document.querySelector('[name="agreed"]').checked, agreed);
    assert.equal(document.querySelector('fieldset').disabled, false);
    assert.equal(navigations.length, 0);
  };

  await render({ name: 'Creator Name', agreed: true });
  responses = [response('consent_saved'), response('', '/creator')];
  await submit();
  assert.deepEqual(actions(), ['consent', 'submit']);
  assert.ok(requests.every(request => request.name === 'Creator Name' && request.agreed), 'both requests retain entered values');
  assert.deepEqual(navigations, ['https://creator.example/creator'], 'only the final submission navigates');

  await render({ name: '   ' });
  responses = [response('', '/creator')];
  await submit();
  assert.deepEqual(actions(), ['submit'], 'blank optional consent preserves direct submission');

  for (const fields of [{ name: 'Partial Name', agreed: false }, { name: '', agreed: true }]) {
    await render(fields);
    responses = [response('consent_missing')];
    await submit();
    assert.deepEqual(actions(), ['consent'], 'partial consent must be confirmed before submission');
    assert.match(alert(), /legal name and confirm consent/);
    assertRetained(fields.name, fields.agreed);
  }

  await render({ name: 'Flirt Creator' });
  responses = [response('consent_skipped'), response('submitted')];
  await submit();
  assert.deepEqual(actions(), ['consent', 'submit'], 'the FLIRT endpoint can confirm its existing optional consent skip');
  assert.equal(navigations.length, 1);

  for (const unconfirmed of [response('consent_saved', '/creator/onboarding', 'https://other.example'), response('', '/creator'), response('error')]) {
    await render({ name: 'Creator Name', agreed: true });
    responses = [unconfirmed];
    await submit();
    assert.deepEqual(actions(), ['consent'], 'unconfirmed consent never advances to submission');
    assert.match(alert(), /could not confirm/);
    assertRetained('Creator Name', true);
  }

  await render({ name: 'Retry Creator', agreed: true });
  responses = [new Error('connection interrupted')];
  await submit();
  assert.match(alert(), /connection was interrupted/);
  assertRetained('Retry Creator', true);
  responses = [response('consent_saved'), response('file_removal_pending')];
  await submit();
  assert.deepEqual(actions(), ['consent', 'consent', 'submit']);
  assertRetained('Retry Creator', true);
  assert.equal(document.querySelector('[role="alert"] a').getAttribute('href'), '/creator/onboarding?step=content');
  responses = [response('consent_saved'), response('', '/creator')];
  await submit();
  assert.equal(navigations.length, 1, 'a failed final submission can be retried without losing consent entries');
  assert.equal(alert(), '');

  await render({ name: 'Busy Creator', agreed: true });
  let finishConsent;
  responses = [() => new Promise(resolve => { finishConsent = resolve; }), response('', '/creator')];
  await submit();
  assert.equal(document.querySelector('fieldset').disabled, true);
  const beforeUnload = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(beforeUnload);
  assert.equal(beforeUnload.defaultPrevented, true, 'in-flight consent/submission protects navigation');
  await submit();
  assert.deepEqual(actions(), ['consent'], 'duplicate submission cannot start a second consent request');
  await act(async () => finishConsent(response('consent_saved')));
  assert.deepEqual(actions(), ['consent', 'submit']);
  assert.equal(navigations.length, 1);

  await render({ name: 'Expired Creator', agreed: true });
  responses = [{ ok: false, status: 401, url: 'https://creator.example/creator/moxy/login' }];
  await submit();
  assert.deepEqual(actions(), ['consent']);
  assertRetained('Expired Creator', true);
  assert.match(document.querySelector('[role="alert"] a').getAttribute('href'), /^\/creator\/moxy\/login\?next=%2Fcreator%2Fonboarding/);

  await render({ name: 'Legacy Creator', agreed: true, inline: false, action: 'consent' });
  responses = [response('consent_saved')];
  await submit();
  assert.deepEqual(actions(), ['consent'], 'standalone consent retains its single-request behavior');
  assert.deepEqual(navigations, ['https://creator.example/creator/onboarding?status=consent_saved']);
  await act(async () => root.unmount());
  rmSync(outdir, { recursive: true, force: true });
  console.log('Inline onboarding consent passed: confirmed consent before submit, optional bypass, partial/unconfirmed failure, retry, duplicate guard, session recovery and standalone compatibility.');
})().catch(error => { console.error(error); process.exitCode = 1; });

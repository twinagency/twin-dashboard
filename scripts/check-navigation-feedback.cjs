// Isolated interaction contract: no network, credentials or production writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { JSDOM } = require('jsdom');
const { renderToStaticMarkup } = require('react-dom/server');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://dashboard.test/' });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, IS_REACT_ACT_ENVIRONMENT: true });
const { createRoot } = require('react-dom/client');
let pending = false, linkProps;
const NextLink = React.forwardRef(({ children, prefetch, onNavigate, scroll, replace, ...props }, ref) => {
  linkProps = { prefetch, onNavigate, scroll, replace, ...props };
  return React.createElement('a', { ...props, ref }, children);
});
function compile(path) {
  const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => name === 'next/link'
    ? { __esModule: true, default: NextLink, useLinkStatus: () => ({ pending }) }
    : require(name), module, module.exports);
  return module.exports.default;
}
const Link = compile('components/NavigationLink.tsx');
const Loading = compile('components/PageLoading.tsx');
const root = createRoot(document.getElementById('root'));
const ref = React.createRef();
let clicks = 0, focuses = 0;
const onNavigate = () => {};
const render = props => React.act(() => root.render(React.createElement(Link, {
  href: '/users?cursor=next', scroll: false, replace: true, ref, onNavigate,
  onClick: event => { clicks++; event.preventDefault(); }, onFocus: () => focuses++, ...props,
}, 'Next page')));
(async () => {
  await render();
  const anchor = document.querySelector('a');
  assert.equal(ref.current, anchor, 'Forward the actual anchor ref to Next');
  assert.equal(anchor.textContent, 'Next page');
  assert.equal(linkProps.prefetch, undefined, 'Viewport uses lightweight automatic prefetch');
  assert.equal(linkProps.scroll, false); assert.equal(linkProps.replace, true);
  assert.equal(linkProps.onNavigate, onNavigate, 'Next retains cancellation and navigation semantics');
  assert.equal(document.querySelector('[role=status]'), null, 'No fake loading state at rest');
  await React.act(() => anchor.dispatchEvent(new window.FocusEvent('focusin', { bubbles: true })));
  assert.equal(focuses, 1); assert.equal(linkProps.prefetch, true, 'Keyboard intent starts full page prefetch');
  await React.act(() => anchor.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true })));
  assert.equal(linkProps.prefetch, undefined, 'Stop requesting full viewport prefetch after intent ends');
  await React.act(() => anchor.dispatchEvent(new window.MouseEvent('mouseover', { bubbles: true })));
  assert.equal(linkProps.prefetch, true, 'Pointer intent prepares the next page');
  await render({ prefetch: false });
  assert.equal(linkProps.prefetch, false, 'Explicit prefetch opt-out remains authoritative');
  const cancelled = !anchor.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }));
  assert.equal(clicks, 1); assert.ok(cancelled, 'Existing click handlers can still cancel navigation');
  assert.equal(document.querySelector('[role=status]'), null, 'Clicks alone never invent a pending navigation');
  pending = true; await render();
  assert.equal(document.querySelector('[role=status]').getAttribute('aria-label'), 'Loading page');
  assert.equal(anchor.textContent, 'Next page', 'Pending state preserves button copy');
  pending = false; await render();
  assert.equal(document.querySelector('[data-navigation-pending]'), null, 'Completion or cancellation removes feedback');
  const loading = renderToStaticMarkup(React.createElement(Loading));
  assert.match(loading, /role="status"/); assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /Loading page/);
  assert.equal(fs.existsSync('app/loading.tsx'), false, 'Auth and redirect-only routes must keep unstreamed redirect responses');
  for (const folder of ['dashboard','revenue','clones','users']) assert.match(fs.readFileSync('app/' + folder + '/loading.tsx', 'utf8'), /PageLoading/);
  assert.match(fs.readFileSync('app/navigation-feedback.css', 'utf8'), /prefers-reduced-motion/);
  await React.act(() => root.unmount()); dom.window.close();
  console.log('Navigation feedback: intent prefetch, pending lifecycle, keyboard, cancelled clicks, refs, pagination options and streaming fallback passed');
})().catch(error => { console.error(error); process.exitCode = 1; });

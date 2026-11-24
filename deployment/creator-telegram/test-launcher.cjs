const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const ts = require('typescript'), React = require('react');
const { renderToStaticMarkup } = require('react-dom/server'), { JSDOM } = require('jsdom');
const source = readFileSync(path.join(__dirname, '../../components/CreatorStudioShell.tsx'), 'utf8');
const code = ts.transpileModule(source, { fileName: 'CreatorStudioShell.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
const component = {};
function mockRequire(key) {
    if (key.endsWith('.module.css'))
        return { __esModule: true, default: new Proxy({}, { get: (_, k) => 'Studio_' + k }) };
    if (key.endsWith('/NavigationLink'))
        return ({ children, ...props }) => React.createElement('a', props, children);
    if (key === 'next/navigation')
        return { usePathname: () => '/creator', useRouter: () => ({ refresh() { } }) };
    if (key.endsWith('FlirtCreatorLocale'))
        return { useFlirtCreatorLocale: () => ({ t: a => a, locale: 'en' }), FlirtCreatorLanguageSwitch: () => null };
    if (key.endsWith('useCreatorCurrency'))
        return { useCreatorCurrency: () => ({ currency: 'AUD', brlRate: 1, setCurrency() { } }) };
    if (key.endsWith('/creator-studio-model'))
        return { creatorStudioStatusLabel: () => 'Ready' };
    if (key.endsWith('/TwinWordmark'))
        return () => null;
    return require(key);
}
new Function('require', 'exports', code)(mockRequire, component);
const markup = renderToStaticMarkup(React.createElement(component.default, { brand: 'flirt', creatorName: 'Fixture', contentHref: '/creator/onboarding?step=content', status: { phase: 'ready', linked: true } }));
const dom = new JSDOM(markup, { url: 'https://dashboard.flirt.example/creator', runScripts: 'outside-only', pretendToBeVisual: true });
const w = dom.window, d = w.document;
const launcher = readFileSync(path.join(__dirname, 'launcher.js'), 'utf8');
const calls = [];
let status = 204;
w.fetch = async (url, opts) => { calls.push({ url, opts }); return { status }; };
const settle = () => new Promise(resolve => setTimeout(resolve, 5));
const links = () => Array.from(d.querySelectorAll('a[href="/creator/telegram"]'));
const refresh = () => w.dispatchEvent(new w.Event('focus'));
(async () => {
    const originalAnchors = Array.from(d.querySelectorAll('a')).map(a => a.outerHTML);
    w.eval(launcher);
    await settle();
    assert.equal(links().length, 2);
    const mobile = d.querySelector('[data-creator-studio] > nav');
    assert.match(mobile.style.gridTemplateColumns, /repeat/);
    assert.match(d.querySelector('style').textContent, /repeat\(7,minmax\(0,1fr\)\)!important/);
    for (const link of links()) {
        assert.equal(link.className, link.parentNode.querySelector('a[href="/creator"]').className);
        assert.equal(link.textContent, 'Telegram');
        assert.equal(link.querySelector('svg').getAttribute('aria-hidden'), 'true');
    }
    assert.deepEqual(Array.from(d.querySelectorAll('a:not([data-flirt-telegram-launcher])')).map(a => a.outerHTML), originalAnchors);
    assert(calls.every(c => c.url === '/creator-auth/telegram/feed' && c.opts.method === 'HEAD' && c.opts.cache === 'no-store' && c.opts.credentials === 'same-origin' && c.opts.redirect === 'error'));
    w.eval(launcher);
    await settle();
    assert.equal(links().length, 2);
    status = 403;
    refresh();
    await settle();
    assert.equal(links().length, 0);
    status = 200;
    refresh();
    await settle();
    assert.equal(links().length, 0);
    status = 204;
    refresh();
    await settle();
    assert.equal(links().length, 2);
    w.history.pushState({}, '', '/creator/payouts');
    d.title = 'Payouts';
    await settle();
    assert.equal(links().length, 0);
    w.history.pushState({}, '', '/creator');
    w.dispatchEvent(new w.PopStateEvent('popstate'));
    await settle();
    assert.equal(links().length, 2);
    const actual = d.querySelector('[data-creator-studio]');
    const clone = actual.cloneNode(true);
    clone.querySelectorAll('[data-flirt-telegram-launcher]').forEach(a => a.remove());
    actual.replaceWith(clone);
    await settle();
    assert.equal(links().length, 2);
    const count = calls.length;
    clone.setAttribute('data-creator-studio', 'moxy');
    d.title = 'Moxy';
    await settle();
    assert.equal(links().length, 0);
    assert.equal(calls.length, count);
    console.log('Launcher passed jsdom tests with actual CreatorStudioShell markup. Verified both menus, native anchors unaffected, duplicate prevention, HEAD gate, denied sessions, SPA navigation, shell remount and alternate brand.');
})().finally(() => { w.dispatchEvent(new w.Event('pagehide')); w.close(); }).catch(err => { console.error(err); process.exit(1); });

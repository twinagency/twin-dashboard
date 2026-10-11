import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';
import Access, * as accessModule from '../components/DashboardAccessProvider';

const requireNative = createRequire(import.meta.url);
const css = new Proxy({}, { get: (_, key) => String(key) });
const cache = new Map<string, any>();
function compile(path: string): any {
  path = resolve(path);
  if (cache.has(path)) return cache.get(path);
  const source = readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, { fileName: path, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} as any };
  cache.set(path, module.exports);
  new Function('require', 'module', 'exports', js)((name: string) => {
    if (name.endsWith('.module.css')) return { __esModule: true, default: css };
    if (name.endsWith('DashboardAccessProvider')) return accessModule;
    if (name === '@/lib/agency-brand') return { isMoxy: (name?: string) => name?.toLowerCase() === 'moxy' };
    if (name.endsWith('ModelSelect')) return { __esModule: true, default: ({ name, value, defaultValue }: any) => <input name={name} defaultValue={value ?? defaultValue ?? ''} /> };
    if (name === '@/lib/colors') return { initials: () => 'BR' };
    if (!name.startsWith('.') && !name.startsWith('@/')) return requireNative(name);
    const base = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(path), name);
    const dependency = [base, base + '.tsx', base + '.ts'].find(existsSync);
    if (!dependency) throw new Error(`Missing studio dependency: ${name}`);
    return compile(dependency);
  }, module, module.exports);
  return module.exports;
}

async function main() {
  const { JSDOM } = requireNative('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://example.test', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'Node', 'File', 'FormData', 'MutationObserver']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const Config = compile('components/clone/ConfigSections.tsx').default;
  const Persona = compile('components/clone/PersonaFactsFields.tsx').default;
  const Appearance = compile('components/clone/CloneAppearanceEditor.tsx').default;
  const { useCloneConfig } = compile('components/clone/useCloneConfig.ts');
  const { STUDIO_PAGES } = compile('components/clone/CreatorStudio.tsx');
  const clone = { id: '0328e7b3-a1e5-465a-9a30-c9cf6519cba1', name: 'Brianna Redd', stage_name: 'Brianna', charge_messages: true, starting_credits: 10, credit_pack_size: 30, credit_pack_price_stars: 299, paywall_prime_enabled: true, paywall_prime_before: 3 };
  function Fixture({ studio, tab = 'identity', panel = 'overview', creator = clone, onChange }: any) {
    const clone = creator;
    const [cfg, set] = useCloneConfig(clone);
    const part = (name: string) => <Persona clone={clone} cfg={cfg} set={set} studio={studio} part={name} />;
    return <form id="creator-control-plane-form"><accessModule.ReadOnlyEditor><Config clone={clone} cfg={cfg} set={set} models={[]} mode="edit" studio={studio} tab={tab} studioPanel={panel} onStudioPanelChange={onChange}
      identityWhoSlot={<><Appearance cloneName={clone.name} initialColor="#0878ff" initialImagePath={null} studio={studio}/>{part('who')}</>}
      {...Object.fromEntries(['creator','physical','socials','vibe','behaviour','rhythm','life','content','imperfection','limits'].map(name => ['identity' + name[0].toUpperCase() + name.slice(1) + 'Slot', part(name)]))}
    /></accessModule.ReadOnlyEditor></form>;
  }
  const payload = () => Array.from(new FormData(document.querySelector('form')!).entries()).map(([k,v]) => [k, typeof v === 'string' ? v : '[file]']).sort((a,b) => a[0].localeCompare(b[0]));
  await act(async () => root.render(<Fixture studio={false}/>));
  const baseline = payload();
  assert.ok(baseline.length > 150, 'Real operational controls are mounted');
  await act(async () => root.render(<Fixture studio={true}/>));
  assert.deepEqual(payload(), baseline, 'Shared presentation preserves the entire submitted payload');
  const nameInput = document.querySelector<HTMLInputElement>('[name=stage_name]')!;
  nameInput.value = 'Unsaved identity edit';
  for (const [tab, data] of Object.entries(STUDIO_PAGES) as any) {
    for (const [panel] of data.panels) {
      await act(async () => root.render(<Fixture studio={true} tab={tab} panel={panel}/>));
      assert.equal(document.querySelector('[name=stage_name]'), nameInput, `${tab}/${panel} preserves the input node`);
      assert.equal(nameInput.value, 'Unsaved identity edit');
      assert.equal(payload().length, baseline.length);
    }
  }
  await act(async () => root.render(<Fixture studio={true} tab="money"/>));
  await act(async () => {
    const price = document.querySelector<HTMLInputElement>('[name=credit_pack_price_stars]')!;
    price.value = '349'; price.dispatchEvent(new Event('input', { bubbles: true }));
    const prime = document.querySelector<HTMLInputElement>('[name=paywall_prime_before]')!;
    prime.value = '5'; prime.dispatchEvent(new Event('input', { bubbles: true }));
  });
  assert.match(document.querySelector('[data-studio-money=preview]')!.textContent!, /349 Stars/);
  assert.match(document.querySelector('[aria-label="Paywall journey preview"]')!.textContent!, /5 messages before/);
  for (const brand of ['Moxy', 'FLIRT', 'LYNQ', 'Tether', 'Jess and Kate AI']) {
    const creator = { ...clone, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Fixture Creator', stage_name: 'Fixture Creator' };
    await act(async () => root.render(null));
    const render = async (studio: boolean, tab = 'identity', panel = 'overview', onChange?: (panel: string) => void, canManage = true) => {
      await act(async () => root.render(<Access agencyName={brand} canManage={canManage}><Fixture creator={creator} studio={studio} tab={tab} panel={panel} onChange={onChange}/></Access>));
    };
    await render(false);
    const partnerBaseline = payload();
    await render(true);
    assert.deepEqual(payload(), partnerBaseline, `${brand} retains its complete save payload`);
    const draft = document.querySelector<HTMLInputElement>('[name=stage_name]')!;
    draft.value = 'Partner draft';
    for (const [tab, data] of Object.entries(STUDIO_PAGES) as any) {
      for (const [panel] of data.panels) {
        await render(true, tab, panel);
        assert.equal(document.querySelector('[name=stage_name]'), draft);
        assert.equal(draft.value, 'Partner draft');
        assert.equal(payload().length, partnerBaseline.length);
      }
    }
    await render(true, 'money');
    const preview = document.querySelector('[data-studio-money=preview]')!;
    assert.match(preview.textContent!, /Fixture Creator/);
    assert.doesNotMatch(preview.textContent!, /Brianna|BR/);
    await act(async () => root.render(null));
    const visited: string[] = [];
    await render(true, 'identity', 'overview', panel => visited.push(panel), false);
    assert.ok(document.querySelector<HTMLInputElement>('[name=stage_name]')!.disabled, `${brand} read-only fields remain disabled`);
    for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-readonly-navigation]')) {
      assert.equal(button.disabled, false, `${brand} read-only navigation remains usable`);
      await act(async () => button.click());
    }
    assert.ok(visited.includes('life') && visited.includes('boundaries'), `${brand} can inspect identity details without editing`);
    await render(true, 'config', 'overview', panel => visited.push(panel), false);
    for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-readonly-navigation]')) await act(async () => button.click());
    assert.ok(visited.includes('delivery') && visited.includes('models'), `${brand} can navigate configuration summaries`);
    if (brand === 'Moxy') {
      await render(true, 'config', 'models', undefined, false);
      assert.equal(document.querySelector('[name=text_model]'), null, 'Moxy read-only model assignments stay restricted');
    }
  }
  await act(async () => root.unmount());
  console.log(`PASS: ${baseline.length} submitted fields preserved; every panel retains drafts across Twin and five partners; creator-specific previews, read-only navigation and restricted models verified.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });


import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';

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
    if (name.endsWith('DashboardAccessProvider')) return { useDashboardAccess: () => ({ readOnly: false, isAgency: false, agencyName: '' }) };
    if (name === '@/lib/agency-brand') return { isMoxy: () => false };
    if (name.endsWith('ModelSelect')) return { __esModule: true, default: ({ name, value, defaultValue }: any) => <input name={name} defaultValue={value ?? defaultValue ?? ''} /> };
    if (name === '@/lib/colors') return { initials: () => 'BR' };
    if (!name.startsWith('.') && !name.startsWith('@/')) return requireNative(name);
    const base = name.startsWith('@/') ? resolve(name.slice(2)) : resolve(dirname(path), name);
    return compile([base, base + '.tsx', base + '.ts'].find(existsSync)!);
  }, module, module.exports);
  return module.exports;
}

async function main() {
  const { JSDOM } = requireNative('jsdom');
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://example.test', pretendToBeVisual: true });
  for (const key of ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Event', 'MouseEvent', 'Node', 'File', 'FormData']) Object.defineProperty(globalThis, key, { value: dom.window[key], configurable: true });
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(document.getElementById('root')!);
  const Config = compile('components/clone/ConfigSections.tsx').default;
  const Persona = compile('components/clone/PersonaFactsFields.tsx').default;
  const Appearance = compile('components/clone/CloneAppearanceEditor.tsx').default;
  const { useCloneConfig } = compile('components/clone/useCloneConfig.ts');
  const { STUDIO_PAGES } = compile('components/clone/CreatorStudio.tsx');
  const clone = { id: '0328e7b3-a1e5-465a-9a30-c9cf6519cba1', name: 'Brianna Redd', stage_name: 'Brianna', charge_messages: true, starting_credits: 10, credit_pack_size: 30, credit_pack_price_stars: 299, paywall_prime_enabled: true, paywall_prime_before: 3 };
  function Fixture({ studio, tab = 'identity', panel = 'overview' }: any) {
    const [cfg, set] = useCloneConfig(clone);
    const part = (name: string) => <Persona clone={clone} cfg={cfg} set={set} studio={studio} part={name} />;
    return <form id="creator-control-plane-form"><Config clone={clone} cfg={cfg} set={set} models={[]} mode="edit" studio={studio} tab={tab} studioPanel={panel}
      identityWhoSlot={<><Appearance cloneName={clone.name} initialColor="#0878ff" initialImagePath={null} studio={studio}/>{part('who')}</>}
      {...Object.fromEntries(['creator','physical','socials','vibe','behaviour','rhythm','life','content','imperfection','limits'].map(name => ['identity' + name[0].toUpperCase() + name.slice(1) + 'Slot', part(name)]))}
    /></form>;
  }
  const payload = () => Array.from(new FormData(document.querySelector('form')!).entries()).map(([k,v]) => [k, typeof v === 'string' ? v : '[file]']).sort((a,b) => a[0].localeCompare(b[0]));
  await act(async () => root.render(<Fixture studio={false}/>));
  const baseline = payload();
  assert.ok(baseline.length > 150, 'Real operational controls are mounted');
  await act(async () => root.render(<Fixture studio={true}/>));
  assert.deepEqual(payload(), baseline, 'Brianna presentation preserves the entire submitted payload');
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
  await act(async () => root.unmount());
  console.log(`PASS: ${baseline.length} submitted fields preserved, every studio panel retains drafts and DOM nodes, live price/warm-up previews update.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });

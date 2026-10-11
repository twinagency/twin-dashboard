import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React, { act } from 'react';
import * as model from '../components/inbox/movie-night-model';

const requireLocal = createRequire(import.meta.url);

export async function checkMovieNightDemo() {
  let state = model.newMovieDemo();
  assert.deepEqual(model.demoTotals(state), { purchases: 4, spent: 126 });
  state = model.movieDemoReducer(state, { type: 'start' });
  state = model.movieDemoReducer(state, { type: 'tick' });
  const paused = model.movieDemoReducer(state, { type: 'pause' });
  assert.deepEqual(model.movieDemoReducer(paused, { type: 'tick' }), paused, 'Paused playback cannot emit a reply');
  const human = model.movieDemoReducer(state, { type: 'takeover' });
  assert.deepEqual(model.movieDemoReducer(human, { type: 'start', auto: true }), human, 'Takeover blocks automatic messages');
  assert.deepEqual(model.movieDemoReducer(human, { type: 'tick' }), human);
  state = model.newMovieDemo();
  for (const scene of model.DEMO_SCENES) {
    state = model.movieDemoReducer(state, { type: 'start' });
    for (const _event of scene.events) {
      if (!state.playing) state = model.movieDemoReducer(state, { type: 'start' });
      state = model.movieDemoReducer(state, { type: 'tick' });
    }
  }
  assert.equal(state.purchased, true); assert.equal(state.memorySaved, true);
  assert.deepEqual(model.demoTotals(state), { purchases: 5, spent: 144 });
  assert.equal(state.messages.filter(message => message.offer).length, 1);
  assert.equal(state.messages.filter(message => message.role === 'system').length, 1);
  for (let n = 0; n < 10; n++) state = model.movieDemoReducer(model.movieDemoReducer(state, { type: 'start' }), { type: 'tick' });
  assert.deepEqual(model.demoTotals(state), { purchases: 5, spent: 144 }, 'Completed replay cannot duplicate the sale');
  assert.deepEqual(model.movieDemoReducer(state, { type: 'reset' }), model.newMovieDemo());

  const { JSDOM } = requireLocal('jsdom');
  const dom = new JSDOM('<html><body><div id="demo-root"></div></body></html>', { url: 'https://dashboard.test/inbox?creator=briana&presentation=movie-night' });
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, localStorage: dom.window.localStorage, IS_REACT_ACT_ENVIRONMENT: true });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function() { this.setAttribute('open',''); };
  dom.window.HTMLDialogElement.prototype.close = function() { this.removeAttribute('open'); };
  let serial = 0; const timers = new Map<number, () => void>();
  dom.window.setTimeout = (callback: () => void) => { timers.set(++serial, callback); return serial; };
  dom.window.clearTimeout = (id: number) => timers.delete(id);
  let requests = 0; const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { requests++; throw Error('No external services in the movie demo'); };
  const imports: Record<string, unknown> = {
    '../IntelligenceCoreIcon': { __esModule: true, default: ({size}: {size: number}) => <canvas width={size * 2} height={size * 2} aria-hidden="true"/> },
    'next/link': { __esModule: true, default: ({children, ...props}: React.ComponentProps<'a'>) => <a {...props}>{children}</a> },
    '../fans/PlatformMark': { __esModule: true, default: () => <span>OnlyFans</span> },
    '../dashboard/portraits': { portraitUrl: (key: string) => `/api/dashboard/portrait?image=${key}` },
    '../dashboard/fan-avatars': { fanAvatarUrl: () => '/dashboard/fans/fan-01.webp' },
    './movie-night-model': model,
    './MovieNightDemo.module.css': { __esModule: true, default: new Proxy({}, {get: (_, key) => String(key)}) },
  };
  const js = ts.transpileModule(readFileSync('components/inbox/MovieNightDemo.tsx','utf8'), { fileName: 'MovieNightDemo.tsx', compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true }}).outputText;
  const mod = { exports: {} as any };
  new Function('require','module','exports',js)((name: string) => Object.hasOwn(imports,name) ? imports[name] : requireLocal(name),mod,mod.exports);
  const Demo = mod.exports.default;
  const { createRoot } = requireLocal('react-dom/client');
  const root = createRoot(document.getElementById('demo-root')!);
  const click = async (name: string) => act(async () => {
    const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent?.trim() === name || item.getAttribute('aria-label') === name);
    assert.ok(button, name); assert.equal(button.disabled, false, `${name} enabled`); button.click();
  });
  const tick = async () => act(async () => { const item = timers.entries().next().value; assert.ok(item, 'pending timer'); timers.delete(item[0]); item[1](); });
  await act(async () => root.render(<Demo/>));
  assert.match(document.body.textContent!, /Scripted conversation.*Simulated purchase/);
  assert.match(document.body.textContent!, /Bri/);
  assert.match(document.body.textContent!, /Ronan/);
  assert.doesNotMatch(document.body.textContent!, /Anastasia|Ben|popcorn|thriller|Friday/i);
  assert.equal(model.DEMO_SCENES[0].events[0].text, 'you still awake?');
  for (const memory of model.DEMO_MEMORIES) assert.ok(model.DEMO_HISTORY.some(item => item.id === memory.source), 'Every memory has a visible source record');
  assert.equal(document.querySelector('[aria-label="Presenter controls"]'),null, 'Recording view hides playback controls by default');
  assert.doesNotMatch(document.body.textContent!, /Play all|Reset demo|CONVERSATION PROGRESS|Next scene/);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'n',bubbles:true})));
  await tick();
  assert.equal(document.querySelectorAll('[data-demo-message]').length, 1);
  await click('Take over'); assert.equal(timers.size, 0, 'Takeover cancels pending reply');
  assert.equal((document.querySelector('textarea') as HTMLTextAreaElement).disabled, false);
  await act(async () => { document.querySelector('textarea')!.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'n',bubbles:true})); });
  assert.equal(timers.size, 0, 'Typing in composer cannot trigger a scene');
  await click('Return to autonomous');
  await click('Toggle presenter controls');
  assert.ok(document.querySelector('[aria-label="Presenter controls"]'), 'Prototype badge opens optional presenter controls');
  await click('Continue scene'); await tick();
  assert.equal(timers.size, 0, 'Memory reveal waits for the presenter before a reply');
  assert.equal(document.querySelectorAll('[data-demo-message]').length, 1, 'No reply appears while the presenter explains memory');
  await click('Reset demo'); assert.equal(timers.size, 0, 'Reset cancels pending timers');
  assert.equal(document.querySelectorAll('[data-demo-message]').length, 0);
  await click('Play all');
  for(let n = 0; timers.size && n < 100; n++) await tick();
  assert.equal(timers.size, 0, 'Autoplay completes without looping');
  assert.equal(document.querySelector('[data-demo-spend]')?.textContent, 'US$144.00');
  assert.equal(document.querySelector('[data-demo-purchases]')?.textContent, '5');
  assert.equal(document.querySelector('[data-offer-status]')?.getAttribute('data-offer-status'),'purchased');
  await click('Fan record'); assert.match(document.body.textContent!, /Just purchased/);
  assert.match(document.body.textContent!, /Shower video/);
  assert.match(document.body.textContent!, /now get some sleep, you earned it/);
  assert.doesNotMatch(document.body.textContent!, /800 Stars/);
  await click('View earlier conversation'); assert.ok(document.querySelector('dialog[open]'));
  await click('Close earlier conversation'); assert.equal(document.querySelector('dialog[open]'),null);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'p',bubbles:true})));
  assert.doesNotMatch(document.body.textContent!, /Ready for another take|CONVERSATION PROGRESS|Play all|Reset demo/);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'p',bubbles:true})));
  await click('Reset demo');
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'p',bubbles:true})));
  assert.equal(document.querySelector('[aria-label="Presenter controls"]'),null);
  await act(async () => document.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'n',bubbles:true})));
  await tick(); assert.equal(document.querySelectorAll('[data-demo-message]').length, 1, 'Hidden controls still accept next-scene shortcut');
  await act(async () => root.unmount()); assert.equal(timers.size, 0, 'Leaving the demo cancels scheduled replies');
  assert.equal(requests, 0); assert.equal(dom.window.localStorage.length, 0, 'Demo does not alter saved inbox or ledger');
  globalThis.fetch = savedFetch; dom.window.close();
  console.log('Movie-night presentation: replay, pause, takeover, reset, keyboard controls, ownership and single purchase update passed; no external operations or saved-state changes');
}

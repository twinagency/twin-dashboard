import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../core.js', import.meta.url), 'utf8');
new vm.Script(script); // Check syntax of the complete application.
const start = script.indexOf('const makeFeature');
const end = script.indexOf('let state=parseHash');
const sandbox = { window: {} };
vm.runInNewContext(script.slice(start, end), sandbox);
const { CATALOGUE, parseHash, parentOf, resolveIntent } = sandbox.window.TwinCore;
assert.equal(CATALOGUE.length, 6);
assert.equal(CATALOGUE.flatMap(c => c.features).length, 31);
const ids = CATALOGUE.flatMap(c => c.features.map(f => f.id));
assert.equal(new Set(ids).size, ids.length);
for (const c of CATALOGUE) for (const f of c.features) {
  assert.equal(parseHash(`#core/${c.id}/${f.id}`).feature, f.id);
  assert.equal(resolveIntent(f.name).state.feature, f.id);
  assert.ok(f.description && f.controls && f.inputs && f.process && f.output);
}
for (const [q, category, feature] of [
  ['show me security', 'privacy'],
  ['clone my voice', 'communication', 'voice-cloning'],
  ['follow up my leads', 'sales', 'nurturing-follow-up'],
  ['do you guys do automation', 'automation'],
  ['data ownership', 'privacy', 'deployment'],
  ['show me email automation', 'automation', 'email-automation']
]) {
  const result = resolveIntent(q);
  assert.equal(result.kind, 'open');
  assert.equal(result.state.category, category);
  assert.equal(result.state.feature, feature);
}
assert.equal(resolveIntent('go back').kind, 'back');
assert.equal(resolveIntent('customer').kind, 'choices');
assert.equal(resolveIntent('aardvark rocket').kind, 'unknown');
assert.equal(parseHash('#core/not-real').view, 'core');
assert.equal(parseHash('#core/privacy/not-real').feature, undefined);
assert.equal(parentOf({ view:'core', category:'privacy', feature:'deployment' }).category, 'privacy');
assert.equal(parentOf({ view:'core' }).view, 'home');
assert.ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/.test(script));
console.log('PASS: full-script syntax; 6 categories; 31 unique feature routes and exact-name commands; synonyms; back/unknown/ambiguity; invalid routes; no API or storage calls.');

for (const file of ['experience.js', 'speech.js', 'mobile.js']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  new vm.Script(source);
  assert.ok(!/fetch\(|XMLHttpRequest|localStorage|sessionStorage|sendBeacon/.test(source));
}
const experience = readFileSync(new URL('../experience.js', import.meta.url), 'utf8');
const body = experience.slice(experience.indexOf('  function workflowStep'), experience.indexOf('  const workflowScenes'));
vm.runInNewContext(body + ';window.workflowStep=workflowStep;', sandbox);
const step = sandbox.window.workflowStep;
let model = { step:0, approved:false, paused:false };
assert.equal(step(model, 'approve').step, 0);
for (let i=0;i<3;i++) model=step(model, 'next');
assert.equal(model.step, 3);
assert.equal(step(model, 'next').step, 3);
model=step(model, 'takeover');
assert.equal(step(model, 'approve').step, 3);
assert.equal(step(model, 'next').step, 3);
model=step(step(model, 'resume'), 'approve');
assert.equal(model.step, 4);assert.equal(model.approved, true);
model=step(model, 'next');assert.equal(model.step, 5);
assert.equal(step(model, 'next').step, 5);
assert.equal(step(model, 'reset').step, 0);
assert.equal(resolveIntent('customer retention').state.feature,'retention');
assert.equal(resolveIntent('memory boundaries').state.feature,'data-boundaries');
assert.equal(resolveIntent('Voice Cloning & Communication').state.category,'communication');
assert.equal(resolveIntent('Voice Cloning & Communication').state.feature,undefined);
console.log('PASS: additional-script syntax; no API/storage calls; bounded workflow approval/takeover gates; additional intent regressions.');

const mobile = readFileSync(new URL('../mobile.js', import.meta.url), 'utf8');
assert.ok(mobile.includes("83bb5068a6d4ab517a9ce810c16d4bdccaa515a7"));
assert.ok(mobile.includes("width:118,height:86"));
assert.ok(mobile.includes("baseDraw(now)"));
assert.ok(mobile.includes("const W=118,H=86"));
assert.ok(!mobile.includes('createImageBitmap') && !mobile.includes('new Image('));
console.log('PASS: mobile-source provenance, dock aspect ratio and desktop renderer fallback.');

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
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

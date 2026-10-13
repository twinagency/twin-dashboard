// Bounded DESIGN EXPERIMENT, not product implementation or release acceptance.
// Four frozen assertions, original full history, same configured conversation model/provider.
// A fetch adapter changes the existing request's output contract and decodes its response.
// Actual queue/selection/delivery/history run over fake Telegram/storage/ownership.
// Keep actual modified requests/raw replies private; no fan outreach or Stars spending.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {config} from './src/config.ts';
import {catalogueFromRaw} from './src/media.ts';
import {girlFromRow} from './src/girls/index.ts';
import {riley as rigDefaultGirl} from './src/girls/riley.ts';
import {runAs} from './src/context.ts';
import {saveChat, loadChat} from './src/memory.ts';
import {groundReply, evidenceText} from './src/grounding.ts';
import {turnRig, installModelStub, restoreFetch} from './scripts/lib/turn-rig.ts';

assert(config.openrouterKey, 'existing authorised model credential required');
assert.equal(config.model, 'deepseek/deepseek-v4.1-flash');
assert.deepEqual(config.providerOrder, ['deepinfra/fp8', 'together']);
assert.equal(config.maxTokens, 400);
const privateDir = path.join(config.dataDir, '_operator_backups/photo-incident-20261013-morning');
const hash = v => crypto.createHash('sha256').update(v).digest('hex');
const original = fs.readFileSync(path.join(privateDir, 'riley-morning-requests.json'));
assert.equal(hash(original), '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253');
const records = JSON.parse(original);
const snapshot = JSON.parse(fs.readFileSync(path.join(privateDir, 'catalogue-at-diagnosis.json'), 'utf8'));
const profile = JSON.parse(fs.readFileSync(path.join(privateDir, 'current-settings.json'), 'utf8')).find(x => x.slug === 'riley-mae-lewis');
const chat = JSON.parse(fs.readFileSync(path.join(privateDir, 'current-riley-chat.json'), 'utf8'));
Object.defineProperties(rigDefaultGirl, Object.getOwnPropertyDescriptors(girlFromRow(profile, () => profile.v2_vars)));
const log = console.log; console.log = () => {};
const catalogue = catalogueFromRaw(snapshot.raw), byKey = new Map(catalogue.map(x => [x.key, x]));
const exactChest = ['photo:ceb606ce-4110-42b8-9c53-5507a8a787fc', 'photo:a5414325-ef14-49ee-9f30-f9487739fbde'];
// Outcomes frozen before the first call. Do not edit these to accept a model failure.
const cases = [
  {name: 'direct request after earlier wrong offer', source: 1, expectedKeys: exactChest},
  {name: 'repeated direct request after topic drift', source: 3, expectedKeys: exactChest},
  {name: 'delegated choice after mirror request', source: 5, expectedFromCurrentMenu: true},
  {name: 'ordinary greeting with retained history', source: 0, input: 'hey how are you today', noMedia: true},
];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'explicit-selection-probe-'));
const oldDirs = {data: config.dataDir, logs: config.logDir};
config.dataDir = path.join(tmp, 'data'); config.logDir = path.join(tmp, 'logs');
const networkFetch = globalThis.fetch;
installModelStub();
const fakeFetch = globalThis.fetch;
let current, requests = 0;
const exchanges = [], results = [];
const random = Math.random; let seed = 1;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
globalThis.fetch = async (url, init) => {
  if (!String(url).includes('openrouter.ai')) return fakeFetch(url, init);
  assert(requests < 8, 'four normal calls with only the existing one-retry ceiling');
  requests++;
  const body = JSON.parse(init.body);
  assert.equal(body.model, config.model); assert.equal(body.max_tokens, 400);
  assert.deepEqual(body.provider.order, config.providerOrder); assert.equal(body.provider.allow_fallbacks, false);
  const system = body.messages[0].content;
  const menu = system.slice(system.indexOf('YOUR CONTENT READY TO SEND (descriptions'));
  const choices = ['none', ...[...menu.matchAll(/^\[((?:free )?(?:photo|video|bundle)(?: \d+)?)\] \((?:locked|free)\):/gm)].map(x => x[1])];
  assert(choices.includes('photo 1'));
  body.messages[0].content = system
    .replace('put its exact tag at the end of your reply', 'choose its exact tag without brackets in the selection field')
    .replace('Use that exact tag and describe its actual kind.', 'Choose that exact selection and describe its actual kind.')
    .replace('No tag means no attachment.', 'A selection of none means no attachment.')
    .replace(/Reply only with [^\n]+next text message\./, 'Return one JSON object: selection first, then reply. The selection is none for ordinary conversation or no offer, otherwise the exact current content tag without brackets. The reply is your next text message in your usual voice, without a tag. Describing or inviting an unlock of a listed file requires selecting that file.');
  assert.notEqual(body.messages[0].content, system);
  body.provider.require_parameters = true;
  body.response_format = {type: 'json_schema', json_schema: {name: 'next_reply', strict: true, schema: {
    type: 'object', properties: {
      selection: {type: 'string', enum: choices, description: 'Select the current file to accompany this reply, or none. Decide this before writing the reply.'},
      reply: {type: 'string', description: 'The one next fan-facing message. Describe only the selected file when offering content.'},
    }, required: ['selection', 'reply'], additionalProperties: false,
  }}};
  const exchange = {case: current.name, request: body}; exchanges.push(exchange);
  const res = await networkFetch(url, {...init, body: JSON.stringify(body)});
  const value = await res.json();
  exchange.status = res.status; exchange.provider = value.provider; exchange.finishReason = value.choices?.[0]?.finish_reason;
  exchange.raw = value.choices?.[0]?.message?.content; exchange.usage = value.usage;
  if (!res.ok || value.error) return new Response(JSON.stringify(value), {status: res.status});
  const parsed = JSON.parse(exchange.raw);
  assert.deepEqual(Object.keys(parsed).sort(), ['reply', 'selection']);
  assert.equal(typeof parsed.reply, 'string'); assert(choices.includes(parsed.selection));
  assert.equal(exchange.finishReason, 'stop', 'truncated output is not acceptance');
  exchange.parsed = parsed;
  // Experimental compatibility adapter, explicitly not the product's output parser.
  value.choices[0].message.content = parsed.reply + (parsed.selection === 'none' ? '' : ` [${parsed.selection}]`);
  return new Response(JSON.stringify(value), {status: 200});
};
try {
  for (const [i, test] of cases.entries()) {
    current = test; const original = records[test.source];
    assert.equal(original.history.at(-1).content, original.fanText);
    const input = test.input ?? original.fanText;
    const rig = turnRig('simulated', `explicit-selection-${i}`);
    rig.deps.girl = girlFromRow({...profile, slug: rig.slug}, () => profile.v2_vars);
    rig.deps.catalogue = catalogue;
    const route = {bcid: 'synthetic-business'};
    runAs(rig.slug, () => saveChat(6814483810, {ageConfirmed: true, epoch: 0, sent: [...chat.sent], history: original.history.slice(0, -1), ...route}));
    seed = 100 + test.source;
    const before = requests;
    await rig.fan(6814483810, input, route);
    const row = rig.rows().at(-1), model = exchanges.filter(x => x.case === test.name), last = model.at(-1);
    const selected = row?.selectedMedia?.key ?? null, item = byKey.get(selected);
    const reply = last?.parsed?.reply ?? '';
    const unsupported = item ? groundReply(reply, evidenceText(item.desc, item.words)).dropped : [];
    const unsupportedOldPose = /face[- ]down|(?:ass|buttocks|booty)[^.!?]{0,12}(?:up|raised)|doggy|bent over/i.test(reply);
    const checks = {
      oneModelRequest: requests - before === 1,
      validStructuredReply: !!last?.parsed,
      correctSelection: test.noMedia ? selected === null && last?.parsed?.selection === 'none'
        : test.expectedKeys ? test.expectedKeys.includes(selected) : row.menu.some(x => x.key === selected && x.slot.startsWith('photo ')),
      expectedTransport: test.noMedia ? !row.delivery?.media && rig.tg.of('sendPaidMedia').length === 0
        : row.delivery?.media?.status === 'acknowledged' && row.media?.key === selected && row.media?.stars === 5 && rig.tg.of('sendPaidMedia').length === 1,
      noUnsupportedKnownPose: !unsupportedOldPose,
      noUnsupportedSelectedVocabulary: unsupported.length === 0,
      noExistingPromptLeak: !/\b(?:selection|response_format|json|YOUR CONTENT READY)\b/i.test(reply),
      originalHistoryRetained: JSON.stringify(row.history.slice(0, -1)) === JSON.stringify(original.history.slice(0, -1)),
      noLiveRouteReuse: rig.tg.calls.every(x => !x.payload.business_connection_id || x.payload.business_connection_id === route.bcid),
      historyCommitted: runAs(rig.slug, () => loadChat(6814483810)).history.at(-1)?.role === 'assistant',
    };
    exchanges.push({case: test.name, pipelineRecord: row});
    results.push({case: test.name, selected, provider: last?.provider, requests: requests - before, checks, passed: Object.values(checks).every(Boolean)});
    rig.stop();
  }
  const summary = {status: results.every(x => x.passed) ? 'DESIGN PROBE PASSED; NOT PRODUCT IMPLEMENTATION OR RELEASE ACCEPTANCE' : 'DESIGN PROBE FAILED; DO NOT DEPLOY',
    checkedAt: new Date().toISOString(), candidate: process.env.PROBE_COMMIT, model: config.model, providers: config.providerOrder,
    assertionsFrozen: true, requests, realTelegramSends: 0, realDownloads: 0, results,
    limitations: ['request/response adapter, not implemented product contract', 'Business transport and ownership simulated', 'no explicit resend/state/failure acceptance in this probe', 'ordinary route and displayed prompt not validated here']};
  fs.writeFileSync(path.join(privateDir, 'explicit-selection-probe.private.json'), JSON.stringify(exchanges), {mode: 0o600});
  fs.writeFileSync(path.join(privateDir, 'explicit-selection-probe.summary.json'), JSON.stringify(summary), {mode: 0o600});
  console.log = log; console.log(JSON.stringify(summary));
  if (results.some(x => !x.passed)) process.exitCode = 1;
} finally {
  restoreFetch(); console.log = log; Math.random = random;
  config.dataDir = oldDirs.data; config.logDir = oldDirs.logs;
  fs.rmSync(tmp, {recursive: true, force: true});
}

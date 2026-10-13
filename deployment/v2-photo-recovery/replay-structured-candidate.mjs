// Actual integrated selection contract; no request, prompt or response adaptation.
// Frozen incident input is mounted read-only. Only original OpenRouter calls pass through.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {config} from './src/config.ts';
import {catalogueFromRaw} from './src/media.ts';
import {girlFromRow} from './src/girls/index.ts';
import {riley as rigDefaultGirl} from './src/girls/riley.ts';
import {runAs} from './src/context.ts';
import {saveChat, loadChat} from './src/memory.ts';
import {priceFor} from './src/payments.ts';
import {groundReply, evidenceText} from './src/grounding.ts';
import {turnRig, installModelStub, restoreFetch} from './scripts/lib/turn-rig.ts';

const revision = '45931b6f56db9f97cc8406154e35a0d216f5de65';
const fixtureHash = '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253';
assert.equal(process.env.GIT_SHA, revision);
assert(config.openrouterKey, 'existing runtime model credential required');
assert.equal(config.model, 'deepseek/deepseek-v4.1-flash');
assert.deepEqual(config.providerOrder, ['deepinfra/fp8', 'together']);
assert.equal(config.maxTokens, 400);
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');
const fixtureDir = path.join(config.dataDir, '_operator_backups/photo-incident-20261013-morning');
const fixtureBytes = fs.readFileSync(path.join(fixtureDir, 'riley-morning-requests.json'));
assert.equal(sha256(fixtureBytes), fixtureHash);
const records = JSON.parse(fixtureBytes);
assert.equal(records.length, 7);
const snapshotBytes = fs.readFileSync(path.join(fixtureDir, 'catalogue-at-diagnosis.json'));
const snapshot = JSON.parse(snapshotBytes);
const profile = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'current-settings.json'), 'utf8')).find(x => x.slug === 'riley-mae-lewis');
const chat = JSON.parse(fs.readFileSync(path.join(fixtureDir, 'current-riley-chat.json'), 'utf8'));
assert(profile?.v2_vars && snapshot.cloneId === profile.id);
assert.equal(chat.sent.length, 6);
for (const record of records) {
  assert.equal(record.history.at(-1).role, 'user');
  assert.equal(record.history.at(-1).content, record.fanText);
}
Object.defineProperties(rigDefaultGirl, Object.getOwnPropertyDescriptors(girlFromRow(profile, () => profile.v2_vars)));
const catalogue = catalogueFromRaw(snapshot.raw), byKey = new Map(catalogue.map(x => [x.key, x]));
const exactChest = ['photo:ceb606ce-4110-42b8-9c53-5507a8a787fc', 'photo:a5414325-ef14-49ee-9f30-f9487739fbde'];
assert(exactChest.every(key => byKey.has(key)));
// Expectations are frozen before any model request. Ambiguous, mirror-reference and missing-card
// behavior is observational: contract/transport assertions apply, but this stage does not claim resend.
const originalCases = records.map((_, source) => ({
  name: 'original-turn-' + (source + 1), source,
  behaviorAcceptance: [0, 1, 3, 5].includes(source),
  expectedKeys: [0, 1, 3].includes(source) ? exactChest : undefined,
  requirePhoto: source === 5,
  observationReason: source === 2 ? 'elliptical body-part request' : source === 4 ? 'potentially ambiguous mirror reference' : source === 6 ? 'missing-card report; resend is outside this stage' : undefined,
}));
const cases = [...originalCases,
  {name: 'greeting-with-retained-history', source: 0, input: 'hey how are you today', noMedia: true, behaviorAcceptance: true},
  {name: 'empty-catalogue-unavailable', source: 0, input: 'can you send me a photo?', emptyCatalogue: true, noMedia: true, behaviorAcceptance: true},
  {name: 'explicit-no-offer', source: 0, input: 'no photos or videos please, just chat with me about your day', noMedia: true, behaviorAcceptance: true},
  {name: 'new-photo-request', source: 0, input: 'can you send me a new photo?', requirePhoto: true, behaviorAcceptance: true},
];
const plan = cases.map(test => ({...test, expectedKeys: test.expectedKeys ? [...test.expectedKeys] : undefined}));
const frozenPlan = JSON.stringify(plan);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'structured-candidate-replay-'));
const oldDirs = {data: config.dataDir, logs: config.logDir};
config.dataDir = path.join(temp, 'data'); config.logDir = path.join(temp, 'logs');
const realFetch = globalThis.fetch;
installModelStub();
const fakeFetch = globalThis.fetch;
const exchanges = [], results = [], privateOutput = [];
const writeOut = process.stdout.write.bind(process.stdout), writeErr = process.stderr.write.bind(process.stderr);
process.stdout.write = (chunk, encoding, callback) => { privateOutput.push(String(chunk)); if (typeof encoding === 'function') encoding(); else callback?.(); return true; };
process.stderr.write = (chunk, encoding, callback) => { privateOutput.push(String(chunk)); if (typeof encoding === 'function') encoding(); else callback?.(); return true; };
const random = Math.random; let seed = 1, current, requests = 0;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const normalCalls = cases.length * 2;
globalThis.fetch = async (url, init) => {
  const endpoint = new URL(String(url));
  if (endpoint.origin !== 'https://openrouter.ai' || endpoint.pathname !== '/api/v1/chat/completions') return fakeFetch(url, init);
  assert(current, 'no model call outside a test');
  assert(requests < normalCalls * 2, 'at most the existing single retry per planned turn');
  requests++;
  const body = JSON.parse(init.body);
  assert.equal(init.method, 'POST');
  assert.equal(body.model, config.model); assert.equal(body.max_tokens, config.maxTokens);
  assert.deepEqual(body.provider.order, config.providerOrder);
  assert.equal(body.provider.allow_fallbacks, false); assert.equal(body.provider.require_parameters, true);
  assert.equal(body.response_format.type, 'json_schema');
  const schema = body.response_format.json_schema;
  assert.equal(schema.name, 'twin_reply'); assert.equal(schema.strict, true);
  assert.deepEqual(schema.schema.required, ['selection', 'reply']);
  assert.equal(schema.schema.additionalProperties, false);
  assert(schema.schema.properties.selection.enum.includes('none'));
  assert.deepEqual(body.messages.slice(1), current.expectedHistory, 'original complete history retained in actual request');
  const exchange = {case: current.id, request: body}; exchanges.push(exchange);
  // Deliberately pass the exact request and untouched response through; no output adapter.
  const response = await realFetch(url, init);
  const value = await response.clone().json().catch(() => null);
  exchange.status = response.status; exchange.response = value;
  return response;
};
let fatal = null;
try {
  for (const business of [true, false]) {
    const route = business ? {bcid: 'synthetic-business-route'} : {};
    for (const [index, test] of cases.entries()) {
      assert.equal(JSON.stringify(plan), frozenPlan, 'acceptance plan must remain frozen');
      const original = records[test.source], input = test.input ?? original.fanText;
      const expectedHistory = [...original.history.slice(0, -1), {role: 'user', content: input}];
      const id = (business ? 'business/' : 'ordinary/') + test.name;
      current = {id, expectedHistory};
      const rig = turnRig('simulated', 'structured-' + (business ? 'b' : 'o') + '-' + index);
      rig.deps.girl = girlFromRow({...profile, slug: rig.slug}, () => profile.v2_vars);
      rig.deps.catalogue = test.emptyCatalogue ? [] : catalogue;
      const downloads = [];
      rig.deps.download = async item => { downloads.push(item.key); return Buffer.from('synthetic-media-bytes'); };
      const before = requests;
      try {
        runAs(rig.slug, () => saveChat(6814483810, {ageConfirmed: true, epoch: 0, sent: [...chat.sent], history: original.history.slice(0, -1), ...route}));
        seed = 100 + test.source;
        await rig.fan(6814483810, input, route);
        const row = rig.rows().at(-1);
        const calls = exchanges.filter(value => value.case === id);
        const last = calls.at(-1), raw = last?.response?.choices?.[0]?.message?.content;
        let decoded;
        try { decoded = JSON.parse(raw); } catch {}
        const menu = row?.menu ?? [], selected = row?.selectedMedia?.key ?? null;
        const selectedSlot = menu.find(item => item.slot === decoded?.selection);
        const item = byKey.get(selected);
        const mediaCalls = rig.tg.calls.filter(call => ['sendPaidMedia', 'sendPhoto', 'sendVideo'].includes(call.method));
        const deliveredText = (row?.final ?? []).join(' ');
        const finishReason = last?.response?.choices?.[0]?.finish_reason;
        const enumValues = last?.request?.response_format?.json_schema?.schema?.properties?.selection?.enum ?? [];
        const expectedEnum = ['none', ...menu.map(item => item.slot)];
        const allPayloadText = rig.tg.calls.flatMap(call => [call.payload.text, call.payload.caption]).filter(Boolean).join(' ');
        const selectedCaptionClaims = item ? groundReply(deliveredText, evidenceText(item.desc, item.words)).dropped : [];
        const rawSelectedClaims = item && decoded?.reply ? groundReply(decoded.reply, evidenceText(item.desc, item.words)).dropped : [];
        const expectedPrice = item ? (row.selectedMedia.free ? 0 : priceFor(item.stars, {cloneId: profile.id, telegramId: 6814483810, kind: item.kind})) : null;
        const checks = {
          oneModelRequest: requests - before === 1,
          validStructuredReply: !!decoded && Object.keys(decoded).sort().join(',') === 'reply,selection' && typeof decoded.reply === 'string' && typeof decoded.selection === 'string',
          completeResponse: finishReason === 'stop',
          exactCurrentEnum: JSON.stringify(enumValues) === JSON.stringify(expectedEnum),
          selectionInEnum: enumValues.includes(decoded?.selection),
          actualParserRecordedRawAndSelection: row?.raw === raw && row?.selection === decoded?.selection && !row?.selectionError,
          selectionMapsExactFile: decoded?.selection === 'none' ? selected === null : !!selectedSlot && selected === selectedSlot.key,
          expectedBehavior: test.noMedia ? selected === null && decoded?.selection === 'none' : test.expectedKeys ? test.expectedKeys.includes(selected) : test.requirePhoto ? !!item && item.kind === 'photo' : true,
          actualModelHistoryRetained: JSON.stringify(row?.history) === JSON.stringify(expectedHistory),
          noUnsupportedKnownPose: !/face[- ]down|(?:ass|buttocks|booty)[^.!?]{0,12}(?:up|raised)|doggy|bent over/i.test(deliveredText),
          noUnsupportedSelectedVocabularyDelivered: selectedCaptionClaims.length === 0,
          noUnsupportedSelectedVocabularyGenerated: rawSelectedClaims.length === 0,
          noPromptOrJSONLeak: !/YOUR CONTENT READY|response_format|"(?:selection|reply)"\s*:|\[(?:free )?(?:photo|video|bundle|tip)(?: \d+)?\]/i.test(allPayloadText),
          correctTransport: selected ? mediaCalls.length === 1 && row?.delivery?.media?.status === 'acknowledged' && row.media?.key === selected && row.media?.stars === expectedPrice && downloads.length === 1 && downloads[0] === selected : mediaCalls.length === 0 && !row?.delivery?.media && downloads.length === 0 && row?.delivery?.text?.status === 'acknowledged',
          correctRoute: row?.route === (business ? 'business' : 'ordinary') && rig.tg.calls.every(call => call.payload.business_connection_id === route.bcid),
          correctPaidAmount: !selected || row.selectedMedia.free || mediaCalls[0]?.payload.star_count === expectedPrice,
          historyCommitted: runAs(rig.slug, () => loadChat(6814483810)).history.at(-1)?.role === 'assistant',
          noRepeatedSentKey: !selected || !chat.sent.includes(selected),
        };
        const passed = Object.values(checks).every(Boolean);
        exchanges.push({case: id, pipelineRecord: row, fakeCalls: rig.tg.calls, downloads, rawSelectedClaims, selectedCaptionClaims});
        results.push({case: id, sourceTurn: test.source + 1, behaviorAcceptance: test.behaviorAcceptance, observationReason: test.observationReason, requests: requests - before, selected, selection: decoded?.selection ?? null, provider: last?.response?.provider, expectedPrice, checks, passed});
      } catch (error) {
        exchanges.push({case: id, error: String(error?.stack ?? error)});
        results.push({case: id, behaviorAcceptance: test.behaviorAcceptance, passed: false, checks: {executionCompleted: false}, error: 'Private diagnostic contains execution failure'});
      } finally { rig.stop(); current = undefined; }
    }
  }
} catch (error) { fatal = String(error?.stack ?? error); }
finally {
  restoreFetch(); Math.random = random;
  process.stdout.write = writeOut; process.stderr.write = writeErr;
  config.dataDir = oldDirs.data; config.logDir = oldDirs.logs;
}
const summary = {
  status: !fatal && results.length === normalCalls && results.every(result => result.passed) ? 'STRUCTURED CANDIDATE MODEL REPLAY PASSED; TELEGRAM TRANSPORT SIMULATED' : 'STRUCTURED CANDIDATE MODEL REPLAY FAILED; DO NOT DEPLOY',
  checkedAt: new Date().toISOString(), candidate: process.env.CANDIDATE_SHA ?? 'uncommitted', rollbackRevision: revision,
  fixtureHash, catalogueHash: sha256(snapshotBytes), planHash: sha256(frozenPlan), sourceHashes: JSON.parse(process.env.CANDIDATE_HASHES ?? '{}'),
  model: config.model, providers: config.providerOrder, normalCallsPlanned: normalCalls, requests, results,
  realTelegramSends: 0, realDownloads: 0, assertionsFrozen: true, actualProductContract: true, noRequestOrResponseAdapter: true,
  observationalCases: originalCases.filter(test => !test.behaviorAcceptance).map(test => ({sourceTurn: test.source + 1, reason: test.observationReason})),
  limitations: ['Telegram transport, file download and ownership simulated', 'source turns 3, 5 and 7 behavioral outcomes observational; no resend acceptance claim', 'not live delivery or production deployment acceptance', 'does not replace offline failure, ownership or displayed-prompt tests'],
  fatal: fatal ? 'Private diagnostic contains fatal error' : null,
};
try {
  const outputDir = process.env.PROBE_OUTPUT_DIR ?? '/out';
  fs.mkdirSync(outputDir, {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(outputDir, 'structured-candidate.private.json'), JSON.stringify({plan, exchanges, privateOutput, fatal}), {mode: 0o600});
  fs.writeFileSync(path.join(outputDir, 'structured-candidate.summary.json'), JSON.stringify(summary), {mode: 0o600});
  writeOut(JSON.stringify(summary) + '\n');
  if (fatal || results.length !== normalCalls || results.some(result => !result.passed)) process.exitCode = 1;
} finally { fs.rmSync(temp, {recursive: true, force: true}); }


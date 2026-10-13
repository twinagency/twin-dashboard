// Actual integrated selection contract; no request, prompt or response adaptation.
// Frozen incident input is mounted read-only. Only original OpenRouter calls pass through.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {config} from './src/config.ts';
import {catalogueFromRaw, requestedAttrs, isAlternative, ALTERNATIVE_PHOTO_CAPTION} from './src/media.ts';
import {girlFromRow} from './src/girls/index.ts';
import {riley as rigDefaultGirl} from './src/girls/riley.ts';
import {runAs} from './src/context.ts';
import {saveChat, loadChat} from './src/memory.ts';
import {priceFor, payloadFor} from './src/payments.ts';
import {photoRequest} from './src/turn.ts';
import {trimCaption} from './src/deliver.ts';
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
// Prospective correction from independent frozen-description inspection. The old
// c457 replay remains failed: gym equipment "rack" was not affirmative anatomy evidence.
const exactChest = ['photo:ceb606ce-4110-42b8-9c53-5507a8a787fc'];
const exactEvidence = {approvedKeys: exactChest, excludedMisfoldedKey: 'photo:a5414325-ef14-49ee-9f30-f9487739fbde',
  basis: 'frozen affirmative visual evidence; gym equipment rack must not establish an anatomy match',
  priorRunPreserved: 'c457f1767377:43-of-50; prospective plan correction does not reclassify that run'};
assert(exactChest.every(key => byKey.has(key)));
assert(exactChest.every(key => !byKey.get(key).isFree && byKey.get(key).stars > 0), 'exact reference controls require paid seed photos');
assert(exactChest.every(key => byKey.get(key).words.has('boobs')), 'verified affirmative fixture must retain the requested attribute');
assert(byKey.has(exactEvidence.excludedMisfoldedKey) && !byKey.get(exactEvidence.excludedMisfoldedKey).words.has('boobs'),
  'fixture gym equipment rack must not create a false anatomy match');
// Freeze behavioral gates before the first request. Original ambiguity is not a success claim.
const originalCases = records.map((_, source) => ({
  name: 'original-turn-' + (source + 1), source,
  behaviorAcceptance: [0, 1, 3, 5, 6].includes(source),
  expectedKeys: [0, 1, 3].includes(source) ? exactChest : undefined,
  requirePhoto: source === 5,
  noMedia: source === 6, noContext: source === 6,
  observationReason: source === 2 ? 'elliptical body-part request' : source === 4 ? 'potentially ambiguous mirror reference' : undefined,
}));
const cases = [...originalCases,
  {name: 'greeting-with-retained-history', source: 0, input: 'hey how are you today', noMedia: true, behaviorAcceptance: true},
  {name: 'empty-catalogue-unavailable', source: 0, input: 'can you send me a photo?', emptyCatalogue: true, noMedia: true, behaviorAcceptance: true},
  {name: 'explicit-no-offer', source: 0, input: 'no photos or videos please, just chat with me about your day', noMedia: true, behaviorAcceptance: true},
  {name: 'new-photo-request', source: 0, input: 'can you send me a new photo?', requirePhoto: true, behaviorAcceptance: true},
];
const referenceCases = [
  {name: 'reference-seed', input: records[0].fanText, expectedKeys: exactChest, requirePhoto: true, requirePaid: true, noVerification: true},
  {name: 'explicit-exact-resend', input: 'send that same photo again', reference: true},
  {name: 'already-owned-exact-resend', input: 'send that same photo again', reference: true, owned: true},
  {name: 'new-photo-after-reference', input: 'can you send me a new photo?', requirePhoto: true, noVerification: true, different: true},
  {name: 'timeout-seed', input: records[0].fanText, expectedKeys: exactChest, requirePhoto: true, requirePaid: true, timeout: true, noVerification: true},
  {name: 'missing-card-after-timeout', input: "the photo didn't come through", reference: true, priorStatus: 'unknown'},
  {name: 'missing-card-without-context', input: "the photo didn't come through", noMedia: true, noContext: true},
];
const sequentialRules = {
  seed: 'only original turn 1 pre-input history and frozen sent keys; keep actual candidate replies, sent keys and Chat.photo thereafter',
  exactSources: [0, 1, 3], exactKeys: exactChest,
  exactPolicy: 'require independently verified ceb while unsent; after it is sent, require truthful unavailability or explicit alternative wording with grounded output and no exact-key repeat',
  exhaustedPolicy: 'a listed alternative requires an explicit limitation/alternative acknowledgement in its actual dispatched caption; none requires that acknowledgement in actual sent text; unrecognized wording fails review rather than being silently accepted',
  chooseAnySource: 5, chooseAnyPolicy: 'require a current photo if an unsent photo remains',
  ambiguousSources: [2, 4], finalSource: 6,
  finalPolicy: 'original final missing-card wording must classify as missing and select the exact scoped previous photo; missing context or unrecognized wording fails this sequential recovery gate',
};
const plan = {version: 'prospective-reference-v4', exactEvidence, independent: cases, sequentialRules, referenceCases,
  groundingPolicy: 'raw draft claims are diagnostic; actual prepared and dispatched captions must be grounded, with dispatched caption equal to the product trimmed prepared output even when transport times out',
  noAttachmentClaimPolicy: 'only a bounded past-deictic reference may cite a scoped acknowledged photo with message id, sent key and matching last-assistant delivery note; remaining new-send claims fail; prior f1d50 48-of-50 result stays unchanged',
  routes: ['business', 'ordinary']};
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
const normalCalls = (cases.length + records.length + referenceCases.length) * 2;
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
  const choices = schema.schema.properties.selection.enum;
  assert(Array.isArray(choices) && choices.length > 0);
  assert(choices.includes('none') || (choices.length === 1 && /^photo 1$|^free photo$/.test(choices[0])), 'only a verified exact photo may have a required singleton contract');
  assert.deepEqual(body.messages.slice(1), current.expectedHistory, 'original complete history retained in actual request');
  const exchange = {case: current.id, request: body}; exchanges.push(exchange);
  // Deliberately pass the exact request and untouched response through; no output adapter.
  const response = await realFetch(url, init);
  const value = await response.clone().json().catch(() => null);
  exchange.status = response.status; exchange.response = value;
  return response;
};
const chatId = 6814483810;
const mediaMethods = new Set(['sendPaidMedia', 'sendPhoto', 'sendVideo']);
// This is a predeclared replay review gate, not a product reply rule or semantic proof.
// It recognizes limitation/alternative wording; unfamiliar wording requires review.
const alternativeAcknowledgement = text => /\b(?:instead|alternative|something (?:else|different)|(?:another|different) (?:one|photo|pic|picture)|closest|not (?:an? )?(?:exact|quite|what)|(?:don['’]?t|do not|haven['’]?t|have not|can['’]?t|cannot|no|not|nothing|out of)\b[^.!?]{0,65}\b(?:more|another|one|ones|photo|photos|pic|pics|picture|pictures|shot|shots|like that|exact|left|available)|(?:already|just)\b[^.!?]{0,35}\b(?:sent|showed|shown))\b/i.test(text);
const downloadBytes = new WeakMap(); // keep nonserializable attachment objects out of private JSON
let rigNumber = 0;
const primitiveCalls = calls => calls.map(({method, payload}) => ({
  method, chat_id: payload.chat_id, business_connection_id: payload.business_connection_id,
  star_count: payload.star_count, payload: typeof payload.payload === 'string' ? payload.payload : undefined,
  text: payload.text, caption: payload.caption, action: payload.action,
}));
function makeRig(business, original, emptyCatalogue = false) {
  const route = business ? {bcid: 'synthetic-business-route'} : {};
  const rig = turnRig('simulated', 'reference-' + (business ? 'b' : 'o') + '-' + (++rigNumber));
  rig.deps.girl = girlFromRow({...profile, slug: rig.slug}, () => profile.v2_vars);
  rig.deps.catalogue = emptyCatalogue ? [] : catalogue;
  const state = {rig, route, business, downloads: [], verifications: [], owned: new Set(), timeoutNext: false, timeouts: 0};
  rig.deps.download = async item => {
    const record = {key: item.key, storagePath: item.storagePath};
    const bytes = Buffer.from('synthetic-media:' + item.key + ':' + item.storagePath);
    state.downloads.push(record); downloadBytes.set(record, bytes);
    return bytes;
  };
  // Synthetic ownership only. No ledger, database, purchase or live transport is consulted.
  rig.deps.verifyPhoto = async (key, storagePath, id) => {
    state.verifications.push({key, storagePath, chatId: id});
    const item = rig.deps.catalogue.find(value => value.key === key && value.storagePath === storagePath);
    return {photo: item ? {ok: true, item} : {ok: false, reason: 'not in frozen catalogue'},
      ownership: {ok: true, keys: new Set(state.owned), at: Date.now()}};
  };
  rig.tg.handlers.push(call => {
    if (state.timeoutNext && mediaMethods.has(call.method)) {
      state.timeoutNext = false; state.timeouts++;
      return {err: new Error('synthetic one-shot Telegram timeout')};
    }
    return undefined;
  });
  // This is the only seeding write for this rig, including both multi-turn sequences.
  runAs(rig.slug, () => saveChat(chatId, {ageConfirmed: true, epoch: 0, sent: [...chat.sent], history: original.history.slice(0, -1), ...route}));
  return state;
}
const storedChat = state => runAs(state.rig.slug, () => loadChat(chatId));
function scopedReceipt(state, c) {
  const p = c.photo;
  return !!p && p.cloneId === profile.id && p.epoch === c.epoch && p.mode === 'simulated'
    && (p.bcid ?? '') === (state.route.bcid ?? '') && p.status !== 'cancelled';
}
const explicitSendClaim = text => /\b(?:i(?:'ve| have)?\s+(?:just\s+)?(?:sent|resent|attached|shared|uploaded)|(?:here(?:'s| is)|sent)\s+(?:the|your|that)\s+(?:photo|pic|picture|selfie|image|card))\b/i.test(text);
function noAttachmentClaim(state, c, texts) {
  const p = c.photo, priorItem = p ? byKey.get(p.key) : undefined;
  const scopedAcknowledgedReceipt = scopedReceipt(state, c) && p.status === 'acknowledged'
    && Number.isSafeInteger(p.messageId) && p.messageId > 0 && c.sent.includes(p.key)
    && priorItem?.kind === 'photo' && priorItem.storagePath === p.storagePath;
  const lastAssistant = c.history.filter(value => value.role === 'assistant').at(-1)?.content ?? '';
  const matchingHistoryNote = !!priorItem && [
    `[locked photo waiting for him to unlock: ${priorItem.label}]`,
    `[sent him free photo: ${priorItem.label}]`,
  ].some(note => lastAssistant.split('\n').includes(note));
  let used = false, deicticClaims = 0;
  const okay = texts.every(value => {
    const text = String(value ?? '').replace(/[’‘]/g, "'");
    if (!explicitSendClaim(text)) return true;
    // Remove only this proved historical clause, never a whole sentence or reply.
    const past = /^\s*that(?:'s|s| is)\s+the\s+one\s+i\s+just\s+sent(?:\s+you)?(?=\s*(?:[,!.?]|(?:babe|baby|hun|love)\b|$))/i.exec(text);
    if (!past || !scopedAcknowledgedReceipt || !matchingHistoryNote) return false;
    const rest = text.slice(past[0].length);
    const newSendPromise = /\b(?:i(?:'m| am|m|'ll| will))\s+(?:just\s+)?(?:send(?:ing)?|resend(?:ing)?|attach(?:ing)?|upload(?:ing)?)\b/i.test(rest);
    if (explicitSendClaim(rest) || newSendPromise) return false;
    used = true; deicticClaims++; return true;
  });
  return {okay, exemption: {used: okay && used, deicticClaims, scopedAcknowledgedReceipt: !!scopedAcknowledgedReceipt,
    matchingLastAssistantDeliveryNote: matchingHistoryNote, priorKey: used ? p?.key : undefined,
    priorTurnId: used ? p?.turnId : undefined, priorMessageId: used ? p?.messageId : undefined}};
}

// Offline assertions for the narrow diagnostic exemption, before any model request.
function checkHistoricalClaimGate() {
  const item = byKey.get(exactChest[0]), state = {route: {bcid: 'claim-gate-test'}};
  const note = `[locked photo waiting for him to unlock: ${item.label}]`;
  const base = {epoch: 0, sent: [item.key], history: [{role: 'assistant', content: `a prior caption\n${note}`}],
    photo: {v: 1, cloneId: profile.id, key: item.key, storagePath: item.storagePath, epoch: 0,
      turnId: 'claim-gate-proof', at: 1, bcid: state.route.bcid, mode: 'simulated', status: 'acknowledged', messageId: 5025}};
  const text = 'thats the one i just sent babe, tap the lock on that one';
  let checks = 0;
  const check = (chat, reply, expected) => { assert.equal(noAttachmentClaim(state, chat, [reply, reply]).okay, expected); checks++; };
  check(base, text, true);
  assert.equal(noAttachmentClaim(state, base, [text]).exemption.used, true); checks++;
  check({...base, history: [{role: 'assistant', content: `[sent him free photo: ${item.label}]`}]}, text, true);
  check({...base, photo: {...base.photo, status: 'unknown'}}, text, false);
  check({...base, photo: {...base.photo, status: 'prepared'}}, text, false);
  check({...base, photo: {...base.photo, bcid: 'other-route'}}, text, false);
  check({...base, photo: {...base.photo, epoch: 1}}, text, false);
  check({...base, photo: {...base.photo, mode: 'real'}}, text, false);
  check({...base, photo: {...base.photo, messageId: undefined}}, text, false);
  check({...base, photo: {...base.photo, storagePath: 'unproved-file.jpg'}}, text, false);
  check({...base, photo: undefined}, text, false);
  check({...base, sent: []}, text, false);
  check({...base, history: []}, text, false);
  check({...base, history: [{role: 'assistant', content: '[locked photo waiting for him to unlock: another file]'}]}, text, false);
  check(base, 'i just sent you a new photo', false);
  check(base, 'thats the one i just sent you a new photo', false);
  check(base, text + '. i just sent another photo', false);
  check(base, text + '. here is your photo', false);
  check(base, text + ". i'm sending another photo", false);
  check(base, 'i can chat with you', true);
  return checks;
}
const historicalClaimGateChecks = checkHistoricalClaimGate();
async function execute(state, test, group) {
  assert.equal(JSON.stringify(plan), frozenPlan, 'acceptance plan must remain frozen');
  const {rig, route, business} = state, beforeChat = storedChat(state);
  const input = test.input ?? records[test.source].fanText;
  const id = (business ? 'business/' : 'ordinary/') + group + '/' + test.name;
  const expectedHistory = [...beforeChat.history, {role: 'user', content: input}].slice(-config.historyLimit);
  const prior = beforeChat.photo, classified = photoRequest(input);
  const before = {requests, calls: rig.tg.calls.length, downloads: state.downloads.length, verifications: state.verifications.length, rows: rig.rows().length, timeouts: state.timeouts};
  current = {id, expectedHistory};
  if (test.timeout) state.timeoutNext = true;
  try {
    seed = 100 + (test.source ?? 11);
    await rig.fan(chatId, input, route);
    const rows = rig.rows(), row = rows.at(-1), afterChat = storedChat(state);
    const calls = exchanges.filter(value => value.case === id && value.request);
    const last = calls.at(-1), raw = last?.response?.choices?.[0]?.message?.content;
    let decoded;
    try { decoded = JSON.parse(raw); } catch {}
    const menu = row?.menu ?? [], selected = row?.selectedMedia?.key ?? null;
    const selectedSlot = menu.find(item => item.slot === decoded?.selection), item = byKey.get(selected);
    const turnCalls = rig.tg.calls.slice(before.calls), mediaCalls = turnCalls.filter(call => mediaMethods.has(call.method));
    const downloads = state.downloads.slice(before.downloads), verifications = state.verifications.slice(before.verifications);
    const deliveredText = (row?.final ?? []).join(' ');
    const preparedText = (row?.generated ?? []).join(' ');
    const dispatchedCaption = mediaCalls[0]?.payload.caption;
    const noAttachment = noAttachmentClaim(state, beforeChat, [decoded?.reply ?? '', deliveredText]);
    const enumValues = last?.request?.response_format?.json_schema?.schema?.properties?.selection?.enum ?? [];
    const allPayloadText = turnCalls.flatMap(call => [call.payload.text, call.payload.caption]).filter(Boolean).join(' ');
    const selectedCaptionClaims = item ? groundReply(deliveredText, evidenceText(item.desc, item.words)).dropped : [];
    const rawSelectedClaims = item && decoded?.reply ? groundReply(decoded.reply, evidenceText(item.desc, item.words)).dropped : [];
    const preparedClaims = item ? groundReply(preparedText, evidenceText(item.desc, item.words)).dropped : [];
    const dispatchedClaims = item ? groundReply(dispatchedCaption ?? '', evidenceText(item.desc, item.words)).dropped : [];
    const groundingRemoved = row?.grounding ?? [];
    const groundingTraceValid = !item || groundingRemoved.every(drop => typeof drop.sentence === 'string' && drop.sentence.trim()
      && Array.isArray(drop.claims) && drop.claims.length > 0
      && JSON.stringify(groundReply(drop.sentence, evidenceText(item.desc, item.words)).dropped.flatMap(value => value.claims)) === JSON.stringify(drop.claims)
      && !preparedText.toLowerCase().includes(drop.sentence.trim().toLowerCase()));
    const expectedPrice = item ? (row.selectedMedia.free ? 0 : priceFor(item.stars, {cloneId: profile.id, telegramId: chatId, kind: item.kind})) : null;
    const isReference = !!row?.photoReference?.available;
    const expectedStatus = test.timeout ? 'unknown' : 'acknowledged';
    const exactDownload = !selected ? downloads.length === 0 : downloads.length === 1 && downloads[0].key === selected && downloads[0].storagePath === item?.storagePath;
    const attachment = mediaCalls[0]?.method === 'sendPaidMedia' ? mediaCalls[0].payload.media?.[0]?.media
      : mediaCalls[0]?.payload.photo ?? mediaCalls[0]?.payload.video;
    const checks = {
      oneModelRequest: requests - before.requests === 1,
      onePipelineRow: rows.length - before.rows === 1,
      validStructuredReply: !!decoded && Object.keys(decoded).sort().join(',') === 'reply,selection' && typeof decoded.reply === 'string' && typeof decoded.selection === 'string',
      completeResponse: last?.response?.choices?.[0]?.finish_reason === 'stop',
      exactCurrentEnum: JSON.stringify(enumValues) === JSON.stringify([...(isReference ? [] : ['none']), ...menu.map(value => value.slot)]),
      selectionInEnum: enumValues.includes(decoded?.selection),
      actualParserRecordedRawAndSelection: row?.raw === raw && row?.selection === decoded?.selection && !row?.selectionError,
      selectionMapsExactFile: decoded?.selection === 'none' ? selected === null : !!selectedSlot && selected === selectedSlot.key,
      expectedBehavior: test.noMedia ? selected === null && decoded?.selection === 'none' : test.expectedKeys ? test.expectedKeys.includes(selected) : test.requirePhoto ? item?.kind === 'photo' : true,
      actualModelHistoryRetained: JSON.stringify(row?.history) === JSON.stringify(expectedHistory),
      noUnsupportedKnownPose: !/face[- ]down|(?:ass|buttocks|booty)[^.!?]{0,12}(?:up|raised)|doggy|bent over/i.test([deliveredText, dispatchedCaption ?? ''].join(' ')),
      noUnsupportedSelectedVocabularyDelivered: selectedCaptionClaims.length === 0,
      actualPreparedOutputGrounded: preparedClaims.length === 0,
      actualDispatchedCaptionGrounded: dispatchedClaims.length === 0,
      alternativePhotoLabelMatchesMenuFacts: !item || item.kind !== 'photo' || isReference ? row.photoAlternative !== true : (isAlternative(item, requestedAttrs(catalogue.filter(value => !value.isFree), input)) ? row.photoAlternative === true && preparedText.startsWith(ALTERNATIVE_PHOTO_CAPTION) && dispatchedCaption?.startsWith(ALTERNATIVE_PHOTO_CAPTION) : row.photoAlternative !== true),
      actualDispatchedCaptionMatchesPrepared: !selected || dispatchedCaption === (preparedText ? trimCaption(preparedText) : undefined),
      groundingRemovalTraceValid: groundingTraceValid,
      noPromptOrJSONLeak: !/YOUR CONTENT READY|response_format|"(?:selection|reply)"\s*:|\[(?:free )?(?:photo|video|bundle|tip)(?: \d+)?\]/i.test(allPayloadText),
      noExplicitFalseSendClaimWithoutSelection: !!selected || noAttachment.okay,
      exactDownloadedFile: exactDownload,
      exactDispatchedAttachment: !selected || (downloads.length === 1 && attachment?.fileData === downloadBytes.get(downloads[0])
        && attachment?.filename === item?.storagePath.split('/').at(-1)
        && (mediaCalls[0]?.method !== 'sendPaidMedia' || mediaCalls[0].payload.media?.length === 1 && mediaCalls[0].payload.media[0].type === item?.kind)),
      correctTransport: selected ? mediaCalls.length === 1 && row?.delivery?.media?.status === expectedStatus
        && (test.timeout ? !row.media && row.delivery.recovery?.status === 'acknowledged' : row.media?.key === selected && row.media?.stars === expectedPrice)
        : mediaCalls.length === 0 && !row?.delivery?.media && row?.delivery?.text?.status === 'acknowledged',
      correctRoute: row?.route === (business ? 'business' : 'ordinary') && turnCalls.every(call => call.payload.business_connection_id === route.bcid),
      exactCommercialPayload: !selected || (row.selectedMedia.free ? mediaCalls[0]?.method === (item.kind === 'photo' ? 'sendPhoto' : 'sendVideo') && mediaCalls[0]?.payload.star_count === undefined
        : mediaCalls[0]?.method === 'sendPaidMedia' && mediaCalls[0]?.payload.star_count === expectedPrice && mediaCalls[0]?.payload.payload === payloadFor(selected)),
      photoReceiptMatchesOutcome: item?.kind !== 'photo' || (afterChat.photo?.key === selected && afterChat.photo.storagePath === item.storagePath && afterChat.photo.cloneId === profile.id
        && afterChat.photo.turnId === row.turnId && afterChat.photo.status === expectedStatus && afterChat.photo.mode === 'simulated'
        && (afterChat.photo.bcid ?? '') === (route.bcid ?? '') && afterChat.photo.epoch === beforeChat.epoch
        && (test.timeout ? !afterChat.photo.messageId : afterChat.photo.messageId === row.delivery.media.messageId)),
      historyCommitted: afterChat.history.at(-1)?.role === 'assistant',
      acknowledgedSentKeyRecordedOnce: !selected || test.timeout || afterChat.sent.filter(key => key === selected).length === 1,
      repeatsOnlyVerifiedReference: !selected || !beforeChat.sent.includes(selected) || isReference,
      verificationScopedAndFresh: !isReference ? verifications.length === 0 : verifications.length >= (selected ? 2 : 1)
        && verifications.every(value => value.key === prior?.key && value.storagePath === prior?.storagePath && value.chatId === chatId),
    };
    if (test.reference) {
      Object.assign(checks, {
        referencePrerequisite: scopedReceipt(state, beforeChat) && (!test.priorStatus || prior.status === test.priorStatus),
        exactReferenceSelected: !!prior && item?.kind === 'photo' && selected === prior.key && item.storagePath === prior.storagePath,
        referenceRecognized: classified === (test.priorStatus === 'unknown' || test.originalFinal ? 'missing' : 'resend'),
        exactReferenceMenu: menu.length === 1 && menu[0].key === prior?.key && row?.photoReference?.available === true && row.photoReference.sourceTurnId === prior?.turnId,
        referenceOwnership: row?.photoReference?.owned === !!test.owned && row?.selectedMedia?.free === (!!test.owned || !!item?.isFree),
        referenceDownloadedAgain: downloads.length === 1 && verifications.length >= 2,
      });
    }
    if (test.noContext) Object.assign(checks, {noInventedReference: !prior && classified === 'missing' && row?.photoReference?.available === false && menu.length === 0 && verifications.length === 0});
    if (test.requirePaid) checks.paidReferenceSeed = !!selected && row?.selectedMedia?.free === false && expectedPrice > 0;
    if (test.noVerification) checks.normalOfferHasNoReferenceReads = classified === null && verifications.length === 0 && !row?.photoReference;
    if (test.different) checks.newPhotoIsDifferent = !!prior && selected !== prior.key;
    if (test.exhaustedExact) Object.assign(checks, {
      exhaustedExactPoolConfirmed: exactChest.every(key => beforeChat.sent.includes(key)),
      noFalseExactRepeat: !selected || !exactChest.includes(selected),
      truthfulAlternativeOrUnavailabilityAcknowledged: alternativeAcknowledgement(selected ? dispatchedCaption ?? '' : deliveredText),
    });
    if (test.timeout) Object.assign(checks, {
      oneTimeoutNoAutomaticRepeat: state.timeouts - before.timeouts === 1 && !state.timeoutNext && mediaCalls.length === 1 && !row?.delivery?.media?.retried,
      unknownDoesNotBecomeSent: !!selected && !afterChat.sent.includes(selected),
    });
    const passed = Object.values(checks).every(Boolean);
    exchanges.push({case: id, pipelineRecord: row, fakeCalls: primitiveCalls(turnCalls), downloads, verifications,
      beforeChat, afterChat, rawSelectedClaims, selectedCaptionClaims, preparedClaims, dispatchedClaims});
    const result = {case: id, sourceTurn: test.source === undefined ? undefined : test.source + 1,
      behaviorAcceptance: test.behaviorAcceptance !== false, observationReason: test.observationReason,
      requests: requests - before.requests, selected, selection: decoded?.selection ?? null, provider: last?.response?.provider,
      expectedPrice, parserClassification: classified, priorPhotoPresent: !!prior, priorPhotoStatus: prior?.status ?? null,
      priorPhotoScoped: scopedReceipt(state, beforeChat), referenceAvailable: row?.photoReference?.available ?? null,
      referenceReason: row?.photoReference?.reason ?? null, menuKeys: menu.map(value => value.key),
      rawDraftUnsupportedClaims: rawSelectedClaims.flatMap(value => value.claims),
      recordedGroundingRemovedClaims: groundingRemoved.flatMap(value => value.claims),
      rawDraftClean: rawSelectedClaims.length === 0,
      historicalSendClaimExemption: selected ? {used: false} : noAttachment.exemption,
      exhaustedExact: !!test.exhaustedExact,
      alternativeAcknowledgementRecognized: test.exhaustedExact ? alternativeAcknowledgement(selected ? dispatchedCaption ?? '' : deliveredText) : null,
      unresolvedOriginalRecovery: !!test.originalFinal && !(classified && scopedReceipt(state, beforeChat) && test.reference && checks.exactReferenceSelected),
      checks, passed};
    results.push(result);
    return result;
  } catch (error) {
    exchanges.push({case: id, error: String(error?.stack ?? error)});
    const result = {case: id, behaviorAcceptance: test.behaviorAcceptance !== false, passed: false,
      checks: {executionCompleted: false}, error: 'Private diagnostic contains execution failure'};
    results.push(result); return result;
  } finally { state.timeoutNext = false; current = undefined; }
}
let fatal = null;
try {
  for (const business of [true, false]) {
    for (const test of cases) {
      const state = makeRig(business, records[test.source], test.emptyCatalogue);
      try { await execute(state, test, 'independent'); } finally { state.rig.stop(); }
    }
    const sequence = makeRig(business, records[0]);
    try {
      for (const [source, original] of originalCases.entries()) {
        const beforeChat = storedChat(sequence), test = {...original};
        if (sequentialRules.exactSources.includes(source)) {
          const remaining = exactChest.filter(key => !beforeChat.sent.includes(key));
          test.expectedKeys = remaining.length ? remaining : undefined;
          test.behaviorAcceptance = true;
          test.exhaustedExact = remaining.length === 0;
        }
        if (source === 5 && !catalogue.some(item => item.kind === 'photo' && !beforeChat.sent.includes(item.key))) {
          test.requirePhoto = false; test.behaviorAcceptance = false; test.observationReason = 'all current photos already sent in this sequence';
        }
        if (source === 6) {
          test.originalFinal = true; test.reference = true; test.behaviorAcceptance = true;
          test.noMedia = false; test.noContext = false; test.observationReason = undefined;
        }
        await execute(sequence, test, 'sequential-original');
      }
    } finally { sequence.rig.stop(); }
    const reference = makeRig(business, records[0]);
    try {
      for (const test of referenceCases.slice(0, 4)) {
        if (test.owned) {
          const prior = storedChat(reference).photo;
          if (prior) reference.owned.add(prior.key);
        }
        await execute(reference, test, 'reference-controls');
      }
    } finally { reference.rig.stop(); }
    const recovery = makeRig(business, records[0]);
    try { for (const test of referenceCases.slice(4, 6)) await execute(recovery, test, 'reference-controls'); }
    finally { recovery.rig.stop(); }
    const noContext = makeRig(business, records[0]);
    try { await execute(noContext, referenceCases[6], 'reference-controls'); } finally { noContext.rig.stop(); }
  }
} catch (error) { fatal = String(error?.stack ?? error); }
finally {
  restoreFetch(); Math.random = random;
  process.stdout.write = writeOut; process.stderr.write = writeErr;
  config.dataDir = oldDirs.data; config.logDir = oldDirs.logs;
}
const summary = {
  status: !fatal && results.length === normalCalls && results.every(result => result.passed) ? 'DECLARED PHOTO REFERENCE GATES PASSED; ORIGINAL AMBIGUITIES REPORTED SEPARATELY; TELEGRAM SIMULATED' : 'PHOTO REFERENCE MODEL REPLAY FAILED; DO NOT DEPLOY',
  checkedAt: new Date().toISOString(), candidate: process.env.CANDIDATE_SHA ?? 'uncommitted', rollbackRevision: revision,
  fixtureHash, catalogueHash: sha256(snapshotBytes), planHash: sha256(frozenPlan), sourceHashes: JSON.parse(process.env.CANDIDATE_HASHES ?? '{}'),
  model: config.model, providers: config.providerOrder, normalCallsPlanned: normalCalls, requests, results,
  realTelegramSends: 0, realDownloads: 0, assertionsFrozen: true, actualProductContract: true, noRequestOrResponseAdapter: true,
  realDatabaseCalls: 0, syntheticOwnership: true, sequentialOriginalTurns: records.length * 2,
  historicalClaimGateChecks,
  acceptedBehaviorCases: results.filter(result => result.behaviorAcceptance && result.passed).length,
  observationalResults: results.filter(result => !result.behaviorAcceptance).map(result => ({case: result.case, reason: result.observationReason, contractPassed: result.passed})),
  originalRecoveryUnresolved: results.filter(result => result.unresolvedOriginalRecovery).map(result => result.case),
  rawDraftGroundingDiagnostics: results.filter(result => result.rawDraftUnsupportedClaims?.length).map(result => ({case: result.case,
    rawClaims: result.rawDraftUnsupportedClaims, removedClaims: result.recordedGroundingRemovedClaims,
    actualPreparedPassed: result.checks.actualPreparedOutputGrounded, actualDispatchPassed: result.checks.actualDispatchedCaptionGrounded})),
  observationalCases: originalCases.filter(test => !test.behaviorAcceptance).map(test => ({sourceTurn: test.source + 1, reason: test.observationReason})),
  limitations: ['Telegram transport, file download and ownership simulated', 'original source turns 3 and 5 remain behaviorally observational',
    'raw unsupported draft terms are diagnostic; protection is tested on actual prepared and dispatched output',
    'closed grounding vocabulary and bounded alternative-language recognition are not a complete semantic truth check; unrecognized alternative wording fails review',
    'the previous c457 43-of-50 and f1d50 48-of-50 results remain unchanged under their original plans',
    'not live delivery or production deployment acceptance', 'does not replace offline failure, ownership or displayed-prompt tests'],
  fatal: fatal ? 'Private diagnostic contains fatal error' : null,
};
try {
  const outputDir = process.env.PROBE_OUTPUT_DIR ?? '/out';
  fs.mkdirSync(outputDir, {recursive: true, mode: 0o700});
  fs.writeFileSync(path.join(outputDir, 'structured-candidate.summary.json'), JSON.stringify(summary), {mode: 0o600});
  fs.writeFileSync(path.join(outputDir, 'structured-candidate.private.json'), JSON.stringify({plan, exchanges, privateOutput, fatal}), {mode: 0o600});
  writeOut(JSON.stringify(summary) + '\n');
  if (fatal || results.length !== normalCalls || results.some(result => !result.passed)) process.exitCode = 1;
} finally { fs.rmSync(temp, {recursive: true, force: true}); }


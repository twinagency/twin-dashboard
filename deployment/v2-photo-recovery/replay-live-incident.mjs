// Diagnostic only. No product patch, real model request, file download or Telegram send.
// Original private request records remain private on the host; never copy them into Git.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {config} from './src/config.ts';
import {loadRawCatalogue, catalogueFromRaw, buildMenu, requestedAttrs} from './src/media.ts';
import {girlFromRow} from './src/girls/index.ts';
import {riley as rigDefaultGirl} from './src/girls/riley.ts';
import {runAs} from './src/context.ts';
import {saveChat, loadChat} from './src/memory.ts';
import {M, turnRig, installModelStub, restoreFetch} from './scripts/lib/turn-rig.ts';

const revision = '45931b6f56db9f97cc8406154e35a0d216f5de65';
assert.equal(process.env.GIT_SHA, revision, 'stop if runtime has changed');
const candidate = process.env.PROBE_COMMIT || null;
const sourceDir = path.join(config.dataDir, '_operator_backups/photo-incident-20261013-morning');
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const bytes = fs.readFileSync(path.join(sourceDir, 'riley-morning-requests.json'));
assert.equal(hash(bytes), '43e21019a2c33d1e840c81ec6d683cf7bb6546f68e1de4106db9218b6d3bd253');
const records = JSON.parse(bytes);
assert.equal(records.length, 7);
const chat = JSON.parse(fs.readFileSync(path.join(sourceDir, 'current-riley-chat.json'), 'utf8'));
const profile = JSON.parse(fs.readFileSync(path.join(sourceDir, 'current-settings.json'), 'utf8')).find(x => x.slug === 'riley-mae-lewis');
assert(profile?.v2_vars);
// The shared rig spreads the standalone Riley object before replacing it. In fleet production
// that optional standalone vars file is incomplete. Supply the retained fleet profile in THIS
// diagnostic process only, using the same production fleet renderer; no vars file is written.
Object.defineProperties(rigDefaultGirl, Object.getOwnPropertyDescriptors(girlFromRow(profile, () => profile.v2_vars)));
assert.equal(chat.sent.length, 6);
const snapshotPath = path.join(sourceDir, 'catalogue-at-diagnosis.json');
let snapshot;
if (fs.existsSync(snapshotPath)) snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
else {
  snapshot = {at: new Date().toISOString(), cloneId: profile.id, raw: await loadRawCatalogue(profile.id)};
  fs.writeFileSync(snapshotPath, JSON.stringify(snapshot), {mode: 0o600});
}
assert.equal(snapshot.cloneId, profile.id);
const originalLog = console.log;
console.log = () => {};
const catalogue = catalogueFromRaw(snapshot.raw);
const catalogueByKey = new Map(catalogue.map(x => [x.key, x]));
const oldMenuComparisons = records.map((r, i) => ({turn: i + 1, items: r.menu.map(m => ({key: m.key,
  exists: catalogueByKey.has(m.key), sameDescription: catalogueByKey.get(m.key)?.desc === m.desc,
  samePrice: (m.slot.startsWith('free ') && catalogueByKey.get(m.key)?.isFree ? 0 : catalogueByKey.get(m.key)?.stars) === m.stars}))}));
const allDescriptionsMatch = oldMenuComparisons.every(r => r.items.every(x => x.exists && x.sameDescription && x.samePrice));
const originalDirs = {data: config.dataDir, logs: config.logDir};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'v2-private-replay-'));
config.dataDir = path.join(temp, 'data');
config.logDir = path.join(temp, 'logs');
// All HTTP is blocked from this point except the rig's synthetic responses.
installModelStub();
const random = Math.random;
let seed = 1;
Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const saved = [], result = [];
const chatId = 6814483810;
try {
  for (const business of [false, true]) {
    const route = business ? {bcid: 'synthetic-business-route'} : {};
    for (const [i, record] of records.entries()) {
      // Freeze the complete history the model actually received, not a miniature conversation.
      assert.equal(record.history.at(-1)?.role, 'user');
      assert.equal(record.history.at(-1)?.content, record.fanText);
      const history = record.history.slice(0, -1);
      const rig = turnRig('simulated', `replay-${business ? 'business' : 'ordinary'}-${i}`);
      rig.deps.girl = girlFromRow({...profile, slug: rig.slug}, () => profile.v2_vars);
      rig.deps.catalogue = catalogue;
      runAs(rig.slug, () => saveChat(chatId, {ageConfirmed: true, epoch: chat.epoch,
        sent: [...chat.sent], history, ...route}));
      seed = 100 + i;
      M.reply = record.raw;
      const before = M.requests;
      await rig.fan(chatId, record.fanText, route);
      const row = rig.rows().at(-1);
      assert.equal(M.requests - before, 1);
      assert.deepEqual(row.history, record.history, 'actual model history must be identical');
      assert.equal(row.selectedMedia, null);
      assert.equal(row.delivery.media, undefined);
      assert.equal(row.delivery.text.status, 'acknowledged');
      assert.equal(rig.tg.of('sendPaidMedia').length + rig.tg.of('sendPhoto').length + rig.tg.of('sendVideo').length, 0);
      const persisted = runAs(rig.slug, () => loadChat(chatId));
      assert.deepEqual(persisted.sent, chat.sent);
      saved.push({sourceTurn: i + 1, route: business ? 'business' : 'ordinary', row});
      result.push({turn: i + 1, route: row.route, modelStubCalls: 1, mediaAttempts: 0,
        acceptedText: true, note: row.note, grounded: !!row.grounding,
        originalHistoryMessages: row.history.length, menuKeys: row.menu.map(x => x.key),
        originalMenuKeys: record.menu.map(x => x.key), sentKeysUnchanged: true});
      rig.stop();
    }
    // Positive control: existing exact tag still follows the complete delivery pipeline.
    const rig = turnRig('simulated', 'control-' + (business ? 'business' : 'ordinary'));
    rig.deps.girl = girlFromRow({...profile, slug: rig.slug}, () => profile.v2_vars);
    rig.deps.catalogue = catalogue;
    let downloaded;
    rig.deps.download = async item => {downloaded = item.key; return Buffer.from('synthetic file bytes');};
    runAs(rig.slug, () => saveChat(chatId, {ageConfirmed: true, epoch: 0, sent: [...chat.sent], history: [], ...route}));
    seed = 999; M.reply = 'here is the photo [photo 1]';
    const before = M.requests;
    await rig.fan(chatId, 'send me a new photo', route);
    const row = rig.rows().at(-1), paid = rig.tg.of('sendPaidMedia');
    assert.equal(M.requests - before, 1);
    assert.equal(paid.length, 1);
    assert.equal(row.selectedMedia.key, row.menu.find(x => x.slot === 'photo 1').key);
    assert.equal(row.media.key, row.selectedMedia.key);
    assert.equal(downloaded, row.media.key);
    assert.equal(row.media.stars, 5);
    assert.equal(paid[0].payload.business_connection_id, route.bcid);
    assert.equal(row.delivery.media.status, 'acknowledged');
    assert(runAs(rig.slug, () => loadChat(chatId)).sent.includes(row.media.key));
    result.push({positiveControl: true, route: row.route, exactFile: row.media.key,
      price: row.media.stars, fakeMediaAcknowledgements: 1, modelStubCalls: 1,
      savedReceipt: true, correctRoute: true});
    saved.push({positiveControl: true, row}); rig.stop();
  }
  const ranking = records.map((record, i) => {
    const recent = record.history.slice(-6).map(m => m.content).join(' ');
    const examine = context => {
      seed = 100 + i;
      const m = buildMenu(catalogue, new Set(chat.sent), context, record.fanText);
      return m.photos.map(it => ({key: it.key, confirmedChestWord: it.words.has('boobs'),
        missing: m.missing?.get(it.key) ?? []}));
    };
    const req = requestedAttrs(catalogue.filter(it => !it.isFree), record.fanText);
    return {turn: i + 1, requestedExact: [...req.exact], originalContext: examine(recent), focusOnly: examine(record.fanText)};
  });
  if (candidate) {
    const exactKeys = ['photo:ceb606ce-4110-42b8-9c53-5507a8a787fc', 'photo:a5414325-ef14-49ee-9f30-f9487739fbde'].sort();
    for (const i of [0, 1, 3]) {
      assert.deepEqual(ranking[i].originalContext.slice(0, 2).map(x => x.key).sort(), exactKeys,
        'all three retained specific requests must list the two existing confirmed matches first');
      assert(ranking[i].originalContext.slice(0, 2).every(x => x.confirmedChestWord && !x.missing.length));
    }
  }
  const summary = {status: 'KNOWN MISSING-SELECTION DEFECT REMAINS; NOT A RELEASE PASS', checkedAt: new Date().toISOString(), revision, candidate,
    originalRecordsHash: hash(bytes), catalogueHash: hash(fs.readFileSync(snapshotPath)), catalogueAt: snapshot.at,
    catalogueCounts: {photos: snapshot.raw.photos.length, videos: snapshot.raw.videos.length},
    allOriginalMenuDescriptionsAndPricesStillMatch: allDescriptionsMatch, oldMenuComparisons, result, ranking,
    realModelCalls: 0, realTelegramSends: 0, realFileDownloads: 0,
    limitation: 'Original history and frozen model outputs; rollback prompt/current frozen catalogue; synthetic Telegram, ownership and downloads.'};
  const artifact = candidate ? 'ranking-candidate-replay' : 'rollback-seven-turn-replay';
  fs.writeFileSync(path.join(sourceDir, artifact + '.private.json'), JSON.stringify(saved), {mode: 0o600});
  fs.writeFileSync(path.join(sourceDir, artifact + '.summary.json'), JSON.stringify(summary), {mode: 0o600});
  console.log = originalLog;
  console.log(JSON.stringify({...summary, oldMenuComparisons: undefined,
    result: result.map(({menuKeys, originalMenuKeys, ...rest}) => rest),
    ranking: ranking.map(({focusOnly, ...rest}) => rest)}));
} finally {
  restoreFetch(); Math.random = random; console.log = originalLog;
  config.dataDir = originalDirs.data; config.logDir = originalDirs.logs;
  fs.rmSync(temp, {recursive: true, force: true});
}

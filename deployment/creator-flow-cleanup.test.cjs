"use strict";

// Offline, read-only Storage-list doubles; never calls a live backend.
const assert = require('node:assert/strict');
const { runnerFixtureObjectAllowed, enumerateFixtureStorage, LIMIT } = require('./creator-flow-live-check.cjs');
assert.equal(typeof runnerFixtureObjectAllowed, 'function');
assert.equal(typeof enumerateFixtureStorage, 'function');

const fixture = { id: '11111111-1111-4111-8111-111111111111' };
const foreign = '22222222-2222-4222-8222-222222222222';
const uploadId = '33333333-3333-4333-8333-333333333333';
const startedAt = 1791072000000;
const SFW = 'content_sfw_video', NSFW = 'content_nsfw_video';
const prefix = `creators/${fixture.id}`;
const legacy = (name = 'moving-one.mp4', kind = SFW, size = 1024, timestamp = startedAt) => ({
  bucket: 'onboarding-content', storage_path: `${prefix}/${kind}/${timestamp}-${uploadId}-${name}`, size_bytes: size,
});
const allowed = (object, knownRows = [], attempts = []) => runnerFixtureObjectAllowed(fixture, object, startedAt, knownRows, attempts);
const reject = (object, label, knownRows = [], attempts = []) => assert.equal(allowed(object, knownRows, attempts), false, label);

for (const [name, kind, bytes] of [
  ['moving-one.mp4', SFW, 12345], ['moving-two.mp4', NSFW, 54321],
  ['near-limit-padded.mp4', SFW, LIMIT - 1024], ['exact-limit-padded.mp4', SFW, LIMIT],
  ['over-limit-padded.mp4', SFW, LIMIT + 1], ['additional-after-submit.mp4', SFW, 65432],
  ['removal-guard-fixture.mp4', SFW, 3210],
]) {
  assert.equal(allowed(legacy(name, kind, bytes)), true, `Known runner orphan ${name}`);
  reject(legacy(name, kind === SFW ? NSFW : SFW, bytes), `${name} wrong category`);
}

reject({ ...legacy(), bucket: 'creator-content' }, 'Unknown bucket');
reject({ ...legacy(), storage_path: legacy().storage_path.replace(fixture.id, foreign) }, 'Foreign creator prefix');
reject({ ...legacy(), storage_path: legacy().storage_path.replace(`${fixture.id}/`, `${fixture.id}-suffix/`) }, 'Prefix lookalike');
reject(legacy('customer-video.mp4'), 'Unrecognized filename');
reject(legacy('moving-one.mp4.exe'), 'Filename suffix');
reject(legacy('MOVING-ONE.mp4'), 'Case-changed filename');
reject(legacy('moving-one.mp4', 'content_sfw_image'), 'Unexpected category');
reject(legacy('moving-one.mp4', SFW, 0), 'Empty object');
reject(legacy('moving-one.mp4', SFW, -1), 'Negative bytes');
reject(legacy('moving-one.mp4', SFW, 2 * 1024 * 1024), 'Normal orphan size upper bound');
reject(legacy('moving-one.mp4', SFW, Number.NaN), 'Malformed size');
reject(legacy('moving-one.mp4', SFW, 1.5), 'Non-integer size');
assert.equal(allowed(legacy('moving-one.mp4', SFW, 1024, startedAt - 5000)), true, 'Exact lower time boundary');
assert.equal(allowed(legacy('moving-one.mp4', SFW, 1024, startedAt + 2 * 60 * 60 * 1000)), true, 'Exact upper time boundary');
reject(legacy('moving-one.mp4', SFW, 1024, startedAt - 5001), 'Before run window');
reject(legacy('moving-one.mp4', SFW, 1024, startedAt + 2 * 60 * 60 * 1000 + 1), 'After run window');
reject(legacy('near-limit-padded.mp4', SFW, LIMIT - 1023), 'Near boundary is exact');
reject(legacy('exact-limit-padded.mp4', SFW, LIMIT - 1), 'Exact boundary is exact');
reject(legacy('over-limit-padded.mp4', SFW, LIMIT + 2), 'Over boundary is exact');
reject({ ...legacy(), storage_path: legacy().storage_path.replace(uploadId, 'not-a-uuid') }, 'Legacy upload identifier malformed');
reject({ ...legacy(), storage_path: legacy().storage_path.replace(`/${SFW}/`, `/${SFW}/../`) }, 'Traversal');
reject({ ...legacy(), storage_path: legacy().storage_path.replace('moving-one.mp4', '%2fsecret') }, 'Encoded path');

const receiptObject = { bucket: 'onboarding-content', storage_path: `${prefix}/${SFW}/${uploadId}`, size_bytes: 1024 };
const knownRow = { ...receiptObject, kind: SFW, original_name: 'moving-one.mp4' };
const attempt = { creator_account_id: fixture.id, id: uploadId, kind: SFW, name: 'moving-one.mp4', bytes: 1024 };
reject(receiptObject, 'UUID-only object without runner proof');
assert.equal(allowed(receiptObject, [knownRow]), true, 'Exact persisted runner row proves UUID-only object');
assert.equal(allowed(receiptObject, [], [attempt]), true, 'Exact checkpointed attempt proves UUID-only object');
reject(receiptObject, 'Wrong known-row filename', [{ ...knownRow, original_name: 'customer-video.mp4' }]);
reject(receiptObject, 'Wrong known-row size', [{ ...knownRow, size_bytes: 1025 }]);
reject(receiptObject, 'Wrong known-row category', [{ ...knownRow, kind: NSFW }]);
reject(receiptObject, 'Wrong known-row storage path', [{ ...knownRow, storage_path: `${prefix}/${SFW}/${foreign}` }]);
reject(receiptObject, 'Wrong attempt creator', [], [{ ...attempt, creator_account_id: foreign }]);
reject(receiptObject, 'Wrong attempt ID', [], [{ ...attempt, id: foreign }]);
reject(receiptObject, 'Wrong attempt size', [], [{ ...attempt, bytes: 1025 }]);
reject(receiptObject, 'Wrong attempt filename', [], [{ ...attempt, name: 'customer-video.mp4' }]);
reject(receiptObject, 'Wrong attempt category', [], [{ ...attempt, kind: NSFW }]);

function mockStorage(pages) {
  const calls = [];
  const backend = async (resource, options = {}) => {
    assert.equal(options.method, 'POST', 'Enumeration only uses read-only Storage list');
    assert.match(resource, /^\/storage\/v1\/object\/list\/[a-z-]+$/);
    const bucket = resource.split('/').at(-1);
    const body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
    assert.equal(body.limit, 100);
    assert.ok(Number.isInteger(body.offset) && body.offset >= 0 && body.offset % 100 === 0);
    assert.ok(body.prefix === prefix || body.prefix.startsWith(prefix + '/'), 'List stays under exact creator root');
    assert.ok(!body.prefix.includes('..'));
    calls.push({ bucket, prefix: body.prefix, offset: body.offset });
    return pages({ bucket, ...body });
  };
  return { backend, calls };
}
const folder = name => ({ name, id: null, metadata: null });
const file = (name, bytes = 1024) => ({ name, id: uploadId, metadata: { size: bytes } });
async function enumerationTests() {
  const simple = mockStorage(({ bucket, prefix: current }) => {
    if (bucket !== 'onboarding-content') return [];
    if (current === prefix) return [folder(SFW), folder(NSFW)];
    if (current === `${prefix}/${SFW}`) return [file(`${startedAt}-${uploadId}-moving-one.mp4`)];
    if (current === `${prefix}/${NSFW}`) return [file(`${startedAt}-${uploadId}-moving-two.mp4`, 2048)];
    throw new Error('Unexpected scoped directory');
  });
  const objects = await enumerateFixtureStorage(simple.backend, fixture);
  assert.equal(objects.length, 2);
  assert.ok(objects.some(item => item.storage_path === legacy().storage_path && item.size_bytes === 1024 && item.bucket === 'onboarding-content'));
  assert.ok(objects.some(item => item.storage_path === legacy('moving-two.mp4', NSFW, 2048).storage_path));

  const paginated = mockStorage(({ bucket, prefix: current, offset }) => {
    if (bucket !== 'onboarding-content') return [];
    if (current === prefix) return [folder(SFW)];
    if (current !== `${prefix}/${SFW}`) throw new Error('Unknown prefix');
    return offset === 0 ? Array.from({ length: 100 }, (_, index) => file(`first-${index}.mp4`)) : offset === 100 ? [file('last.mp4')] : [];
  });
  assert.equal((await enumerateFixtureStorage(paginated.backend, fixture)).length, 101);
  assert.ok(paginated.calls.some(item => item.offset === 100 && item.prefix === `${prefix}/${SFW}`), 'Continues Storage pagination');

  const exactCap = mockStorage(({ bucket, prefix: current, offset }) => {
    if (bucket !== 'onboarding-content') return [];
    if (current === prefix) return [folder(SFW)];
    return Array.from({ length: Math.min(100, Math.max(0, 499 - offset)) }, (_, index) => file(`${offset + index}.mp4`));
  });
  assert.equal((await enumerateFixtureStorage(exactCap.backend, fixture)).length, 499, '500 total entries includes its one category folder');

  async function rejectsListing(listing, label) {
    const mock = mockStorage(({ bucket, prefix: current }) => bucket !== 'onboarding-content' ? [] : listing(current));
    await assert.rejects(enumerateFixtureStorage(mock.backend, fixture), undefined, label);
  }
  for (const name of ['../escape', '..', '.', '/absolute', 'nested/escape', 'nested\\escape', '%2e%2e', 'bad\u0000name']) {
    await rejectsListing(current => current === prefix ? [folder(name)] : [], `Rejects malformed/escaping directory ${JSON.stringify(name)}`);
    await rejectsListing(current => current === prefix ? [folder(SFW)] : [file(name)], `Rejects malformed/escaping file ${JSON.stringify(name)}`);
  }
  await rejectsListing(current => current === prefix ? [folder('unrecognized-category')] : [], 'Unknown category');
  await rejectsListing(current => current === prefix ? [folder(SFW)] : [folder('nested')], 'No nested directories under category');
  await rejectsListing(current => current === prefix ? [file('root-object.mp4')] : [], 'No objects outside a supported category');
  for (const size of [-1, 0, 1.5, Number.NaN]) {
    await rejectsListing(current => current === prefix ? [folder(SFW)] : [file('malformed-size.mp4', size)], 'Malformed object size');
  }
  await rejectsListing(current => current === prefix ? [folder(SFW)] : [{ name: 'missing-size.mp4', id: uploadId, metadata: {} }], 'Missing object size');
  await rejectsListing(current => current === prefix ? [folder(SFW)] : [{ ...file('bad-id.mp4'), id: 'invalid-identifier' }], 'Invalid object identifier');
  const wrongVoiceCategory = mockStorage(({ bucket, prefix: current }) => bucket === 'voice-samples' && current === prefix ? [folder(SFW)] : []);
  await assert.rejects(enumerateFixtureStorage(wrongVoiceCategory.backend, fixture), undefined, 'Content category cannot be traversed in voice bucket');
  const malformedPage = mockStorage(() => ({ unexpected: 'shape' }));
  await assert.rejects(enumerateFixtureStorage(malformedPage.backend, fixture), undefined, 'Reject non-array Storage list');
  const overfullPage = mockStorage(() => Array.from({ length: 101 }, () => folder(SFW)));
  await assert.rejects(enumerateFixtureStorage(overfullPage.backend, fixture), undefined, 'Reject overfull Storage page');
  await assert.rejects(enumerateFixtureStorage(async () => { throw new Error('Must not call backend'); }, { id: 'unresolved' }), undefined, 'Unresolved fixture does not list Storage');
  const overflowing = mockStorage(({ bucket, prefix: current, offset }) => {
    if (bucket !== 'onboarding-content') return [];
    if (current === prefix) return [folder(SFW)];
    return Array.from({ length: 100 }, (_, index) => file(`${offset + index}.mp4`));
  });
  await assert.rejects(enumerateFixtureStorage(overflowing.backend, fixture), undefined, 'Enumeration exceeds 500 objects safely');
  assert.ok(overflowing.calls.length <= 9, 'Bounded pagination rather than an endless list');
}

enumerationTests().then(() => console.log(JSON.stringify({ passed: true, test: 'offline exact fixture cleanup authorization and bounded Storage enumeration', productionCalls: 0 })))
  .catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });

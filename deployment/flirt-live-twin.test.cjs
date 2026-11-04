const { test } = require('node:test');
const assert = require('node:assert/strict');
const live = require('./flirt-live-twin.cjs');
const { deferredClient } = require('./deferred-client.cjs');
test('live access requires the complete verified assignment', () => {
  const access = live.identity();
  assert.deepEqual(access.cloneIds, [
    '0328e7b3-a1e5-465a-9a30-c9cf6519cba1',
    'bfaf6235-6c3b-4369-8d5c-c7068b08bea2',
    '2e5eb05f-cc88-4ba6-870a-924948d4b09a',
    'dd1869c2-d1e2-490f-9fae-45200232cc30',
    'e0464c19-d5b7-4154-ba46-a60a2ed2a8a3',
    '4fff7866-c7e9-4af2-926a-36e727c0a77f',
    '64d9532d-aac9-4e60-a48c-a3e5c53bb00a',
    '3484f7d9-0cda-4f52-84de-e104c238ce5e',
    '7c2e9452-1d4e-475c-86ef-07a797f52ce5',
    '7626a96d-809e-47f1-b96b-d2e3bc583328',
    '4994b010-f976-4cd1-b053-d72986fb455d',
    'fe60c5d0-9e80-44af-9356-6c14c193464b',
  ]);
  assert.equal(live.isLiveAccess(access), true);
  for (const invalid of [null, { ...access, id: 'other' }, { ...access, dataSource: undefined }, { ...access, cloneIds: access.cloneIds.slice(1) }, { ...access, cloneIds: [...access.cloneIds.slice(1), '11111111-1111-1111-1111-111111111111'] }, { ...access, cloneIds: Array(access.cloneIds.length).fill(access.cloneIds[0]) }]) assert.equal(live.isLiveAccess(invalid), false);
  access.cloneIds.length = 0;
  assert.equal(live.identity().cloneIds.length, 12);
});
test('configuration cannot connect to another project or an anonymous key', () => {
  const env = { FLIRT_LIVE_TWIN_ENABLED: 'true', FLIRT_SUPABASE_PROJECT_REF: 'lkmfwpqegjluirfusnaw', FLIRT_LIVE_TWIN_URL: `https://${live.PROJECT}.supabase.co`, FLIRT_LIVE_TWIN_SERVICE_KEY: 'sb_secret_' + 'x'.repeat(32) };
  assert.equal(live.configuration(env).url, env.FLIRT_LIVE_TWIN_URL);
  for (const change of [{ FLIRT_LIVE_TWIN_ENABLED: 'false' }, { FLIRT_SUPABASE_PROJECT_REF: live.PROJECT }, { FLIRT_LIVE_TWIN_URL: 'https://other.supabase.co' }, { FLIRT_LIVE_TWIN_SERVICE_KEY: 'private-invalid-value' }, { FLIRT_LIVE_TWIN_SERVICE_KEY: env.FLIRT_LIVE_TWIN_SERVICE_KEY + '\nINJECT=true' }]) {
    assert.throws(() => live.configuration({ ...env, ...change }), error => !error.message.includes('private-invalid-value') && !error.message.includes('sb_secret_'));
  }
});
test('deferred SDK chains resolve the client within each request and preserve method receivers', async () => {
  const { AsyncLocalStorage } = require('node:async_hooks');
  const scope = new AsyncLocalStorage();
  function client(name) { return { name, from(table) { assert.equal(this.name, name); return { table, select(column) { assert.equal(this.table, table); return Promise.resolve({ name, table, column }); } }; }, storage: { from(bucket) { return { createSignedUrl(path) { return Promise.resolve({ data: { signedUrl: `${name}/${bucket}/${path}` } }); } }; } } }; }
  const sdk = deferredClient(async () => scope.getStore());
  const results = await Promise.all(['local', 'live'].map(name => scope.run(client(name), async () => {
    const rows = await sdk.from('clones').select('id');
    const signed = await sdk.storage.from('media').createSignedUrl('photo.jpg');
    return [rows.name, signed.data.signedUrl];
  })));
  assert.deepEqual(results, [['local', 'local/media/photo.jpg'], ['live', 'live/media/photo.jpg']]);
  const broken = deferredClient(async () => { throw new Error('unavailable'); });
  assert.equal(await broken.from('clones').select('*').catch(error => error.message), 'unavailable');
});

test('Luna Skyee is scoped to her own clone with the content-upload exception, and nobody else gets it', () => {
  const accountId = '032d8512-ac99-434a-abea-6b1ac5aa67fc';
  const cloneId = '4994b010-f976-4cd1-b053-d72986fb455d';
  const access = { id: `creator:${accountId}`, kind: 'creator', accountId, dataSource: 'twin-live', cloneIds: [cloneId] };
  assert.deepEqual(live.scopedCreator(accountId), { cloneId, name: 'Luna Skyee', source: 'agency_invite', contentUploads: true });
  assert.equal(live.isScopedLiveCreator(access), true);
  assert.equal(live.isLiveData(access), true);
  assert.equal(live.CLONES.includes(cloneId), true);
  for (const invalid of [{ ...access, cloneIds: [live.CLONES[0]] }, { ...access, accountId: 'unassigned' }]) assert.equal(live.isScopedLiveCreator(invalid), false);
  for (const other of ['22952fd9-0a82-4da2-a172-f1a0d1aa2c6d', 'c9c6d09d-71e4-424d-9150-07147c9bd5d2', 'eb46dd1c-2d5b-4a6e-a848-3154b5c7fc0a']) {
    assert.equal(live.scopedCreator(other).contentUploads, undefined, `${other} stays fully read-only`);
  }
});

test('Clarissa Mason is scoped to her own clone with the content-upload exception', () => {
  const accountId = 'c9d878da-b049-430e-be9b-235efbed16f4';
  const cloneId = 'fe60c5d0-9e80-44af-9356-6c14c193464b';
  const access = { id: `creator:${accountId}`, kind: 'creator', accountId, dataSource: 'twin-live', cloneIds: [cloneId] };
  assert.deepEqual(live.scopedCreator(accountId), { cloneId, name: 'Clarissa Mason', source: 'agency_invite', contentUploads: true });
  assert.equal(live.isScopedLiveCreator(access), true);
  assert.equal(live.CLONES.includes(cloneId), true);
  assert.equal(live.isScopedLiveCreator({ ...access, cloneIds: [live.CLONES[0]] }), false);
});

test('Olivia existing login stays scoped to her own clone after agency assignment', () => {
  const accountId = '22952fd9-0a82-4da2-a172-f1a0d1aa2c6d';
  const cloneId = '7c2e9452-1d4e-475c-86ef-07a797f52ce5';
  const access = { id: `creator:${accountId}`, kind: 'creator', accountId, dataSource: 'twin-live', cloneIds: [cloneId] };
  assert.deepEqual(live.scopedCreator(accountId), { cloneId, name: 'Olivia Jade', source: 'twin' });
  assert.equal(live.isScopedLiveCreator(access), true);
  assert.equal(live.isLiveData(access), true);
  assert.equal(live.identity().cloneIds.includes(cloneId), true);
  for (const invalid of [
    { ...access, accountId: 'unassigned' },
    { ...access, id: 'creator:unassigned' },
    { ...access, kind: 'agency' },
    { ...access, dataSource: undefined },
    { ...access, cloneIds: [live.CLONES[0]] },
    { ...access, cloneIds: [cloneId, live.CLONES[0]] },
  ]) assert.equal(live.isScopedLiveCreator(invalid), false);
});


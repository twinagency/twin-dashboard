const { test } = require('node:test');
const assert = require('node:assert/strict');
const live = require('./flirt-live-twin.cjs');
const { deferredClient } = require('./deferred-client.cjs');
test('live access requires the complete verified assignment', () => {
  const access = live.identity();
  assert.equal(live.isLiveAccess(access), true);
  for (const invalid of [null, { ...access, id: 'other' }, { ...access, dataSource: undefined }, { ...access, cloneIds: access.cloneIds.slice(1) }, { ...access, cloneIds: Array(4).fill(access.cloneIds[0]) }]) assert.equal(live.isLiveAccess(invalid), false);
  access.cloneIds.length = 0;
  assert.equal(live.identity().cloneIds.length, 4);
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

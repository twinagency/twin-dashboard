const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');

async function main() {
  const root = process.cwd(), dir = mkdtempSync(join(tmpdir(), 'creator-preparation-'));
  const queries = [];
  const fixture = { fail: null, missing: false, answers: { preferred_name: 'Fixture creator', boundaries: 'Private fixture text', content_folder_links: JSON.stringify([{ url: 'https://drive.google.com/drive/folders/fixture', submittedAt: '2026-10-21T00:00:00Z' }]) } };
  const db = { from(table) {
    const query = { table, filters: [], columns: null, options: null }; queries.push(query);
    const chain = {
      select(columns, options) { query.columns = columns; query.options = options; return chain; },
      eq(...args) { query.filters.push(['eq', ...args]); return chain; },
      in(...args) { query.filters.push(['in', ...args]); return chain; },
      like(...args) { query.filters.push(['like', ...args]); return chain; },
      or(...args) { query.filters.push(['or', ...args]); return chain; },
      order() { return chain; }, limit() { return chain; }, maybeSingle() { return chain; },
      then(resolve) {
        if (fixture.fail === table) return Promise.resolve({ data: null, count: null, error: { message: 'fixture outage' } }).then(resolve);
        if (table === 'creator_applications') return Promise.resolve({ data: fixture.missing ? null : { answers: fixture.answers }, error: null }).then(resolve);
        const count = table === 'creator_consents' ? 0 : query.filters.some(f => f[0] === 'or') ? 2 : query.filters.some(f => f.includes('image/%')) ? 1200 : 300;
        return Promise.resolve({ data: null, count, error: null }).then(resolve);
      },
    }; return chain;
  } };
  globalThis.__preparationFixture = db;
  try {
    await build({ stdin: { contents: `export {getCreatorPreparation} from './lib/creator-preparation';export * from './lib/creator-preparation-model';export * from './lib/creator-platforms/model';export * from './lib/onlyfans-sign-in/model';`, resolveDir: root, loader: 'ts' }, outfile: join(dir, 'model.cjs'), bundle: true, platform: 'node', format: 'cjs', alias: { '@': root }, plugins: [{ name: 'isolated-database', setup(b) {
      b.onResolve({ filter: /^server-only$|^\.\/supabase-service$/ }, a => ({ path: a.path, namespace: 'fixture' }));
      b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: a.path === 'server-only' ? '' : 'export const serviceClient=()=>globalThis.__preparationFixture;', loader: 'js' }));
    } }] });
    const m = require(join(dir, 'model.cjs'));
    const result = await m.getCreatorPreparation({ accountId: 'only-this-creator' });
    assert.equal(result.profile.answered, 2); assert.equal(result.profile.total, 22);
    assert.deepEqual(result.content, { photos: 1200, videos: 300, pending: 2, folders: 1 });
    assert.equal(result.consentSaved, false);
    for (const query of queries) assert(query.filters.some(f => f[0] === 'eq' && f[1] === 'creator_account_id' && f[2] === 'only-this-creator'));
    for (const query of queries.filter(q => q.table === 'creator_files')) { assert.equal(query.options.head, true); assert.equal(query.options.count, 'exact'); assert(!query.filters.find(f => f[0] === 'in')[2].includes('voice')); }
    assert(!JSON.stringify(result).includes('Private fixture text')); assert(!JSON.stringify(result).includes('drive.google'));
    assert.equal(m.preparationProgress(result).profileSaved, false); assert.equal(m.preparationProgress(result).needsContentReview, true);
    fixture.fail = 'creator_files';
    const outage = await m.getCreatorPreparation({ accountId: 'only-this-creator' });
    assert.equal(outage.content.photos, null); assert.equal(outage.content.videos, null); assert.equal(m.preparationProgress(outage).unavailable, true); assert.equal(m.preparationProgress(outage).contentSaved, false);
    fixture.fail = 'creator_applications'; assert.equal((await m.getCreatorPreparation({ accountId: 'only-this-creator' })).profile.answered, null);
    fixture.fail = 'creator_consents'; assert.equal((await m.getCreatorPreparation({ accountId: 'only-this-creator' })).consentSaved, null);
    fixture.fail = null; fixture.missing = true; const empty = await m.getCreatorPreparation({ accountId: 'only-this-creator' }); assert.equal(empty.profile.answered, 0); assert.equal(empty.content.folders, 0);
    const now = Date.now(), future = new Date(now + 60000).toISOString(), past = new Date(now - 1).toISOString();
    const account = status => ({ id: 'of-1', handle: 'fixture', connection: { status, expiresAt: future, outgoingEnabled: false } });
    assert.equal(m.platformConnectionState(account('paused'), now), 'paused'); assert.equal(m.platformConnectionState(account('verified'), now), 'connected');
    assert.equal(m.platformConnectionState({ ...account('verified'), connection: { ...account('verified').connection, expiresAt: past } }, now), 'reconnect');
    assert.equal(m.activePlatformEnrollment({ status: 'pending', expiresAt: past }, now), false);
    const attempt = { id: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', phase: 'waiting', handle: null, expiresAt: past, enrollmentId: null, width: 432, height: 720 };
    assert.equal(m.currentSignInAttempt(attempt, now).phase, 'expired'); assert.equal(m.currentSignInAttempt({ ...attempt, phase: 'submitted' }, now).phase, 'submitted');
    assert.equal(m.parseSignInAttempt({ ...attempt, cookies: [] }), null);
    console.log('PASS creator preparation: current owner scope, exact counts beyond row limits, voice exclusion, saved profile projection, folder-link distinction, no consent inference, unknown on outages; paused/expired connection and sign-in states.');
  } finally { delete globalThis.__preparationFixture; rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

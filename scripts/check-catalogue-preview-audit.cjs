const assert = require('node:assert/strict');
const { build } = require('esbuild');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'catalogue-audit-test-'));
  try {
    await build({ stdin: { contents: `export * from './lib/catalogue-preview-audit';export {DEFAULT_BLUR} from './lib/catalogue-core';`, resolveDir: process.cwd(), loader: 'ts' },
      outfile: join(dir, 'audit.cjs'), bundle: true, platform: 'node', format: 'cjs' });
    const { readCatalogueInventory, auditCataloguePreviews, DEFAULT_BLUR } = require(join(dir, 'audit.cjs'));
    const creators = [{ id: 'a', slug: 'creator-one' }, { id: 'b', slug: 'creator-two' }, { id: 'c', slug: 'new-without-content' }];
    const videos = Array.from({ length: 1005 }, (_, i) => ({ id: 'video-' + String(i).padStart(5, '0'),
      clone_id: i % 2 ? 'a' : 'b', storage_path: 'private-path-' + i }));
    const tables = { clones: creators, videos, creator_catalogue_settings: [{ clone_id: 'a', blur_strength: 12 }] };
    const queries = []; let outage = false, repeatedPage = false;
    const db = { from(table) {
      const q = { table, after: null }; queries.push(q);
      const chain = { select() { return chain; }, order(key, options) { q.key = key; assert.equal(options.ascending, true); return chain; },
        limit(n) { q.limit = n; return chain; }, gt(key, value) { assert.equal(key, q.key); q.after = value; return chain; },
        abortSignal(signal) { assert(signal instanceof AbortSignal); return chain; },
        then(resolve, reject) {
          if (outage && table === 'videos' && q.after) return Promise.resolve({ data: null, error: {} }).then(resolve, reject);
          const rows = tables[table].filter(row => repeatedPage || q.after === null || row[q.key] > q.after).slice(0, Math.min(q.limit, 73));
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        } };
      return chain;
    } };
    let inventory = await readCatalogueInventory(db);
    assert.equal(inventory.videos.length, 1005, 'server page caps and a 1000-row boundary cannot omit the tail');
    assert(queries.filter(q => q.table === 'videos').length > 10);
    const checked = new Set();
    const report = await auditCataloguePreviews(inventory, async (video, blur) => {
      checked.add(video.id); assert.equal(blur, video.clone_id === 'a' ? 12 : DEFAULT_BLUR);
      if (video.id === videos.at(-1).id) throw new Error('private URL/token must not leak', { cause: { stage: 'probe', reason: 'invalid', url: 'private' } });
    });
    assert.equal(checked.size, 1005); assert.equal(report.checked, 1005); assert.equal(report.failed, 1);
    assert.equal(report.verificationComplete, true); assert.equal(report.scope, 'all-creators');
    assert.equal(report.results.find(c => c.creatorId === 'a').status, 'passed');
    assert.equal(report.results.find(c => c.creatorId === 'b').status, 'failed');
    assert.equal(report.results.find(c => c.creatorId === 'c').status, 'no_videos');
    assert(!JSON.stringify(report).includes('private')); assert(!JSON.stringify(report).includes('storage_path'));
    // A creator added after the first audit is discovered without a roster or code change.
    creators.push({ id: 'd', slug: 'future-creator' });
    videos.push({ id: 'video-99999', clone_id: 'd', storage_path: 'future-private-path' });
    inventory = await readCatalogueInventory(db);
    const future = await auditCataloguePreviews(inventory, async () => {});
    assert.equal(future.creatorsDiscovered, 4); assert.equal(future.results.find(c => c.creatorId === 'd').passed, 1);
    const discovery = await auditCataloguePreviews(inventory, async () => { throw new Error('inventory-only must not read media'); }, { inventoryOnly: true });
    assert.equal(discovery.checked, 0); assert.equal(discovery.verificationComplete, false); assert.equal(discovery.results[0].status, 'not_checked');
    let clock = 0;
    const bounded = await auditCataloguePreviews(inventory, async () => { clock += 10; }, { now: () => clock, maxRunMs: 15 });
    assert.equal(bounded.verificationComplete, false); assert(bounded.unchecked > 0); assert(bounded.results.some(c => c.status === 'incomplete'));
    clock = 0; const firstVisit = [];
    await auditCataloguePreviews(inventory, async video => { firstVisit.push(video.clone_id); clock++; }, { now: () => clock, maxRunMs: 3 });
    assert.deepEqual(new Set(firstVisit), new Set(['a', 'b', 'd']), 'Every non-empty creator is visited before another pass through a large library');
    const orphan = await auditCataloguePreviews({ ...inventory, videos: [{ id: 'orphan', clone_id: 'missing', storage_path: 'hidden' }] }, async () => {});
    assert.equal(orphan.failed, 1); assert.equal(orphan.failures[0].reason, 'unknown_creator');
    outage = true; await assert.rejects(() => readCatalogueInventory(db), /inventory unavailable/); outage = false;
    repeatedPage = true; await assert.rejects(() => readCatalogueInventory(db), /pagination is incomplete/);
    console.log('PASS catalogue audit: every discovered creator, future signups, pagination beyond 1000, no-content states, creator blur/defaults, tail failures, unavailable/incomplete audits and private-output protection.');
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

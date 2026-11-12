"use strict";
// Characterization (review lane W4-deploy-creator-flow-live-check-plus12): deployment/creator-flow-live-check.cjs
// cleanup (:577-624) deletes only its own fixtures. A non-fixture customer (account, Auth user, agency invite in the
// same agency, creator_files row + Storage object under creators/<customer id>/) is seeded before a flow-only run of
// each brand; the wire fake honours PostgREST filters exactly and, like pg-safeupdate, refuses only a DELETE with no filter.
// Mutation proof: tests/rules/mutations/W4-deploy-creator-flow-live-check-plus12/m1-invite-delete-drops-label.diff.
// Wire fake only: fetch is blocked before the runner loads; flow-only, so ffmpeg is never reached.
const assert = require('node:assert/strict');
const test = require('node:test');
const { blockNetwork, makeFake, runFlowOnly } = require('./W4-deploy-creator-flow-live-check-plus12-fake.cjs');
blockNetwork();
const { run, BRANDS } = require('../../deployment/creator-flow-live-check.cjs');

for (const brand of ['flirt', 'moxy']) {
  test(`cleanup-scope ${brand}: flow-only cleanup removes every fixture and leaves a seeded customer intact`, async () => {
    const fake = makeFake(brand, BRANDS);
    const customer = fake.seedCustomer();
    const before = fake.snapshotCustomer(customer);
    const { result } = await runFlowOnly(run, brand, fake);
    assert.deepEqual(fake.deleteViolations, [], 'no cleanup DELETE without any filter');
    assert.deepEqual(fake.fakeErrors, []);
    assert.ok(fake.requests.filter(r => r.path === '/creator-auth/signup' && r.method === 'POST').length >= 3, 'fixtures were actually signed up');
    assert.ok(fake.requests.some(r => r.path === '/rest/v1/creator_agency_codes' && r.method === 'DELETE'), 'invite cleanup actually ran');
    assert.ok(fake.requests.some(r => r.path === '/rest/v1/creator_accounts' && r.method === 'DELETE'), 'account cleanup actually ran');
    assert.deepEqual(fake.snapshotCustomer(customer), before, `non-fixture customer survives intact (runner result.passed=${result.passed})`);
    assert.equal(result.passed, true, JSON.stringify(result));
    assert.equal(result.identified_fixtures_removed, true);
    assert.deepEqual(fake.fixtureLeftovers(customer), { accounts: 0, auth: 0, invites: 0, files: 0, objects: 0, assignments: 0, applications: 0 }, 'all fixtures gone');
  });
}

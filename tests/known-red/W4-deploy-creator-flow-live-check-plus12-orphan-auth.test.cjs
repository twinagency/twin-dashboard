"use strict";
// KNOWN RED (review lane W4-deploy-creator-flow-live-check-plus12): deployment/creator-flow-live-check.cjs learns a
// fixture's auth_user_id only from its creator_accounts row (signup :311-312, cleanup :581-603). When the signup route
// keeps the Auth user but has no account row (app/creator-auth/signup/route.ts:118-128, readback error), cleanup skips
// that fixture and still reports identified_fixtures_removed:true while a disposable Auth user stays live.
// Fixed looks like: cleanup finds the Auth user by fixture email (or reports cleanup_failure). Control must pass; the
// red test must fail on ERR_ASSERTION. Wire fake only: fetch is blocked before the runner loads; flow-only, no ffmpeg.
const assert = require('node:assert/strict');
const test = require('node:test');
const { blockNetwork, makeFake, runFlowOnly } = require('../rules/W4-deploy-creator-flow-live-check-plus12-fake.cjs');
blockNetwork();
const { run, BRANDS } = require('../../deployment/creator-flow-live-check.cjs');

test('control: normal flow-only run leaves no fixture Auth user and claims identified_fixtures_removed', async () => {
  const fake = makeFake('flirt', BRANDS);
  const { result } = await runFlowOnly(run, 'flirt', fake);
  assert.deepEqual(fake.fakeErrors, []);
  assert.equal(result.passed, true, JSON.stringify(result));
  assert.equal(result.identified_fixtures_removed, true);
  assert.equal(fake.auth.size, 0, 'fake Auth store must end empty');
});

// Scenario: the `skip` fixture's signup keeps its Auth user but gets no account row (route "incomplete" redirect).
async function orphanRun() {
  const fake = makeFake('flirt', BRANDS, { orphanAuthOn: email => email.endsWith('-skip@twinagency.co') });
  const { result } = await runFlowOnly(run, 'flirt', fake);
  return { fake, result };
}

test('control: orphan scenario reproduces (incomplete signup fails the flow, one fixture Auth user created without a row)', async () => {
  const { fake, result } = await orphanRun();
  assert.deepEqual(fake.fakeErrors, []);
  assert.equal(result.passed, false);
  assert.match(result.failure || '', /Normal signup did not create account/);
  // Counted at creation, not at the end: a correct cleanup fix removes it, and this control must stay green then.
  assert.equal(fake.orphanAuthEmails.length, 1, 'exactly one fixture Auth user created without an account row');
  assert.equal(fake.db.creator_accounts.filter(row => row.email.endsWith('-skip@twinagency.co')).length, 0, 'no account row for the orphan');
  assert.ok(fake.requests.some(r => r.path.startsWith('/auth/v1/admin/users/') && r.method === 'DELETE'), 'cleanup ran for the complete fixture');
});

test('orphan-auth: cleanup must not claim identified_fixtures_removed while a fixture Auth user remains', async () => {
  const { fake, result } = await orphanRun();
  const left = fake.fixtureAuthEmails();
  assert.ok(left.length === 0 || result.identified_fixtures_removed !== true,
    `result claims identified_fixtures_removed:true while ${left.length} fixture Auth user(s) remain (expected cleanup_failure)`);
});

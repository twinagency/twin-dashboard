import assert from "node:assert/strict";
import { CONTENT_SCHEMA } from "../lib/onlyfans/content";
import { parseVault, parseVaultSync, parseVaultSyncAck } from "../lib/onlyfans/vault";

const accountId = "of-312988353";
const sync = {
  commandKey: "a".repeat(64), jobId: "6ac54b67-df58-4f63-ae58-ef3760afbd59", status: "pending",
  pagesRead: 1368, itemsSeen: 8208, lastError: null,
  requestedAt: "2026-11-04T18:00:00Z", updatedAt: "2026-11-04T20:00:00Z", completedAt: null,
};
const vault = {
  items: [], nextCursor: null, sync, connectionRevision: 1,
  summary: { total: 8144, photos: 7611, videos: 513, other: 20, matching: 8144, folders: 23 },
};
const response = { schemaVersion: CONTENT_SCHEMA, ok: true, accountId, vault };
const ack = { schemaVersion: CONTENT_SCHEMA, ok: true, applied: true, accountId, commandKey: sync.commandKey, sync };

// Cumulative job progress must not hide an otherwise valid recorded vault.
assert.deepEqual(parseVault(response, accountId), vault);
assert.deepEqual(parseVaultSyncAck(ack, { accountId, commandKey: sync.commandKey }), sync);
for (const [pagesRead, itemsSeen] of [[0, 0], [200, 4800], [201, 4801], [1368, 8208], [100000, 2400000], [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]]) {
  assert(parseVaultSync({ ...sync, pagesRead, itemsSeen }));
}

// Large counters do not weaken the numeric, schema, account or request binding.
for (const field of ["pagesRead", "itemsSeen"] as const) {
  for (const bad of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY, "8208", true, null]) {
    const invalid = { ...sync, [field]: bad };
    assert.equal(parseVaultSync(invalid), null);
    assert.equal(parseVault({ ...response, vault: { ...vault, sync: invalid } }, accountId), null);
    assert.equal(parseVaultSyncAck({ ...ack, sync: invalid }, { accountId }), null);
  }
}
assert.equal(parseVaultSync({ ...sync, providerUrl: "https://example.invalid" }), null);
assert.equal(parseVault(response, "of-other-account"), null);
assert.equal(parseVault({ ...response, schemaVersion: "of-content.v2" }, accountId), null);
assert.equal(parseVault({ ...response, vault: { ...vault, items: Array(25).fill({}) } }, accountId), null);
assert.equal(parseVaultSyncAck(ack, { accountId: "of-other-account" }), null);
assert.equal(parseVaultSyncAck(ack, { accountId, commandKey: "b".repeat(64) }), null);
console.log("PASS vault sync progress: cumulative counters, read and sync acknowledgement, invalid numbers, scope and schema checks");

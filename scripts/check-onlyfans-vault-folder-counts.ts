import assert from "node:assert/strict";
import { CONTENT_SCHEMA } from "../lib/onlyfans/content";
import { parseVaultResource, validVaultEdit } from "../lib/onlyfans/vault-editing";

const accountId = "of-312988353";
const summary = { folderId: "123", name: "Imported content", count: 6803 };
const envelope = (folders: unknown[]) => ({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId, folders });

// A large imported folder must not hide all other folders in the recorded vault.
const folders = [summary, { folderId: "124", name: "Recent", count: 12 }];
assert.deepEqual(parseVaultResource(envelope(folders), accountId, "folders"), folders);
for (const count of [0, 5000, 5001, 6803, 100000, Number.MAX_SAFE_INTEGER]) {
  assert(parseVaultResource(envelope([{ ...summary, count }]), accountId, "folders"));
  assert(parseVaultResource(envelope([{ ...summary, count, automatic: true, coverMediaId: "987", coverKind: "photo" }]), accountId, "folders"));
}
for (const count of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "6803", true, null]) {
  assert.equal(parseVaultResource(envelope([{ ...summary, count }]), accountId, "folders"), null);
}
assert.equal(parseVaultResource(envelope(folders), "of-other-account", "folders"), null);
assert.equal(parseVaultResource(envelope([summary, summary]), accountId, "folders"), null);
assert.equal(parseVaultResource(envelope([{ ...summary, providerUrl: "https://example.invalid" }]), accountId, "folders"), null);
assert.equal(parseVaultResource(envelope(Array.from({ length: 201 }, (_, i) => ({ ...summary, folderId: String(i + 1) }))), accountId, "folders"), null);

// Summary display does not relax the existing detailed editor or mutation bounds.
const detail = (count: number) => ({ schemaVersion: CONTENT_SCHEMA, ok: true, accountId,
  folder: { ...summary, count, fingerprint: "a".repeat(64), archived: false } });
assert(parseVaultResource(detail(5000), accountId, "folders/123"));
assert.equal(parseVaultResource(detail(5001), accountId, "folders/123"), null);
const edit = { requestId: "d59e1bee-af04-4cb7-a67c-e440e0d9b009", action: "add", name: null,
  mediaIds: Array.from({ length: 40 }, (_, i) => String(i + 1)), expectedFingerprint: "b".repeat(64) };
assert(validVaultEdit("folders/123", edit));
assert.equal(validVaultEdit("folders/123", { ...edit, mediaIds: [...edit.mediaIds, "41"] }), false);
console.log("PASS vault folder summaries: large imported counts, strict numbers/schema/scope, preserved editor and mutation limits");

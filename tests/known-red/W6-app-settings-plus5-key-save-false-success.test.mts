// KNOWN RED (W6 app-settings-plus5, finding S2, docs/review/W6/app-settings-plus5.md).
// saveApiKeys (app/settings/actions.ts:29,32) never reads `error` from the app_settings delete/upsert, so a rejected
// write resolves like a success: the operator believes a fleet key (openrouter_api_key etc.) was rotated or cleared
// while the bot keeps the old one. Condition: internal admin saves keys and PostgREST rejects the write.
// Fake Supabase client returning an error, no network, no DB, no key values. Run:
//   node --import tsx --experimental-test-module-mocks --test tests/known-red/W6-app-settings-plus5-key-save-false-success.test.mts
import assert from "node:assert/strict";
import { mock, test } from "node:test";
import { withModuleMocks } from "../support/module-mocks-rerun.ts";

// W6 close: init.sh runs plain `node --import tsx --test`; without module mocks this re-runs the file with the flag.
if (withModuleMocks(import.meta.url, { controls: 1, rest: 2 })) {

let fail = false;
const writes: string[] = [];
const result = () => Promise.resolve(fail ? { data: null, error: { message: "permission denied for table app_settings" } } : { data: null, error: null });
const query = () => {
  const q = {
    upsert: (row: { key: string }) => { writes.push(`upsert ${row.key}`); return result(); },
    delete: () => q,
    eq: (_c: string, key: string) => { writes.push(`delete ${key}`); return result(); },
  };
  return q;
};

const lib = (p: string) => new URL(`../../lib/${p}`, import.meta.url).href;
mock.module(lib("supabase.ts"), { namedExports: { supabaseAdmin: { from: query } } });
mock.module(lib("agency-management.ts"), { namedExports: { guardDashboardAction: async () => {} } });
mock.module(lib("query-cache.ts"), { namedExports: { invalidateCloneCaches: async () => {} } });
mock.module("next/cache", { namedExports: { revalidatePath: () => {} } });

const { saveApiKeys } = await import("../../app/settings/actions.ts");
const form = (key: string, value: string) => { const fd = new FormData(); fd.set(key, value); return fd; };

test("control: an accepted key write resolves and reaches the database", async () => {
  fail = false; writes.length = 0;
  await saveApiKeys(form("openrouter_api_key", "placeholder-not-a-key"));
  assert.deepEqual(writes, ["upsert openrouter_api_key"]);
});

for (const [label, value, write] of [["save", "placeholder-not-a-key", "upsert"], ["clear", "__CLEAR__", "delete"]] as const) {
  test(`S2: a rejected key ${label} is reported, not resolved as success`, async () => {
    fail = true; writes.length = 0;
    await assert.rejects(saveApiKeys(form("deepgram_api_key", value)), `rejected ${write} must surface as an error`);
    assert.deepEqual(writes, [`${write} deepgram_api_key`]);
  });
}
}

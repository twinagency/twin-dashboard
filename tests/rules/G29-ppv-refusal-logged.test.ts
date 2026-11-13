// G29 (W5 app-compact-workspace-plus2 F1, high): app/creator/ppvs/CreatorPpvUploads.tsx:42-45 always shows
// "uploaded" (owner decision 2026-10-10) on the premise that "a file that never landed is logged server side
// (system_logs) for follow-up". app/creator-auth/ppv-upload/route.ts:80-81 refuses an oversized photo (>75 MB) with
// 413 and writes NO system_logs row, so a signed-in creator with a linked clone is told "uploaded" while the file is
// neither stored nor recorded. Control: the route's catch path (unparseable body, 500) does log.
// Run: node --import tsx --test tests/rules/G29-ppv-refusal-logged.test.ts
// Offline: identity, origin, supabase and media actions are faked at the module boundary; no network, no DB.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { withModuleMocks } from "../support/module-mocks-rerun";

// W5 close: init.sh runs plain `node --import tsx --test`; without module mocks this re-runs the file with the flag.
if (withModuleMocks(import.meta.url, { controls: 1, rest: 1 })) {
const CLONE = "00000000-0000-4000-8000-0000000000c1";
const logs: Array<Record<string, unknown>> = [];
mock.module("@/lib/creator-dashboard-identity", { namedExports: {
  creatorDashboardIdentity: async () => ({ kind: "creator", accountId: "acct-1", userId: "u-1", creatorName: "Fixture", onboarded: true, readOnly: false, agencyId: null, cloneIds: [CLONE] }),
} });
mock.module("@/lib/form-origin", { namedExports: { trustedFormOrigin: () => true } });
mock.module("@/lib/supabase", { namedExports: { supabaseAdmin: {
  from: (table: string) => ({ insert: (row: Record<string, unknown>) => { logs.push({ table, ...row }); return Promise.resolve({ error: null }); } }),
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
} } });
mock.module("@/app/media/actions", { namedExports: { uploadPhoto: async () => ({ ok: true }), uploadVideo: async () => ({ ok: true }) } });
mock.module("@/lib/dashboard-access", { namedExports: { withDashboardAccess: (_scope: unknown, fn: () => unknown) => fn() } });

// Loaded lazily (repo compiles tests as CJS, no top-level await) and only after the mocks above are registered.
const load = async () => ({ NextRequest: (await import("next/server")).NextRequest, POST: (await import("../../app/creator-auth/ppv-upload/route")).POST });
const MB = 1024 * 1024;
const ppvLogs = () => logs.filter(row => row.table === "system_logs" && row.source === "creator-ppv-upload");
async function post(body: BodyInit, headers: Record<string, string> = {}) {
  const { NextRequest, POST } = await load();
  return POST(new NextRequest("https://fixture.invalid/creator-auth/ppv-upload", { method: "POST", body, headers, duplex: "half" } as ConstructorParameters<typeof NextRequest>[1]));
}

test("control: an upload the route cannot parse (500) is recorded in system_logs", async () => {
  logs.length = 0;
  const res = await post("not multipart", { "content-type": "text/plain" });
  assert.equal(res.status, 500);
  assert.equal(ppvLogs().length, 1, "the catch path writes one creator-ppv-upload row");
});

test("F1: an oversized photo refused with 413 (creator still sees 'uploaded') is recorded in system_logs", async () => {
  logs.length = 0;
  const fd = new FormData();
  fd.append("kind", "photo");
  fd.append("files", new File([new Uint8Array(76 * MB)], "big.jpg", { type: "image/jpeg" }));
  const res = await post(fd);
  assert.equal(res.status, 413, "fixture must hit the 75 MB photo refusal");
  assert.equal((await res.json()).ok, false);
  assert.ok(ppvLogs().length >= 1, "a refused file that never landed must leave a system_logs row (CreatorPpvUploads.tsx:42-43 claim)");
});
}

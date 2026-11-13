// G29 (W5 app-creator-auth F1, high, reachable by any signed-in creator): app/creator-auth/ppv-upload/route.ts:85-95 answers 200 as soon as a file is
// staged and runs the catalogue ingest in after(), with no bound on how many ingests run at once. Each ingest calls
// uploadVideo/uploadPhoto (app/media/actions.ts:329/:256), which reads the whole file into RAM (up to 512 MiB per video)
// and compresses it. Because each 200 arrives before processing, the creator page's sequential loop
// (app/creator/ppvs/CreatorPpvUploads.tsx:24-36) starts the next file while earlier ones still run, so jobs pile up in the
// one dashboard process that also serves the operator UI and the public API. Condition: any signed-in, non-readOnly
// creator with exactly one linked clone selecting several videos, or any script holding such a session.
// Red assertion: with 4 accepted uploads whose ingest has not finished, at most 2 ingests run concurrently (a fix may
// queue them or answer 429 past a bound; both pass, but at least one upload must be accepted). Control: one upload is accepted and runs exactly one ingest.
// Run: node --import tsx --test tests/rules/G29-ppv-ingest-bound.test.ts
// Offline: identity, origin, supabase, media actions, dashboard access and after() are faked at the module boundary.
// Harness shape copied from tests/rules/G29-ppv-refusal-logged.test.ts.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { withModuleMocks } from "../support/module-mocks-rerun";
import * as realNextServer from "next/server";

// W5 close: init.sh runs plain `node --import tsx --test`; without module mocks this re-runs the file with the flag.
if (withModuleMocks(import.meta.url, { controls: 1, rest: 1 })) {
const CLONE = "00000000-0000-4000-8000-0000000000c1";
let active = 0;
let peak = 0;
const releases: Array<() => void> = [];
const ingest = async () => {
  active++;
  peak = Math.max(peak, active);
  await new Promise<void>(resolve => releases.push(resolve));
  active--;
  return { ok: true };
};
const pendingAfter: Array<Promise<unknown>> = [];

mock.module("next/server", { namedExports: {
  ...realNextServer,
  // Next runs after() callbacks once the response is sent; run them immediately and do not await (same overlap).
  after: (fn: () => unknown) => { pendingAfter.push(Promise.resolve().then(fn)); },
} });
mock.module("@/lib/creator-dashboard-identity", { namedExports: {
  creatorDashboardIdentity: async () => ({ kind: "creator", accountId: "acct-1", userId: "u-1", creatorName: "Fixture", onboarded: true, readOnly: false, agencyId: null, cloneIds: [CLONE] }),
} });
mock.module("@/lib/form-origin", { namedExports: { trustedFormOrigin: () => true } });
mock.module("@/lib/supabase", { namedExports: { supabaseAdmin: {
  from: () => ({ insert: () => Promise.resolve({ error: null }) }),
  storage: { from: () => ({ upload: async () => ({ error: null }) }) },
} } });
mock.module("@/app/media/actions", { namedExports: { uploadPhoto: ingest, uploadVideo: ingest } });
mock.module("@/lib/dashboard-access", { namedExports: { withDashboardAccess: (_scope: unknown, fn: () => unknown) => fn() } });

// Loaded lazily (repo compiles tests as CJS, no top-level await) and only after the mocks above are registered.
const load = async () => (await import("../../app/creator-auth/ppv-upload/route")).POST;
async function postVideo(name: string) {
  const POST = await load();
  const fd = new FormData();
  fd.append("kind", "video");
  fd.append("files", new File([new Uint8Array(1024)], name, { type: "video/mp4" }));
  return POST(new realNextServer.NextRequest("https://fixture.invalid/creator-auth/ppv-upload", { method: "POST", body: fd, duplex: "half" } as ConstructorParameters<typeof realNextServer.NextRequest>[1]));
}
const settle = () => new Promise(resolve => setTimeout(resolve, 50));
async function drain() {
  // A fixed route may queue jobs behind a semaphore: keep releasing until no ingest is waiting.
  for (let round = 0; round < 50; round++) {
    while (releases.length) releases.shift()!();
    await settle();
    if (!releases.length) break;
  }
  await Promise.allSettled(pendingAfter.splice(0));
  active = 0;
  peak = 0;
}

test("control: one accepted PPV upload runs exactly one catalogue ingest", async () => {
  await drain();
  const res = await postVideo("one.mp4");
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
  await settle();
  assert.equal(peak, 1, "the accepted file reaches the catalogue ingest once");
  await drain();
});

test("F1: four accepted PPV uploads still processing never run more than 2 whole-file ingests at once", async () => {
  await drain();
  const statuses: number[] = [];
  for (const name of ["a.mp4", "b.mp4", "c.mp4", "d.mp4"]) {
    statuses.push((await postVideo(name)).status);
    await settle();
  }
  assert.ok(statuses.every(status => status === 200 || status === 429), `fixture: each upload is accepted or deferred (${statuses})`);
  assert.ok(statuses.filter(status => status === 200).length >= 1, `a limiter that refuses everything is not a fix (${statuses})`);
  assert.ok(peak <= 2, `${peak} catalogue ingests ran at once (each buffers the whole file, up to 512 MiB); statuses ${statuses}`);
  await drain();
});
}

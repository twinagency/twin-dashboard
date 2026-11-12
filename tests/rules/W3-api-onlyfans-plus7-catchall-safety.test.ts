// CHARACTERIZATION (green; W3 api-onlyfans-plus7 C1, REVIEW.md inv 7 "Isolation"). Pins that the four OnlyFans catch-all GET routes only
// relay allowlisted paths upstream:
//   app/api/onlyfans-launch/abc/accounts/[accountId]/[...path]            (lib/onlyfans/launch/a-route.ts dispatchLaunch)
//   app/api/onlyfans-content/accounts/[accountId]/sync/[[...path]]        (lib/onlyfans/content-sync-route.ts dispatchSync)
//   app/api/onlyfans-content/accounts/[accountId]/imports/[[...path]]     (lib/onlyfans/offer-import-route.ts dispatchImport)
//   app/api/onlyfans-content/accounts/[accountId]/vault/manage/[...resource] (target() + lib/onlyfans/vault-editing.ts validVaultResource)
// Each must refuse "..", an encoded "%2F" (raw, and decoded into one segment) and unknown segments with a 4xx and ZERO upstream calls;
// the control per route proves one allowed path reaches upstream exactly once (so a refusal is not vacuous).
// Drives the real handlers as the internal operator (tests/helpers/W3-api-onlyfans-plus7-harness.ts: route.ts, next/headers, server-only,
// supabase-service mocked; the REAL launch/sync/import/vault backends run over the fake wire at https://backend.invalid). The handlers read
// `context.params`, so the raw segments below are what Next would hand them. No extra module mocks.
// Mutation proofs: tests/rules/mutations/W3-api-onlyfans-plus7/catchall-*.diff + .failing.txt; the launch route-only plant SURVIVES
// (a-backend.ts re-checks the path) and is recorded as catchall-launch-route-only.diff + .survived.txt.
// Runs with plain commands:
//   node --import tsx --test --test-name-pattern='^control' tests/rules/W3-api-onlyfans-plus7-catchall-safety.test.ts   (green)
//   node --import tsx --test --test-skip-pattern='^control' tests/rules/W3-api-onlyfans-plus7-catchall-safety.test.ts   (green)
// Synthetic values only.
import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { call, calls, ensureModuleMocks, reset, upstream } from "../helpers/W3-api-onlyfans-plus7-harness";

const JOB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
type Route = { name: string; template: string; key: "path" | "resource"; allowed: string[]; refused: string[][] };
const encoded = (allowed: string) => [[".."], ["%2F"], ["a%2Fb"], [`..%2F${allowed}`], [`${allowed}%2F..`], [`../${allowed}`], [`${allowed}/..`],
  [allowed, ".."], ["..", allowed], ["unknown-segment"], [allowed, "unknown-segment"]];
const routes: Route[] = [
  { name: "launch", template: "onlyfans-launch/abc/accounts/[accountId]/[...path]", key: "path", allowed: ["readiness"],
    refused: [...encoded("readiness"), ["purchases", "..", "readiness"], ["personality", "revisions", ".."], ["personality", "revisions", "%2F"],
      ["purchases", "evidence", ".."]] },
  { name: "sync", template: "onlyfans-content/accounts/[accountId]/sync/[[...path]]", key: "path", allowed: ["status"],
    refused: [...encoded("status"), [], ["operations", ".."], ["operations", "%2F"], ["drafts", ".."], ["drafts", "a%2Fb"], ["commands", ".."],
      ["operations", "x", ".."]] },
  { name: "imports", template: "onlyfans-content/accounts/[accountId]/imports/[[...path]]", key: "path", allowed: ["jobs", JOB],
    refused: [...encoded("jobs"), [], ["jobs", ".."], ["jobs", "%2F"], ["jobs", JOB, ".."], ["jobs", JOB, "candidates", ".."], ["commands", ".."],
      ["commands", "%2F"], ["jobs", `${JOB}%2F..`]] },
  { name: "vault/manage", template: "onlyfans-content/accounts/[accountId]/vault/manage/[...resource]", key: "resource", allowed: ["folders"],
    refused: [...encoded("folders"), ["folders", ".."], ["folders", "%2F"], ["assets", ".."], ["assets", "1%2F.."], ["folders", "1", ".."],
      ["folders", "..", "assets", "1"], ["assets", "-1"]] },
];
const get = (r: Route, segments: string[]) => call(r.template, { accountId: "of-a", [r.key]: segments });

if (ensureModuleMocks(import.meta.url, { controls: routes.length, rest: routes.length })) {
  beforeEach(() => { reset(); upstream(() => Response.json({ ok: false }, { status: 404 })); });

  for (const r of routes) {
    test(`control: ${r.name} relays the allowed path ${r.allowed.join("/")} upstream exactly once`, async () => {
      await get(r, r.allowed);
      assert.equal(calls.length, 1, `${r.name} ${r.allowed.join("/")} reached upstream ${calls.length} times`);
    });
  }

  for (const r of routes) {
    test(`C1: ${r.name} refuses "..", encoded "%2F" and unknown segments with a 4xx and no upstream call`, async () => {
      for (const segments of r.refused) {
        reset(); upstream(() => Response.json({ ok: false }, { status: 404 }));
        const response = await get(r, segments);
        const label = `${r.name} ${JSON.stringify(segments)}`;
        assert.equal(calls.length, 0, `${label} reached upstream: ${calls.map(c => c.url).join(", ")}`);
        assert.ok(response.status >= 400 && response.status < 500, `${label} answered ${response.status}, not a 4xx`);
      }
    });
  }
}

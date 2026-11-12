/**
 * Characterization (W4 lib-onlyfans-preview-2-plus2 C2 review; REVIEW inv 7 "No false success" + sources.ts:1-6 own
 * contract "the production build refuses fixture data outright; no fallback in either direction"). Holds today in
 * lib/onlyfans-preview/sources.ts:30-40 with NODE_ENV=production:
 *   - mode "fixture" throws OnlyFansApiNotConfiguredError (never sample data);
 *   - mode "live" yields the live source (kind "live"), whose reads go to the injected transport, never fixtures;
 *   - the REAL production default, {mode:"live", viewer} with no transport, reads through the global fetch at
 *     /api/onlyfans/accounts and reports a missing backend (synthetic 503) as "unavailable", never sample accounts.
 * NODE_ENV is read per call, so it is set before each call and restored (deleted when it was unset). Offline: the
 * injected-transport test uses a fake transport; the default test replaces globalThis.fetch with a recorder that
 * answers 503 (restored after).
 * Mutation-proven (D15): tests/rules/mutations/W4-lib-onlyfans-preview-2-plus2/m4-*, m5-*.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { OnlyFansApiNotConfiguredError } from "../../lib/onlyfans-preview/data-source";
import type { OnlyFansTransport } from "../../lib/onlyfans-preview/server-data-source";
import { createOnlyFansDataSource } from "../../lib/onlyfans-preview/sources";
import type { PreviewViewer } from "../../lib/onlyfans-preview/types";

const env = process.env as Record<string, string | undefined>;
const viewer = { canManage: false, scopedAccountIds: [] } as unknown as PreviewViewer;
function inProduction<T>(run: () => T): T {
  const before = env.NODE_ENV;
  env.NODE_ENV = "production";
  try { return run(); } finally { if (before === undefined) delete env.NODE_ENV; else env.NODE_ENV = before; }
}

test("production: the fixture source is refused, never handed out", () => {
  assert.throws(() => inProduction(() => createOnlyFansDataSource({ mode: "fixture", viewer })),
    (error: unknown) => error instanceof OnlyFansApiNotConfiguredError);
});

test("production: live mode yields the live source, whose reads hit the transport", async () => {
  const reads: string[] = [];
  const transport: OnlyFansTransport = {
    kind: "fake",
    async readAccounts() { reads.push("accounts"); return { outcome: "unavailable", message: "synthetic: no backend" }; },
    async readConversations() { reads.push("conversations"); return { outcome: "unavailable", message: "synthetic" }; },
    async readConversation() { reads.push("conversation"); return { outcome: "unavailable", message: "synthetic" }; },
  };
  const source = inProduction(() => createOnlyFansDataSource({ mode: "live", viewer, transport }));
  assert.equal(source.kind, "live");
  const state = await source.listAccounts();
  assert.equal(state.status, "unavailable", "an absent backend reads unavailable, not sample accounts");
  assert.deepEqual(reads, ["accounts"]);
});

test("production default (live, no transport injected): reads go to /api/onlyfans over fetch, never fixture data", async () => {
  const urls: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request) => {
    urls.push(String(url));
    return new Response(JSON.stringify({ error: "synthetic: no backend" }), { status: 503, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const source = inProduction(() => createOnlyFansDataSource({ mode: "live", viewer }));
    assert.equal(source.kind, "live");
    const state = await inProduction(() => source.listAccounts());
    assert.equal(urls.length, 1, "exactly one read reached the wire");
    assert.match(urls[0], /^\/api\/onlyfans\/accounts(?:\?|$)/);
    assert.equal(state.status, "unavailable", "a missing backend reads unavailable, not sample accounts");
  } finally {
    globalThis.fetch = original;
  }
});

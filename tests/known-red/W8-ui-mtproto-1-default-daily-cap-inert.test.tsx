/**
 * Known red (W8 ui-mtproto-1 H1, half-wired setting): Settings -> MTProto limits (components/mtproto/MtprotoLimitsPanel.tsx:41)
 * saves `defaultDailyCap`, hinted "The daily cap a new run or creator starts with", into app_settings via
 * lib/mtproto/limits.ts setMtprotoLimits. Nothing reads it when a run is built: app/mtproto-campaign/new/page.tsx renders
 * <RunBuilderForm creators flows/> and RunBuilderForm.tsx:81 seeds `useState(String(DEFAULT_DAILY_CAP))` (constant 30).
 * Condition: a saved Default daily cap of 10. Control: getMtprotoLimits() reads it back as 10. Red: the new run form's
 * `dailyCap` input still shows 30. Fake db only, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import { getMtprotoLimits, setMtprotoLimits } from "../../lib/mtproto/limits";
import NewMtprotoRunPage from "../../app/mtproto-campaign/new/page";

const CLONE_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
Object.assign(globalThis, { React });

const noop = () => {};
const router = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, hmrRefresh: noop };

async function seed(): Promise<void> {
  const db = new FakeDb();
  db.seed("clones", [{ id: CLONE_A, name: "Alpha", slug: "alpha", status: "active", business_username: null, account_phone: null }]);
  db.seed("mtproto_flows", []);
  __setMtDbForTest(db);
  await setMtprotoLimits({ defaultDailyCap: 10 }, "test");
}
test.after(() => __setMtDbForTest(null));

test("control: saved Default daily cap 10 is readable", async () => {
  await seed();
  assert.equal((await getMtprotoLimits()).defaultDailyCap, 10);
});

test("new run form seeds its daily cap from the saved Default daily cap", async () => {
  await seed();
  const el = await NewMtprotoRunPage();
  const html = renderToStaticMarkup(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <AppRouterContext.Provider value={router as any}>{el}</AppRouterContext.Provider>,
  );
  const input = html.match(/<input[^>]*name="dailyCap"[^>]*>/)?.[0];
  assert.ok(input, "dailyCap input rendered");
  const value = input.match(/value="([^"]*)"/)?.[1];
  assert.equal(value, "10", `new run form seeds daily cap ${value}, ignoring saved Default daily cap 10`);
});

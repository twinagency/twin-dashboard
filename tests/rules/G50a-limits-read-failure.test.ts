// Regression guard (G50a): was KNOWN RED tests/known-red/W9-lib-mtproto-2-limits-read-failure-resets-brakes.test.ts (local branch rwl/W9-lib-mtproto-2 @ 9459f9c2), fixed in this PR (lib/mtproto/limits.ts, app/mtproto-campaign/settings/page.tsx, components/mtproto/SettingsView.tsx). Original header below.
/**
 * KNOWN RED (W9 lib-mtproto-2 F5, = W4 O8 / W6 F7): a failed limits READ makes a one-field limits WRITE reset every
 * other brake to its default. lib/mtproto/limits.ts:80-95 getMtprotoLimits never throws (any read error returns
 * MTPROTO_LIMITS_DEFAULTS), and setMtprotoLimits (:102-104) merges the input onto that "before" and then upserts the
 * WHOLE object (:127-129). Defaults are warmupHours 0, minSendGapMinutes 0, firstDayMaxSends 0 (brakes off) and
 * minSilenceHours 24.
 * Condition: stored row has warmupHours 24, minSendGapMinutes 10, firstDayMaxSends 5, minSilenceHours 72; the
 * app_settings select fails; setMtprotoLimits({ hourlyCap: 7 }).
 * Turns green when setMtprotoLimits either throws or leaves those four stored fields unchanged on a failed read.
 * Control: read works, the same call keeps every other field.
 * Promoted: runs in `npm run test:rules`. Offline FakeDb, no network.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { __setMtDbForTest } from "../../lib/mtproto/db";
import { FakeDb } from "../../lib/mtproto/tests/fake-db";
import { setMtprotoLimits } from "../../lib/mtproto/limits";
import { MTPROTO_LIMITS_KEY } from "../../lib/mtproto/types";

const STORED = { hourlyCap: 20, defaultDailyCap: 30, jitterMinMs: 4_000, jitterMaxMs: 25_000, minSilenceHours: 72, floodWaitMultiplier: 2, warmupHours: 24, minSendGapMinutes: 10, firstDayMaxSends: 5 };
const BRAKES = ["warmupHours", "minSendGapMinutes", "firstDayMaxSends", "minSilenceHours"] as const;

function seeded(): FakeDb {
  const db = new FakeDb();
  db.seed("app_settings", [{ key: MTPROTO_LIMITS_KEY, value: JSON.stringify(STORED) }]);
  __setMtDbForTest(db);
  return db;
}
const stored = (db: FakeDb) => JSON.parse(db.rows("app_settings").find((r) => r.key === MTPROTO_LIMITS_KEY)!.value as string);

test.after(() => __setMtDbForTest(null));

test("control: read works, setMtprotoLimits({hourlyCap: 7}) keeps every other brake", async () => {
  const db = seeded();
  await setMtprotoLimits({ hourlyCap: 7 }, "operator");
  const row = stored(db);
  assert.equal(row.hourlyCap, 7, "harness reaches the upsert");
  for (const k of BRAKES) assert.equal(row[k], STORED[k], k);
});

test("F5: limits read fails, setMtprotoLimits({hourlyCap: 7}) must throw or leave the stored brakes unchanged", async () => {
  const db = seeded();
  db.fail("app_settings", "select", { message: "read timeout" });
  try {
    await setMtprotoLimits({ hourlyCap: 7 }, "operator");
  } catch {
    // throwing is an acceptable fix; the stored row is what matters
  }
  const row = stored(db);
  assert.deepEqual(
    Object.fromEntries(BRAKES.map((k) => [k, row[k]])),
    Object.fromEntries(BRAKES.map((k) => [k, STORED[k]])),
    "a failed read made a hourlyCap-only save overwrite the stored brakes with defaults (warmup 0 = brake off)",
  );
});

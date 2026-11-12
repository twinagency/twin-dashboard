import "../support/admin-route-env";
/**
 * KNOWN RED (W4 api-admin-plus1 F13, docs/review/W4/api-admin-plus1.md): GET /api/admin/v1/mtproto/preview builds
 * its filters by hand and drops `includeLegacy` and `excludeIds`, which create_run keeps via sanitizeFilters and
 * lib/mtproto/audience.ts acts on, so the previewed audience is not the run's audience. Drives the real route and
 * the real computeAudiencePreview; PostgREST faked at the wire (tests/support/admin-wire.ts).
 * Control: without either param, the legacy import is excluded as legacy_import and all three fans are in the pool.
 * Turns green when preview reads includeLegacy / excludeIds the way create_run does.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, adminRequest, installWire } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/mtproto/preview/route";
import { computeAudiencePreview } from "../../lib/mtproto/audience";
import { DEFAULT_DAILY_CAP, DEFAULT_HOLDOUT_PCT } from "../../lib/mtproto/types";

const EXCLUDED = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const fan = (id: string, telegram_id: number, legacy_id: string | null) => ({
  id, clone_id: CLONE_ID, telegram_id, name: id, language_code: "en", blocked: false, blocked_reason: null, paused: false,
  is_active: true, minor_flagged_at: null, first_seen_at: "2026-01-01T00:00:00Z", legacy_id, purchase_count: 1,
  last_message_received: "2026-09-01T00:00:00Z", total_spent_stars: 100, spend_tier: "low", is_test: false,
});
const users = [
  fan("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 1001, null),
  fan("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1002, "legacy-42"),
  fan(EXCLUDED, 1003, null),
];
async function preview(q: string) {
  const w = installWire({ tables: { users } });
  try {
    const res = await GET(adminRequest(`/api/admin/v1/mtproto/preview?clone=${CLONE_ID}${q}`));
    const body = await res.json();
    assert.equal(res.status, 200, JSON.stringify(body));
    return body.preview as { candidatePool: number; excluded: Record<string, number> };
  } finally { w.restore(); }
}

test("control: default preview excludes the legacy import and pools all three fans", async () => {
  const p = await preview("");
  assert.equal(p.candidatePool, 3);
  assert.equal(p.excluded.legacy_import, 1);
});

test("control: computeAudiencePreview itself honours includeLegacy and excludeIds on this fake wire", async () => {
  const w = installWire({ tables: { users } });
  try {
    const p = await computeAudiencePreview({ cloneIds: [CLONE_ID], segment: "all_silent", includeLegacy: true, excludeIds: [EXCLUDED] },
      { dailyCap: DEFAULT_DAILY_CAP, runCap: null, holdoutPct: DEFAULT_HOLDOUT_PCT });
    assert.equal(p.candidatePool, 2);
    assert.equal(p.excluded.legacy_import, 0);
  } finally { w.restore(); }
});

test("F13: includeLegacy=true reaches the preview (legacy import not excluded), as it does for create_run", async () => {
  const p = await preview("&includeLegacy=true");
  assert.equal(p.excluded.legacy_import, 0, "preview ignored includeLegacy");
});

test("F13: excludeIds reaches the preview (excluded fan not in the pool), as it does for create_run", async () => {
  const p = await preview(`&excludeIds=${EXCLUDED}`);
  assert.equal(p.candidatePool, 2, "preview ignored excludeIds");
});

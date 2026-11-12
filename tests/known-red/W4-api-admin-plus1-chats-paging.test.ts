import "../support/admin-route-env";
/**
 * KNOWN RED (W4 api-admin-plus1 F9, docs/review/W4/api-admin-plus1.md): GET /api/admin/v1/chats pages on
 * `created_at` alone and the next page asks `created_at < nextBefore`, so a message sharing the boundary
 * timestamp with the last row of a page is never returned (silent transcript loss for sim runs).
 * Drives the real route; PostgREST faked at the wire (tests/support/admin-wire.ts) with real lt/order/limit
 * semantics. Control: distinct timestamps page through every row.
 * Turns green with a (created_at, id) keyset cursor. The pager follows `nextCursor` (as ?cursor=) if the fix adds
 * one, else `nextBefore` (as ?before=).
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, adminRequest, fakeClone, installWire } from "../support/admin-wire";
import { GET } from "../../app/api/admin/v1/chats/route";

const msg = (id: number, at: string) => ({ id, clone_id: CLONE_ID, telegram_id: 777, role: "user", content: `m${id}`, created_at: at });

async function pageAll(rows: ReturnType<typeof msg>[], limit: number): Promise<number[]> {
  const w = installWire({ tables: { clones: [fakeClone()], chat_history: rows } });
  try {
    const seen: number[] = [];
    let q = "";
    for (let i = 0; i < 10; i++) {
      const res = await GET(adminRequest(`/api/admin/v1/chats?clone=${CLONE_ID}&fan=777&limit=${limit}${q}`));
      const body = await res.json();
      assert.equal(res.status, 200, JSON.stringify(body));
      seen.push(...body.messages.map((m: { id: number }) => m.id));
      const cursor = body.nextCursor !== undefined ? ["cursor", body.nextCursor] : ["before", body.nextBefore];
      if (cursor[1] == null) break;
      q = `&${cursor[0]}=${encodeURIComponent(String(cursor[1]))}`;
    }
    return seen.sort((a, b) => a - b);
  } finally { w.restore(); }
}

test("control: distinct timestamps page through every message", async () => {
  const rows = [msg(1, "2026-11-01T10:00:00.000Z"), msg(2, "2026-11-01T10:01:00.000Z"), msg(3, "2026-11-01T10:02:00.000Z"), msg(4, "2026-11-01T10:03:00.000Z")];
  assert.deepEqual(await pageAll(rows, 2), [1, 2, 3, 4]);
});

test("F9: two messages sharing the page-boundary timestamp are both returned across pages", async () => {
  const T = "2026-11-01T10:01:00.000Z";
  const rows = [msg(1, "2026-11-01T10:00:00.000Z"), msg(2, T), msg(3, T), msg(4, "2026-11-01T10:03:00.000Z")];
  assert.deepEqual(await pageAll(rows, 2), [1, 2, 3, 4], "a message at the boundary timestamp was skipped");
});

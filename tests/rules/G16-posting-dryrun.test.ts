import "../support/admin-route-env";
// Regression guard (G16): promoted from known-red tests/known-red/W4-api-admin-plus1-posting-dryrun.test.ts as a regression guard. Original header below.
/**
 * KNOWN RED (W4 api-admin-plus1 F1, docs/review/W4/api-admin-plus1.md): POST /api/admin/v1/posting/write
 * `delete_story` / `delete_channel_post` ignore `dryRun` (route header says every action takes it), so a probe
 * with dryRun:true deletes a live story/post. Drives the real route; the wire (PostgREST + Telegram Bot API) is
 * faked by tests/support/admin-wire.ts. Controls: a dryRun story never reaches Telegram postStory, and each delete
 * WITHOUT dryRun reaches Telegram and the audit log exactly once (so the reds below are not passing on a dead harness).
 * Turns green when deletes refuse dryRun (400) or answer a would-delete preview (200, dryRun:true) without calling
 * Telegram or logging a delete.
 * Team's Claude owns the fix. Not wired into npm scripts on purpose.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { CLONE_ID, adminRequest, callJson, fakeClone, installWire } from "../support/admin-wire";
import { POST } from "../../app/api/admin/v1/posting/write/route";

function wire() {
  return installWire({
    tables: {
      clones: [fakeClone()],
      users: [{ id: "u1", clone_id: CLONE_ID, business_connection_id: "bc-1", last_message_received: "2026-11-01T00:00:00Z" }],
    },
    telegram: (m) => {
      if (m === "getBusinessConnection") return { ok: true, result: { is_enabled: true, rights: { can_manage_stories: true }, user: { id: 42 } } };
      if (m === "getChat") return { ok: true, result: { type: "channel", id: -100123, username: "fakechan", title: "Fake" } };
      if (m === "postStory") return { ok: true, result: { id: 9 } };
      return { ok: true, result: true };
    },
    http: (url) => (url.hostname === "fake-media.invalid" ? new Response(new Uint8Array(64).fill(1), { headers: { "content-type": "video/mp4" } }) : undefined),
  });
}
type W = ReturnType<typeof wire>;
const adminWrites = (w: W, action: string) =>
  w.rest("system_logs", "POST").filter((c) => String((c.body as { message?: string })?.message ?? "").includes(action));
const DELETE_STORY = { action: "delete_story", clone: CLONE_ID, storyId: 5 };
const DELETE_POST = { action: "delete_channel_post", clone: CLONE_ID, channel: "@fakechan", messageIds: [7] };

async function post(json: Record<string, unknown>) {
  const w = wire();
  try {
    const r = await callJson(POST, adminRequest("/api/admin/v1/posting/write", { json }));
    await w.idle();
    return { ...r, w };
  } finally { w.restore(); }
}
const refusedOrPreview = ({ status, body }: { status: number; body: { dryRun?: unknown } }) =>
  assert.ok(status === 400 || (status === 200 && body?.dryRun === true), `dryRun delete answered ${status} ${JSON.stringify(body)}`);

test("control: story with dryRun:true checks rights but never calls Telegram postStory", async () => {
  const { status, body, w } = await post({ action: "story", clone: CLONE_ID, mediaUrl: "https://fake-media.invalid/clip.mp4", mediaType: "video", dryRun: true });
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.dryRun, true);
  assert.ok(w.telegram("getBusinessConnection").length > 0, "harness reaches lib/posting's Telegram transport");
  assert.equal(w.telegram("postStory").length, 0);
  assert.equal(adminWrites(w, "posting:story").length, 0);
});

test("control: delete_story without dryRun reaches Telegram deleteStory and the audit log exactly once", async () => {
  const { status, body, w } = await post(DELETE_STORY);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(w.telegram("deleteStory").length, 1);
  assert.equal(adminWrites(w, "posting:delete_story").length, 1, "idle() waits for the fire-and-forget audit insert");
});

test("control: delete_channel_post without dryRun reaches Telegram deleteMessages and the audit log exactly once", async () => {
  const { status, body, w } = await post(DELETE_POST);
  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(w.telegram("deleteMessages").length, 1);
  assert.equal(adminWrites(w, "posting:delete_channel_post").length, 1);
});

test("F1: delete_story with dryRun:true is refused or previewed, never calls Telegram deleteStory nor logs a delete", async () => {
  const r = await post({ ...DELETE_STORY, dryRun: true });
  assert.equal(r.w.telegram("deleteStory").length, 0, "dryRun:true reached Telegram deleteStory (irreversible)");
  assert.equal(adminWrites(r.w, "posting:delete_story").length, 0, "dryRun:true was audited as a real delete");
  refusedOrPreview(r);
});

test("F1: delete_channel_post with dryRun:true is refused or previewed, never calls Telegram deleteMessages nor logs a delete", async () => {
  const r = await post({ ...DELETE_POST, dryRun: true });
  assert.equal(r.w.telegram("deleteMessages").length, 0, "dryRun:true reached Telegram deleteMessages (irreversible)");
  assert.equal(adminWrites(r.w, "posting:delete_channel_post").length, 0, "dryRun:true was audited as a real delete");
  refusedOrPreview(r);
});

// G16 Codex final P1: a duplicated dryRun field (multipart false then true, or a JSON array) must not slip past
// a first-value read. Refused 400, zero Telegram calls, no delete logged.
async function postForm(fields: [string, string][]) {
  const w = wire();
  try {
    const form = new FormData();
    for (const [k, v] of fields) form.append(k, v);
    const r = await callJson(POST, adminRequest("/api/admin/v1/posting/write", { form }));
    await w.idle();
    return { ...r, w };
  } finally { w.restore(); }
}
const telegramCalls = (w: W) => w.telegram().length;
for (const [action, extra, log] of [
  ["delete_story", [["storyId", "5"]], "posting:delete_story"],
  ["delete_channel_post", [["channel", "@fakechan"], ["messageIds", "7"]], "posting:delete_channel_post"],
] as [string, [string, string][], string][]) {
  test(`G16: ${action} with multipart dryRun=false then dryRun=true is refused before any Telegram call`, async () => {
    const r = await postForm([["action", action], ["clone", CLONE_ID], ...extra, ["dryRun", "false"], ["dryRun", "true"]]);
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(telegramCalls(r.w), 0, "a duplicated dryRun reached Telegram");
    assert.equal(adminWrites(r.w, log).length, 0);
  });
  test(`G16: ${action} with JSON dryRun [false, true] is refused before any Telegram call`, async () => {
    const r = await post({ ...(action === "delete_story" ? DELETE_STORY : DELETE_POST), dryRun: [false, true] });
    assert.equal(r.status, 400, JSON.stringify(r.body));
    assert.equal(telegramCalls(r.w), 0, "a duplicated dryRun reached Telegram");
  });
}
test("G16 control: delete_story with a single explicit dryRun=false still deletes", async () => {
  const r = await postForm([["action", "delete_story"], ["clone", CLONE_ID], ["storyId", "5"], ["dryRun", "false"]]);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.w.telegram("deleteStory").length, 1);
});

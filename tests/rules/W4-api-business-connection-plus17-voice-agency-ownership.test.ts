/**
 * W4 api-business-connection-plus17 C2: /api/voice proxies a Telegram voice note for an agency login only for its own
 * clone (requireCloneAccess, app/api/voice/route.ts:29, refused 403 by lib/dashboard-reader.ts) and only for a file that
 * clone's chat_history actually carries (:30-33, 404). Both refusals happen before the bot token is read, before
 * Telegram is asked, and before the module cache is consulted, so an admin's cached copy of another clone's note is
 * never served to an agency.
 * The 403 in the first test pins the ROUTE's requireCloneAccess (mutation c2-m2 removes it and the test goes red with
 * 404). Isolation does not rest on that check alone: the agency transport (lib/agency-fetch.ts dashboardFetch ->
 * lib/agency-query.ts scopeReadUrl) appends the viewer's clone scope to the chat_history read, so without the route
 * check clone B's file is still not found (404) and Telegram is still not asked.
 * Only the wire is faked: PostgREST answers from in-memory rows honouring every filter (including that appended scope),
 * Telegram answers getFile and the file download.
 * Mutation proofs: tests/rules/mutations/W4-api-business-connection-plus17/c2-*.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { agency, anyOf, as, botTokenRead, CLONE_A, CLONE_B, isRest, selects, table, telegramFile, TELEGRAM_HOST, withWire, type Call } from "./W4-api-business-connection-plus17-helpers";
import type { DashboardAccess } from "../../lib/dashboard-access";
import { GET } from "../../app/api/voice/route";

const AUDIO = new Uint8Array([0x4f, 0x67, 0x67, 0x53, 9]);
// Each test uses its own file id, so the route's module cache never carries an answer from one test into another
// (except in the cache-poisoning test, where that is the point).
const CHAT = [
  { id: "msg-a", clone_id: CLONE_A, meta: { tg_file_id: "file-a-1" } },
  { id: "msg-b1", clone_id: CLONE_B, meta: { tg_file_id: "file-b-1" } },
  { id: "msg-b2", clone_id: CLONE_B, meta: { tg_file_id: "file-b-2" } },
];
const database = (c: Call) => {
  if (isRest(c, "chat_history")) return table(CHAT, c);
  if (isRest(c, "platform_cuts")) return table([], c); // the agency transport resolves the viewer's cut on every read
  return undefined;
};

async function voice(viewer: DashboardAccess, clone: string, file: string) {
  return withWire(anyOf(database, botTokenRead([CLONE_A, CLONE_B]), telegramFile(AUDIO)), async stub => {
    const res = await as(viewer, () => GET(new NextRequest(`http://localhost/api/voice?clone=${clone}&file=${file}`)));
    const bytes = new Uint8Array(await res.arrayBuffer());
    return {
      status: res.status,
      bytes: bytes.length,
      telegramCalls: stub.to(TELEGRAM_HOST).length,
      tokenReads: stub.calls.filter(c => isRest(c, "clones") && selects(c, "bot_token")).length,
    };
  });
}

test("agency: another clone's voice note is refused 403 before the bot token is read or Telegram is asked", async () => {
  const r = await voice(agency([CLONE_A]), CLONE_B, "file-b-1");
  assert.equal(r.status, 403);
  assert.equal(r.tokenReads, 0, "the other clone's bot_token was read");
  assert.equal(r.telegramCalls, 0, "Telegram was asked");
});

test("agency: its own clone with a file its chat_history does not carry answers 404 and never asks Telegram", async () => {
  const r = await voice(agency([CLONE_A]), CLONE_A, "file-not-in-chat");
  assert.equal(r.status, 404);
  assert.equal(r.tokenReads, 0, "the bot_token was read");
  assert.equal(r.telegramCalls, 0, "Telegram was asked");
});

test("agency: another clone's note an admin already cached is still refused 403 with zero Telegram calls", async () => {
  const admin = await voice(null, CLONE_B, "file-b-2");
  assert.equal(admin.status, 200, "precondition: the admin request streams and caches clone B's note");
  const r = await voice(agency([CLONE_A]), CLONE_B, "file-b-2");
  assert.equal(r.status, 403, `the cached note answered ${r.status} (${r.bytes} bytes) to clone A's agency`);
  assert.equal(r.telegramCalls, 0, "Telegram was asked");
});

test("agency: its own clone with a file its chat_history carries streams the audio (harness can succeed)", async () => {
  const r = await voice(agency([CLONE_A]), CLONE_A, "file-a-1");
  assert.equal(r.status, 200);
  assert.equal(r.bytes, AUDIO.length);
  assert.equal(r.tokenReads, 1);
  assert.equal(r.telegramCalls, 2, "getFile + the file download");
});

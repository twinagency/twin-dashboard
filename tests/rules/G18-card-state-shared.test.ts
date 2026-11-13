/**
 * Rule (G18 rwl R2, S1; not from the known-red corpus): a card's state after a live /approve 409 and after a reload
 * comes from ONE mapping (lib/ai-claim-state.ts cardState). /approve returns the raw claim state; applied renders
 * "approved" on both paths, claimed and unknown render "unknown" on both paths. Both chat clients use the shared
 * mapping and none maps a claim state inline.
 * Red on 39cfedec: lib/ai-claim-state.ts did not exist, the live 409 for an applied card rendered "unknown" while the
 * reload rendered "approved", and a claimed card answered state "unknown" instead of its raw state.
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-card-state-shared.test.ts
 */
import { CLONE, inWorkStore, jsonRequest, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, test } from "node:test";
import { approveOutcome, cardState } from "../../lib/ai-claim-state";

const CONV = "e1e1e1e1-e1e1-4e1e-8e1e-e1e1e1e1e1e1", MSG = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";
const A = "c3c3c3c3-c3c3-4c3c-8c3c-c3c3c3c3c3c3";
const ARGS = { clone: CLONE.id, status: "paused" };

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
const seed = (claims?: Record<string, string>) => {
  pg.reset();
  pg.seed("clones", [{ ...CLONE, status: "active" }]);
  pg.seed("ai_conversations", [{ id: CONV, title: "t", created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-01T00:00:00Z" }]);
  pg.seed("ai_messages", [{ id: MSG, conversation_id: CONV, role: "assistant", content: "a", created_at: "2026-11-01T00:00:00Z",
    meta: { proposals: [{ id: A, tool: "setCloneStatus", args: ARGS, summary: "Pause it.", heavy: true }], ...(claims ? { claims } : {}) } }]);
};
beforeEach(() => seed());

async function approve() {
  const { POST } = await import("../../app/api/ai-assistant/approve/route");
  return inWorkStore(async () => {
    const r = await POST(jsonRequest("/api/ai-assistant/approve", { conversationId: CONV, proposalId: A, tool: "setCloneStatus", args: ARGS }));
    return { ok: r.ok, status: r.status, json: await r.json() };
  });
}
async function reloadState() {
  const { GET } = await import("../../app/api/ai-assistant/conversations/[id]/route");
  const res = await GET(new Request(`http://127.0.0.1/api/ai-assistant/conversations/${CONV}`) as any, { params: Promise.resolve({ id: CONV }) });
  const m = (await res.json()).messages.find((x: any) => x.id === MSG);
  return cardState(m.meta?.claims?.[A]);
}

test("S1: an already-applied card is 'approved' after the live 409 and after a reload", async () => {
  assert.equal((await approve()).status, 200);
  const replay = await approve();
  assert.equal(replay.status, 409, JSON.stringify(replay.json));
  assert.equal(replay.json.state, "applied", "/approve returns the raw claim state");
  const live = approveOutcome(replay.ok, replay.json, "Pause it.");
  assert.equal(live.state, "approved", "the live 409 for an applied card is not 'approved'");
  assert.equal(live.state, await reloadState(), "live 409 and reload disagree on an applied card");
  assert.ok(live.applied, "an applied card that vanishes live must leave an Applied line");
  assert.equal(pg.writes("PATCH", "clones").length, 1, "the replay ran the write");
});

for (const claim of ["claimed", "unknown"] as const) {
  test(`S1: a ${claim} card is 'unknown' after the live 409 and after a reload`, async () => {
    seed({ [A]: claim });
    const r = await approve();
    assert.equal(r.status, 409, JSON.stringify(r.json));
    assert.equal(r.json.state, claim, "/approve returns the raw claim state");
    assert.doesNotMatch(r.json.error, /already applied/);
    const live = approveOutcome(r.ok, r.json, "Pause it.");
    assert.equal(live.state, "unknown");
    assert.equal(live.state, await reloadState(), `live 409 and reload disagree on a ${claim} card`);
    assert.equal(pg.writes("PATCH", "clones").length, 0);
  });
}

test("S1: success, refusal and an unclaimed reload map through the same module", () => {
  assert.deepEqual(approveOutcome(true, { ok: true, summary: "Paused." }, "Pause it."), { state: "approved", applied: "Paused." });
  assert.equal(approveOutcome(false, { ok: false, error: "nope" }, "s").state, "pending", "a refusal must stay retryable");
  assert.equal(approveOutcome(false, null, "s").state, "pending");
  assert.equal(cardState(undefined), "pending");
});

test("S1/S2: both clients use the shared mapping from lib/, none maps a claim state inline", () => {
  for (const f of ["app/ai/AiChat.tsx", "components/TwinPanel.tsx"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.match(src, /from "@\/lib\/ai-claim-state"/, `${f} does not import lib/ai-claim-state`);
    assert.match(src, /approveOutcome\(/, `${f} does not map /approve through approveOutcome`);
    assert.doesNotMatch(src, /state === "applied"|state === "claimed"|app\/api\/ai-assistant\/claim-state/, `${f} maps a claim state inline`);
  }
});

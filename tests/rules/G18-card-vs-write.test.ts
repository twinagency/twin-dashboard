/**
 * KNOWN RED (W4 F6, docs/review/W4/api-ai-assistant-plus2.md): the approval card (proposals.ts describeProposal)
 * and the executor (write-tools.ts execSetFanCredits) read setFanCredits args differently. For credits null / -5
 * the card says "...balance to null." / "to -5." while the wire PATCH writes message_credits 0: the operator
 * approves one thing and the fan's balance is wiped.
 * Control: credits 50 → card states 50 and the PATCH writes 50.
 * Red: whenever a PATCH users happens, the card must state the value that was written (a fix that refuses the
 * proposal or the write also passes: nothing written, nothing mis-stated).
 * Run: env -i PATH="$PATH" HOME="$HOME" NODE_ENV=test nice -n 10 node --import tsx --test tests/rules/G18-card-vs-write.test.ts (copied from tests/known-red/W4-api-ai-assistant-plus2-card-vs-write.test.ts)
 * DECLARED BYPASS: Next workAsyncStorage fake store (see harness header); PostgREST faked on 127.0.0.1.
 */
import { CLONE, FAN_ID, inWorkStore, startFakePostgrest, type FakePostgrest } from "./G18-harness";
import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";

let pg: FakePostgrest;
before(async () => { pg = await startFakePostgrest(); });
after(async () => { await pg.close(); });
beforeEach(() => {
  pg.reset();
  pg.respond((c) => (c.table === "users" && c.method === "GET"
    ? { body: [{ id: FAN_ID, clone_id: CLONE.id, stated_name: "Sam", name: "Sam", telegram_id: 1001, message_credits: 40 }] }
    : undefined));
});

async function cardAndWire(credits: unknown): Promise<{ card: string; written: unknown[] }> {
  const { describeProposal } = await import("../../app/api/ai-assistant/proposals");
  const { executeWriteTool } = await import("../../app/api/ai-assistant/write-tools");
  const args = { userId: FAN_ID, credits };
  let card = "";
  try { card = describeProposal("setFanCredits", args).summary; } catch { card = ""; }
  try { await inWorkStore(() => executeWriteTool("setFanCredits", args)); } catch { /* a refusal is fine */ }
  const written = pg.writes("PATCH", "users").map((c) => c.body?.message_credits);
  return { card, written };
}
const states = (card: string, n: unknown) => new RegExp(`(?<![\\d.-])${String(n).replace(/[.-]/g, "\\$&")}(?!\\d|\\.\\d)`).test(card);

test("control: credits 50 → the card says 50 and the wire writes 50", async () => {
  const { card, written } = await cardAndWire(50);
  assert.deepEqual(written, [50]);
  assert.ok(states(card, 50), `card: ${card}`);
});

for (const credits of [null, -5]) {
  test(`F6: credits ${credits} → the card states the balance that is actually written`, async () => {
    const { card, written } = await cardAndWire(credits);
    for (const w of written) assert.ok(states(card, w), `card "${card}" approved, but the wire wrote message_credits ${w}`);
  });
}

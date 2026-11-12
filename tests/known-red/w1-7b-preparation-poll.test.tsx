// KNOWN RED (W1 lane 7b F5 + F6, REVIEW.md "Unbounded polling or retries in client components"; RISKS D11):
// F5 Preparation.tsx:45-48 polls GET every 10 s for as long as status is "configured", also after the vault job is complete; no cap,
//    backoff or idle stop. Threshold (lane choice): at most 60 reads in 60 simulated minutes of identical answers (a fixed 10 s poll
//    makes ~360). Any cap, backoff, idle stop or stop-after-complete satisfies it.
// F6 Preparation.tsx:32-37,47: polls are not serialized (`inFlight` guards sends only), every read bumps `generation` and drops older
//    replies, and the 15 s read timeout is longer than the 10 s interval, so a backend that answers in 12 s never updates the status.
//    Threshold (lane choice): a later answer is rendered within 60 simulated seconds.
// Fake clock: node:test mock.timers for setInterval/setTimeout; React and the harness keep the real timers captured before enabling.
// Not exercised: AbortSignal.timeout runs on the real clock, not the fake one, so the 15 s read timeout (Preparation.tsx:35) never fires
// here. A fix must still keep its read timeout above real backend latency, or slow reads abort instead of landing (inferred).
// The document is visible (pretendToBeVisual), so a visibility-pause fix is not mistaken for a bound. Team's Claude owns the fix.
// Not wired into npm scripts; init.sh does not run it yet. Offline: jsdom, global fetch stubbed, no network.
import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";
import { act } from "react";
import { flush, openPreparation, pageText, preparationConfigured, preparationRead, stubFetch, unmount } from "../helpers/w1-7b-dom";

const vault = (status: string, pagesRead: number) => ({ jobId: "synthetic-job-1", status, pagesRead, itemsSeen: 120, error: null, selected: 120 });
let stub: ReturnType<typeof stubFetch>;
/** `answer(n)` is the n-th GET (0-based); `delayMs` is simulated backend latency (fake setTimeout). Polling must never write: an unexpected
 * POST is recorded (and answered with a lost reply) and each test asserts `stub.posts.length === 0` at the end. */
async function open(answer: (n: number) => unknown, delayMs = 0) {
  mock.timers.enable({ apis: ["setInterval", "setTimeout"] });
  stub = stubFetch({ read: async (_url, n) => {
    const body = answer(n);
    if (delayMs) await new Promise(resolve => setTimeout(resolve, delayMs));
    return preparationRead(body);
  } });
  await openPreparation(stub);
  await flush();
}
async function advance(seconds: number, until?: () => boolean) {
  for (let s = 0; s < seconds; s++) {
    await act(async () => { mock.timers.tick(1000); });
    await flush();
    if (until?.()) return s + 1;
  }
  return null;
}
afterEach(async () => { await unmount(); mock.timers.reset(); }); // unmount first: its interval belongs to the fake clock

test("control: a fast read whose next answer changed is rendered after one poll interval", async () => {
  await open(n => preparationConfigured("fixture", { vault: vault("running", n === 0 ? 0 : 5) }));
  assert.match(pageText(), /0 pages recorded/);
  const after = await advance(30, () => /5 pages recorded/.test(pageText()));
  assert.ok(after !== null, `the changed status is rendered within 30 simulated s; page says: ${document.querySelector("[data-preparation-status]")?.textContent}`);
  assert.equal(stub.posts.length, 0, "polling never writes");
});

test("F5: a finished vault with unchanged answers is not polled every 10 s for an hour", async () => {
  await open(() => preparationConfigured("fixture", { vault: vault("complete", 4) }));
  assert.match(pageText(), /Vault complete/);
  await advance(60 * 60);
  assert.equal(stub.posts.length, 0, "polling never writes");
  assert.ok(stub.reads <= 60, `${stub.reads} preparation reads in 60 simulated minutes of identical answers (bound: 60)`);
});

test("F6: a backend that answers in 12 s still updates the status", async () => {
  await open(n => preparationConfigured("fixture", { vault: vault("running", n) }), 12_000);
  assert.ok(await advance(12, () => /0 pages recorded/.test(pageText())), "precondition: the first (slow) read renders");
  const after = await advance(60, () => /[1-9]\d* pages recorded/.test(pageText()));
  assert.ok(after !== null, `no later answer rendered within 60 simulated s (${stub.reads} reads started); page says: ${document.querySelector("[data-preparation-status]")?.textContent}`);
  assert.equal(stub.posts.length, 0, "polling never writes");
});

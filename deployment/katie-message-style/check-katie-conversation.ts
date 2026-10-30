import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { HttpError } from "grammy";
import { config } from "../src/config.js";
import { runAs } from "../src/context.js";
import { loadChat, resetChat } from "../src/memory.js";
import { processTurn } from "../src/deliver.js";
import { girlFromRow } from "../src/girls/index.js";
import { render, renderParts, previewParts } from "../src/girls/template.js";
import { KATIE_CLONE_ID, conversationSettings, conversationBubbles, randomDelay, waitWhileCurrent } from "../src/conversation-style.js";
import { M, turnRig, installModelStub, restoreFetch } from "./lib/turn-rig.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "check-katie-conversation-"));
const saved = { data: config.dataDir, logs: config.logDir, random: Math.random };
config.dataDir = path.join(tmp, "data"); config.logDir = path.join(tmp, "logs");
installModelStub(); M.rawStructured = "exact";
const text = "That sounds like a lovely evening. I hope you're enjoying the match!";
const settings = conversationSettings({ id: KATIE_CLONE_ID })!;
const fan = 985031;
let passed = 0;
const check = async (name: string, fn: () => unknown | Promise<unknown>) => { await fn(); passed++; console.log("PASS " + name); };
function rig(katie = true) {
  const r = turnRig(); const vars = r.deps.girl.vars;
  r.deps.girl = girlFromRow({ id: katie ? KATIE_CLONE_ID : "another-creator", slug: r.slug, name: "Katie Price" }, () => vars);
  let now = 100000;
  r.deps.now = () => now;
  const waits: number[] = [], sentAt: number[] = [], prepared: any[] = [];
  (r.deps as any).wait = async (ms: number) => { waits.push(ms); now += ms; };
  r.tg.on("sendMessage", () => { sentAt.push(now); return undefined; });
  (r.deps as any).intake = { prepared: (v: any) => prepared.push(v), acknowledgementId: () => undefined };
  M.reply = JSON.stringify({ selection: "none", reply: text, caption: "" });
  let charges = 0;
  const job = { chatId: fan, who: "@fixture", text: "I'm watching the football tonight.", epoch: 0, route: { bcid: "fixture-business" }, receivedAt: now, onTextAcknowledged: () => { charges++; } };
  return { ...r, vars, job, waits, sentAt, prepared, advance: (ms: number) => { now += ms; }, charges: () => charges };
}
try {
  await check("only the exact Katie clone receives pacing; settings use saved values", () => {
    assert.equal(conversationSettings({ id: "not-katie", slug: "katie-price" }), undefined);
    assert.deepEqual(settings, { waitMinMs: 25000, waitMaxMs: 90000, bubbleMinMs: 2000, bubbleMaxMs: 5000, splitChance: .35 });
    assert.equal(conversationSettings({ id: KATIE_CLONE_ID, response_wait_min: 30, response_wait_max: 40, double_texts: false })?.waitMinMs, 30000);
    assert.equal(conversationSettings({ id: KATIE_CLONE_ID, double_texts: false })?.splitChance, 0);
  });
  await check("random delays cover the configured bounds with varied intermediate values", () => {
    assert.equal(randomDelay(25000, 90000, () => 0), 25000);
    assert.equal(randomDelay(25000, 90000, () => 1), 90000);
    assert.equal(randomDelay(25000, 90000, () => .5), 57500);
  });
  await check("splitting is occasional, preserves words, and keeps short replies together", () => {
    const split = conversationBubbles(text, settings, () => 0);
    assert.equal(split.length, 2); assert.equal(split.join(" "), text);
    assert.deepEqual(conversationBubbles(text, settings, () => .8), [text]);
    assert.deepEqual(conversationBubbles("Sounds good!", settings, () => 0), ["Sounds good!"]);
    const one = "That sounds like a lovely evening and I hope you're enjoying it.";
    assert.deepEqual(conversationBubbles(one, settings, () => 0), [one]);
    const signoff = "That sounds like a lovely evening. x";
    assert.deepEqual(conversationBubbles(signoff, settings, () => 0), [signoff]);
  });
  await check("Katie prompt and both dashboard previews agree; other creators retain their exact prompt", () => {
    const r = rig(); const now = new Date("2026-10-30T12:00:00Z"), opts = { creatorId: KATIE_CLONE_ID };
    const prompt = render(r.vars, now, opts);
    assert(!prompt.includes("ALL lowercase")); assert(!prompt.includes("ONE text per reply"));
    assert(prompt.includes("British English")); assert(prompt.includes("AI clone"));
    // Preview parts include their existing optional tip block; their base rules match.
    for (const parts of [renderParts(r.vars, now, opts), previewParts(r.vars, now, opts)]) {
      const shown = parts.map(p => p.text).join("");
      assert(shown.includes("British English")); assert(!shown.includes("ALL lowercase")); assert(!shown.includes("ONE text per reply"));
    }
    assert.equal(render(r.vars, now, { creatorId: "other" }), render(r.vars, now)); r.stop();
  });
  await check("first reply includes generation time, second bubble pauses, capitalization survives, one charge", async () => {
    Math.random = () => 0; const r = rig(); const before = M.requests;
    M.onModel = () => r.advance(5000);
    const result = await processTurn(r.deps as any, r.job);
    assert.deepEqual(r.sentAt, [125000, 127000]); assert.equal(M.requests, before + 1);
    assert.deepEqual(r.tg.texts, ["That sounds like a lovely evening.", "I hope you're enjoying the match!"]);
    assert.equal(r.charges(), 1); assert.equal(result?.delivery?.bubbles?.length, 2);
    assert.equal(result?.delivery?.text?.status, "acknowledged");
    assert.deepEqual(r.prepared.slice(-2).map(p => p.reply), r.tg.texts);
    assert.equal(runAs(r.slug, () => loadChat(fan).history.filter(m => m.role === "assistant").length), 2);
    assert(r.tg.of("sendMessage").every(c => c.payload.business_connection_id === "fixture-business"));
    M.onModel = undefined; r.stop();
  });
  await check("upper response delay and single-message choice work without a second bubble", async () => {
    Math.random = () => 1; const r = rig(); await processTurn(r.deps as any, r.job);
    assert.deepEqual(r.sentAt, [190000]); assert.deepEqual(r.tg.texts, [text]); r.stop();
  });
  await check("slow generation adds no extra wait after the response target", async () => {
    Math.random = () => 0; const r = rig(); M.onModel = () => r.advance(100000);
    await processTurn(r.deps as any, r.job); assert.equal(r.sentAt[0], 200000);
    assert.equal(r.waits.reduce((a, b) => a + b, 0), 2000); M.onModel = undefined; r.stop();
  });
  for (const phase of ["first", "second"] as const) await check("reset during " + phase + " delay cancels unsent text", async () => {
    Math.random = () => 0; const r = rig(); const wait = r.deps.wait as (ms: number) => Promise<void>; let reset = false;
    (r.deps as any).wait = async (ms: number) => { await wait(ms); if (!reset && (phase === "first" || r.tg.texts.length === 1)) { reset = true; runAs(r.slug, () => resetChat(fan)); } };
    const result = await processTurn(r.deps as any, r.job);
    assert.equal(r.tg.texts.length, phase === "first" ? 0 : 1); assert(result?.delivery?.cancelled); r.stop();
  });
  await check("unknown second send is recorded once and never retried or recharged", async () => {
    Math.random = () => 0; const r = rig(); let sends = 0;
    r.tg.on("sendMessage", () => ++sends === 2 ? { err: new HttpError("fixture timeout", new Error("socket closed")) } : undefined);
    const result = await processTurn(r.deps as any, r.job);
    assert.equal(sends, 2); assert.equal(r.charges(), 1);
    assert.equal(result?.delivery?.text?.status, "acknowledged");
    assert.equal(result?.delivery?.bubbles?.[1].attempt.status, "unknown");
    assert.equal(result?.final?.length, 1); r.stop();
  });
  await check("other creator keeps the previous lowercase single-message delay", async () => {
    Math.random = () => 0; const r = rig(false); await processTurn(r.deps as any, r.job);
    assert.deepEqual(r.tg.texts, [text.toLowerCase()]); assert(r.sentAt[0] < 104001); assert.equal(r.charges(), 1); r.stop();
  });
  await check("cancellable waits stop promptly", async () => {
    let active = true, elapsed = 0;
    assert.equal(await waitWhileCurrent(90000, async ms => { elapsed += ms; active = false; }, () => active), false);
    assert.equal(elapsed, 250);
  });
  console.log(JSON.stringify({ passed, failed: 0 }));
} finally {
  M.onModel = undefined; restoreFetch(); Math.random = saved.random;
  config.dataDir = saved.data; config.logDir = saved.logs; fs.rmSync(tmp, { recursive: true, force: true });
}

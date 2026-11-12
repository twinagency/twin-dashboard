// KNOWN RED (W8 ui-clone-5-plus3 finding H1, docs/review/W8/ui-clone-5-plus3.md): in phase `submitted` the hosted sign-in
// status poll never ends. components/creator-platforms/HostedConnect.tsx:66-75 polls `?attempt=` every 500 ms (750 ms once
// slowStage flips at 30 s, :74) and awaits onChanged (the parent's full platformSnapshot refresh) after every poll (:72);
// the expiry timer (:76-80) and currentSignInAttempt (lib/onlyfans-sign-in/model.ts:25-29) cover only opening/waiting/ready.
// CONDITION: an attempt in `submitted` whose enrollment never reaches accepted + connected, dialog open in a visible tab.
// Fixed looks like: in `submitted` back off (e.g. 5 s doubling to a 30 s cap) and call onChanged only on a phase change,
// or end on a terminal enrollment status; then 10 simulated minutes cost tens of requests, not ~800.
// Team's Claude owns the fix. Not wired into npm scripts; init.sh does not list it yet (window close's call).
// Offline: jsdom, global fetch stubbed (fixture.invalid), simulated clock on globalThis and window; no real timers waited.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test, { after, before } from "node:test";
import React, { act } from "react";
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_("jsdom");
// The component imports a CSS module; tsx loads it through require, so stub the extension.
(require_ as unknown as { extensions: Record<string, (module: { exports: unknown }) => void> }).extensions[".css"] = module => { module.exports = {}; };

const dom = new JSDOM('<div id="root"></div>', { url: "https://fixture.invalid/creator/platforms" });
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, React, IS_REACT_ACT_ENVIRONMENT: true });

// Deterministic clock. React captures the real timers when react-dom loads (before()), so only component code sees these.
const realImmediate = setImmediate, realNow = Date.now;
let now = Date.parse("2026-11-12T00:00:00.000Z"), seq = 0;
type Timer = { at: number; fn: () => void; every?: number };
const timers = new Map<number, Timer>();
const fakeTimeout = (fn: () => void, ms = 0) => { const id = ++seq; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn }); return id; };
const fakeInterval = (fn: () => void, ms = 0) => { const every = Math.max(1, Number(ms) || 0), id = ++seq; timers.set(id, { at: now + every, fn, every }); return id; };
const fakeClear = (id?: number) => { if (id !== undefined) timers.delete(id); };
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => realImmediate(resolve)); };
async function advance(ms: number) {
  const end = now + ms;
  for (;;) {
    let nextId = -1, next: Timer | undefined;
    for (const [id, timer] of timers) if (timer.at <= end && (!next || timer.at < next.at)) { nextId = id; next = timer; }
    if (!next) { now = end; return; }
    now = next.at;
    if (next.every) next.at += next.every; else timers.delete(nextId);
    await act(async () => { next!.fn(); await flush(); });
  }
}

let createRoot: typeof import("react-dom/client").createRoot;
let root: ReturnType<typeof createRoot> | undefined;
let HostedConnect: typeof import("../../components/creator-platforms/HostedConnect").default;
before(async () => {
  ({ createRoot } = await import("react-dom/client"));
  ({ default: HostedConnect } = await import("../../components/creator-platforms/HostedConnect"));
  for (const target of [globalThis, dom.window] as Array<Record<string, unknown>>) Object.assign(target, { setTimeout: fakeTimeout, setInterval: fakeInterval, clearTimeout: fakeClear, clearInterval: fakeClear });
  Date.now = () => now;
});
after(async () => { await act(async () => root?.unmount()); Date.now = realNow; dom.window.close(); });

const ATTEMPT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", ENROLLMENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TEN_MINUTES = 10 * 60_000;
async function run(phase: "waiting" | "submitted", expiresInMs: number) {
  const attempt = { id: ATTEMPT, phase, handle: phase === "submitted" ? "synthetic_creator" : null, expiresAt: new Date(now + expiresInMs).toISOString(),
    enrollmentId: phase === "submitted" ? ENROLLMENT : null, width: 432, height: 720, keyboard: null };
  const seen = { starts: 0, statusGets: 0, changed: 0 };
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === "POST" && JSON.parse(String(init.body)).action === "start") { seen.starts++; return Response.json({ ok: true, attempt, proxy: null }); }
    if ((init?.method ?? "GET") === "GET" && url.includes("?attempt=" + ATTEMPT) && !url.includes("frame=")) { seen.statusGets++; return Response.json({ ok: true, attempt }); }
    return new Response(null, { status: 404 });
  }) as typeof fetch;
  if (root) await act(async () => root!.unmount());
  document.body.innerHTML = '<div id="root"></div>';
  root = createRoot(document.getElementById("root")!);
  await act(async () => {
    root!.render(<HostedConnect profileId="profile-synthetic" accountId={null} disabled={false} onChanged={async () => { seen.changed++; return true; }} />);
    await flush();
  });
  await advance(TEN_MINUTES);
  return seen;
}

test("control: a waiting attempt stops polling at its expiry", async t => {
  const seen = await run("waiting", 5_000);
  t.diagnostic(`status GETs ${seen.statusGets}, onChanged ${seen.changed}`);
  assert.equal(seen.starts, 1, "one start command");
  assert.ok(seen.statusGets >= 1, `harness counts status polls (got ${seen.statusGets})`);
  assert.ok(seen.statusGets <= 10, `waiting attempt polls only until expiry (got ${seen.statusGets})`);
  assert.match(document.body.textContent ?? "", /Your sign-in expired/);
});

test("W8-H1: a submitted attempt backs off instead of polling without end", async t => {
  const seen = await run("submitted", 15 * 60_000);
  t.diagnostic(`status GETs ${seen.statusGets}, onChanged ${seen.changed}`);
  assert.equal(seen.starts, 1, "one start command");
  assert.ok(seen.statusGets <= 60, `submitted phase polls without end: ${seen.statusGets} status GETs in 10 simulated minutes (expected <= 60)`);
  assert.ok(seen.changed <= 60, `submitted phase polls without end: ${seen.changed} onChanged refreshes in 10 simulated minutes (expected <= 60)`);
});

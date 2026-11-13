// RULE G07a stale-account-link (regression guard; REVIEW.md inv 7: STOP reachable; lib/onlyfans-preview/scope.ts:8-12 "an account the
// session cannot see selects nothing"). Promoted from known-red W3-ui-onlyfans-launch-stale-account-link (finding L5).
// A `?account=` the session cannot see keeps the account switcher, chooses nothing (placeholder shown), asks nobody to sign in again,
// and reads no account until the operator picks one; a silent fallback to the first account is also wrong. The workspace select shows a
// disabled placeholder (value "") while no account is chosen. Copy matched on key words only.
// Mounts the real BAutomationPanel, BMemoryPanel and AbcWorkspace inside real Next router contexts. Offline: jsdom, stub fetch, synthetic ids.
//   node --import tsx --test tests/rules/G07a-stale-account-link.test.tsx
import { inNextApp, json, mount, pageText, stubFetch, unmount } from "../helpers/w3-launch-dom";
import { accounts } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

function serve(...ids: string[]) {
  return stubFetch(url => url === "/api/onlyfans/accounts" ? json(accounts(...ids))
    // Every per-account read: not under test.
    : json({ error: "Not in this fixture." }, 503));
}
/** Booleans only: a failing assertion that inspects a jsdom node can exhaust the heap. */
function view(switcherSelector: string, cards: string, stub: ReturnType<typeof serve>) {
  const switcher = document.querySelector<HTMLSelectElement>(switcherSelector);
  return { switcher: Boolean(switcher), signInAgain: /sign in again/i.test(pageText()), showsOfA: switcher?.value === "of-a",
    accountCard: Boolean(document.querySelector(cards)), stop: Boolean(document.querySelector("[data-b-emergency]")),
    ofAFetched: stub.calls.some(c => /\/accounts\/of-a(\/|$)/.test(c.url.split("?")[0])) };
}

async function automation(initialAccountId: string) {
  const stub = serve("of-a");
  const { default: BAutomationPanel } = await import("../../components/onlyfans-launch/automation/BAutomationPanel");
  await mount(inNextApp(React.createElement(BAutomationPanel, { canManage: true, initialAccountId }), "/onlyfans/launch/automation"));
  return view("select#b-auto-acct", '[data-b-card="account"]', stub);
}
async function memory(initialAccountId: string) {
  const stub = serve("of-a");
  const { default: BMemoryPanel } = await import("../../components/onlyfans-launch/memory/BMemoryPanel");
  await mount(inNextApp(React.createElement(BMemoryPanel, { canManage: true, initialAccountId }), "/onlyfans/launch/memory"));
  return view("select#b-mem-acct", "[data-b-card]", stub);
}
/** Fixed: the switcher stays, nothing asks to sign in again, and NO account is chosen, shown, read or offered a STOP until the operator picks one. */
const SELECTS_NOTHING = { switcher: true, signInAgain: false, showsOfA: false, accountCard: false, stop: false, ofAFetched: false };

test("control: automation panel with a visible ?account= renders the switcher and the account card for it", async () => {
  // STOP itself is not asserted here: G07a-stop-gating owns it.
  const a = await automation("of-a");
  assert.deepEqual({ switcher: a.switcher, signInAgain: a.signInAgain, showsOfA: a.showsOfA, accountCard: a.accountCard, ofAFetched: a.ofAFetched },
    { switcher: true, signInAgain: false, showsOfA: true, accountCard: true, ofAFetched: true });
  await unmount();
});

test("control: memory panel with a visible ?account= renders the switcher on it and reads it", async () => {
  const m = await memory("of-a");
  assert.deepEqual({ switcher: m.switcher, signInAgain: m.signInAgain, showsOfA: m.showsOfA, ofAFetched: m.ofAFetched },
    { switcher: true, signInAgain: false, showsOfA: true, ofAFetched: true });
  await unmount();
});

test("L5 automation: ?account=of-gone keeps the switcher, selects nothing and does not ask to sign in again", async () => {
  assert.deepEqual(await automation("of-gone"), SELECTS_NOTHING, "unseen account locks the page (BAutomationPanel.tsx:48,96); a silent fallback to of-a is also wrong (scope.ts:8-12)");
  await unmount();
});

test("L5 memory: ?account=of-gone keeps the switcher, selects nothing and does not ask to sign in again", async () => {
  assert.deepEqual(await memory("of-gone"), SELECTS_NOTHING, "unseen account locks the page (BMemoryPanel.tsx:47,131); a silent fallback to of-a is also wrong (scope.ts:8-12)");
  await unmount();
});

async function workspace() {
  serve("of-a", "of-b");
  const { default: AbcWorkspace } = await import("../../components/onlyfans-launch/AbcWorkspace");
  await mount(inNextApp(React.createElement(AbcWorkspace, { initialAccountId: "of-gone" }), "/onlyfans/launch"));
  const select = document.querySelector<HTMLSelectElement>("select#launch-account");
  return { select: Boolean(select), placeholder: Boolean(select?.querySelector('option[value=""]')), shownValue: String(select?.value),
    panel: Boolean(document.querySelector("[role=tablist]")), status: /select an authorised account/i.test(pageText()) };
}

test("control: workspace with ?account=of-gone shows 'Select an authorised account' and no screen", async () => {
  const w = await workspace();
  assert.deepEqual({ select: w.select, panel: w.panel, status: w.status }, { select: true, panel: false, status: true });
  await unmount();
});

test("L5 workspace: with no account selected the select does not show the first account as chosen", async () => {
  const w = await workspace();
  assert.equal(w.panel, false, "no screen is mounted");
  assert.equal(w.placeholder || w.shownValue !== "of-a", true, `select shows ${w.shownValue} as chosen with no placeholder (AbcWorkspace.tsx:45)`);
  await unmount();
});

test("L5 embedded memory (inbox, switcher hidden): an unseen account says so and does not ask to select one", async () => {
  const stub = serve("of-a");
  const { default: BMemoryPanel } = await import("../../components/onlyfans-launch/memory/BMemoryPanel");
  await mount(inNextApp(React.createElement(BMemoryPanel, { canManage: true, part: "facts", selectedAccountId: "of-gone", selectedFanId: "101" }), "/onlyfans"));
  const text = pageText();
  assert.deepEqual({ switcher: Boolean(document.querySelector("select")), notAvailable: /not available/i.test(text), select: /select an/i.test(text),
    signInAgain: /sign in again/i.test(text), ofAFetched: stub.calls.some(c => /\/accounts\/of-a(\/|$)/.test(c.url.split("?")[0])) },
    { switcher: false, notAvailable: true, select: false, signInAgain: false, ofAFetched: false }, "asks to select with nothing to select (BMemoryPanel.tsx:134)");
  await unmount();
});

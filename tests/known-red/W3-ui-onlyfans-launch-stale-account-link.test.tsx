// KNOWN RED (W3 lane 2 ui-onlyfans-launch, finding L5; REVIEW.md inv 7: STOP reachable; lib/onlyfans-preview/scope.ts:8-12 "an
// account the session cannot see selects nothing" and the URL is reconciled).
//   automation/BAutomationPanel.tsx:48,96 and memory/BMemoryPanel.tsx:47,131  a `?account=` the session cannot see turns the whole
//      account list into `denied`: "Your session cannot read accounts. Sign in again." and no switcher, so no account (and no
//      Emergency stop) is reachable from the page.
//   AbcWorkspace.tsx:45  the right status copy shows, but `<select value="">` has no empty option: React marks the first account
//      selected while no account is, and in a browser choosing that already-shown option fires no change event.
// Fixed looks like: "account not available" + the switcher showing no account chosen (placeholder), with no account card, no
// [data-b-emergency] and no read of any /accounts/of-a/ URL until the operator picks one (a silent fallback to the first account
// stays red); a disabled placeholder option (value "") in the workspace select.
// Copy matched on key words only ("sign in again", "select an authorised account").
// Mounts the real BAutomationPanel, BMemoryPanel and AbcWorkspace inside real Next router contexts. Offline: jsdom, stub fetch,
// synthetic ids (of-a, of-b, of-gone). Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-stale-account-link.test.tsx   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W3-ui-onlyfans-launch-stale-account-link.test.tsx   (red, ERR_ASSERTION)
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
  // STOP itself is not asserted here: every per-account read answers 503 in this fixture, which hides STOP (that is L2, stop-gating).
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

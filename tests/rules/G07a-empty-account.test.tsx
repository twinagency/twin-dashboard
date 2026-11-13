// RULE G07a empty-account (regression guard; REVIEW.md inv 7: STOP reachable). Promoted from known-red
// W7-P-picks-W3-ui-onlyfans-launch-empty-account (finding L27). An empty `?account=` renders exactly like no `?account=`: the automation
// and memory panels show the account switcher (and so the account card and STOP), never a blank page or a sign-in-again ask.
// Reuses the launch jsdom helpers and fixtures (offline, stub fetch, synthetic ids).
//   node --import tsx --test tests/rules/G07a-empty-account.test.tsx
import { inNextApp, json, mount, pageText, stubFetch, unmount } from "../helpers/w3-launch-dom";
import { accounts } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

/** The account the switcher shows as chosen on the last `panel` call ("" = none). */
let lastChosen = "";
async function panel(kind: "automation" | "memory", initialAccountId: string | undefined) {
  stubFetch(url => url === "/api/onlyfans/accounts" ? json(accounts("of-a")) : json({ error: "Not in this fixture." }, 503));
  const mod = kind === "automation"
    ? await import("../../components/onlyfans-launch/automation/BAutomationPanel")
    : await import("../../components/onlyfans-launch/memory/BMemoryPanel");
  await mount(inNextApp(React.createElement(mod.default, { canManage: true, initialAccountId }), "/onlyfans/launch/" + kind));
  const switcher = Boolean(document.querySelector(kind === "automation" ? "select#b-auto-acct" : "select#b-mem-acct"));
  lastChosen = document.querySelector<HTMLSelectElement>(kind === "automation" ? "select#b-auto-acct" : "select#b-mem-acct")?.value ?? "";
  const signInAgain = /sign in again/i.test(pageText());
  await unmount();
  return { switcher, signInAgain };
}

for (const kind of ["automation", "memory"] as const) {
  test(`control: ${kind} panel with no ?account= renders the account switcher`, async () => {
    assert.deepEqual(await panel(kind, undefined), { switcher: true, signInAgain: false });
  });
  test(`L27 ${kind}: an empty ?account= renders the switcher like no ?account=`, async () => {
    assert.deepEqual(await panel(kind, ""), { switcher: true, signInAgain: false }, `empty ?account= blanks the ${kind} page: no switcher, no STOP`);
  });
  // Added at promotion: once a stale ?account= keeps the switcher (L5), the test above passes with "" read as an unseen account too.
  test(`L27 ${kind}: an empty ?account= chooses what no ?account= chooses`, async () => {
    await panel(kind, undefined); const none = lastChosen;
    await panel(kind, "");
    assert.deepEqual({ none, empty: lastChosen }, { none: "of-a", empty: "of-a" }, `empty ?account= is read as an account no one can see`);
  });
}

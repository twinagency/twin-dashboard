// KNOWN RED (W3 ui-onlyfans-launch L27, written by W7 P-picks; REVIEW.md inv 7: STOP reachable).
// app/onlyfans/launch/automation/page.tsx:7 and memory/page.tsx:7 pass `?account=` as "" to the panels. BAutomationPanel.tsx:48
// (`initialAccountId &&`) skips the visibility check and :49 keeps `"" ?? ...` = "", so :99 (`account` falsy) renders no switcher,
// no message and no STOP; BMemoryPanel.tsx:46-47 same via `wanted`.
// Fixed looks like: "" treated as no account (`||`, or the page normalises), so the switcher renders as with no `?account=` at all.
// Reuses the W3 launch jsdom helpers and fixtures (offline, stub fetch, synthetic ids). Not wired into npm scripts.
//   nice -n 10 node --import tsx --test --test-name-pattern='^control' tests/known-red/W7-P-picks-W3-ui-onlyfans-launch-empty-account.test.tsx   (green)
//   nice -n 10 node --import tsx --test --test-skip-pattern='^control' tests/known-red/W7-P-picks-W3-ui-onlyfans-launch-empty-account.test.tsx   (red, ERR_ASSERTION)
import { inNextApp, json, mount, pageText, stubFetch, unmount } from "../helpers/w3-launch-dom";
import { accounts } from "../helpers/w3-launch-fixtures";
import assert from "node:assert/strict";
import test from "node:test";
import React from "react";

async function panel(kind: "automation" | "memory", initialAccountId: string | undefined) {
  stubFetch(url => url === "/api/onlyfans/accounts" ? json(accounts("of-a")) : json({ error: "Not in this fixture." }, 503));
  const mod = kind === "automation"
    ? await import("../../components/onlyfans-launch/automation/BAutomationPanel")
    : await import("../../components/onlyfans-launch/memory/BMemoryPanel");
  await mount(inNextApp(React.createElement(mod.default, { canManage: true, initialAccountId }), "/onlyfans/launch/" + kind));
  const switcher = Boolean(document.querySelector(kind === "automation" ? "select#b-auto-acct" : "select#b-mem-acct"));
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
}

import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ALL_MODE_LABEL, AUDIENCE_LIMIT, NO_SENDER_TEXT, canQueue, clearDrafts, clearSelection, mergePage, recallDraft, rememberDraft, selectPage, senderLine } from "../lib/onlyfans/campaign-audience";
import type { ConversationSummary } from "../lib/onlyfans-preview/types";

(globalThis as { React?: unknown }).React = React;
const row = (n: number) => ({ conversationId: `a:${n}`, accountId: "a" } as unknown as ConversationSummary);
const base = { accountId: "a", locked: false, name: "n", body: "b", audienceKind: "explicit" as const, selected: 1 };

async function main() {
const { default: CampaignManager } = await import("../components/onlyfans-preview/CampaignManager");
// No single account: the form is absent, says so, and nothing can be queued.
const none = renderToStaticMarkup(<CampaignManager accountId={null} />);
assert.ok(none.includes(NO_SENDER_TEXT));
assert.ok(!none.includes("data-of-create-campaign") && !none.includes("<form"));
assert.equal(canQueue({ ...base, accountId: null }), false);
assert.equal(canQueue(base), true);
assert.equal(canQueue({ ...base, selected: 0 }), false, "explicit audience needs a selection");
assert.equal(canQueue({ ...base, selected: AUDIENCE_LIMIT + 1 }), false);
assert.equal(canQueue({ ...base, audienceKind: "all_known", selected: 0 }), true);
assert.equal(canQueue({ ...base, locked: true }), false);

// Sender line names the creator.
assert.equal(senderLine({ creatorName: "Katie Price", handle: "katie" }), "Sending as Katie Price · @katie · OnlyFans");
assert.equal(senderLine(null), NO_SENDER_TEXT);

// Selection survives an appended page, and Clear empties it.
const page1 = [1, 2, 3].map(row), page2 = [3, 4].map(row);
let selected = selectPage(new Set(), page1);
const rows = mergePage(page1, page2);
assert.equal(rows.length, 4, "repeats are dropped");
selected = selectPage(selected, page2);
assert.deepEqual([...selected].sort(), ["a:1", "a:2", "a:3", "a:4"]);
assert.equal(clearSelection().size, 0);
assert.equal(selectPage(new Set(), Array.from({ length: 1200 }, (_, i) => row(i))).size, AUDIENCE_LIMIT, "never selects past the limit");

// Honest all-mode label.
assert.ok(ALL_MODE_LABEL.includes("up to 1,000") && ALL_MODE_LABEL.includes("refused above that"));

// Drafts are per account.
clearDrafts();
rememberDraft("a", { ...recallDraft("a"), name: "A draft", fanIds: ["a:1"] });
assert.equal(recallDraft("b").name, "", "another account starts empty");
rememberDraft("b", { ...recallDraft("b"), name: "B draft" });
assert.equal(recallDraft("a").name, "A draft");
assert.deepEqual(recallDraft("a").fanIds, ["a:1"]);
assert.equal(recallDraft("b").fanIds.length, 0);
console.log("onlyfans campaign audience checks passed");
}
main().catch(error => { console.error(error); process.exit(1); });

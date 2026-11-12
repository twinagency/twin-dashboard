import assert from "node:assert/strict";
import { ONLYFANS_CHANNEL } from "../lib/channel-nav";
import { clearInboxViewMemory, recallFilters, recallScroll, recallSelected, rememberFilters, rememberScroll, rememberSelected } from "../lib/onlyfans/inbox-view-memory";

// Everyday pages come first, in working order; technical controls sit under Settings.
const nav = ONLYFANS_CHANNEL.nav;
assert.deepEqual(nav.filter(item => !item.group).map(item => item.label), ["Today", "Inbox", "Creators", "Content", "Revenue", "Earnings", "Campaigns"]); // Revenue: 44bd819d (#344)
assert.deepEqual(nav.filter(item => item.group === "settings").map(item => item.label), ["Settings", "Launch control", "Operations"]);
assert.ok(nav.findIndex(item => item.group === "settings") > nav.findIndex(item => item.label === "Campaigns"), "settings group comes last");
assert.deepEqual(nav.filter(item => item.combined).map(item => item.label), ["Today"], "only Today is an every-creator page");
assert.equal(nav.find(item => item.label === "Creators")?.href, "/onlyfans/accounts", "old routes keep working");
assert.equal(nav.find(item => item.label === "Earnings")?.href, "/onlyfans/sales", "old routes keep working");

// Inbox view memory is separate per staff identity, creator, account and conversation.
clearInboxViewMemory();
assert.deepEqual(recallFilters("a", "c1"), { search: { query: "", filter: "all" }, aiOnly: false });
rememberFilters("a", "c1", { search: { query: "sam", filter: "unread" }, aiOnly: false });
assert.equal(recallFilters("a", "c1").search.query, "sam");
assert.equal(recallFilters("b", "c1").search.query, "", "another operator starts empty");
assert.equal(recallFilters("a", "c2").search.query, "", "another creator starts empty");
rememberSelected("a", "acc1", "conv9");
assert.equal(recallSelected("a", "acc1"), "conv9");
assert.equal(recallSelected("a", "acc2"), null);
rememberScroll("a", "acc1", "conv9", 420);
assert.equal(recallScroll("a", "acc1", "conv9"), 420);
assert.equal(recallScroll("a", "acc1", "conv8"), null, "scroll is per conversation");
rememberScroll("a", "acc1", "conv9", null);
assert.equal(recallScroll("a", "acc1", "conv9"), null, "back at the bottom forgets the offset");
clearInboxViewMemory();
assert.equal(recallSelected("a", "acc1"), null);
console.log("PASS onlyfans inbox memory and navigation order");

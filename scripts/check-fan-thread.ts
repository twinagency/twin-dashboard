// ── Checks for the Telegram-style fan chat thread ────────────────────────────
// Run:  npm run test:thread
//
// The thread was rebuilt on 2026-08-18 to Ronan's brief: match Telegram closely,
// open on the newest message, mark where the latest message is, draw the buttons
// the fan actually saw, and say under each bubble which flow produced it.
//
// Most of that is markup, and asserting on markup is worth very little. What
// this file defends is the four things that can be confidently WRONG while
// looking completely right on screen:
//
//   1. THE FLOW VOCABULARY IS A CROSS-REPO CONTRACT. The bot writes
//      chat_history.meta.flow from FLOW_SLUGS in ../bot/src/types.ts; this repo
//      renders it from lib/flow-labels.ts. The checked-in contract snapshot keeps
//      dashboard CI self-contained. When the sibling bot checkout is available,
//      this check also proves the snapshot still exactly matches the runtime.
//   2. AN UNSTAMPED ROW MUST STAY UNLABELLED. Nothing recorded which flow
//      produced a message before 2026-08-18. If flowLabelOf ever invents a
//      default for a missing slug, every historic message in the database
//      acquires a confident, fabricated provenance. Same rule the drip marker
//      already runs under.
//   3. A PURCHASE IS ONLY EVER SHOWN WHERE THE DATA SAYS IT IS. "Which pic did
//      he buy" is answered by star_transactions.media_id (migration 121) and by
//      nothing else. Matching an unlabelled purchase to the nearest locked send
//      by timestamp would be right most of the time, wrong invisibly the rest,
//      and this operator makes pricing decisions off it.
//   4. THE INVOICE URL NEVER REACHES THE PAGE. meta.buttons carries labels only.
//      A live Stars payment link rendered into an operator page is a real link
//      anyone with a screenshot can pay through.
//
// PROVEN TO FAIL (each planted back, went red, then restored):
//   a) FLOW_LABELS: the `paywall` entry deleted. Red on C1.
//   b) flowLabelOf(): `if (!slug) return null` changed to fall through to the
//      unknown-slug branch. Red on C2.
//   c) app/users/page.tsx: `purchasedByMediaId` filled from every media purchase
//      by nearest timestamp instead of `if (!p.media_id) continue`. Red on C4.
//   d) ChatThread.tsx: the `el.scrollTop = el.scrollHeight` effect removed.
//      Red on C6.
//   e) ChatThread.tsx: `{b.text}` changed to `{b.url}`. Red on C5.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { FLOW_LABELS, flowLabelOf } from "../lib/flow-labels";

const root = join(__dirname, "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");

let passed = 0;
const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    passed++;
  } catch (e) {
    failures.push(`${name}\n      ${e instanceof Error ? e.message : String(e)}`);
  }
}
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

const thread = read("components/users/ChatThread.tsx");
const page = read("app/users/page.tsx");

check("C1 every flow slug the bot can write has a label here", () => {
  const contract = JSON.parse(read("contracts/bot-flow-slugs.json"));
  assert(
    Array.isArray(contract) && contract.length > 0 && contract.every((slug) => typeof slug === "string"),
    "contracts/bot-flow-slugs.json must be a non-empty string array",
  );

  const slugs = contract as string[];
  assert(new Set(slugs).size === slugs.length, "contracts/bot-flow-slugs.json contains duplicate slugs");
  const missing = slugs.filter((slug) => !(slug in FLOW_LABELS));
  assert(
    missing.length === 0,
    `the bot contract contains ${missing.length} slug(s) this dashboard has no label for: ${missing.join(", ")}`,
  );

  // Local multi-repo check: catch drift against the bot's source when it exists.
  // GitHub checks out this repository alone, so absence is expected in CI.
  let botTypes: string | null = null;
  try {
    botTypes = readFileSync(join(root, "..", "bot", "src", "types.ts"), "utf8");
  } catch {
    return;
  }
  const block = botTypes.match(/FLOW_SLUGS\s*=\s*\[([\s\S]*?)\]/);
  assert(
    block,
    "FLOW_SLUGS not found in ../bot/src/types.ts. Either the bot has not shipped the flow stamp yet, or it was renamed and this contract is now unenforced.",
  );
  const runtimeSlugs = [...block![1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  assert(runtimeSlugs.length > 0, "FLOW_SLUGS parsed as empty");
  assert(
    JSON.stringify(runtimeSlugs) === JSON.stringify(slugs),
    "contracts/bot-flow-slugs.json has drifted from ../bot/src/types.ts FLOW_SLUGS",
  );
});

check("C2 a row with no flow stamp gets NO label", () => {
  assert(flowLabelOf(null) === null, "a null slug produced a label, so every pre-2026-08-18 message would be given a fabricated provenance");
  assert(flowLabelOf(undefined) === null, "an undefined slug produced a label");
  assert(flowLabelOf("") === null, "an empty slug produced a label");
});

check("C3 an unknown slug still renders rather than vanishing", () => {
  const label = flowLabelOf("some_new_flow");
  assert(label !== null, "an unknown slug rendered nothing, so this file going stale looks identical to the bot not stamping");
  assert(label!.label === "some new flow", `unknown slug rendered as "${label!.label}"`);
});

check("C4 a purchase is attached to a message only via media_id", () => {
  // The guard is one line and deleting it is an easy, plausible "improvement".
  assert(
    /if \(!p\.media_id\) continue;/.test(page),
    "the media_id guard on purchasedByMediaId is gone, so purchases can now be attached to messages by inference",
  );
  assert(
    !/purchasedByMediaId[\s\S]{0,400}created_at/.test(page),
    "purchase-to-message matching now reads a timestamp, which means it is guessing",
  );
});

check("C5 the thread renders button LABELS and never an invoice url", () => {
  assert(/\{b\.text\}/.test(thread), "buttons are no longer rendered from their label");
  assert(!/b\.url|invoice_url|\bhref=\{/.test(thread), "the thread renders a url from button data, which would put a live Stars payment link on the page");
});

check("C6 the thread opens on the newest message", () => {
  assert(
    /scrollTop\s*=\s*el\.scrollHeight/.test(thread),
    "the scroll-to-bottom effect is gone, so picking a fan lands on the OLDEST of his last 60 messages again",
  );
  assert(/\[fanId, messages\.length, messages\.at\(-1\)\?\.id\]/.test(thread), "the scroll effect must follow the selected fan and the newest message even on a full page");
});

check("C7 the newest message is marked", () => {
  assert(/tg-newline/.test(thread), "the latest-message rule is gone from the thread");
  assert(/tg-newline/.test(read("app/globals.css")), "the latest-message rule has no styles");
});

check("C8 only the last bubble of a run gets a tail", () => {
  // Telegram's own behaviour, and the most obvious tell when it is wrong.
  assert(/endsRun/.test(thread), "run detection is gone, so every bubble gets a tail");
  assert(/tg-tail-in|tg-tail-out/.test(thread), "tail classes are no longer applied");
});

check("C10 the automated-campaign marker survived the Telegram rebuild", () => {
  // It predates this rebuild and applies to rows the flow pill never will:
  // drip has been stamped since 2026-08-17, flow only since 2026-08-18. Losing
  // it would make every historic automated send read as a live conversation.
  assert(/\{m\.dripMarker && \(/.test(thread), "the drip marker is no longer rendered in the thread component");
  assert(/dripMeta && !sameStepAsPrev/.test(page), "the per-step dedupe is no longer applied, so a win-back draws its rule twice");
  assert(/drip_kind === "winback"/.test(page), "the win-back marker no longer reads differently from a plain campaign step");
});

check("C11 the per-fan unlock counts are read with paging", () => {
  // An unpaged .in() read over 300 fans silently stops at PostgREST's 1000-row
  // cap, and every "n bought" chip built from it is then low with nothing going
  // red. scripts/check-paged-call-sites.ts only scans lib/, so it does not
  // cover this call site and cannot be relied on here.
  assert(
    /idChunks\.map\(\(chunk\)\s*=>\s*selectAllRows<\{[\s\S]*?user_id: string;[\s\S]*?amount_stars: number \| null;[\s\S]*?\}>\([\s\S]*?\.in\("user_id", chunk\)/.test(page),
    "the media-unlock read is no longer paged, so the counts beside each fan name truncate at 1000 rows",
  );
});

check("C12 a padlock is only drawn when 'not bought' is a fact", () => {
  // The same locked photo can legitimately be re-sent before he pays, and a
  // BUNDLE's Star charge carries no uuid at all, so it can never be linked.
  // Drawing "LOCKED" over something he actually bought is worse than drawing
  // nothing, so the claim is gated on every one of his media purchases naming
  // its item.
  assert(/const lockStateKnown = unlinkedMediaPurchases === 0;/.test(page), "the lock-state gate is gone from the page");
  assert(/lockKnown: !!meta\?\.media_id && lockStateKnown/.test(page), "the gate is no longer carried onto each bubble");
  assert(/m\.paid && m\.lockKnown \?/.test(thread), "the thread draws a padlock without checking whether 'not bought' is knowable");
});

check("C13 the unlock counts cover every fan on screen", () => {
  // "Load more" takes this list to 1000 rows. A fixed .slice() on the id list
  // is the same silent undercount the paging fixed, moved somewhere else.
  assert(/const pageUserIds = filtered\.map\(\(u\) => u\.id\)\.filter\(isStoredFan\);/.test(page), "unlock-count lookup must cover all stored fans and exclude synthetic IDs from UUID queries");
  assert(/idChunks/.test(page), "the id list is no longer chunked, so a long list overflows the query string");
});

check("C9 the fan list leads with telegram identity, not the stated name", () => {
  assert(
    /const displayName = \(u: any\) => u\.name\?\.trim\(\) \|\| `Fan \$\{u\.telegram_id\}`/.test(page),
    "displayName leads with something other than the Telegram name again",
  );
  assert(/identityBits/.test(page), "the @username / id / business id line is gone from the list");
  assert(/business_connection_id\.ilike/.test(page), "search no longer matches the business connection id");
});

// ── report ───────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\n✗ fan thread: ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ fan thread: ${passed} passed`);

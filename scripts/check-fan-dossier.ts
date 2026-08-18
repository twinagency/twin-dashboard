// ── Checks for the fan knowledge dossier helpers ─────────────────────────────
// Run:  npm run test:dossier
//
// Every assertion is against the REAL functions app/users/page.tsx calls, from
// lib/fan-dossier.ts. Asserting on the markup would pass while the ordering and
// the splitting are nonsense, and those are the two things here that can be
// confidently wrong without looking wrong.
//
// What this is specifically defending:
//
//   1. UPCOMING EVENTS ORDER. The panel promises soonest first. An event list
//      that is merely SPLIT but not SORTED looks exactly like a sorted one, and
//      the operator plans a conversation around the wrong date. Past events run
//      the other way, most recent first, and getting the direction backwards is
//      the same silent failure.
//   2. THE YEARLESS DATE. "Birthday March 3" read in August means NEXT March.
//      Resolving it to this year puts a future event five months in the past,
//      which both mis-sorts it and mislabels it.
//   3. COMMA SPLITTING IS NOT UNIVERSAL. "Sydney, Australia" is one location;
//      "guitar, hiking, cooking" is three hobbies. Nothing in the string says
//      which, so the split is driven by CATEGORY_META. Splitting everything
//      shreds addresses and dates; splitting nothing brings back the wall of
//      comma soup this panel was rebuilt to kill.
//   4. CAPITALISATION IS ADDITIVE. The extractor writes lowercase, so the panel
//      raises sentence starts. It must never LOWERCASE, or a naive Title Case
//      pass turns "Formula 1" into "Formula 1" but "iPhone" into "IPhone" and
//      "Sydney" survives only by luck.
//   5. NOTHING IS DROPPED. An event with no parseable date still has to render.
//      Silently binning it is the worst outcome here: the operator sees a
//      shorter list and believes it.
//
// PROVEN TO FAIL (each planted back, went red, then restored):
//   a) parseEvents(): the `dated.sort(...)` line deleted, so events render in
//      extractor order. Red on E1, E3, E6.
//   b) resolveYearless(): the direction branch replaced with a bare
//      `new Date(now.getFullYear(), month, day)`. Red on E2.
//   c) splitList(): `commaSplits` ignored and commas always split. Red on S3, R1.
//   d) sentenceCase(): `.toLowerCase()` added before the first replace. Red on C2.
//   e) parseEvents(): the undated events dropped instead of appended. Red on E4.

import {
  CATEGORY_META,
  parseEvents,
  sentenceCase,
  splitList,
  toRows,
} from "../lib/fan-dossier";

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
function eq(a: unknown, b: unknown, what: string): void {
  if (a !== b) throw new Error(`${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
}

// A fixed clock. The whole point of parsing server side is that the answer does
// not depend on when you run it, so the check pins the date too: 2026-08-18.
const NOW = new Date(2026, 7, 18).getTime();

// ── Event ordering ───────────────────────────────────────────────────────────

check("E1 upcoming events come back soonest first, not extractor order", () => {
  const raw = "Sister's wedding on 2026-12-04, Job interview on 2026-08-25, Trip to Bali on 2026-10-01";
  const events = parseEvents(raw, NOW, "upcoming");
  eq(events.length, 3, "event count");
  assert(/interview/i.test(events[0].text), `first should be the August interview, got "${events[0].text}"`);
  assert(/Bali/i.test(events[1].text), `second should be the October trip, got "${events[1].text}"`);
  assert(/wedding/i.test(events[2].text), `third should be the December wedding, got "${events[2].text}"`);
  // and each one really is a separate event, never one paragraph
  assert(!events[0].text.includes("Bali"), "events must not be merged into one entry");
});

check("E2 a yearless date resolves forward for upcoming, backward for past", () => {
  // Read in August: March is BEHIND us this year, so an upcoming March 3 is
  // 2027 and a past March 3 is 2026.
  const up = parseEvents("Birthday on March 3", NOW, "upcoming");
  eq(up.length, 1, "upcoming count");
  assert(up[0].at != null, "upcoming birthday should have parsed a date");
  eq(new Date(up[0].at!).getFullYear(), 2027, "upcoming yearless March resolves to next year");
  assert(up[0].at! > NOW, "an upcoming event must not sort into the past");

  const past = parseEvents("Birthday on March 3", NOW, "past");
  eq(new Date(past[0].at!).getFullYear(), 2026, "past yearless March resolves to this year");
  assert(past[0].at! < NOW, "a past event must not sort into the future");
});

check("E3 past events come back most recent first", () => {
  const events = parseEvents("Moved house on 2026-01-10, Ran a marathon on 2026-07-02", NOW, "past");
  eq(events.length, 2, "event count");
  assert(/marathon/i.test(events[0].text), `most recent should lead, got "${events[0].text}"`);
});

check("E4 an undated event still renders, and sorts after the dated ones", () => {
  const events = parseEvents("Wants to visit Japan someday, Concert on 2026-09-12", NOW, "upcoming");
  eq(events.length, 2, "nothing may be dropped for lacking a date");
  assert(/Concert/i.test(events[0].text), "the dated event leads");
  eq(events[1].when, null, "the undated event carries no date chip");
  assert(/Japan/i.test(events[1].text), "the undated event is still present");
});

check("E5 a comma inside a date does not split one event into two", () => {
  const events = parseEvents("Wedding on March 3, 2027", NOW, "upcoming");
  eq(events.length, 1, "'March 3, 2027' is one event, not two");
  eq(new Date(events[0].at!).getFullYear(), 2027, "the year survives the split");
});

check("E6 relative phrases are ordered against each other", () => {
  const events = parseEvents("Exam next month, Dentist tomorrow, Gig next week", NOW, "upcoming");
  eq(events.length, 3, "event count");
  assert(/Dentist/i.test(events[0].text), `tomorrow leads, got "${events[0].text}"`);
  assert(/Gig/i.test(events[1].text), `next week is second, got "${events[1].text}"`);
  assert(/Exam/i.test(events[2].text), `next month is last, got "${events[2].text}"`);
});

check("E7 an empty events cell is an empty list, never a phantom row", () => {
  eq(parseEvents("", NOW, "upcoming").length, 0, "empty string");
  eq(parseEvents("   ", NOW, "upcoming").length, 0, "whitespace only");
});

// ── Splitting ────────────────────────────────────────────────────────────────

check("S1 semicolons and pipes always split, whatever the category", () => {
  eq(splitList("guitar; hiking | cooking", false).length, 3, "structural separators");
});

check("S2 a list category splits on commas", () => {
  const items = splitList("guitar, hiking, cooking", true);
  eq(items.length, 3, "hobby count");
  eq(items[0], "guitar", "first hobby");
});

check("S3 a non-list category does NOT split on commas", () => {
  const items = splitList("Sydney, Australia", false);
  eq(items.length, 1, "a location is one value, not two");
  eq(items[0], "Sydney, Australia", "the location survives intact");
});

check("S4 duplicates collapse", () => {
  eq(splitList("guitar, Guitar, hiking", true).length, 2, "case-insensitive dedupe");
});

check("S5 the two comma-shredding categories are flagged correctly", () => {
  // The whole S3 defence rests on this table being right, so it is asserted
  // rather than trusted.
  eq(CATEGORY_META["Location"].list, false, "Location must not comma-split");
  eq(CATEGORY_META["Timezone"].list, false, "Timezone must not comma-split");
  eq(CATEGORY_META["Birthday / age"].list, false, "Birthday must not comma-split");
  eq(CATEGORY_META["Hobbies"].list, true, "Hobbies must comma-split");
  eq(CATEGORY_META["Interests"].list, true, "Interests must comma-split");
});

// ── Capitalisation ───────────────────────────────────────────────────────────

check("C1 a lowercase fragment gets a capital, and sentences after it do too", () => {
  eq(sentenceCase("loves cats. hates mornings"), "Loves cats. Hates mornings", "two sentences");
  eq(sentenceCase(""), "", "empty stays empty");
  eq(sentenceCase("   "), "", "whitespace stays empty");
});

check("C2 capitalisation is additive and never lowercases", () => {
  // The failure this exists for: a Title Case or normalise pass mangling names
  // and brands the extractor got right.
  eq(sentenceCase("iPhone user in Sydney"), "IPhone user in Sydney", "first letter rises, rest untouched");
  eq(sentenceCase("Formula 1 and NASA"), "Formula 1 and NASA", "existing capitals survive");
  eq(sentenceCase("works at BMW"), "Works at BMW", "an acronym mid-sentence is not touched");
});

// ── The rows the panel actually renders ──────────────────────────────────────

check("R1 toRows splits, capitalises and tags an emoji per category", () => {
  const rows = toRows([
    { label: "Hobbies", value: "guitar, hiking" },
    { label: "Location", value: "sydney, australia" },
  ]);
  eq(rows[0].items.length, 2, "hobbies split");
  eq(rows[0].items[0], "Guitar", "hobby capitalised");
  eq(rows[0].emoji, "🎨", "hobbies emoji");
  eq(rows[1].items.length, 1, "location did not split");
  eq(rows[1].items[0], "Sydney, australia", "location capitalised but intact");
});

check("R2 an empty category becomes an empty item list, not a fake value", () => {
  const rows = toRows([{ label: "Pets", value: "" }]);
  eq(rows[0].items.length, 0, "empty means empty, the component prints Not learned yet");
});

check("R3 an unknown category still renders rather than throwing", () => {
  // Adding a category in page.tsx without touching CATEGORY_META must degrade,
  // not crash: this panel is read-only and must never take the Fans page down.
  const rows = toRows([{ label: "Something New", value: "a value" }]);
  eq(rows.length, 1, "unknown label still produces a row");
  eq(rows[0].emoji, "🗂️", "unknown label gets the fallback icon");
  eq(rows[0].items[0], "A value", "unknown label still gets capitalised");
});

// ── report ───────────────────────────────────────────────────────────────────
if (failures.length > 0) {
  console.error(`\n✗ fan dossier: ${failures.length} failed, ${passed} passed\n`);
  failures.forEach((f) => console.error(`  ✗ ${f}\n`));
  process.exit(1);
}
console.log(`✓ fan dossier: ${passed} passed`);
